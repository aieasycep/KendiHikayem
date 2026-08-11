/**
 * moderation/openai.ts — the real moderation adapter (SPEC §10.4 layers K2 and K4b).
 *
 * ⚠️ NOT TESTED AGAINST THE LIVE VENDOR (no key, no egress). Written to the vendor's
 * documented wire shape and exercised against recorded fixtures.
 *
 * Why this vendor: the multimodal moderation endpoint is free, is documented as materially
 * better in Turkish than its predecessor, and does not count against the account's token
 * quota (docs/research/03-story.md §4a). Free matters here because moderation runs three
 * times per story and must never be the thing someone switches off to save money.
 *
 * What it is NOT: an age filter. "Büyükanne öldü ve Ayşe çok üzüldü" comes back clean, and
 * for a 3-5 band that is the wrong answer — hence `packages/safety`'s own age rubric. This
 * adapter is one of six layers, not the safety story.
 */

import type {
  ModerationAdapter,
  ModerationCheckInput,
  ModerationCheckOutput,
} from '../core/adapters';
import type { AdapterResult, ProviderCallContext, ProviderName, ProviderUsage } from '../core/types';
import { ProviderError } from '../core/errors';
import { defaultFetch, postJson, type FetchLike } from '../llm/http';

export interface OpenAiModerationAdapterOptions {
  apiKey: string | undefined;
  baseUrl: string;
  model: string;
  /**
   * A score at or above this is a BLOCK even when the vendor's own boolean says otherwise.
   * Their flag is tuned for a general audience; a bedtime story for a four-year-old is not
   * a general audience.
   */
  blockThreshold: number;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
  provider?: ProviderName;
}

interface OpenAiModerationResult {
  flagged?: boolean;
  categories?: Record<string, boolean | null>;
  category_scores?: Record<string, number | null>;
}

interface OpenAiModerationResponse {
  model?: string;
  results?: OpenAiModerationResult[];
}

export class OpenAiModerationAdapter implements ModerationAdapter {
  readonly kind = 'moderation' as const;
  readonly provider: ProviderName;

  private readonly options: OpenAiModerationAdapterOptions;
  private readonly fetchImpl: FetchLike;

  constructor(options: OpenAiModerationAdapterOptions) {
    this.options = options;
    this.provider = options.provider ?? 'openai';
    this.fetchImpl = options.fetchImpl ?? defaultFetch();
  }

  async check(
    input: ModerationCheckInput,
    ctx: ProviderCallContext,
  ): Promise<AdapterResult<ModerationCheckOutput>> {
    if (!this.options.apiKey) {
      throw new ProviderError({
        kind: 'auth',
        provider: this.provider,
        operation: 'moderation.check',
        detail: 'OPENAI_API_KEY is not set; cannot run the live moderation adapter',
      });
    }

    const parts: Array<Record<string, unknown>> = [];
    if (input.text) parts.push({ type: 'text', text: input.text });
    if (input.image) {
      parts.push({
        type: 'image_url',
        image_url: { url: `data:${input.image.mimeType};base64,${base64(input.image.bytes)}` },
      });
    }
    if (parts.length === 0) {
      throw new ProviderError({
        kind: 'invalid_request',
        provider: this.provider,
        operation: 'moderation.check',
        detail: 'moderation called with neither text nor image',
      });
    }

    const response = await postJson({
      url: `${this.options.baseUrl.replace(/\/+$/u, '')}/v1/moderations`,
      headers: { authorization: `Bearer ${this.options.apiKey}` },
      body: { model: this.options.model, input: parts },
      provider: this.provider,
      operation: 'moderation.check',
      timeoutMs: ctx.timeoutMs ?? this.options.timeoutMs ?? 15_000,
      ...(ctx.signal ? { signal: ctx.signal } : {}),
      fetchImpl: this.fetchImpl,
    });

    return this.readResponse(response.body, response.latencyMs);
  }

  private readResponse(
    body: unknown,
    latencyMs: number,
  ): AdapterResult<ModerationCheckOutput> {
    const parsed = body as OpenAiModerationResponse;
    const result = parsed?.results?.[0];
    if (!result) {
      throw new ProviderError({
        kind: 'unknown',
        provider: this.provider,
        operation: 'moderation.check',
        detail: 'moderation response contained no results',
      });
    }

    const scores: Record<string, number> = {};
    for (const [key, value] of Object.entries(result.category_scores ?? {})) {
      if (typeof value === 'number') scores[key] = value;
    }
    const categories: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(result.categories ?? {})) {
      if (value === true) categories[key] = true;
    }

    const maxScore = Object.values(scores).reduce((max, score) => Math.max(max, score), 0);
    const verdict: ModerationCheckOutput['verdict'] =
      result.flagged === true || maxScore >= this.options.blockThreshold
        ? 'block'
        : // Half the block threshold is a review signal, not a refusal: it lands in
          // `moderation_events` for ops without failing a parent's story.
          maxScore >= this.options.blockThreshold / 2
          ? 'flag'
          : 'pass';

    const model = parsed.model ?? this.options.model;
    const usage: ProviderUsage = {
      provider: this.provider,
      model,
      operation: 'moderation.check',
      billingUnit: 'request',
      billedUnits: 1,
      // Free, and recorded anyway: a call that costs nothing still has to be countable.
      unitPriceUsd: 0,
      costUsd: 0,
      cacheHit: false,
      latencyMs,
    };

    return { value: { verdict, categories, scores, model }, usage: [usage] };
  }
}

function base64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}
