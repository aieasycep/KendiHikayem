/**
 * The Gemini text adapter, driven by RECORDED response bodies.
 *
 * ⚠️ NOTHING HERE TOUCHES THE NETWORK AND THE ADAPTER HAS NEVER BEEN RUN LIVE. No key, no
 * egress. Every body below is written to Google's published `models.generateContent` shape.
 * What is proved:
 *
 *   · the request     — model from config, system prompt hoisted, `assistant` renamed to
 *                       `model`, structured output translated into the vendor's dialect,
 *                       no sampling parameters
 *   · the response    — text extraction with reasoning parts excluded, token accounting
 *                       that does not double-bill cached input, finish reasons
 *   · the failures    — ⭐ a per-minute throttle and a spent daily allowance both arrive as
 *                       429 with the same prose, and must NOT get the same treatment
 *   · the ledger      — a free-tier call still writes its row, with real units and zero cost
 *
 * What is NOT proved, and what the first live hour must check: that the vendor accepts this
 * body, and that `responseSchema` really returns JSON our zod schema validates first try.
 */

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { GeminiLlmAdapter } from './gemini';
import { completeStructuredOn } from './structured';
import { toGeminiResponseSchema, toJsonSchema } from './schema';
import type { StructuredLlmInput } from './types';
import type { FetchLike, HttpResponseLike } from './http';
import type { LlmPurpose } from '../core/adapters';
import { ProviderError } from '../core/errors';
import { FREE_TIER_PRICE_BOOK } from '../core/pricing';
import { RequestPacer } from '../google/pacing';

/* ── recorded vendor bodies ────────────────────────────────────────────────── */

const OK = {
  candidates: [
    {
      content: {
        role: 'model',
        parts: [
          // A thinking model may expose its reasoning. It is NOT part of the answer.
          { text: 'Önce sayfa sayısını belirleyeyim…', thought: true },
          { text: '{"sayfalar":[{"sayfa_no":1,"metin":"Elif uyudu."}]}' },
        ],
      },
      finishReason: 'STOP',
    },
  ],
  usageMetadata: {
    promptTokenCount: 4_000,
    candidatesTokenCount: 340,
    cachedContentTokenCount: 3_800,
    thoughtsTokenCount: 120,
    totalTokenCount: 4_460,
  },
  modelVersion: 'test-gemini-fill-001',
};

const TRUNCATED = {
  ...OK,
  candidates: [
    {
      content: { role: 'model', parts: [{ text: '{"sayfalar":[{"sayfa_no":1,' }] },
      finishReason: 'MAX_TOKENS',
    },
  ],
};

const PROMPT_BLOCKED = {
  promptFeedback: { blockReason: 'SAFETY', blockReasonMessage: 'istem reddedildi' },
};

const CANDIDATE_BLOCKED = {
  candidates: [
    {
      content: { role: 'model', parts: [] },
      finishReason: 'SAFETY',
      safetyRatings: [{ category: 'HARM_CATEGORY_DANGEROUS_CONTENT', blocked: true }],
    },
  ],
  usageMetadata: { promptTokenCount: 500, candidatesTokenCount: 0 },
};

/**
 * ⭐ THE FREE-TIER TRAP. A per-MINUTE throttle, whose prose is byte-for-byte the sentence
 * Google also uses for a spent BILLING quota. Only `quotaId` tells them apart.
 */
const THROTTLE_429 = {
  error: {
    code: 429,
    message: 'You exceeded your current quota, please check your plan and billing details.',
    status: 'RESOURCE_EXHAUSTED',
    details: [
      { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '31s' },
      {
        '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
        violations: [
          {
            quotaMetric: 'generativelanguage.googleapis.com/generate_content_free_tier_requests',
            quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier',
          },
        ],
      },
    ],
  },
};

/** Same status, same sentence, opposite correct behaviour: the day's allowance is gone. */
const DAILY_429 = {
  error: {
    code: 429,
    message: 'You exceeded your current quota, please check your plan and billing details.',
    status: 'RESOURCE_EXHAUSTED',
    details: [
      {
        '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
        violations: [
          {
            quotaMetric: 'generativelanguage.googleapis.com/generate_content_free_tier_requests',
            quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier',
          },
        ],
      },
    ],
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
    calls.push({ url, headers: init.headers, body: JSON.parse(init.body) as Record<string, unknown> });
    const recorded = responses[Math.min(index, responses.length - 1)]!;
    index += 1;
    const headers = recorded.headers ?? {};
    const response: HttpResponseLike = {
      status: recorded.status ?? 200,
      ok: (recorded.status ?? 200) < 400,
      headers: { get: (name) => headers[name.toLowerCase()] ?? null },
      text: async () =>
        typeof recorded.body === 'string' ? recorded.body : JSON.stringify(recorded.body),
    };
    return response;
  };

  return { fetchImpl, calls };
}

