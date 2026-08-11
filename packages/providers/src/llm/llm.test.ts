/**
 * The real LLM adapters, tested against RECORDED responses.
 *
 * ⚠️ THESE TESTS NEVER TOUCH THE NETWORK, AND THE ADAPTERS HAVE NEVER BEEN RUN AGAINST THE
 * LIVE VENDORS. This environment has no keys and no egress to them. Every response body
 * below is written to the vendor's documented wire shape; what is proved is everything up
 * to the socket:
 *
 *   · the request we would send  — model from config, no rejected parameters, cache
 *     breakpoint in the right place, structured-output schema attached
 *   · the response we would parse — text, stop reasons, token counters, cost
 *   · the failures we would map   — 401/429/400/529/timeout → retry, failover or stop
 *   · the repair loop             — a wrong-shaped answer costs one more call, not a book
 *
 * What is NOT proved: that the vendor accepts this exact body. That is a five-minute check
 * on the day a key exists, and it is listed as such in the handover.
 */

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { AnthropicLlmAdapter } from './anthropic';
import { OpenAiLlmAdapter } from './openai';
import { completeStructuredOn, parseJson } from './structured';
import { SchemaValidationError } from './types';
import { toJsonSchema } from './schema';
import type { FetchLike, HttpResponseLike } from './http';
import type { LlmPurpose } from '../core/adapters';
import { ProviderError } from '../core/errors';
import { ProviderRouter } from '../core/router';

/* ── recorded vendor bodies ────────────────────────────────────────────────── */

const ANTHROPIC_OK = {
  id: 'msg_01ABC',
  type: 'message',
  role: 'assistant',
  model: 'test-fill-model',
  content: [
    { type: 'thinking', thinking: '' },
    { type: 'text', text: '{"sayfalar":[{"sayfa_no":1,"metin":"Elif uyudu.","kelime_sayisi":2}]}' },
  ],
  stop_reason: 'end_turn',
  stop_details: null,
  usage: {
    input_tokens: 120,
    output_tokens: 340,
    cache_creation_input_tokens: 40,
    cache_read_input_tokens: 3_800,
  },
};

const ANTHROPIC_REFUSAL = {
  id: 'msg_01REF',
  type: 'message',
  model: 'test-fill-model',
  content: [],
  stop_reason: 'refusal',
  stop_details: { type: 'refusal', category: 'cyber', explanation: 'declined' },
  usage: { input_tokens: 0, output_tokens: 0 },
};

const ANTHROPIC_TRUNCATED = {
  ...ANTHROPIC_OK,
  content: [{ type: 'text', text: '{"sayfalar":[{"sayfa_no":1,' }],
  stop_reason: 'max_tokens',
};

const OPENAI_OK = {
  id: 'chatcmpl-1',
  model: 'test-fallback-model',
  choices: [
    {
      index: 0,
      message: { role: 'assistant', content: '{"ok":true}', refusal: null },
      finish_reason: 'stop',
    },
  ],
  usage: {
    prompt_tokens: 1_000,
    completion_tokens: 200,
    prompt_tokens_details: { cached_tokens: 800 },
  },
};

/* ── fetch double ──────────────────────────────────────────────────────────── */

interface RecordedCall {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

function stubFetch(
  responses: Array<{ status?: number; body: unknown; headers?: Record<string, string> }>,
): { fetchImpl: FetchLike; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  let index = 0;

  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({
      url,
      headers: init.headers,
      body: JSON.parse(init.body) as Record<string, unknown>,
    });
    const recorded = responses[Math.min(index, responses.length - 1)]!;
    index += 1;
    const headers = recorded.headers ?? {};
    const response: HttpResponseLike = {
      status: recorded.status ?? 200,
      ok: (recorded.status ?? 200) < 400,
      headers: { get: (name) => headers[name.toLowerCase()] ?? null },
      text: async () => JSON.stringify(recorded.body),
    };
    return response;
  };

  return { fetchImpl, calls };
}

const MODELS: Record<LlmPurpose, string> = {
  outline: 'test-outline-model',
  fill: 'test-fill-model',
  judge: 'test-judge-model',
  character_dna: 'test-outline-model',
  illustration_prompt: 'test-outline-model',
  page_rewrite: 'test-outline-model',
};

