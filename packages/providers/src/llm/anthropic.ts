/**
 * llm/anthropic.ts — the real primary LLM adapter (SPEC §6, §12 A3).
 *
 * ⚠️ NOT TESTED AGAINST THE LIVE VENDOR. This environment has no key and no egress to
 * `api.anthropic.com`. Every test in `anthropic.test.ts` replays a recorded response body
 * in the vendor's documented wire shape. The request builder, the response parser, the
 * error mapping and the cost accounting are all exercised; the network is not.
 *
 * Four decisions that are easy to get wrong and expensive to get wrong:
 *
 *  1. NO MODEL NAME IN THIS FILE. `models` arrives from `packages/config`
 *     (`LLM_MODEL_OUTLINE` / `_FILL` / `_JUDGE`); `eslint.config.mjs` makes a literal one a
 *     build error (SPEC §3 rule 6).
 *  2. NO SAMPLING PARAMETERS. `temperature` / `top_p` / `top_k` are rejected outright by
 *     the current flagship models — a request carrying one fails with 400 rather than
 *     degrading. `LlmCompleteInput.temperature` is therefore accepted and deliberately
 *     dropped; steering is done with prompt text.
 *  3. THINKING IS `adaptive` OR ABSENT. The fixed-budget form the older models used is
 *     rejected by the current ones, so the mode is a config value with exactly two states.
 *     Likewise `effort`: the cheap judge tier rejects the field, so `'none'` means *omit*,
 *     not "low".
 *  4. A REFUSAL IS NOT A FAILURE TO ROUTE AROUND. `stop_reason: "refusal"` arrives as a
 *     perfectly successful HTTP 200; it is mapped to `content_blocked`, which the router
 *     treats as terminal. Retrying a refused children's story on a second vendor would
 *     spend money to defeat our own safety gate — this is why the vendor's server-side
 *     refusal-fallback feature is deliberately NOT enabled here.
 */

import { createHash } from 'node:crypto';

import type {
  LlmAdapter,
  LlmCompleteInput,
  LlmCompleteOutput,
  LlmPurpose,
} from '../core/adapters';
import type { AdapterResult, ProviderCallContext, ProviderName, ProviderUsage } from '../core/types';
import { ProviderError } from '../core/errors';
import {
  type PriceBook,
  DEFAULT_PRICE_BOOK,
  priceLlmCall,
  roundUsd,
} from '../core/pricing';
import { defaultFetch, postJson, type FetchLike } from './http';
import type { JsonSchema } from './schema';
import {
  type LlmEffort,
  type LlmThinkingMode,
  type PurposeProfile,
  jsonSchemaOf,
} from './types';

/**
 * Writing to the prompt cache costs ~1.25× the base input rate; reading from it ~0.1×.
 * The shared `PriceBook` has a row for the read rate but not the write premium, so the
 * premium is applied here, where the vendor's own cache-creation counter is in hand.
 */
const CACHE_WRITE_MULTIPLIER = 1.25;

export interface AnthropicLlmAdapterOptions {
  /** Missing key ⇒ every call fails with a mapped `auth` error, at call time, not at boot. */
  apiKey: string | undefined;
  baseUrl: string;
  apiVersion: string;
  /** Comma-separated `anthropic-beta` values from config; usually empty. */
  beta?: string | undefined;
  /** Model id per stage — a value from `packages/config`, never a literal. */
  models: Record<LlmPurpose, string>;
  /** Thinking mode + effort per stage; see decision 3 in the file header. */
  profiles: Record<LlmPurpose, PurposeProfile>;
  /** Output ceiling per stage. Thinking tokens count against it. */
  maxOutputTokens: Record<LlmPurpose, number>;
  priceBook?: PriceBook;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
  provider?: ProviderName;
}

interface AnthropicUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

interface AnthropicContentBlock {
  type: string;
  text?: string;
}

interface AnthropicMessageResponse {
  id?: string;
  model?: string;
  content?: AnthropicContentBlock[];
  stop_reason?: string | null;
  stop_details?: { type?: string; category?: string | null; explanation?: string } | null;
  usage?: AnthropicUsage;
}

export class AnthropicLlmAdapter implements LlmAdapter {
  readonly kind = 'llm' as const;
  readonly provider: ProviderName;

  private readonly options: AnthropicLlmAdapterOptions;
  private readonly priceBook: PriceBook;
  private readonly fetchImpl: FetchLike;

