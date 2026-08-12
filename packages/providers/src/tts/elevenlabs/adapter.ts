/**
 * tts/elevenlabs/adapter.ts — the real ElevenLabs `TtsAdapter`.
 *
 * ⚠️ NEVER EXERCISED AGAINST THE LIVE API. This environment has no key and no egress to the
 * vendor, so every behaviour below is proven against recorded fixtures (`elevenlabs.test.ts`)
 * and nothing more. What the fixtures CANNOT prove is the thing the product is sold on:
 * whether a cloned Turkish voice actually sounds like the parent. That needs a key, a real
 * recording and a human listening (SPEC §14 R2).
 *
 * What IS proven here: request shape, response parsing, the vendor's error taxonomy mapped
 * to `ProviderError` kinds the router already knows how to retry or fail over, character
 * timings turned into Turkish word timings, and per-character cost landing in
 * `provider_usage` on every path including failures that still billed.
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
  type HttpResponse,
  type HttpTransport,
  decodeJson,
  decodeText,
  fetchTransport,
  retryAfterMs,
} from '../http';
import type { TtsSettings } from '../settings';
import { assertVoiceCloningAvailable } from '../cloning';
import { wordTimingsFromCharacters } from '../alignment';
import { audioDurationMs } from '../audio/duration';
import {
  buildCreateVoiceRequest,
  buildDeleteVoiceRequest,
  buildSubscriptionRequest,
  buildSynthesizeRequest,
  parseCreateVoiceBody,
  parseErrorBody,
  parseSubscriptionBody,
  parseSynthesizeBody,
} from './wire';

export interface ElevenLabsAdapterOptions {
  settings: TtsSettings;
  /** Injected in tests to replay recorded responses; defaults to real `fetch`. */
  transport?: HttpTransport;
  priceBook?: PriceBook;
  /** Injected so latency assertions are deterministic. */
  now?: () => number;
}

/** MIME + container facts for each wire format we may ask for. */
const FORMAT_INFO: Record<
  TtsSettings['outputFormat'],
  { mimeType: string; sampleRate: number; pcm: boolean }
> = {
  mp3_44100_128: { mimeType: 'audio/mpeg', sampleRate: 44_100, pcm: false },
  pcm_48000: { mimeType: 'audio/L16', sampleRate: 48_000, pcm: true },
  opus_48000: { mimeType: 'audio/opus', sampleRate: 48_000, pcm: false },
};

export class ElevenLabsTtsAdapter implements TtsAdapter {
  readonly provider = 'elevenlabs' as const;
  readonly kind = 'tts' as const;

  private readonly settings: TtsSettings;
  private readonly transport: HttpTransport;
  private readonly priceBook: PriceBook;
  private readonly now: () => number;

  constructor(options: ElevenLabsAdapterOptions) {
    this.settings = options.settings;
    this.transport = options.transport ?? fetchTransport;
    this.priceBook = options.priceBook ?? DEFAULT_PRICE_BOOK;
    this.now = options.now ?? Date.now;
  }

  /* ── Voice cloning ───────────────────────────────────────────────────────── */