const MODELS: Record<LlmPurpose, string> = {
  outline: 'test-gemini-outline',
  fill: 'test-gemini-fill',
  judge: 'test-gemini-judge',
  character_dna: 'test-gemini-outline',
  illustration_prompt: 'test-gemini-outline',
  page_rewrite: 'test-gemini-outline',
};

const MAX_TOKENS: Record<LlmPurpose, number> = {
  outline: 4_000,
  fill: 12_000,
  judge: 1_500,
  character_dna: 4_000,
  illustration_prompt: 4_000,
  page_rewrite: 4_000,
};

function gemini(
  fetchImpl: FetchLike,
  overrides: Partial<ConstructorParameters<typeof GeminiLlmAdapter>[0]> = {},
): GeminiLlmAdapter {
  return new GeminiLlmAdapter({
    apiKey: 'test-key',
    baseUrl: 'https://google.invalid',
    apiVersion: 'v1beta',
    models: MODELS,
    profiles: {
      outline: { thinking: 'adaptive', effort: 'medium' },
      fill: { thinking: 'adaptive', effort: 'high' },
      judge: { thinking: 'off', effort: 'none' },
      character_dna: { thinking: 'adaptive', effort: 'medium' },
      illustration_prompt: { thinking: 'adaptive', effort: 'medium' },
      page_rewrite: { thinking: 'adaptive', effort: 'medium' },
    },
    maxOutputTokens: MAX_TOKENS,
    fetchImpl,
    ...overrides,
  });
}

const ctx = { requestId: 'req-1', correlationId: 'trace-1', userId: 'user-uuid-1234' };

const fillInput = {
  purpose: 'fill' as const,
  messages: [
    { role: 'system' as const, content: 'kalıcı kurallar', cacheable: true },
    { role: 'user' as const, content: 'yaz' },
  ],
  maxOutputTokens: 9_000,
  // Accepted by the interface and deliberately dropped — see the adapter header.
  temperature: 0.7,
};

/* ── request ───────────────────────────────────────────────────────────────── */