  constructor(options: AnthropicLlmAdapterOptions) {
    this.options = options;
    this.provider = options.provider ?? 'anthropic';
    this.priceBook = options.priceBook ?? DEFAULT_PRICE_BOOK;
    this.fetchImpl = options.fetchImpl ?? defaultFetch();
  }

  /** Model id for a stage. Exposed so the cache key can include it (SPEC §6.2 rule 4). */
  modelFor(purpose: LlmPurpose): string {
    return this.options.models[purpose];
  }

  async complete(
    input: LlmCompleteInput,
    ctx: ProviderCallContext,
  ): Promise<AdapterResult<LlmCompleteOutput>> {
    const model = this.modelFor(input.purpose);
    if (!this.options.apiKey) {
      // A healthy, specific error — not a crash, and not a silent fall back to the fake.
      throw new ProviderError({
        kind: 'auth',
        provider: this.provider,
        operation: 'llm.complete',
        detail: 'ANTHROPIC_API_KEY is not set; cannot run the live LLM adapter',
      });
    }

    const body = this.buildBody(input, model, ctx);
    const response = await postJson({
      url: `${this.options.baseUrl.replace(/\/+$/u, '')}/v1/messages`,
      headers: {
        'x-api-key': this.options.apiKey,
        'anthropic-version': this.options.apiVersion,
        ...(this.options.beta ? { 'anthropic-beta': this.options.beta } : {}),
      },
      body,
      provider: this.provider,
      operation: 'llm.complete',
      timeoutMs: ctx.timeoutMs ?? this.options.timeoutMs ?? 180_000,
      ...(ctx.signal ? { signal: ctx.signal } : {}),
      fetchImpl: this.fetchImpl,
    });

    return this.readResponse(response.body, response.latencyMs, input, model);
  }

  /* ── request ─────────────────────────────────────────────────────────────── */

  private buildBody(
    input: LlmCompleteInput,
    model: string,
    ctx: ProviderCallContext,
  ): Record<string, unknown> {
    const profile = this.options.profiles[input.purpose];
    const maxTokens = Math.min(
      input.maxOutputTokens,
      this.options.maxOutputTokens[input.purpose],
    );

    const system = this.buildSystemBlocks(input);
    const messages = this.buildMessages(input);
    if (messages.length === 0) {
      throw new ProviderError({
        kind: 'invalid_request',
        provider: this.provider,
        operation: 'llm.complete',
        detail: 'at least one user/assistant message is required',
      });
    }

    const outputConfig = this.buildOutputConfig(input, profile.effort);
    const thinking = thinkingFor(profile.thinking);

    return {
      model,
      max_tokens: maxTokens,
      ...(system.length > 0 ? { system } : {}),
      messages,
      ...(thinking ? { thinking } : {}),
      ...(outputConfig ? { output_config: outputConfig } : {}),
      ...(input.stopSequences && input.stopSequences.length > 0
        ? { stop_sequences: input.stopSequences }
        : {}),
      // KVKK data minimisation: the vendor gets a per-user pseudonym for abuse detection,
      // never our own user id. It lives outside the cacheable prefix, so caching is intact.
      ...(ctx.userId ? { metadata: { user_id: pseudonym(ctx.userId) } } : {}),
    };
  }

  /**
   * All `system` messages are hoisted into the top-level `system` array, in order.
   *
   * The vendor also accepts a mid-conversation `role: "system"` message, but only on some
   * models — and a model that does not support it answers with a 400, i.e. the fallback
   * model in our route would behave differently from the primary. Hoisting is portable and
   * keeps the cacheable prefix in exactly one place.
   *
   * `cache_control` goes on the LAST cacheable block: the marker caches everything before
   * it, so one breakpoint covers the whole static prefix (SPEC §6.2 rule 2).
   */
  private buildSystemBlocks(input: LlmCompleteInput): Array<Record<string, unknown>> {
    const systemMessages = input.messages.filter((m) => m.role === 'system');
    const lastCacheableIndex = systemMessages.reduce(
      (last, message, index) => (message.cacheable ? index : last),
      -1,
    );

    return systemMessages.map((message, index) => ({
      type: 'text',
      text: message.content,
      ...(index === lastCacheableIndex ? { cache_control: { type: 'ephemeral' } } : {}),
    }));
  }

  private buildMessages(input: LlmCompleteInput): Array<Record<string, unknown>> {
    return input.messages
      .filter((m) => m.role !== 'system')
      .map((message) => ({
        role: message.role,
        content: [{ type: 'text', text: message.content }],
      }));
  }