  async createVoice(
    input: CreateVoiceInput,
    ctx: ProviderCallContext,
  ): Promise<AdapterResult<CreateVoiceOutput>> {
    // ⚠️ PRODUCT gate, before the KVKK one. This vendor CAN clone, but the feature has its
    // own switch (`VOICE_CLONING_ENABLED`) because it is the thing the free tier cannot do
    // — and a flag that is only enforced on the provider that cannot do it anyway is not a
    // flag, it is a comment. Checked here so "off" means off on every provider.
    assertVoiceCloningAvailable(this.settings, this.provider);

    // ⚠️ KVKK gate, enforced at the last possible moment. Everything upstream also checks
    // consent; this is the check that cannot be skipped by a caller who forgot, because it
    // sits between the reference audio and the vendor.
    if (!input.consentId) {
      throw this.error('invalid_request', 'tts.voice.create', {
        detail: 'refusing to clone a voice without a recorded consent id',
      });
    }
    const files = input.reference
      .map((clip, index) => ({
        filename: `reference-${index + 1}.wav`,
        contentType: 'audio/wav',
        bytes: clip.bytes ?? new Uint8Array(0),
      }))
      .filter((file) => file.bytes.byteLength > 0);

    if (files.length === 0) {
      throw this.error('invalid_request', 'tts.voice.create', {
        detail: 'no reference audio bytes supplied',
      });
    }

    const startedAt = this.now();
    const response = await this.send(
      buildCreateVoiceRequest({
        auth: this.auth('tts.voice.create'),
        // The vendor-side name is an OPAQUE ID, never the parent's display name ("Anne").
        // Personal data does not travel to a US processor for the sake of a nicer label.
        name: `kh-${ctx.requestId}`,
        files,
        labels: {
          ...(input.labels ?? {}),
          // Consent id in the vendor record: when an erasure request arrives, the provider
          // side is auditable against `consents.id` without exporting anything about a user.
          consent_id: input.consentId,
          language: 'tr',
        },
        timeoutMs: this.settings.timeouts.createVoiceMs,
        requestId: ctx.requestId,
        ...(ctx.signal ? { signal: ctx.signal } : {}),
      }),
      'tts.voice.create',
    );

    const latencyMs = this.now() - startedAt;
    const body = parseCreateVoiceBody(decodeJson(response));
    const model = this.settings.models.elevenlabs.quality;

    return {
      value: {
        providerVoiceId: body.providerVoiceId,
        model,
      },
      // Cloning itself is not metered per unit by the vendor — it consumes a SLOT, which is
      // the scarce resource (SPEC §14 R5). Recorded at zero so the call still appears in
      // `provider_usage` and the slot accounting has a row to join against.
      usage: [this.usage('tts.voice.create', model, 'request', 1, 0, latencyMs)],
    };
  }

  async deleteVoice(
    providerVoiceId: string,
    ctx: ProviderCallContext,
  ): Promise<AdapterResult<void>> {
    const startedAt = this.now();
    try {
      await this.send(
        buildDeleteVoiceRequest({
          auth: this.auth('tts.voice.delete'),
          providerVoiceId,
          timeoutMs: this.settings.timeouts.synthesizeMs,
          requestId: ctx.requestId,
        }),
        'tts.voice.delete',
      );
    } catch (error) {
      // Already gone is the outcome we wanted. The deletion chain retries on failure, and
      // treating a 404 as failure would keep a completed erasure task alarming forever.
      if (ProviderError.is(error) && error.kind === 'not_found') {
        return {
          value: undefined,
          usage: [
            this.usage(
              'tts.voice.delete',
              this.settings.models.elevenlabs.quality,
              'request',
              1,
              0,
              this.now() - startedAt,
            ),
          ],
        };
      }
      throw error;
    }

    return {
      value: undefined,
      usage: [
        this.usage(
          'tts.voice.delete',
          this.settings.models.elevenlabs.quality,
          'request',
          1,
          0,
          this.now() - startedAt,
        ),
      ],
    };
  }

  /* ── Synthesis ───────────────────────────────────────────────────────────── */

