/**
 * tts/cartesia/adapter.ts — the silent fallback.
 *
 * SPEC §7 step 8: when ElevenLabs is exhausted — slot ceiling, quota, an outage — the router
 * fails over here and "kullanıcı fark etmez". That phrase sets the design constraint: this
 * adapter must satisfy the same `TtsAdapter` interface with the same units, the same error
 * kinds and the same cost accounting, because everything upstream (chunk cache, page marks,
 * reservations) is written against the interface and not against a vendor.
 *
 * ⚠️ Two honest gaps, both of which the caller already handles:
 *
 *  1. NO WORD TIMINGS. The bytes endpoint returns audio only, so `alignment` is absent and
 *     the pipeline falls to `forced_alignment` or `sentence_estimate` — the reader keeps
 *     working, word highlighting degrades to sentence highlighting.
 *  2. A DIFFERENT VOICE. A cloned voice is vendor-specific; failing over mid-story would
 *     change who is reading. The worker therefore only fails over for SYSTEM voices, or
 *     after re-cloning the reference here.
 *
 * Like the ElevenLabs adapter, this has never been run against the live API.
 */

import type { Tier } from '@kendihikayem/contract';

import type {
  CreateVoiceInput,
  CreateVoiceOutput,
  SynthesizeInput,
  SynthesizeOutput,
  TtsAdapter,
} from '../../core/adapters';
import type { AdapterResult, ProviderCallContext, ProviderUsage } from '../../core/types';
import { ProviderError, type ProviderErrorKind } from '../../core/errors';
import { DEFAULT_PRICE_BOOK, type PriceBook, priceTtsCall, roundUsd } from '../../core/pricing';
import {
  HttpNetworkError,
  HttpTimeoutError,
  type HttpRequest,
  type HttpResponse,
  type HttpTransport,
  decodeJson,
  decodeText,
  fetchTransport,
  retryAfterMs,
} from '../http';
import type { TtsSettings } from '../settings';
import { assertVoiceCloningAvailable } from '../cloning';
import { audioDurationMs } from '../audio/duration';

export interface CartesiaAdapterOptions {
  settings: TtsSettings;
  transport?: HttpTransport;
  priceBook?: PriceBook;
  now?: () => number;
}

export class CartesiaTtsAdapter implements TtsAdapter {
  readonly provider = 'cartesia' as const;
  readonly kind = 'tts' as const;

  private readonly settings: TtsSettings;
  private readonly transport: HttpTransport;
  private readonly priceBook: PriceBook;
  private readonly now: () => number;

  constructor(options: CartesiaAdapterOptions) {
    this.settings = options.settings;
    this.transport = options.transport ?? fetchTransport;
    this.priceBook = options.priceBook ?? DEFAULT_PRICE_BOOK;
    this.now = options.now ?? Date.now;
  }

  async synthesize(
    input: SynthesizeInput,
    ctx: ProviderCallContext,
  ): Promise<AdapterResult<SynthesizeOutput>> {
    const modelId = this.modelFor(input.tier);
    const startedAt = this.now();

    const response = await this.send(
      {
        method: 'POST',
        url: `${this.base()}/tts/bytes`,
        headers: this.headers(ctx.requestId),
        json: {
          model_id: modelId,
          transcript: input.text,
          voice: { mode: 'id', id: input.voice.providerVoiceId },
          language: input.languageCode,
          output_format: {
            container: 'raw',
            encoding: 'pcm_s16le',
            sample_rate: 48_000,
          },
        },
        timeoutMs: this.settings.timeouts.synthesizeMs,
        ...(ctx.signal ? { signal: ctx.signal } : {}),
      },
      'tts.synth',
    );

    const latencyMs = this.now() - startedAt;
    const billedCharacters = input.text.length;
    const costUsd = roundUsd(priceTtsCall(this.priceBook, input.tier, billedCharacters));

    return {
      value: {
        audio: response.bytes,
        mimeType: 'audio/L16',
        durationMs: audioDurationMs(response.bytes, {
          mimeType: 'audio/L16',
          sampleRate: 48_000,
          bitsPerSample: 16,
          channels: 1,
        }),
        billedCharacters,
        model: modelId,
        // No `alignment`: see the file header. The caller falls back, it does not fail.
      },
      usage: [
        this.usage('tts.synth', modelId, 'character', billedCharacters, costUsd, latencyMs),
      ],
    };
  }