function anthropic(
  fetchImpl: FetchLike,
  overrides: Partial<ConstructorParameters<typeof AnthropicLlmAdapter>[0]> = {},
): AnthropicLlmAdapter {
  return new AnthropicLlmAdapter({
    apiKey: 'test-key',
    baseUrl: 'https://vendor.invalid',
    apiVersion: '2023-06-01',
    models: MODELS,
    profiles: {
      outline: { thinking: 'adaptive', effort: 'medium' },
      fill: { thinking: 'adaptive', effort: 'high' },
      judge: { thinking: 'off', effort: 'none' },
      character_dna: { thinking: 'adaptive', effort: 'medium' },
      illustration_prompt: { thinking: 'adaptive', effort: 'medium' },
      page_rewrite: { thinking: 'adaptive', effort: 'medium' },
    },
    maxOutputTokens: {
      outline: 4_000,
      fill: 12_000,
      judge: 1_500,
      character_dna: 4_000,
      illustration_prompt: 4_000,
      page_rewrite: 4_000,
    },
    fetchImpl,
    ...overrides,
  });
}

const ctx = { requestId: 'req-1', correlationId: 'trace-1', userId: 'user-uuid-1234' };

const fillInput = {
  purpose: 'fill' as const,
  messages: [
    { role: 'system' as const, content: 'stable rules', cacheable: true },
    { role: 'system' as const, content: 'Oturum işareti: KH-CANARY-AAAA.' },
    { role: 'user' as const, content: 'yaz' },
  ],
  maxOutputTokens: 9_000,
  // Accepted by the interface and deliberately dropped by the adapter — see below.
  temperature: 0.7,
};

/* ── request shape ─────────────────────────────────────────────────────────── */

describe('Anthropic adapter — the request', () => {
  it('sends the configured model, never a literal', async () => {
    const { fetchImpl, calls } = stubFetch([{ body: ANTHROPIC_OK }]);
    await anthropic(fetchImpl).complete(fillInput, ctx);
    expect(calls[0]?.body['model']).toBe('test-fill-model');
    expect(calls[0]?.url).toBe('https://vendor.invalid/v1/messages');
  });

  it('never sends sampling parameters — current flagship models reject them outright', async () => {
    const { fetchImpl, calls } = stubFetch([{ body: ANTHROPIC_OK }]);
    await anthropic(fetchImpl).complete(fillInput, ctx);
    expect(calls[0]?.body).not.toHaveProperty('temperature');
    expect(calls[0]?.body).not.toHaveProperty('top_p');
    expect(calls[0]?.body).not.toHaveProperty('top_k');
  });

  it('puts the cache breakpoint on the LAST cacheable system block', async () => {
    const { fetchImpl, calls } = stubFetch([{ body: ANTHROPIC_OK }]);
    await anthropic(fetchImpl).complete(fillInput, ctx);

    const system = calls[0]?.body['system'] as Array<Record<string, unknown>>;
    expect(system).toHaveLength(2);
    expect(system[0]).toHaveProperty('cache_control', { type: 'ephemeral' });
    // The canary block is volatile and must stay OUTSIDE the cached prefix.
    expect(system[1]).not.toHaveProperty('cache_control');
    expect(String(system[1]?.['text'])).toContain('KH-CANARY');
  });

  it('sends adaptive thinking and the stage effort, and honours max_tokens ceilings', async () => {
    const { fetchImpl, calls } = stubFetch([{ body: ANTHROPIC_OK }]);
    await anthropic(fetchImpl).complete(fillInput, ctx);

    expect(calls[0]?.body['thinking']).toEqual({ type: 'adaptive' });
    expect(calls[0]?.body['output_config']).toMatchObject({ effort: 'high' });
    // min(caller's 9000, config's 12000)
    expect(calls[0]?.body['max_tokens']).toBe(9_000);
  });

  it('omits thinking and effort for the cheap judge tier, which rejects both', async () => {
    const { fetchImpl, calls } = stubFetch([{ body: { ...ANTHROPIC_OK, content: [{ type: 'text', text: '{}' }] } }]);
    await anthropic(fetchImpl).complete(
      { purpose: 'judge', messages: [{ role: 'user', content: 'denetle' }], maxOutputTokens: 900 },
      ctx,
    );
    expect(calls[0]?.body).not.toHaveProperty('thinking');
    expect(calls[0]?.body).not.toHaveProperty('output_config');
  });

  it('attaches the structured-output schema when one is supplied', async () => {
    const { fetchImpl, calls } = stubFetch([{ body: ANTHROPIC_OK }]);
    await anthropic(fetchImpl).complete(
      { ...fillInput, jsonSchema: { type: 'object', properties: {}, required: [] } },
      ctx,
    );
    expect(calls[0]?.body['output_config']).toMatchObject({
      format: { type: 'json_schema', schema: { type: 'object' } },
    });
  });

  it('sends a pseudonym instead of our user id (KVKK data minimisation)', async () => {
    const { fetchImpl, calls } = stubFetch([{ body: ANTHROPIC_OK }]);
    await anthropic(fetchImpl).complete(fillInput, ctx);

    const metadata = calls[0]?.body['metadata'] as { user_id: string };
    expect(metadata.user_id).not.toContain('user-uuid-1234');
    expect(metadata.user_id).toHaveLength(32);
  });

  it('sets the auth and version headers the vendor requires', async () => {
    const { fetchImpl, calls } = stubFetch([{ body: ANTHROPIC_OK }]);
    await anthropic(fetchImpl).complete(fillInput, ctx);
    expect(calls[0]?.headers['x-api-key']).toBe('test-key');
    expect(calls[0]?.headers['anthropic-version']).toBe('2023-06-01');
  });
});