  async synthesize(
    input: SynthesizeInput,
    ctx: ProviderCallContext,
  ): Promise<AdapterResult<SynthesizeOutput>> {
    const modelId = this.modelFor(input.tier);
    const outputFormat = this.settings.outputFormat;
    const startedAt = this.now();

    const response = await this.send(
      buildSynthesizeRequest({
        auth: this.auth('tts.synth'),
        providerVoiceId: input.voice.providerVoiceId,
        modelId,
        text: input.text,
        outputFormat,
        languageCode: input.languageCode,
        timbre: this.settings.timbre,
        ...(input.previousText ? { previousText: input.previousText } : {}),
        ...(input.nextText ? { nextText: input.nextText } : {}),
        timeoutMs: this.settings.timeouts.synthesizeMs,
        requestId: ctx.requestId,
        ...(ctx.signal ? { signal: ctx.signal } : {}),
      }),
      'tts.synth',
    );

    const latencyMs = this.now() - startedAt;
    const parsed = parseSynthesizeBody(decodeJson(response));
    const format = FORMAT_INFO[outputFormat];

    // Billed characters as the VENDOR counts them when it says so (`character-cost` header),
    // falling back to our own count. The two differ — SSML and normalisation are billable —
    // and using `text.length` blindly makes the ledger disagree with the invoice.
    const billedCharacters = headerNumber(response, 'character-cost') ?? input.text.length;
    const costUsd = roundUsd(priceTtsCall(this.priceBook, input.tier, billedCharacters));

    const durationMs = audioDurationMs(parsed.audio, {
      mimeType: format.mimeType,
      sampleRate: format.sampleRate,
      bitsPerSample: 16,
      channels: 1,
      alignment: parsed.alignment,
    });

    const value: SynthesizeOutput = {
      audio: parsed.audio,
      mimeType: format.mimeType,
      durationMs,
      billedCharacters,
      model: modelId,
    };
    if (parsed.alignment) {
      value.alignment = wordTimingsFromCharacters(parsed.alignment);
    }

    return {
      value,
      usage: [
        this.usage(
          'tts.synth',
          modelId,
          'character',
          billedCharacters,
          costUsd,
          latencyMs,
        ),
      ],
    };
  }

  /**
   * Remaining voice slots. Drives LRU eviction before a create call rather than after a
   * failed one — a 30-second upload rejected at the end for a full account is 30 seconds a
   * parent spent watching "sesiniz hazırlanıyor" for nothing.
   */
  async slotUsage(ctx: ProviderCallContext): Promise<{ used: number; limit: number }> {
    void ctx;
    const response = await this.send(
      buildSubscriptionRequest({
        auth: this.auth('tts.voice.create'),
        timeoutMs: this.settings.timeouts.synthesizeMs,
      }),
      'tts.voice.create',
    );
    const parsed = parseSubscriptionBody(decodeJson(response));
    // The configured ceiling wins when the vendor reports none: `VOICE_SLOT_LIMIT` is what
    // ops actually tuned, and a reported 0 would disable eviction entirely.
    return {
      used: parsed.used,
      limit: parsed.limit > 0 ? parsed.limit : this.settings.slots.limit,
    };
  }

  async health(): Promise<{ ok: boolean; latencyMs: number }> {
    const startedAt = this.now();
    try {
      await this.send(
        buildSubscriptionRequest({
          auth: this.auth('tts.synth'),
          timeoutMs: Math.min(10_000, this.settings.timeouts.synthesizeMs),
        }),
        'tts.synth',
      );
      return { ok: true, latencyMs: this.now() - startedAt };
    } catch {
      return { ok: false, latencyMs: this.now() - startedAt };
    }
  }

  /* ── Plumbing ────────────────────────────────────────────────────────────── */

  private auth(operation: ProviderUsage['operation']): { baseUrl: string; apiKey: string } {
    const apiKey = this.settings.elevenlabs.apiKey;
    if (!apiKey) {
      // Fails at the call, not at boot, and as a typed non-retryable error: `API_MODE=live`
      // without a key must be loud and must not be retried three times per chunk.
      throw this.error('auth', operation, { detail: 'ELEVENLABS_API_KEY is not set' });
    }
    return { baseUrl: this.settings.elevenlabs.baseUrl, apiKey };
  }