describe('Gemini text adapter — the request', () => {
  it('posts to {base}/{version}/models/{model}:generateContent with the key header', async () => {
    const { fetchImpl, calls } = stubFetch([{ body: OK }]);
    await gemini(fetchImpl).complete(fillInput, ctx);

    expect(calls[0]?.url).toBe('https://google.invalid/v1beta/models/test-gemini-fill:generateContent');
    expect(calls[0]?.headers['x-goog-api-key']).toBe('test-key');
    // Stable across retries, so a deduping vendor does not spend the quota twice.
    expect(calls[0]?.headers['x-goog-request-params']).toContain('req-1');
  });

  it('hoists system messages into systemInstruction rather than leaving them in contents', async () => {
    const { fetchImpl, calls } = stubFetch([{ body: OK }]);
    await gemini(fetchImpl).complete(fillInput, ctx);

    const system = calls[0]?.body['systemInstruction'] as { parts: Array<{ text: string }> };
    expect(system.parts[0]?.text).toContain('kalıcı kurallar');
    // A system message left inside `contents` reads as if the parent said it, which quietly
    // strips the safety framing from every prompt.
    const contents = calls[0]?.body['contents'] as Array<{ role: string }>;
    expect(contents).toHaveLength(1);
    expect(contents[0]?.role).toBe('user');
  });

  it('renames the assistant role to `model` — the repair loop depends on it', async () => {
    const { fetchImpl, calls } = stubFetch([{ body: OK }]);
    await gemini(fetchImpl).complete(
      {
        ...fillInput,
        messages: [
          { role: 'user', content: 'yaz' },
          { role: 'assistant', content: '{"bozuk":' },
          { role: 'user', content: 'düzelt' },
        ],
      },
      ctx,
    );

    const roles = (calls[0]?.body['contents'] as Array<{ role: string }>).map((c) => c.role);
    expect(roles).toEqual(['user', 'model', 'user']);
  });

  it('never sends sampling parameters', async () => {
    const { fetchImpl, calls } = stubFetch([{ body: OK }]);
    await gemini(fetchImpl).complete(fillInput, ctx);

    const config = calls[0]?.body['generationConfig'] as Record<string, unknown>;
    expect(config).not.toHaveProperty('temperature');
    expect(config).not.toHaveProperty('topP');
    expect(config).not.toHaveProperty('topK');
  });

  it('honours the smaller of the caller ceiling and the stage ceiling', async () => {
    const { fetchImpl, calls } = stubFetch([{ body: OK }]);
    await gemini(fetchImpl).complete(fillInput, ctx);
    const config = calls[0]?.body['generationConfig'] as Record<string, unknown>;
    expect(config['maxOutputTokens']).toBe(9_000); // min(9000, 12000)
  });

  it('sends a dynamic thinking budget for adaptive stages and NOTHING for the judge', async () => {
    const adaptive = stubFetch([{ body: OK }]);
    await gemini(adaptive.fetchImpl).complete(fillInput, ctx);
    expect(
      (adaptive.calls[0]?.body['generationConfig'] as Record<string, unknown>)['thinkingConfig'],
    ).toEqual({ thinkingBudget: -1 });

    const off = stubFetch([{ body: OK }]);
    await gemini(off.fetchImpl).complete(
      { purpose: 'judge', messages: [{ role: 'user', content: 'denetle' }], maxOutputTokens: 900 },
      ctx,
    );
    // `thinkingBudget: 0` is a 400 on a model that cannot disable thinking — omit instead.
    expect(off.calls[0]?.body['generationConfig']).not.toHaveProperty('thinkingConfig');
  });

  it('always sets safety settings explicitly at the strictest threshold', async () => {
    const { fetchImpl, calls } = stubFetch([{ body: OK }]);
    await gemini(fetchImpl).complete(fillInput, ctx);

    const settings = calls[0]?.body['safetySettings'] as Array<{ threshold: string }>;
    expect(settings).toHaveLength(4);
    expect(settings.every((s) => s.threshold === 'BLOCK_LOW_AND_ABOVE')).toBe(true);
  });

  it('⭐ translates the strict schema into the dialect this vendor accepts', async () => {
    const { fetchImpl, calls } = stubFetch([{ body: OK }]);
    const schema = toJsonSchema(
      z.object({
        baslik: z.string(),
        sayfalar: z.array(z.object({ sayfa_no: z.number().int(), metin: z.string() })),
      }),
    );
    const structured: StructuredLlmInput = { ...fillInput, jsonSchema: schema };
    await gemini(fetchImpl).complete(structured, ctx);

    const config = calls[0]?.body['generationConfig'] as Record<string, unknown>;
    expect(config['responseMimeType']).toBe('application/json');

    const sent = config['responseSchema'] as Record<string, unknown>;
    // `additionalProperties` is what the OTHER two vendors demand and this one rejects.
    expect(sent).not.toHaveProperty('additionalProperties');
    expect(sent['type']).toBe('OBJECT');
    // Declaration order = generation order. Without it the model writes the illustration
    // note for a page before the page's text exists.
    expect(sent['propertyOrdering']).toEqual(['baslik', 'sayfalar']);
    expect(JSON.stringify(sent)).not.toContain('additionalProperties');
  });

  it('asks for JSON without a schema when the caller only set responseFormat', async () => {
    const { fetchImpl, calls } = stubFetch([{ body: OK }]);
    await gemini(fetchImpl).complete({ ...fillInput, responseFormat: 'json' }, ctx);

    const config = calls[0]?.body['generationConfig'] as Record<string, unknown>;
    expect(config['responseMimeType']).toBe('application/json');
    expect(config).not.toHaveProperty('responseSchema');
  });
});

/* ── response ──────────────────────────────────────────────────────────────── */