/* ── response parsing and cost ─────────────────────────────────────────────── */

describe('Anthropic adapter — the response', () => {
  it('extracts the text, the token counters and the cost', async () => {
    const { fetchImpl } = stubFetch([{ body: ANTHROPIC_OK }]);
    const result = await anthropic(fetchImpl).complete(fillInput, ctx);

    expect(result.value.text).toContain('sayfalar');
    expect(result.value.finishReason).toBe('stop');
    // input = uncached + freshly cached; cachedInput = cache READS.
    expect(result.value.tokens).toEqual({ input: 160, output: 340, cachedInput: 3_800 });
    expect(result.value.model).toBe('test-fill-model');

    const usage = result.usage[0]!;
    expect(usage.costUsd).toBeGreaterThan(0);
    expect(usage.cacheHit).toBe(true);
    expect(usage.billedUnits).toBe(4_300);
  });

  it('prices a cache read far below a cache write', async () => {
    const cachedBody = { ...ANTHROPIC_OK, usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 4_000 } };
    const coldBody = { ...ANTHROPIC_OK, usage: { input_tokens: 4_000, output_tokens: 0 } };

    const cached = await anthropic(stubFetch([{ body: cachedBody }]).fetchImpl).complete(fillInput, ctx);
    const cold = await anthropic(stubFetch([{ body: coldBody }]).fetchImpl).complete(fillInput, ctx);

    expect(cached.usage[0]!.costUsd).toBeLessThan(cold.usage[0]!.costUsd / 5);
  });

  it('reports a truncated generation as `length`, not as a failure', async () => {
    const { fetchImpl } = stubFetch([{ body: ANTHROPIC_TRUNCATED }]);
    const result = await anthropic(fetchImpl).complete(fillInput, ctx);
    // The partial text still comes back: the caller decides whether to repair or shorten.
    expect(result.value.finishReason).toBe('length');
    expect(result.value.text).toContain('sayfalar');
  });

  it('treats a refusal as a content block — checked BEFORE reading content', async () => {
    const { fetchImpl } = stubFetch([{ body: ANTHROPIC_REFUSAL }]);
    await expect(anthropic(fetchImpl).complete(fillInput, ctx)).rejects.toMatchObject({
      kind: 'content_blocked',
      providerCode: 'cyber',
    });
  });
});

/* ── error mapping ─────────────────────────────────────────────────────────── */