  /**
   * `output_config` carries BOTH the reasoning effort and the structured-output format.
   * `effort: 'none'` omits the field — the cheap judge tier rejects it outright, and a 400
   * on the safety judge would fail the whole story for a formatting reason.
   */
  private buildOutputConfig(
    input: LlmCompleteInput,
    effort: LlmEffort,
  ): Record<string, unknown> | undefined {
    const schema: JsonSchema | undefined = jsonSchemaOf(input);
    // A caller-supplied effort wins over the stage default; `none` can only come from
    // config, because `LlmCompleteInput.effort` has no such value.
    const resolvedEffort: LlmEffort = input.effort ?? effort;

    const config: Record<string, unknown> = {};
    if (resolvedEffort !== 'none') config['effort'] = resolvedEffort;
    // Without a schema there is no `format` block: an unconstrained "json mode" buys
    // nothing the parser can rely on, and the prompt asks for JSON anyway.
    if (schema) config['format'] = { type: 'json_schema', schema };

    return Object.keys(config).length > 0 ? config : undefined;
  }

  /* ── response ────────────────────────────────────────────────────────────── */

  private readResponse(
    body: unknown,
    latencyMs: number,
    input: LlmCompleteInput,
    requestedModel: string,
  ): AdapterResult<LlmCompleteOutput> {
    const message = body as AnthropicMessageResponse;
    if (typeof message !== 'object' || message === null || !Array.isArray(message.content)) {
      throw new ProviderError({
        kind: 'unknown',
        provider: this.provider,
        operation: 'llm.complete',
        detail: 'response had no content array',
      });
    }

    // ⚠️ Checked BEFORE reading content: a refusal is an HTTP 200 with empty or partial
    // content, and code that indexes content[0] breaks on it.
    if (message.stop_reason === 'refusal') {
      throw new ProviderError({
        kind: 'content_blocked',
        provider: this.provider,
        operation: 'llm.complete',
        detail: message.stop_details?.explanation ?? 'model refused the request',
        ...(message.stop_details?.category
          ? { providerCode: message.stop_details.category }
          : {}),
      });
    }

    const text = message.content
      .filter((block) => block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text as string)
      .join('');

    const usage = message.usage ?? {};
    const inputTokens = usage.input_tokens ?? 0;
    const cacheCreation = usage.cache_creation_input_tokens ?? 0;
    const cachedInput = usage.cache_read_input_tokens ?? 0;
    const outputTokens = usage.output_tokens ?? 0;

    const costUsd = roundUsd(
      priceLlmCall(
        this.priceBook,
        input.purpose,
        {
          // Cache WRITES are billed above the base input rate; the premium is folded in
          // here rather than pretending they were ordinary input tokens.
          input: inputTokens + cacheCreation * CACHE_WRITE_MULTIPLIER,
          output: outputTokens,
          cachedInput,
        },
        false,
      ),
    );

    const billedUnits = inputTokens + cacheCreation + cachedInput + outputTokens;
    const model = message.model ?? requestedModel;

    const providerUsage: ProviderUsage = {
      provider: this.provider,
      model,
      operation: 'llm.complete',
      billingUnit: 'token',
      billedUnits,
      unitPriceUsd: costUsd / Math.max(1, billedUnits),
      costUsd,
      cacheHit: cachedInput > 0,
      latencyMs,
    };

    return {
      value: {
        text,
        finishReason: finishReasonOf(message.stop_reason),
        tokens: {
          // `input` is what was processed at full price: uncached + freshly cached.
          input: inputTokens + cacheCreation,
          output: outputTokens,
          cachedInput,
        },
        model,
      },
      usage: [providerUsage],
    };
  }
}

/* ── helpers ───────────────────────────────────────────────────────────────── */

function thinkingFor(mode: LlmThinkingMode): Record<string, unknown> | undefined {
  return mode === 'adaptive' ? { type: 'adaptive' } : undefined;
}

/**
 * `max_tokens` ⇒ 'length' rather than an error: stage 2 producing 11 of 12 pages is a
 * partial result the caller can repair by asking for fewer pages, not a lost job.
 */
function finishReasonOf(stopReason: string | null | undefined): LlmCompleteOutput['finishReason'] {
  switch (stopReason) {
    case 'max_tokens':
      return 'length';
    case 'tool_use':
      return 'tool_use';
    case 'refusal':
      return 'refusal';
    default:
      return 'stop';
  }
}

/** Stable per-user pseudonym. Same user ⇒ same value; the vendor never sees ours. */
function pseudonym(userId: string): string {
  return createHash('sha256').update(`kendihikayem:${userId}`).digest('hex').slice(0, 32);
}
