/**
 * llm/openai.ts — the SECONDARY LLM adapter, used only when the route says so.
 *
 * ⚠️ NOT TESTED AGAINST THE LIVE VENDOR (no key, no egress). Written to the vendor's
 * documented chat-completions wire shape and exercised against recorded fixtures.
 *
 * A second vendor exists for one reason: `ProviderRouter` can only fail over if there is
 * somewhere to fail over TO. It is off by default (`LLM_FALLBACK_PROVIDER=none`) because a
 * fallback nobody has ever exercised is a liability, not a safety net — turning it on is a
 * deliberate per-environment decision.
 *
 * Note what does NOT fail over: a content block. `ProviderRouter` stops the route on a
 * non-retryable, non-failover-worthy error, and `content_blocked` is exactly that — a
 * children's story refused by one vendor should be refused, not shopped around.
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
import { defaultFetch, postJson, type FetchLike } from './http';
import { jsonSchemaOf, schemaNameOf } from './types';

export interface OpenAiLlmAdapterOptions {
  apiKey: string | undefined;
  baseUrl: string;
  models: Record<LlmPurpose, string>;
  maxOutputTokens: Record<LlmPurpose, number>;
  priceBook?: PriceBook;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
  provider?: ProviderName;
}

interface OpenAiChoice {
  message?: { content?: string | null; refusal?: string | null };
  finish_reason?: string | null;
}

interface OpenAiResponse {
  model?: string;
  choices?: OpenAiChoice[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
  };
}

export class OpenAiLlmAdapter implements LlmAdapter {
  readonly kind = 'llm' as const;
  readonly provider: ProviderName;

  private readonly options: OpenAiLlmAdapterOptions;
  private readonly priceBook: PriceBook;
  private readonly fetchImpl: FetchLike;

  constructor(options: OpenAiLlmAdapterOptions) {
    this.options = options;
    this.provider = options.provider ?? 'openai';
    this.priceBook = options.priceBook ?? DEFAULT_PRICE_BOOK;
    this.fetchImpl = options.fetchImpl ?? defaultFetch();
  }

  modelFor(purpose: LlmPurpose): string {
    return this.options.models[purpose];
  }

  async complete(
    input: LlmCompleteInput,
    ctx: ProviderCallContext,
  ): Promise<AdapterResult<LlmCompleteOutput>> {
    if (!this.options.apiKey) {
      throw new ProviderError({
        kind: 'auth',
        provider: this.provider,
        operation: 'llm.complete',
        detail: 'OPENAI_API_KEY is not set; the fallback LLM route cannot run',
      });
    }

    const model = this.modelFor(input.purpose);
    const schema = jsonSchemaOf(input);

    const body: Record<string, unknown> = {
      model,
      max_completion_tokens: Math.min(
        input.maxOutputTokens,
        this.options.maxOutputTokens[input.purpose],
      ),
      messages: input.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      ...(schema
        ? {
            response_format: {
              type: 'json_schema',
              json_schema: { name: schemaNameOf(input), strict: true, schema },
            },
          }
        : {}),
      ...(input.stopSequences && input.stopSequences.length > 0
        ? { stop: input.stopSequences }
        : {}),
    };

    const response = await postJson({
      url: `${this.options.baseUrl.replace(/\/+$/u, '')}/v1/chat/completions`,
      headers: { authorization: `Bearer ${this.options.apiKey}` },
      body,
      provider: this.provider,
      operation: 'llm.complete',
      timeoutMs: ctx.timeoutMs ?? this.options.timeoutMs ?? 180_000,
      ...(ctx.signal ? { signal: ctx.signal } : {}),
      fetchImpl: this.fetchImpl,
    });

    return this.readResponse(response.body, response.latencyMs, input, model);
  }

  private readResponse(
    body: unknown,
    latencyMs: number,
    input: LlmCompleteInput,
    requestedModel: string,
  ): AdapterResult<LlmCompleteOutput> {
    const parsed = body as OpenAiResponse;
    const choice = parsed?.choices?.[0];
    if (!choice) {
      throw new ProviderError({
        kind: 'unknown',
        provider: this.provider,
        operation: 'llm.complete',
        detail: 'response contained no choices',
      });
    }

    // Refusal and safety stop arrive as a successful response, exactly like Anthropic's.
    if (choice.message?.refusal) {
      throw new ProviderError({
        kind: 'content_blocked',
        provider: this.provider,
        operation: 'llm.complete',
        detail: choice.message.refusal,
      });
    }
    if (choice.finish_reason === 'content_filter') {
      throw new ProviderError({
        kind: 'content_blocked',
        provider: this.provider,
        operation: 'llm.complete',
        detail: 'content filter stopped the generation',
      });
    }

    const usage = parsed.usage ?? {};
    const cachedInput = usage.prompt_tokens_details?.cached_tokens ?? 0;
    const promptTokens = usage.prompt_tokens ?? 0;
    const outputTokens = usage.completion_tokens ?? 0;
    // `prompt_tokens` INCLUDES the cached ones here (unlike Anthropic's counters), so the
    // uncached remainder has to be derived or the cached tokens get billed twice.
    const uncachedInput = Math.max(0, promptTokens - cachedInput);

    const costUsd = roundUsd(
      priceLlmCall(
        this.priceBook,
        input.purpose,
        { input: uncachedInput, output: outputTokens, cachedInput },
        false,
      ),
    );

    const billedUnits = promptTokens + outputTokens;
    const model = parsed.model ?? requestedModel;

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
        text: choice.message?.content ?? '',
        finishReason: choice.finish_reason === 'length' ? 'length' : 'stop',
        tokens: { input: uncachedInput, output: outputTokens, cachedInput },
        model,
      },
      usage: [providerUsage],
    };
  }
}