describe('Anthropic adapter — failures', () => {
  const cases: Array<[number, string, boolean, unknown]> = [
    [401, 'auth', false, { error: { type: 'authentication_error', message: 'bad key' } }],
    [429, 'rate_limited', true, { error: { type: 'rate_limit_error', message: 'slow down' } }],
    [400, 'invalid_request', false, { error: { type: 'invalid_request_error', message: 'bad body' } }],
    [529, 'unavailable', true, { error: { type: 'overloaded_error', message: 'overloaded' } }],
    [500, 'unavailable', true, { error: { type: 'api_error', message: 'boom' } }],
  ];

  it.each(cases)('maps HTTP %i to %s (retryable: %s)', async (status, kind, retryable, body) => {
    const { fetchImpl } = stubFetch([{ status, body }]);
    const error = await anthropic(fetchImpl)
      .complete(fillInput, ctx)
      .catch((caught: unknown) => caught);

    expect(ProviderError.is(error)).toBe(true);
    expect(error).toMatchObject({ kind, retryable, httpStatus: status });
  });

  it('honours retry-after so we back off for as long as the vendor asked', async () => {
    const { fetchImpl } = stubFetch([
      { status: 429, body: { error: { type: 'rate_limit_error' } }, headers: { 'retry-after': '12' } },
    ]);
    const error = (await anthropic(fetchImpl)
      .complete(fillInput, ctx)
      .catch((caught: unknown) => caught)) as ProviderError;
    expect(error.retryAfterMs).toBe(12_000);
  });

  it('separates "out of credit" from "too fast" — one is retryable, one is not', async () => {
    const { fetchImpl } = stubFetch([
      { status: 429, body: { error: { type: 'insufficient_quota', message: 'no credit' } } },
    ]);
    const error = (await anthropic(fetchImpl)
      .complete(fillInput, ctx)
      .catch((caught: unknown) => caught)) as ProviderError;
    expect(error.kind).toBe('quota_exhausted');
    expect(error.retryable).toBe(false);
  });

  it('fails with a clear auth error — and no network call — when the key is missing', async () => {
    const { fetchImpl, calls } = stubFetch([{ body: ANTHROPIC_OK }]);
    const adapter = anthropic(fetchImpl, { apiKey: undefined });
    await expect(adapter.complete(fillInput, ctx)).rejects.toMatchObject({ kind: 'auth' });
    expect(calls).toHaveLength(0);
  });

  it('turns a hung socket into a timeout instead of a stuck job', async () => {
    const hang: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      });
    const adapter = anthropic(hang, { timeoutMs: 20 });
    await expect(adapter.complete(fillInput, ctx)).rejects.toMatchObject({
      kind: 'timeout',
      retryable: true,
    });
  });

  it('does not choke on an HTML error page from an edge proxy', async () => {
    const htmlish: FetchLike = async () => ({
      status: 502,
      ok: false,
      headers: { get: () => null },
      text: async () => '<html>502 Bad Gateway</html>',
    });
    await expect(anthropic(htmlish).complete(fillInput, ctx)).rejects.toMatchObject({
      kind: 'unavailable',
    });
  });
});

/* ── fallback vendor + router ──────────────────────────────────────────────── */

describe('the two-provider route', () => {
  function openai(fetchImpl: FetchLike): OpenAiLlmAdapter {
    return new OpenAiLlmAdapter({
      apiKey: 'test-key',
      baseUrl: 'https://fallback.invalid',
      models: { ...MODELS, fill: 'test-fallback-model' },
      maxOutputTokens: { ...{ outline: 4_000, fill: 12_000, judge: 1_500, character_dna: 4_000, illustration_prompt: 4_000, page_rewrite: 4_000 } },
      fetchImpl,
    });
  }

  it('sends a strict json_schema and subtracts cached tokens from the prompt total', async () => {
    const { fetchImpl, calls } = stubFetch([{ body: OPENAI_OK }]);
    const result = await openai(fetchImpl).complete(
      { ...fillInput, jsonSchema: { type: 'object', properties: {}, required: [] }, schemaName: 'kitap' },
      ctx,
    );

    expect(calls[0]?.body['response_format']).toMatchObject({
      type: 'json_schema',
      json_schema: { name: 'kitap', strict: true },
    });
    // prompt_tokens INCLUDES the cached ones on this vendor; billing them twice would be
    // a silent overcharge in every cost report.
    expect(result.value.tokens).toEqual({ input: 200, output: 200, cachedInput: 800 });
  });

  it('fails over to the second vendor when the first is overloaded', async () => {
    const primary = anthropic(
      stubFetch([{ status: 529, body: { error: { type: 'overloaded_error' } } }]).fetchImpl,
    );
    const fallback = openai(stubFetch([{ body: OPENAI_OK }]).fetchImpl);
    const router = new ProviderRouter([primary, fallback], {
      retry: { maxAttempts: 1 },
      sleep: async () => {},
    });

    const routed = await router.execute('llm.complete', ctx, (adapter) =>
      adapter.complete(fillInput, ctx),
    );
    expect(routed.provider).toBe('openai');
    expect(routed.value.text).toBe('{"ok":true}');
  });

  it('does NOT fail over on a content block — a refused story is refused everywhere', async () => {
    const primary = anthropic(stubFetch([{ body: ANTHROPIC_REFUSAL }]).fetchImpl);
    const { fetchImpl: fallbackFetch, calls: fallbackCalls } = stubFetch([{ body: OPENAI_OK }]);
    const router = new ProviderRouter([primary, openai(fallbackFetch)], {
      retry: { maxAttempts: 1 },
      sleep: async () => {},
    });

    await expect(
      router.execute('llm.complete', ctx, (adapter) => adapter.complete(fillInput, ctx)),
    ).rejects.toThrow();
    // The second vendor was never asked — that would be paying to defeat our own gate.
    expect(fallbackCalls).toHaveLength(0);
  });
});

/* ── structured output + repair ────────────────────────────────────────────── */