  async createVoice(
    input: CreateVoiceInput,
    ctx: ProviderCallContext,
  ): Promise<AdapterResult<CreateVoiceOutput>> {
    // Same product switch as the primary vendor: "cloning is off" must not become "cloning
    // is off unless we happened to fail over" (see `../cloning.ts`).
    assertVoiceCloningAvailable(this.settings, this.provider);

    if (!input.consentId) {
      throw this.error('invalid_request', 'tts.voice.create', {
        detail: 'refusing to clone a voice without a recorded consent id',
      });
    }
    const clip = input.reference.find((reference) => (reference.bytes?.byteLength ?? 0) > 0);
    if (!clip?.bytes) {
      throw this.error('invalid_request', 'tts.voice.create', {
        detail: 'no reference audio bytes supplied',
      });
    }

    const startedAt = this.now();
    const response = await this.send(
      {
        method: 'POST',
        url: `${this.base()}/voices/clone`,
        headers: this.headers(ctx.requestId),
        form: [
          { kind: 'field', name: 'name', value: `kh-${ctx.requestId}` },
          { kind: 'field', name: 'language', value: 'tr' },
          // Cartesia's "similarity" mode keeps more of the speaker's identity than the
          // faster "stability" mode; identity is the entire product promise here.
          { kind: 'field', name: 'mode', value: 'similarity' },
          {
            kind: 'file',
            name: 'clip',
            filename: 'reference.wav',
            contentType: 'audio/wav',
            bytes: clip.bytes,
          },
        ],
        timeoutMs: this.settings.timeouts.createVoiceMs,
        ...(ctx.signal ? { signal: ctx.signal } : {}),
      },
      'tts.voice.create',
    );

    const body = decodeJson<{ id?: string }>(response);
    if (!body?.id) {
      throw this.error('invalid_request', 'tts.voice.create', {
        detail: 'voice clone response carried no id',
      });
    }

    return {
      value: { providerVoiceId: body.id, model: this.settings.models.cartesia.quality },
      usage: [
        this.usage(
          'tts.voice.create',
          this.settings.models.cartesia.quality,
          'request',
          1,
          0,
          this.now() - startedAt,
        ),
      ],
    };
  }

  async deleteVoice(
    providerVoiceId: string,
    ctx: ProviderCallContext,
  ): Promise<AdapterResult<void>> {
    const startedAt = this.now();
    try {
      await this.send(
        {
          method: 'DELETE',
          url: `${this.base()}/voices/${encodeURIComponent(providerVoiceId)}`,
          headers: this.headers(ctx.requestId),
          timeoutMs: this.settings.timeouts.synthesizeMs,
        },
        'tts.voice.delete',
      );
    } catch (error) {
      // Already gone is a completed erasure, not a failure (same reasoning as ElevenLabs).
      if (!(ProviderError.is(error) && error.kind === 'not_found')) throw error;
    }

    return {
      value: undefined,
      usage: [
        this.usage(
          'tts.voice.delete',
          this.settings.models.cartesia.quality,
          'request',
          1,
          0,
          this.now() - startedAt,
        ),
      ],
    };
  }

  /* ── Plumbing ────────────────────────────────────────────────────────────── */

  private base(): string {
    return this.settings.cartesia.baseUrl;
  }

  private headers(requestId: string): Record<string, string> {
    const apiKey = this.settings.cartesia.apiKey;
    if (!apiKey) {
      throw this.error('auth', 'tts.synth', { detail: 'CARTESIA_API_KEY is not set' });
    }
    return {
      authorization: `Bearer ${apiKey}`,
      // A pinned wire version, from config. Cartesia rejects a request without it.
      ...this.settings.cartesia.headers,
      'x-request-id': requestId,
    };
  }

  private async send(
    request: HttpRequest,
    operation: ProviderUsage['operation'],
  ): Promise<HttpResponse> {
    let response: HttpResponse;
    try {
      response = await this.transport(request);
    } catch (error) {
      if (error instanceof HttpTimeoutError) {
        throw this.error('timeout', operation, { detail: error.message });
      }
      if (error instanceof HttpNetworkError) {
        throw this.error('unavailable', operation, { detail: error.message });
      }
      throw ProviderError.from(error, { provider: this.provider, operation });
    }

    if (response.status >= 200 && response.status < 300) return response;

    const detail = decodeText(response).slice(0, 300);
    let kind: ProviderErrorKind;
    if (response.status === 429) kind = 'rate_limited';
    else if (response.status === 401 || response.status === 403) kind = 'auth';
    else if (response.status === 404) kind = 'not_found';
    else if (response.status === 402) kind = 'quota_exhausted';
    else if (response.status >= 500) kind = 'unavailable';
    else if (response.status === 400 || response.status === 422) kind = 'invalid_request';
    else kind = 'unknown';

    const retryAfter = retryAfterMs(response.headers);
    throw this.error(kind, operation, {
      detail,
      httpStatus: response.status,
      ...(retryAfter !== undefined ? { retryAfterMs: retryAfter } : {}),
    });
  }

  private error(
    kind: ProviderErrorKind,
    operation: ProviderUsage['operation'],
    extra: { detail?: string; httpStatus?: number; retryAfterMs?: number } = {},
  ): ProviderError {
    return new ProviderError({ kind, provider: this.provider, operation, ...extra });
  }

  private modelFor(tier: Tier): string {
    return tier === 'draft'
      ? this.settings.models.cartesia.draft
      : this.settings.models.cartesia.quality;
  }

  private usage(
    operation: ProviderUsage['operation'],
    model: string,
    billingUnit: ProviderUsage['billingUnit'],
    billedUnits: number,
    costUsd: number,
    latencyMs: number,
  ): ProviderUsage {
    return {
      provider: this.provider,
      model,
      operation,
      billingUnit,
      billedUnits,
      unitPriceUsd: billedUnits > 0 ? costUsd / billedUnits : 0,
      costUsd,
      cacheHit: false,
      latencyMs,
    };
  }
}