describe('Gemini text adapter — the response', () => {
  it('returns the answer WITHOUT the reasoning parts', async () => {
    const { fetchImpl } = stubFetch([{ body: OK }]);
    const result = await gemini(fetchImpl).complete(fillInput, ctx);

    expect(result.value.text).toBe('{"sayfalar":[{"sayfa_no":1,"metin":"Elif uyudu."}]}');
    // Reasoning prose in front of the JSON would fail every parse — and would put the
    // model's deliberation into a story a child reads.
    expect(result.value.text).not.toContain('belirleyeyim');
    expect(result.value.model).toBe('test-gemini-fill-001');
  });

  it('does not bill cached prompt tokens twice, and counts thinking as output', async () => {
    const { fetchImpl } = stubFetch([{ body: OK }]);
    const result = await gemini(fetchImpl).complete(fillInput, ctx);

    // promptTokenCount (4000) INCLUDES cachedContentTokenCount (3800).
    expect(result.value.tokens.input).toBe(200);
    expect(result.value.tokens.cachedInput).toBe(3_800);
    // candidates (340) + thoughts (120): reasoning is billed at the output rate and is not
    // inside `candidatesTokenCount`. Ignoring it under-reports by a third.
    expect(result.value.tokens.output).toBe(460);
    expect(result.usage[0]?.cacheHit).toBe(true);
  });

  it('reports a truncated generation as `length`, not as a failure', async () => {
    const { fetchImpl } = stubFetch([{ body: TRUNCATED }]);
    const result = await gemini(fetchImpl).complete(fillInput, ctx);
    expect(result.value.finishReason).toBe('length');
    expect(result.value.text).toContain('sayfalar');
  });

  it('treats a prompt-level block as content_blocked, without indexing candidates[0]', async () => {
    const { fetchImpl } = stubFetch([{ body: PROMPT_BLOCKED }]);
    const error = (await gemini(fetchImpl)
      .complete(fillInput, ctx)
      .catch((caught: unknown) => caught)) as ProviderError;

    expect(error.kind).toBe('content_blocked');
    expect(error.retryable).toBe(false);
    expect(error.providerCode).toBe('prompt_feedback:SAFETY');
  });

  it('treats a candidate-level safety stop as content_blocked', async () => {
    const { fetchImpl } = stubFetch([{ body: CANDIDATE_BLOCKED }]);
    const error = (await gemini(fetchImpl)
      .complete(fillInput, ctx)
      .catch((caught: unknown) => caught)) as ProviderError;

    expect(error.kind).toBe('content_blocked');
    expect(error.providerCode).toBe('HARM_CATEGORY_DANGEROUS_CONTENT');
  });

  it('treats a non-JSON 200 (edge proxy HTML) as retryable, not as a parse crash', async () => {
    const { fetchImpl } = stubFetch([{ body: '<html>502</html>' }]);
    await expect(gemini(fetchImpl).complete(fillInput, ctx)).rejects.toMatchObject({
      kind: 'unavailable',
      retryable: true,
    });
  });
});

/* ── ⭐ free-tier quota mapping ────────────────────────────────────────────── */