describe('structured output', () => {
  const schema = z.object({
    baslik: z.string(),
    sayfalar: z.array(z.object({ sayfa_no: z.number().int(), metin: z.string() })),
  });

  const request = {
    purpose: 'fill' as const,
    messages: [{ role: 'user' as const, content: 'yaz' }],
    schema,
    maxOutputTokens: 2_000,
    repairAttempts: 2,
  };

  const valid = JSON.stringify({ baslik: 'Elif', sayfalar: [{ sayfa_no: 1, metin: 'Uyudu.' }] });

  it('returns the validated object on the first try', async () => {
    const { fetchImpl, calls } = stubFetch([
      { body: { ...ANTHROPIC_OK, content: [{ type: 'text', text: valid }] } },
    ]);
    const result = await completeStructuredOn(anthropic(fetchImpl), request, ctx);

    expect(result.value.value.baslik).toBe('Elif');
    expect(result.value.attempts).toBe(1);
    expect(calls).toHaveLength(1);
  });

  it('repairs a wrong-shaped answer by handing the model the validator complaint', async () => {
    const { fetchImpl, calls } = stubFetch([
      { body: { ...ANTHROPIC_OK, content: [{ type: 'text', text: '{"baslik":"Elif"}' }] } },
      { body: { ...ANTHROPIC_OK, content: [{ type: 'text', text: valid }] } },
    ]);
    const result = await completeStructuredOn(anthropic(fetchImpl), request, ctx);

    expect(result.value.attempts).toBe(2);
    // The repair turn names the missing path so the model can fix exactly that.
    const repairTurn = JSON.stringify((calls[1]?.body['messages'] as unknown[]).at(-1));
    expect(repairTurn).toContain('sayfalar');
    // Both attempts are priced: a wasted call is still a call someone paid for.
    expect(result.usage).toHaveLength(2);
  });

  it('gives up with a typed error after the repair budget is spent', async () => {
    const { fetchImpl, calls } = stubFetch([
      { body: { ...ANTHROPIC_OK, content: [{ type: 'text', text: 'özür dilerim, yazamadım' }] } },
    ]);
    await expect(completeStructuredOn(anthropic(fetchImpl), request, ctx)).rejects.toBeInstanceOf(
      SchemaValidationError,
    );
    expect(calls).toHaveLength(3); // 1 + 2 repairs
  });

  it('accepts JSON the model wrapped in a code fence rather than paying for a retry', () => {
    const fenced = '```json\n{"a":1}\n```';
    expect(parseJson(fenced)).toEqual({ ok: true, value: { a: 1 } });
    expect(parseJson('İşte sonuç: {"a":1}')).toEqual({ ok: true, value: { a: 1 } });
    expect(parseJson('').ok).toBe(false);
  });
});

/* ── zod → JSON Schema ─────────────────────────────────────────────────────── */

describe('schema conversion', () => {
  const schema = z.object({
    baslik: z.string().min(1).max(80).describe('En fazla 6 kelime'),
    sayfa_sayisi: z.number().int(),
    ton: z.enum(['sakin', 'nese']),
    sayfalar: z.array(z.object({ no: z.number().int(), metin: z.string() })),
  });

  it('emits strict objects: every field required, nothing extra allowed', () => {
    const json = toJsonSchema(schema);
    expect(json.additionalProperties).toBe(false);
    expect(json.required).toEqual(['baslik', 'sayfa_sayisi', 'ton', 'sayfalar']);
    expect(json.properties?.['sayfalar']?.items?.additionalProperties).toBe(false);
  });

  it('keeps descriptions (the model reads them) and drops constraints (the engine rejects them)', () => {
    const json = toJsonSchema(schema);
    expect(json.properties?.['baslik']?.description).toContain('6 kelime');
    expect(json.properties?.['baslik']).not.toHaveProperty('minLength');
    expect(json.properties?.['baslik']).not.toHaveProperty('maxLength');
  });

  it('maps integers and enums the way the engines expect', () => {
    const json = toJsonSchema(schema);
    expect(json.properties?.['sayfa_sayisi']?.type).toBe('integer');
    expect(json.properties?.['ton']?.enum).toEqual(['sakin', 'nese']);
  });

  it('adds propertyOrdering only for the dialect that needs it', () => {
    expect(toJsonSchema(schema)).not.toHaveProperty('propertyOrdering');
    // Without it, that vendor sorts alphabetically and describes a page before writing it.
    expect(toJsonSchema(schema, { dialect: 'gemini' }).propertyOrdering).toEqual([
      'baslik',
      'sayfa_sayisi',
      'ton',
      'sayfalar',
    ]);
  });
});
