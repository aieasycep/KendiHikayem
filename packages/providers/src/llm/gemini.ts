/**
 * llm/gemini.ts — ⭐ the DEFAULT story model, because it is the one with a free tier.
 *
 * ⚠️ NEVER RUN AGAINST THE LIVE VENDOR. No key, no egress. `gemini.test.ts` replays recorded
 * bodies written to Google's published `models.generateContent` shape and proves everything
 * up to the socket: the request we build, the responses we parse, the failures we map, the
 * quota rows we write. It cannot prove the one thing that matters most on day one — that
 * this vendor's structured output really returns the JSON our zod schema accepts. Budget a
 * live smoke run for exactly that (see the checklist at the bottom of this comment).
 *
 * WHY THIS VENDOR IS PRIMARY. Not quality — economics. Google AI Studio is the only major
 * provider with a genuinely free tier, and the product has to reach the store before it can
 * earn anything. Anthropic and OpenAI adapters stay in the tree, fully wired, and
 * `LLM_PROVIDER_PRIMARY=anthropic` is the entire switch back.
 *
 * FOUR DECISIONS THAT ARE EASY TO GET WRONG HERE:
 *
 *  1. STRUCTURED OUTPUT IS NOT OPTIONAL. Stage 1 and stage 2 both hand back JSON validated
 *     by a zod schema. `responseMimeType: 'application/json'` alone only asks nicely;
 *     `responseSchema` constrains the decoder. Both are sent, and the schema is translated
 *     into Gemini's OpenAPI subset first (see `toGeminiResponseSchema`) because the strict
 *     dialect the other vendors need contains a keyword this one rejects outright.
 *  2. SYSTEM PROMPTS ARE HOISTED, NOT INLINED. `systemInstruction` is a separate top-level
 *     field; a system message left inside `contents` is read as if the user said it, which
 *     quietly removes the safety framing from every prompt.
 *  3. A SAFETY BLOCK IS NOT A TRANSPORT FAILURE. `finishReason: SAFETY` and
 *     `promptFeedback.blockReason` arrive as HTTP 200. They map to `content_blocked`, which
 *     the router treats as terminal — shopping a refused children's story to a second vendor
 *     spends money to defeat our own gate.
 *  4. THE FREE TIER'S LIMIT IS REQUESTS PER MINUTE, NOT TOKENS. Hence the pacer: waiting
 *     before the call is cheaper than a 429 plus a retry, and far cheaper than the retry
 *     storm that a burst of thirteen page calls produces on its own.
 *
 * LIVE-CALL CHECKLIST (the first hour with a real key):
 *   a. one `outline` call — does `responseSchema` come back as parseable JSON, first try?
 *   b. one `fill` call at full length — does it truncate at `maxOutputTokens`, and does
 *      `finishReason: MAX_TOKENS` surface as `length` rather than as a broken story?
 *   c. force a 429 (fire 20 calls) — is it classified as a throttle, and does the router
 *      wait rather than abandon the job?
 */

import type {
  LlmAdapter,
  LlmCompleteInput,
  LlmCompleteOutput,
  LlmPurpose,
} from '../core/adapters';
import type { AdapterResult, ProviderCallContext, ProviderName, ProviderUsage } from '../core/types';
import { ProviderError } from '../core/errors';
import { type PriceBook, DEFAULT_PRICE_BOOK, priceLlmCall, roundUsd } from '../core/pricing';
import {
  mapGoogleHttpError,
  mapGoogleTransportError,
  type GoogleErrorEnvelope,
} from '../google/errors';
import { RequestPacer } from '../google/pacing';
import { defaultFetch, type FetchLike, type HttpResponseLike } from './http';
import { toGeminiResponseSchema } from './schema';
import { type LlmThinkingMode, type PurposeProfile, jsonSchemaOf } from './types';

export interface GeminiLlmAdapterOptions {
  /** From `GOOGLE_GENAI_API_KEY` — the SAME key the image and voice adapters use. */
  apiKey: string | undefined;
  /** From `GOOGLE_GENAI_BASE_URL`. */
  baseUrl: string;
  /** From `GOOGLE_GENAI_API_VERSION`. */
  apiVersion: string;
  /** Model id per stage, from `packages/config`. Never a literal (SPEC §3 rule 6). */
  models: Record<LlmPurpose, string>;
  /** Thinking mode per stage; see `thinkingConfigFor`. */
  profiles: Record<LlmPurpose, PurposeProfile>;
  maxOutputTokens: Record<LlmPurpose, number>;
  priceBook?: PriceBook;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
  provider?: ProviderName;
  /** Free-tier pacing. Shared instance ⇒ shared budget across concurrent jobs. */
  pacer?: RequestPacer;
}