  private async send(
    request: Parameters<HttpTransport>[0],
    operation: ProviderUsage['operation'],
  ): Promise<HttpResponse> {
    let response: HttpResponse;
    try {
      response = await this.transport(request);
    } catch (error) {
      if (error instanceof HttpTimeoutError) {
        throw this.error('timeout', operation, { detail: error.message, cause: error });
      }
      if (error instanceof HttpNetworkError) {
        throw this.error('unavailable', operation, { detail: error.message, cause: error });
      }
      throw ProviderError.from(error, { provider: this.provider, operation });
    }

    if (response.status >= 200 && response.status < 300) return response;
    throw this.mapFailure(response, operation);
  }

  /**
   * Vendor failure → `ProviderErrorKind`. This mapping is the whole reason the router can
   * do the right thing without knowing anything about ElevenLabs:
   *
   *   429            → rate_limited   retry the SAME provider after `Retry-After`
   *   401/403        → auth           do not retry, but DO fail over (SPEC §7 step 8's
   *                                   "silent fallback to Cartesia, the parent never notices")
   *   voice_limit    → slot_exhausted trigger LRU eviction, then retry
   *   404            → not_found      the voice is already gone; deletion treats it as done
   *   422/400        → invalid_request our bug; retrying identical input cannot help
   *   5xx            → unavailable    retry, then fail over
   */
  private mapFailure(response: HttpResponse, operation: ProviderUsage['operation']): ProviderError {
    const body = parseErrorBody(decodeJson(response));
    const vendorStatus = body.status ?? '';
    const detail = body.message ?? decodeText(response).slice(0, 300);
    const retryAfter = retryAfterMs(response.headers);

    let kind: ProviderErrorKind;
    if (response.status === 429) kind = 'rate_limited';
    else if (response.status === 401 || response.status === 403) kind = 'auth';
    else if (response.status === 404) kind = 'not_found';
    else if (response.status >= 500) kind = 'unavailable';
    else if (SLOT_STATUSES.has(vendorStatus)) kind = 'slot_exhausted';
    else if (QUOTA_STATUSES.has(vendorStatus)) kind = 'quota_exhausted';
    else if (response.status === 422 || response.status === 400) kind = 'invalid_request';
    else kind = 'unknown';

    // The vendor sometimes reports a slot ceiling with a 400 and sometimes with a 401-ish
    // permission error, so the STATUS STRING outranks the HTTP code for these two cases.
    // Getting this wrong means eviction never runs and every new parent is told the
    // service is down while 660 dormant voices hold the slots.
    if (SLOT_STATUSES.has(vendorStatus)) kind = 'slot_exhausted';
    else if (QUOTA_STATUSES.has(vendorStatus)) kind = 'quota_exhausted';

    return this.error(kind, operation, {
      detail,
      httpStatus: response.status,
      ...(vendorStatus ? { providerCode: vendorStatus } : {}),
      ...(retryAfter !== undefined ? { retryAfterMs: retryAfter } : {}),
    });
  }

  private error(
    kind: ProviderErrorKind,
    operation: ProviderUsage['operation'],
    extra: {
      detail?: string;
      httpStatus?: number;
      providerCode?: string;
      retryAfterMs?: number;
      cause?: unknown;
    } = {},
  ): ProviderError {
    return new ProviderError({ kind, provider: this.provider, operation, ...extra });
  }

  private modelFor(tier: Tier): string {
    return tier === 'draft'
      ? this.settings.models.elevenlabs.draft
      : this.settings.models.elevenlabs.quality;
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

/** Vendor `detail.status` values that mean "the 660-slot ceiling is full" (SPEC §14 R5). */
const SLOT_STATUSES: ReadonlySet<string> = new Set([
  'voice_limit_reached',
  'max_voices_reached',
  'voice_add_edit_limit_reached',
]);

/** Vendor `detail.status` values that mean "the account is out of credit". */
const QUOTA_STATUSES: ReadonlySet<string> = new Set([
  'quota_exceeded',
  'insufficient_credits',
  'subscription_expired',
]);

function headerNumber(response: HttpResponse, name: string): number | undefined {
  const raw = response.headers[name];
  if (raw === undefined) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}