describe('Gemini text adapter — free-tier quota', () => {
  it('⭐ maps a per-MINUTE throttle to rate_limited, with the vendor’s own delay', async () => {
    const { fetchImpl } = stubFetch([{ status: 429, body: THROTTLE_429 }]);
    const error = (await gemini(fetchImpl)
      .complete(fillInput, ctx)
      .catch((caught: unknown) => caught)) as ProviderError;

    // Retryable: the limit resets in half a minute. Classifying this as "quota exhausted"
    // would abandon a story that was about to succeed.
    expect(error.kind).toBe('rate_limited');
    expect(error.retryable).toBe(true);
    expect(error.retryAfterMs).toBe(31_000);
    expect(error.userMessageTr).toMatch(/birkaç saniye/iu);
  });

  it('⭐ maps a per-DAY allowance to quota_exhausted — same 429, same prose', async () => {
    const { fetchImpl } = stubFetch([{ status: 429, body: DAILY_429 }]);
    const error = (await gemini(fetchImpl)
      .complete(fillInput, ctx)
      .catch((caught: unknown) => caught)) as ProviderError;

    expect(error.kind).toBe('quota_exhausted');
    expect(error.retryable).toBe(false);
    // The parent is told what to do, in Turkish, and it is different advice.
    expect(error.userMessageTr).toMatch(/yarın/iu);
    expect(error.userMessageTr).not.toMatch(/quota|google|429/iu);
  });

  it('never leaks a raw vendor sentence to the parent', async () => {
    const { fetchImpl } = stubFetch([{ status: 429, body: DAILY_429 }]);
    const error = (await gemini(fetchImpl)
      .complete(fillInput, ctx)
      .catch((caught: unknown) => caught)) as ProviderError;

    // The English text is kept for the log; the parent sees Turkish.
    expect(error.detail).toContain('exceeded your current quota');
    expect(error.userMessageTr).not.toContain('exceeded');
    expect(error.toJobError().userMessageTr).toBe(error.userMessageTr);
  });

  it.each([
    [401, 'auth', false],
    [400, 'invalid_request', false],
    [503, 'unavailable', true],
    [500, 'unavailable', true],
  ])('maps HTTP %i to %s (retryable: %s)', async (status, kind, retryable) => {
    const { fetchImpl } = stubFetch([
      { status, body: { error: { code: status, message: 'boom', status: 'UNKNOWN_STATUS' } } },
    ]);
    const error = await gemini(fetchImpl)
      .complete(fillInput, ctx)
      .catch((caught: unknown) => caught);

    expect(ProviderError.is(error)).toBe(true);
    expect(error).toMatchObject({ kind, retryable, httpStatus: status });
  });

  it('fails with a clear auth error, and no network call, when the key is missing', async () => {
    const { fetchImpl, calls } = stubFetch([{ body: OK }]);
    const adapter = gemini(fetchImpl, { apiKey: undefined });
    await expect(adapter.complete(fillInput, ctx)).rejects.toMatchObject({ kind: 'auth' });
    expect(calls).toHaveLength(0);
  });

  it('turns a hung socket into a timeout instead of a stuck job', async () => {
    const hang: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    await expect(gemini(hang, { timeoutMs: 20 }).complete(fillInput, ctx)).rejects.toMatchObject({
      kind: 'timeout',
      retryable: true,
    });
  });
});

/* ── ⭐ free-tier cost accounting ──────────────────────────────────────────── */

