/**
 * Gemini image adapter, driven by RECORDED RESPONSE SHAPES (`../fixtures/*.json`).
 *
 * ⚠️ The vendor is unreachable here and there is no key, so nothing in this file proves the
 * live API behaves this way. It proves the adapter's half of the contract: what it sends,
 * what it does with each response shape, how it prices the call, and which failures the
 * router will retry versus fail over.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import type { ImageGenerateInput } from '../../core/adapters';
import type { ProviderCallContext } from '../../core/types';
import { ProviderError } from '../../core/errors';
import { InMemoryReferenceResolver } from '../references';
import { GeminiImageAdapter, type ImageFetchLike } from './adapter';
import { IMAGE_SIZE_BY_RESOLUTION, type GeminiGenerateRequest } from './protocol';

/* ── fixtures ──────────────────────────────────────────────────────────────── */

function fixture(name: string): unknown {
  const path = fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));
  return JSON.parse(readFileSync(path, 'utf8'));
}

/* ── harness ───────────────────────────────────────────────────────────────── */

interface StubCall {
  url: string;
  headers: Record<string, string>;
  body: GeminiGenerateRequest;
}

function stubFetch(
  responses: Array<{ status: number; body: unknown; headers?: Record<string, string> }>,
): { fetchImpl: ImageFetchLike; calls: StubCall[] } {
  const calls: StubCall[] = [];
  let index = 0;

  const fetchImpl: ImageFetchLike = async (url, init) => {
    calls.push({
      url,
      headers: init.headers,
      body: JSON.parse(init.body) as GeminiGenerateRequest,
    });
    const response = responses[Math.min(index, responses.length - 1)]!;
    index += 1;
    const text = typeof response.body === 'string' ? response.body : JSON.stringify(response.body);
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      headers: { get: (name: string) => response.headers?.[name.toLowerCase()] ?? null },
      text: async () => text,
    };
  };

  return { fetchImpl, calls };
}

/** A model id that is a VALUE, exactly as it arrives from packages/config. */
const MODEL_ID = 'image-model-under-test';