/* ── wire shapes ───────────────────────────────────────────────────────────── */

interface GeminiTextPart {
  text?: string;
  /** Reasoning tokens the model chose to expose. Never part of the answer. */
  thought?: boolean;
}

interface GeminiCandidate {
  content?: { parts?: GeminiTextPart[]; role?: string };
  finishReason?: string;
  safetyRatings?: Array<{ category?: string; probability?: string; blocked?: boolean }>;
}

interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  /** Context-cache hits. INCLUDED in `promptTokenCount`, unlike Anthropic's counters. */
  cachedContentTokenCount?: number;
  /** Reasoning tokens. Billed as output; absent on models without thinking. */
  thoughtsTokenCount?: number;
  totalTokenCount?: number;
}

interface GeminiGenerateContentResponse {
  candidates?: GeminiCandidate[];
  promptFeedback?: { blockReason?: string; blockReasonMessage?: string };
  usageMetadata?: GeminiUsageMetadata;
  modelVersion?: string;
}

/**
 * Finish reasons that mean the safety machinery fired. Reported as `content_blocked`, which
 * `ProviderRouter` refuses to fail over on.
 */
const BLOCKING_FINISH_REASONS: ReadonlySet<string> = new Set([
  'SAFETY',
  'PROHIBITED_CONTENT',
  'BLOCKLIST',
  'SPII',
  'RECITATION',
  'IMAGE_SAFETY',
]);

/**
 * The four harm categories, at the strictest threshold the API offers.
 *
 * ⚠️ Explicit on purpose: leaving `safetySettings` out does not mean "default safe" — the
 * per-category defaults are looser than a bedtime story for a four-year-old warrants. A
 * false positive costs one regeneration; a false negative costs the company.
 */
const SAFETY_SETTINGS: ReadonlyArray<{ category: string; threshold: string }> = [
  'HARM_CATEGORY_HARASSMENT',
  'HARM_CATEGORY_HATE_SPEECH',
  'HARM_CATEGORY_SEXUALLY_EXPLICIT',
  'HARM_CATEGORY_DANGEROUS_CONTENT',
].map((category) => ({ category, threshold: 'BLOCK_LOW_AND_ABOVE' }));

export class GeminiLlmAdapter implements LlmAdapter {
  readonly kind = 'llm' as const;
  readonly provider: ProviderName;

  private readonly options: GeminiLlmAdapterOptions;
  private readonly priceBook: PriceBook;
  private readonly fetchImpl: FetchLike;
  private readonly pacer: RequestPacer | undefined;

  constructor(options: GeminiLlmAdapterOptions) {
    this.options = options;
    this.provider = options.provider ?? 'google';
    this.priceBook = options.priceBook ?? DEFAULT_PRICE_BOOK;
    this.fetchImpl = options.fetchImpl ?? defaultFetch();
    this.pacer = options.pacer;
  }

  /** Model id for a stage. Exposed so the content-cache key can include it (SPEC §6.2). */
  modelFor(purpose: LlmPurpose): string {
    return this.options.models[purpose];
  }

  endpointFor(purpose: LlmPurpose): string {
    const base = this.options.baseUrl.replace(/\/+$/u, '');
    const model = encodeURIComponent(this.modelFor(purpose));
    return `${base}/${this.options.apiVersion}/models/${model}:generateContent`;
  }