describe('free-tier metering', () => {
  it('⭐ still writes a usage row: zero cost, REAL units', async () => {
    const { fetchImpl } = stubFetch([{ body: OK }]);
    const result = await gemini(fetchImpl, { priceBook: FREE_TIER_PRICE_BOOK }).complete(
      fillInput,
      ctx,
    );

    const usage = result.usage[0]!;
    expect(usage.provider).toBe('google');
    expect(usage.costUsd).toBe(0);
    expect(usage.unitPriceUsd).toBe(0);
    // The quota is the resource that actually runs out, and it is counted in tokens and
    // requests — not in dollars. A row that was never written cannot be compared with the
    // paid tier later, which is the whole reason for recording a free call.
    expect(usage.billingUnit).toBe('token');
    expect(usage.billedUnits).toBe(4_460);
    expect(usage.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('prices the same call above zero on the paid book, so the two are comparable', async () => {
    const { fetchImpl } = stubFetch([{ body: OK }]);
    const paid = await gemini(fetchImpl).complete(fillInput, ctx);
    expect(paid.usage[0]!.costUsd).toBeGreaterThan(0);
    expect(paid.usage[0]!.billedUnits).toBe(4_460);
  });
});

/* ── pacing ────────────────────────────────────────────────────────────────── */

describe('free-tier pacing', () => {
  it('spaces consecutive calls by the configured interval instead of bursting', async () => {
    const { fetchImpl } = stubFetch([{ body: OK }]);
    let clock = 0;
    const slept: number[] = [];
    const pacer = new RequestPacer({
      minIntervalMs: 6_000,
      now: () => clock,
      sleep: async (ms) => {
        slept.push(ms);
        clock += ms;
      },
    });
    const adapter = gemini(fetchImpl, { pacer });

    await adapter.complete(fillInput, ctx);
    await adapter.complete(fillInput, ctx);
    await adapter.complete(fillInput, ctx);

    // The first call goes immediately; the next two wait their turn. Thirteen page calls
    // firing at once is a self-inflicted 429 storm.
    expect(slept).toEqual([6_000, 6_000]);
  });

  it('a cancelled job stops waiting instead of sitting in the queue', async () => {
    const { fetchImpl, calls } = stubFetch([{ body: OK }]);
    const controller = new AbortController();
    const pacer = new RequestPacer({
      minIntervalMs: 60_000,
      now: () => 0,
      sleep: () => new Promise<void>(() => {}),
    });
    const adapter = gemini(fetchImpl, { pacer });

    await adapter.complete(fillInput, ctx);
    const pending = adapter.complete(fillInput, { ...ctx, signal: controller.signal });
    controller.abort(new Error('job cancelled'));

    await expect(pending).rejects.toThrow(/cancelled/u);
    expect(calls).toHaveLength(1);
  });
});

/* ── structured output end to end ──────────────────────────────────────────── */

describe('structured output through the repair loop', () => {
  const schema = z.object({
    baslik: z.string(),
    sayfalar: z.array(z.object({ sayfa_no: z.number().int(), metin: z.string() })),
  });
  const valid = JSON.stringify({ baslik: 'Elif', sayfalar: [{ sayfa_no: 1, metin: 'Uyudu.' }] });

  it('validates on the first try when the vendor honours the schema', async () => {
    const { fetchImpl, calls } = stubFetch([
      { body: { ...OK, candidates: [{ content: { parts: [{ text: valid }] }, finishReason: 'STOP' }] } },
    ]);
    const result = await completeStructuredOn(
      gemini(fetchImpl),
      { purpose: 'fill', messages: [{ role: 'user', content: 'yaz' }], schema, maxOutputTokens: 2_000 },
      ctx,
    );

    expect(result.value.value.baslik).toBe('Elif');
    expect(result.value.attempts).toBe(1);
    expect(calls[0]?.body).toBeDefined();
  });

  it('repairs a wrong-shaped answer, and the repair turn goes back as role `model`', async () => {
    const { fetchImpl, calls } = stubFetch([
      {
        body: {
          ...OK,
          candidates: [{ content: { parts: [{ text: '{"baslik":"Elif"}' }] }, finishReason: 'STOP' }],
        },
      },
      { body: { ...OK, candidates: [{ content: { parts: [{ text: valid }] }, finishReason: 'STOP' }] } },
    ]);
    const result = await completeStructuredOn(
      gemini(fetchImpl),
      {
        purpose: 'fill',
        messages: [{ role: 'user', content: 'yaz' }],
        schema,
        maxOutputTokens: 2_000,
        repairAttempts: 2,
      },
      ctx,
    );

    expect(result.value.attempts).toBe(2);
    const roles = (calls[1]?.body['contents'] as Array<{ role: string }>).map((c) => c.role);
    expect(roles).toEqual(['user', 'model', 'user']);
    // Both attempts are metered: a wasted call still spent a request out of the daily quota.
    expect(result.usage).toHaveLength(2);
  });
});

/* ── the schema translator on its own ──────────────────────────────────────── */

describe('toGeminiResponseSchema', () => {
  it('strips additionalProperties everywhere, not only at the root', () => {
    const schema = toJsonSchema(
      z.object({ sayfalar: z.array(z.object({ no: z.number().int() })) }),
    );
    const out = toGeminiResponseSchema(schema);
    expect(JSON.stringify(out)).not.toContain('additionalProperties');
  });

  it('upper-cases types, because the field is a proto enum and not a JSON Schema string', () => {
    const out = toGeminiResponseSchema(
      toJsonSchema(z.object({ ad: z.string(), yas: z.number().int(), uykulu: z.boolean() })),
    );
    const properties = out['properties'] as Record<string, Record<string, unknown>>;
    expect(out['type']).toBe('OBJECT');
    expect(properties['ad']?.['type']).toBe('STRING');
    expect(properties['yas']?.['type']).toBe('INTEGER');
    expect(properties['uykulu']?.['type']).toBe('BOOLEAN');
  });

  it('keeps descriptions and required, and adds propertyOrdering', () => {
    const out = toGeminiResponseSchema(
      toJsonSchema(z.object({ baslik: z.string().describe('En fazla 6 kelime'), ton: z.enum(['sakin', 'nese']) })),
    );
    const properties = out['properties'] as Record<string, Record<string, unknown>>;
    expect(properties['baslik']?.['description']).toContain('6 kelime');
    expect(properties['ton']?.['enum']).toEqual(['sakin', 'nese']);
    expect(out['required']).toEqual(['baslik', 'ton']);
    expect(out['propertyOrdering']).toEqual(['baslik', 'ton']);
  });

  it('expresses a string const as a one-entry enum — `const` does not exist here', () => {
    const out = toGeminiResponseSchema({ type: 'string', const: 'tr' });
    expect(out).toEqual({ type: 'STRING', enum: ['tr'] });
  });
});