function makeAdapter(
  responses: Array<{ status: number; body: unknown; headers?: Record<string, string> }>,
  overrides: Partial<ConstructorParameters<typeof GeminiImageAdapter>[0]> = {},
) {
  const { fetchImpl, calls } = stubFetch(responses);
  const references = new InMemoryReferenceResolver({
    'sheet-1': { bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/png' },
    'face-1': { bytes: new Uint8Array([4, 5, 6]), mimeType: 'image/png' },
    'plate-1': { bytes: new Uint8Array([7, 8, 9]), mimeType: 'image/png' },
  });

  const adapter = new GeminiImageAdapter({
    model: MODEL_ID,
    apiKey: 'test-key',
    baseUrl: 'https://example.invalid',
    apiVersion: 'v1beta',
    timeoutMs: 5_000,
    references,
    fetchImpl,
    ...overrides,
  });
  return { adapter, calls };
}

const CTX: ProviderCallContext = {
  requestId: '11111111-2222-5333-8444-555555555555',
  correlationId: 'trace-1',
  userId: 'user-1',
};

const INPUT: ImageGenerateInput = {
  purpose: 'page',
  promptEn: 'STYLE: watercolour\nCHARACTER: ELIF — a 6-year-old girl.\nSCENE: a garden.',
  references: [
    { kind: 'character_sheet', assetId: 'sheet-1' },
    { kind: 'face_ref', assetId: 'face-1' },
    { kind: 'style_plate', assetId: 'plate-1' },
  ],
  aspectRatio: '1:1',
  resolution: 'screen_2k',
  batch: true,
  safety: { blockLevel: 'BLOCK_MOST' },
};

/* ── request shape ─────────────────────────────────────────────────────────── */

describe('request', () => {
  it('posts to {base}/{version}/models/{model}:generateContent with the key header', async () => {
    const { adapter, calls } = makeAdapter([{ status: 200, body: fixture('generate-success.json') }]);
    await adapter.generate(INPUT, CTX);

    expect(calls[0]!.url).toBe(
      `https://example.invalid/v1beta/models/${MODEL_ID}:generateContent`,
    );
    expect(calls[0]!.headers['x-goog-api-key']).toBe('test-key');
    // Stable across retries so a deduping vendor does not bill the same page twice.
    expect(calls[0]!.headers['x-goog-request-params']).toContain(CTX.requestId);
  });

  it('sends references BEFORE the prompt, in the order given', async () => {
    const { adapter, calls } = makeAdapter([{ status: 200, body: fixture('generate-success.json') }]);
    await adapter.generate(INPUT, CTX);

    const parts = calls[0]!.body.contents[0]!.parts;
    expect(parts).toHaveLength(4);
    expect(parts.slice(0, 3).every((part) => 'inlineData' in part)).toBe(true);
    expect('text' in parts[3]!).toBe(true);
    // Byte order preserved: sheet, face, plate — the SPEC §8.1 ③ slot order.
    const data = parts.slice(0, 3).map((part) => ('inlineData' in part ? part.inlineData.data : ''));
    expect(data).toEqual([
      Buffer.from([1, 2, 3]).toString('base64'),
      Buffer.from([4, 5, 6]).toString('base64'),
      Buffer.from([7, 8, 9]).toString('base64'),
    ]);
  });

  it('asks for IMAGE output and the configured size', async () => {
    const { adapter, calls } = makeAdapter([{ status: 200, body: fixture('generate-success.json') }]);
    await adapter.generate({ ...INPUT, resolution: 'print_4k' }, CTX);

    const config = calls[0]!.body.generationConfig;
    // An image model asked for TEXT happily returns prose and no picture.
    expect(config.responseModalities).toEqual(['IMAGE']);
    expect(config.imageConfig.imageSize).toBe(IMAGE_SIZE_BY_RESOLUTION.print_4k);
    expect(config.imageConfig.aspectRatio).toBe('1:1');
  });

  it('always sets safety settings explicitly — the vendor default is OFF', async () => {
    const { adapter, calls } = makeAdapter([{ status: 200, body: fixture('generate-success.json') }]);
    await adapter.generate(INPUT, CTX);

    const settings = calls[0]!.body.safetySettings;
    expect(settings).toHaveLength(4);
    expect(settings.every((s) => s.threshold === 'BLOCK_LOW_AND_ABOVE')).toBe(true);
  });

  it('folds the negative prompt into the text part (the API has no negative field)', async () => {
    const { adapter, calls } = makeAdapter([{ status: 200, body: fixture('generate-success.json') }]);
    await adapter.generate({ ...INPUT, negativePromptEn: 'no text, no letters' }, CTX);

    const textPart = calls[0]!.body.contents[0]!.parts.at(-1)!;
    expect('text' in textPart && textPart.text).toContain('AVOID: no text, no letters');
  });

  it('refuses BLOCK_NONE outright, before any network call', async () => {
    const { adapter, calls } = makeAdapter([{ status: 200, body: fixture('generate-success.json') }]);
    await expect(
      adapter.generate({ ...INPUT, safety: { blockLevel: 'BLOCK_NONE' } }, CTX),
    ).rejects.toMatchObject({ kind: 'invalid_request' });
    expect(calls).toHaveLength(0);
  });

  it('refuses a non-generated reference, before any network call', async () => {
    const { adapter, calls } = makeAdapter([{ status: 200, body: fixture('generate-success.json') }]);
    await expect(
      adapter.generate(
        { ...INPUT, references: [{ kind: 'child_photo' as never, assetId: 'x' }] },
        CTX,
      ),
    ).rejects.toThrow(/photograph is never used/u);
    expect(calls).toHaveLength(0);
  });
});

/* ── responses ─────────────────────────────────────────────────────────────── */

describe('responses', () => {
  it('returns decoded bytes, real dimensions and a sha256', async () => {
    const { adapter } = makeAdapter([{ status: 200, body: fixture('generate-success.json') }]);
    const result = await adapter.generate(INPUT, CTX);

    expect(result.value.image.mimeType).toBe('image/png');
    expect(result.value.image.bytes.byteLength).toBeGreaterThan(0);
    // Read out of the PNG header, not assumed from the requested resolution.
    expect(result.value.image.width).toBe(64);
    expect(result.value.image.height).toBe(64);
    expect(result.value.image.sha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(result.value.blockedReason).toBeUndefined();
  });

  it('finds the image when the model also returned a chatty text part', async () => {
    const { adapter } = makeAdapter([
      { status: 200, body: fixture('generate-success-with-text-part.json') },
    ]);
    const result = await adapter.generate(INPUT, CTX);
    expect(result.value.image.bytes.byteLength).toBeGreaterThan(0);
  });

  it('reports the model version the vendor actually served', async () => {
    const { adapter } = makeAdapter([{ status: 200, body: fixture('generate-success.json') }]);
    const result = await adapter.generate(INPUT, CTX);
    expect(result.value.model).toBe('image-model-preview-0001');
    expect(result.usage[0]!.model).toBe('image-model-preview-0001');
  });

  it('prices one image per call, in USD, without claiming a batch discount', async () => {
    const { adapter } = makeAdapter([{ status: 200, body: fixture('generate-success.json') }]);
    // `batch: true` on the input asks for the discount; the interactive endpoint does not
    // get one, so the ledger must not pretend it did.
    const result = await adapter.generate({ ...INPUT, batch: true }, CTX);

    expect(result.usage).toHaveLength(1);
    expect(result.usage[0]).toMatchObject({
      provider: 'google',
      operation: 'image.generate',
      billingUnit: 'image',
      billedUnits: 1,
      cacheHit: false,
    });
    expect(result.usage[0]!.costUsd).toBeCloseTo(0.067, 5);
  });

  it('prices 4K above 2K — the reason 4K waits for a print order', async () => {
    const { adapter } = makeAdapter([{ status: 200, body: fixture('generate-success.json') }]);
    const screen = await adapter.generate(INPUT, CTX);
    const print = await adapter.generate({ ...INPUT, resolution: 'print_4k' }, CTX);
    expect(print.usage[0]!.costUsd).toBeGreaterThan(screen.usage[0]!.costUsd);
  });

  it.each([
    ['blocked-prompt-feedback.json', 'prompt_feedback:SAFETY'],
    ['blocked-finish-reason.json', 'finish_reason:IMAGE_SAFETY'],
  ])('reports %s as a block, not an exception', async (file, expected) => {
    const { adapter } = makeAdapter([{ status: 200, body: fixture(file) }]);
    const result = await adapter.generate(INPUT, CTX);

    // A block is a QA outcome the caller retries with a sanitised prompt (SPEC §8.3),
    // not a transport failure the router should fail over on.
    expect(result.value.blockedReason).toBe(expected);
    expect(result.value.image.bytes.byteLength).toBe(0);
    // Nothing was drawn, so nothing is billed.
    expect(result.usage[0]!.costUsd).toBe(0);
    expect(result.usage[0]!.billedUnits).toBe(0);
  });

  it('treats a 200 with neither image nor block reason as a vendor change', async () => {
    const { adapter } = makeAdapter([{ status: 200, body: fixture('malformed-no-image.json') }]);
    const error = await adapter.generate(INPUT, CTX).catch((e: unknown) => e);
    expect(ProviderError.is(error)).toBe(true);
    // Retryable: an envelope change is usually a rollout, and the circuit breaker
    // escalates if it is not.
    expect((error as ProviderError).kind).toBe('unavailable');
    expect((error as ProviderError).retryable).toBe(true);
  });

  it('treats a non-JSON 200 (proxy/HTML) as unavailable', async () => {
    const { adapter } = makeAdapter([{ status: 200, body: '<html>gateway</html>' }]);
    await expect(adapter.generate(INPUT, CTX)).rejects.toMatchObject({ kind: 'unavailable' });
  });
});

/* ── error mapping ─────────────────────────────────────────────────────────── */

describe('error mapping', () => {
  it('maps 429 + RetryInfo to rate_limited with the vendor’s own delay', async () => {
    const { adapter } = makeAdapter([
      { status: 429, body: fixture('error-429-rate-limited.json') },
    ]);
    const error = (await adapter.generate(INPUT, CTX).catch((e: unknown) => e)) as ProviderError;

    expect(error.kind).toBe('rate_limited');
    expect(error.retryable).toBe(true);
    // 23s, straight from RetryInfo — a better backoff than any exponential we invent.
    expect(error.retryAfterMs).toBe(23_000);
  });

  it('maps a spent billing quota to quota_exhausted, so the router fails over', async () => {
    const { adapter } = makeAdapter([
      { status: 429, body: fixture('error-429-quota-exhausted.json') },
    ]);
    const error = (await adapter.generate(INPUT, CTX).catch((e: unknown) => e)) as ProviderError;

    // Same HTTP status as the throttle above, opposite correct behaviour.
    expect(error.kind).toBe('quota_exhausted');
    expect(error.retryable).toBe(false);
  });

  it('maps 401 to a non-retryable auth failure', async () => {
    const { adapter } = makeAdapter([
      { status: 401, body: fixture('error-401-unauthenticated.json') },
    ]);
    const error = (await adapter.generate(INPUT, CTX).catch((e: unknown) => e)) as ProviderError;
    expect(error.kind).toBe('auth');
    expect(error.retryable).toBe(false);
    expect(error.providerCode).toBe('UNAUTHENTICATED');
  });

  it('maps 400 to invalid_request — retrying the same body cannot help', async () => {
    const { adapter } = makeAdapter([
      { status: 400, body: fixture('error-400-invalid-argument.json') },
    ]);
    const error = (await adapter.generate(INPUT, CTX).catch((e: unknown) => e)) as ProviderError;
    expect(error.kind).toBe('invalid_request');
    expect(error.retryable).toBe(false);
  });

  it('maps 503 to a retryable unavailable', async () => {
    const { adapter } = makeAdapter([{ status: 503, body: fixture('error-503-unavailable.json') }]);
    const error = (await adapter.generate(INPUT, CTX).catch((e: unknown) => e)) as ProviderError;
    expect(error.kind).toBe('unavailable');
    expect(error.retryable).toBe(true);
  });

  it('honours a Retry-After header when the body has no RetryInfo', async () => {
    const { adapter } = makeAdapter([
      { status: 429, body: { error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'slow down' } }, headers: { 'retry-after': '7' } },
    ]);
    const error = (await adapter.generate(INPUT, CTX).catch((e: unknown) => e)) as ProviderError;
    expect(error.retryAfterMs).toBe(7_000);
  });

  it('maps a transport failure to unavailable', async () => {
    const adapter = new GeminiImageAdapter({
      model: MODEL_ID,
      apiKey: 'test-key',
      baseUrl: 'https://example.invalid',
      apiVersion: 'v1beta',
      timeoutMs: 5_000,
      references: new InMemoryReferenceResolver({
        'sheet-1': { bytes: new Uint8Array([1]), mimeType: 'image/png' },
        'face-1': { bytes: new Uint8Array([1]), mimeType: 'image/png' },
        'plate-1': { bytes: new Uint8Array([1]), mimeType: 'image/png' },
      }),
      fetchImpl: async () => {
        throw new Error('ECONNRESET');
      },
    });
    await expect(adapter.generate(INPUT, CTX)).rejects.toMatchObject({ kind: 'unavailable' });
  });

  it('maps our own timeout to a retryable timeout', async () => {
    vi.useFakeTimers();
    try {
      const adapter = new GeminiImageAdapter({
        model: MODEL_ID,
        apiKey: 'test-key',
        baseUrl: 'https://example.invalid',
        apiVersion: 'v1beta',
        timeoutMs: 50,
        references: new InMemoryReferenceResolver({
          'sheet-1': { bytes: new Uint8Array([1]), mimeType: 'image/png' },
          'face-1': { bytes: new Uint8Array([1]), mimeType: 'image/png' },
          'plate-1': { bytes: new Uint8Array([1]), mimeType: 'image/png' },
        }),
        fetchImpl: (_url, init) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
          }),
      });

      const promise = adapter.generate(INPUT, CTX);
      const assertion = expect(promise).rejects.toMatchObject({
        kind: 'timeout',
        retryable: true,
      });
      await vi.advanceTimersByTimeAsync(60);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});

/* ── missing key ───────────────────────────────────────────────────────────── */

describe('no API key', () => {
  it('refuses with an actionable message instead of crashing or calling out', async () => {
    const { adapter, calls } = makeAdapter([{ status: 200, body: fixture('generate-success.json') }], {
      apiKey: undefined,
    });

    const error = (await adapter.generate(INPUT, CTX).catch((e: unknown) => e)) as ProviderError;
    expect(error.kind).toBe('auth');
    expect(error.retryable).toBe(false);
    expect(error.message).toContain('GOOGLE_GENAI_API_KEY');
    expect(error.message).toContain('IMAGE_PROVIDER_PRIMARY=fake');
    expect(calls).toHaveLength(0);
  });

  it('reports unhealthy without a network call', async () => {
    const { adapter, calls } = makeAdapter([], { apiKey: undefined });
    expect(await adapter.health()).toEqual({ ok: false, latencyMs: 0 });
    expect(calls).toHaveLength(0);
  });
});