  async complete(
    input: LlmCompleteInput,
    ctx: ProviderCallContext,
  ): Promise<AdapterResult<LlmCompleteOutput>> {
    if (!this.options.apiKey) {
      // Specific and non-retryable, at call time rather than at boot: a missing key must be
      // loud, and must not burn three retries per chunk on its way to being loud.
      throw new ProviderError({
        kind: 'auth',
        provider: this.provider,
        operation: 'llm.complete',
        detail:
          'GOOGLE_GENAI_API_KEY is not set. Set it with API_MODE=live, or run the ' +
          'deterministic double with API_MODE=mock.',
      });
    }

    const model = this.modelFor(input.purpose);
    const body = this.buildBody(input);

    // Paced BEFORE the timeout starts: a request that waited 6 seconds for its turn still
    // gets its full wall-clock budget once it actually leaves.
    await this.pacer?.acquire(ctx.signal);

    const startedAt = Date.now();
    const { signal, cancel, timedOut } = withTimeout(
      ctx.timeoutMs ?? this.options.timeoutMs ?? 180_000,
      ctx.signal,
    );

    let response: HttpResponseLike;
    try {
      response = await this.fetchImpl(this.endpointFor(input.purpose), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': this.options.apiKey,
          // Stable across retries (uuidv5 of the job step): a vendor that dedupes
          // server-side must not count the same generation against the quota twice.
          'x-goog-request-params': `request_id=${ctx.requestId}`,
        },
        body: JSON.stringify(body),
        signal,
      });
    } catch (error) {
      throw mapGoogleTransportError(error, {
        provider: this.provider,
        operation: 'llm.complete',
        timedOut: timedOut(),
        timeoutVar: 'LLM_REQUEST_TIMEOUT_MS',
      });
    } finally {
      cancel();
    }

    const raw = await response.text();
    const latencyMs = Date.now() - startedAt;

    if (!response.ok) {
      throw mapGoogleHttpError({
        provider: this.provider,
        operation: 'llm.complete',
        httpStatus: response.status,
        envelope: safeJson<GoogleErrorEnvelope>(raw),
        rawBody: raw.slice(0, 500),
        retryAfterHeader: response.headers.get('retry-after'),
      });
    }

    const parsed = safeJson<GeminiGenerateContentResponse>(raw);
    if (parsed === undefined) {
      // A 200 that is not JSON is an edge proxy, not the model. Retryable.
      throw new ProviderError({
        kind: 'unavailable',
        provider: this.provider,
        operation: 'llm.complete',
        detail: `200 response was not JSON: ${raw.slice(0, 200)}`,
      });
    }

    return this.readResponse(parsed, latencyMs, input, model);
  }

  /* ── request ─────────────────────────────────────────────────────────────── */

  private buildBody(input: LlmCompleteInput): Record<string, unknown> {
    const profile = this.options.profiles[input.purpose];
    const maxOutputTokens = Math.min(
      input.maxOutputTokens,
      this.options.maxOutputTokens[input.purpose],
    );

    const systemText = input.messages
      .filter((message) => message.role === 'system')
      .map((message) => message.content)
      .join('\n\n');

    const contents = input.messages
      .filter((message) => message.role !== 'system')
      // `assistant` is spelled `model` here. Sending `assistant` is a 400, and sending the
      // repair loop's previous answer under the wrong role would make the model treat its
      // own broken JSON as a user instruction.
      .map((message) => ({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: message.content }],
      }));

    if (contents.length === 0) {
      throw new ProviderError({
        kind: 'invalid_request',
        provider: this.provider,
        operation: 'llm.complete',
        detail: 'at least one user/assistant message is required',
      });
    }

    const schema = jsonSchemaOf(input);
    const wantsJson = schema !== undefined || input.responseFormat === 'json';
    const thinkingConfig = thinkingConfigFor(profile?.thinking ?? 'off');

    const generationConfig: Record<string, unknown> = {
      maxOutputTokens,
      // NO temperature / topP / topK. `LlmCompleteInput.temperature` is accepted by the
      // interface and deliberately dropped: steering a children's story by sampling
      // parameters is unreproducible, and the prompt does the work instead.
      ...(wantsJson ? { responseMimeType: 'application/json' } : {}),
      ...(schema ? { responseSchema: toGeminiResponseSchema(schema) } : {}),
      ...(input.stopSequences && input.stopSequences.length > 0
        ? { stopSequences: input.stopSequences }
        : {}),
      ...(thinkingConfig ? { thinkingConfig } : {}),
    };

    return {
      ...(systemText ? { systemInstruction: { parts: [{ text: systemText }] } } : {}),
      contents,
      generationConfig,
      safetySettings: SAFETY_SETTINGS.map((setting) => ({ ...setting })),
    };
  }

  /* ── response ────────────────────────────────────────────────────────────── */

  private readResponse(
    body: GeminiGenerateContentResponse,
    latencyMs: number,
    input: LlmCompleteInput,
    requestedModel: string,
  ): AdapterResult<LlmCompleteOutput> {
    const model = body.modelVersion ?? requestedModel;

    // ⚠️ Checked before anything indexes `candidates[0]`: a prompt-level block returns a
    // 200 with no candidates at all, and `candidates[0].content` would throw a TypeError
    // that the router would then classify as `unknown` instead of as a safety refusal.
    const promptBlock = body.promptFeedback?.blockReason;
    if (promptBlock) {
      throw new ProviderError({
        kind: 'content_blocked',
        provider: this.provider,
        operation: 'llm.complete',
        detail: body.promptFeedback?.blockReasonMessage ?? `prompt blocked: ${promptBlock}`,
        providerCode: `prompt_feedback:${promptBlock}`,
      });
    }

    const candidate = body.candidates?.[0];
    if (!candidate) {
      throw new ProviderError({
        kind: 'unavailable',
        provider: this.provider,
        operation: 'llm.complete',
        detail: 'response contained no candidates',
      });
    }

    const finishReason = candidate.finishReason ?? 'STOP';
    if (BLOCKING_FINISH_REASONS.has(finishReason)) {
      const blocked = candidate.safetyRatings?.find((rating) => rating.blocked === true);
      throw new ProviderError({
        kind: 'content_blocked',
        provider: this.provider,
        operation: 'llm.complete',
        detail: `generation stopped by the safety filter (${finishReason})`,
        providerCode: blocked?.category ?? `finish_reason:${finishReason}`,
      });
    }

    // `thought: true` parts are the model's reasoning trace. Concatenating them into the
    // answer would put Turkish deliberation prose in front of the JSON and fail every
    // parse — and would leak reasoning into a story a child reads.
    const text = (candidate.content?.parts ?? [])
      .filter((part) => part.thought !== true && typeof part.text === 'string')
      .map((part) => part.text as string)
      .join('');

    const usage = body.usageMetadata ?? {};
    const cachedInput = usage.cachedContentTokenCount ?? 0;
    const promptTokens = usage.promptTokenCount ?? 0;
    // `promptTokenCount` INCLUDES the cached tokens (OpenAI's convention, not Anthropic's).
    // Not subtracting them bills the same tokens twice in every cost report.
    const uncachedInput = Math.max(0, promptTokens - cachedInput);
    // Reasoning tokens are billed at the output rate and are NOT inside
    // `candidatesTokenCount`. Ignoring them under-reports a thinking model by a third.
    const outputTokens = (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0);

    const costUsd = roundUsd(
      priceLlmCall(
        this.priceBook,
        input.purpose,
        { input: uncachedInput, output: outputTokens, cachedInput },
        false,
      ),
    );

    // Recorded even when the price book is the free one: on a free tier the row is the only
    // record of quota consumed, and `costUsd: 0` is the fact, not the absence of one.
    const billedUnits = promptTokens + outputTokens;
    const providerUsage: ProviderUsage = {
      provider: this.provider,
      model,
      operation: 'llm.complete',
      billingUnit: 'token',
      billedUnits,
      unitPriceUsd: billedUnits > 0 ? costUsd / billedUnits : 0,
      costUsd,
      cacheHit: cachedInput > 0,
      latencyMs,
    };

    return {
      value: {
        text,
        finishReason: finishReasonOf(finishReason),
        tokens: { input: uncachedInput, output: outputTokens, cachedInput },
        model,
      },
      usage: [providerUsage],
    };
  }
}

/* ── helpers ───────────────────────────────────────────────────────────────── */

/**
 * Thinking budget.
 *
 * `-1` is the vendor's "decide for yourself" value, which is what `adaptive` means
 * everywhere else in this package. `off` omits the field ENTIRELY rather than sending
 * `thinkingBudget: 0` — a model that cannot disable thinking answers a zero budget with a
 * 400, and the judge stage failing for a formatting reason would fail the whole story.
 */
function thinkingConfigFor(mode: LlmThinkingMode): Record<string, unknown> | undefined {
  return mode === 'adaptive' ? { thinkingBudget: -1 } : undefined;
}

/**
 * `MAX_TOKENS` ⇒ `length`, not an error: eleven of twelve pages is a partial result the
 * caller repairs by asking for fewer pages, not a lost job.
 */
function finishReasonOf(reason: string): LlmCompleteOutput['finishReason'] {
  switch (reason) {
    case 'MAX_TOKENS':
      return 'length';
    case 'MALFORMED_FUNCTION_CALL':
      return 'tool_use';
    default:
      return 'stop';
  }
}

function safeJson<T>(text: string): T | undefined {
  if (text.trim() === '') return undefined;
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
}

/**
 * Wall-clock budget for one call, composed with the caller's own abort.
 *
 * Hand-rolled rather than `AbortSignal.any()` because the caller must know WHICH signal
 * fired: our timeout is a retryable vendor fault, the caller's abort is a cancelled job and
 * must not be reported as one.
 */
function withTimeout(
  timeoutMs: number,
  external?: AbortSignal,
): { signal: AbortSignal; cancel: () => void; timedOut: () => boolean } {
  const controller = new AbortController();
  let fired = false;

  const timer = setTimeout(() => {
    fired = true;
    controller.abort();
  }, timeoutMs);
  (timer as unknown as { unref?: () => void }).unref?.();

  const onExternalAbort = () => controller.abort();
  external?.addEventListener('abort', onExternalAbort, { once: true });

  return {
    signal: controller.signal,
    cancel: () => {
      clearTimeout(timer);
      external?.removeEventListener('abort', onExternalAbort);
    },
    timedOut: () => fired,
  };
}
