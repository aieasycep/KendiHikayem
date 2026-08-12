/**
 * tts/google/adapter.ts — ⭐ the FREE narrator, and the one honest thing it will not do.
 *
 * ⚠️ NEVER RUN AGAINST THE LIVE API. No key, no egress. `google.test.ts` replays recorded
 * bodies; it proves request shape, response parsing, resampling, error mapping, the clone
 * refusal and the ledger row. It cannot prove the one thing this adapter exists to deliver:
 * that the Turkish coming out of a prebuilt voice is good enough to read a child to sleep —
 * that ğ, ı, ö, ü, ş and ç survive, and that a long agglutinated word like
 * "gördüklerimizden" is not chopped into syllables. THAT NEEDS A HUMAN AND A KEY, and it is
 * the first thing to check on day one.
 *
 * ⭐ WHAT THIS ADAPTER DOES NOT DO: CLONE THE PARENT'S VOICE.
 *
 * The free tier has no voice cloning — not at lower quality, not with a queue. The
 * capability does not exist on any free provider we can reach. Two ways to handle that:
 *
 *   (a) fall back to a system voice and say nothing;
 *   (b) refuse, in Turkish, with a sentence a parent can act on.
 *
 * This adapter does (b), and `createVoice` throwing is the enforcement. (a) is the one
 * outcome the product cannot survive: a parent who recorded ninety seconds of their own
 * voice, was told their child would hear THEM, and discovers at bedtime — with the child
 * already listening — that a stranger is reading instead. That is not a degraded feature,
 * it is a broken promise, and it is unrecoverable in a way a clear "şu an kapalı" is not.
 *
 * THREE THINGS THAT ARE EASY TO GET WRONG HERE:
 *
 *  1. SAMPLE RATE. This vendor returns 24 kHz PCM; `apps/worker` assembles narration at a
 *     fixed 48 kHz. Handing back 24 kHz bytes plays the whole story at double speed and an
 *     octave up, and every word timing lands at half its true position. The adapter
 *     resamples, and reads the rate out of the response's own mime type rather than
 *     trusting a constant.
 *  2. NO WORD TIMINGS. This API returns audio only. `alignment` is therefore absent and the
 *     pipeline falls to WhisperX, or to A5's syllable-weighted `sentence_estimate`. The
 *     karaoke manifest format is untouched — the client switches word highlighting off and
 *     highlights whole sentences, which is what `alignment.source` is for.
 *  3. THE FREE TIER'S NARROWEST GATE IS HERE. Roughly 3 requests/minute and ~15/day, and a
 *     book is 12–14 chunks — so the free tier narrates about ONE BOOK PER DAY. Raising
 *     `TTS_CHUNK_MAX_CHARS` is the lever that helps most, because it reduces the number of
 *     REQUESTS, which is what actually runs out.
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
import { ProviderError } from '../../core/errors';
import { DEFAULT_PRICE_BOOK, type PriceBook, priceTtsCall, roundUsd } from '../../core/pricing';
import { mapGoogleHttpError, mapGoogleTransportError } from '../../google/errors';
import { FREE_TIER_UNSUPPORTED_TR } from '../../google/free-tier';
import type { RequestPacer } from '../../google/pacing';
import type { GoogleErrorEnvelope } from '../../google/quota';
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
import { floatToPcm16, pcm16ToFloat } from '../audio/assemble';
import { resample } from '../audio/wav';
import { buildSynthesizeRequest, parseSynthesizeResponse, parseVoiceMap } from './wire';

/** The rate `apps/worker` assembles at. Narration handed back at anything else is wrong. */
const PIPELINE_SAMPLE_RATE = 48_000;

export interface GoogleTtsAdapterOptions {
  settings: TtsSettings;
  /** Injected in tests to replay recorded responses; production uses `fetch`. */
  transport?: HttpTransport;
  priceBook?: PriceBook;
  /** Injected so latency assertions are deterministic. */
  now?: () => number;
  /** Free-tier pacing; see point 3 in the file header. */
  pacer?: RequestPacer;
}

export class GoogleTtsAdapter implements TtsAdapter {
  readonly provider = 'google' as const;
  readonly kind = 'tts' as const;

  private readonly settings: TtsSettings;
  private readonly transport: HttpTransport;
  private readonly priceBook: PriceBook;
  private readonly now: () => number;
  private readonly pacer: RequestPacer | undefined;
  private readonly voiceMap: Record<string, string>;
  /** True when `GOOGLE_TTS_VOICE_MAP` failed to parse — surfaced, never silently ignored. */
  readonly voiceMapMalformed: boolean;

  constructor(options: GoogleTtsAdapterOptions) {
    this.settings = options.settings;
    this.transport = options.transport ?? fetchTransport;
    this.priceBook = options.priceBook ?? DEFAULT_PRICE_BOOK;
    this.now = options.now ?? Date.now;
    this.pacer = options.pacer;

    const parsed = parseVoiceMap(this.settings.google.voiceMap);
    this.voiceMapMalformed = parsed === undefined;
    this.voiceMap = parsed ?? {};
  }

  /* ── Voice cloning: refused, out loud ────────────────────────────────────── */

  /**
   * ⚠️ ALWAYS THROWS. See the file header for why this is a refusal and not a fallback.
   *
   * `invalid_request` is chosen deliberately over `unavailable`: it is non-retryable AND not
   * failover-worthy, so `ProviderRouter` stops the route here instead of asking a second
   * provider the same impossible question three times. The Turkish sentence rides along on
   * `userMessageTr`, which `JobError` carries to the parent verbatim.
   */
  async createVoice(
    _input: CreateVoiceInput,
    _ctx: ProviderCallContext,
  ): Promise<AdapterResult<CreateVoiceOutput>> {
    throw new ProviderError({
      kind: 'invalid_request',
      provider: this.provider,
      operation: 'tts.voice.create',
      detail:
        'voice cloning is not available on the free tier. Set TTS_PROVIDER_PRIMARY=elevenlabs ' +
        'with ELEVENLABS_API_KEY and VOICE_CLONING_ENABLED=true to enable it.',
      userMessageTr: FREE_TIER_UNSUPPORTED_TR.voiceCloning,
    });
  }

  /**
   * Nothing was ever created here, so nothing has to be deleted — and reporting success is
   * the CORRECT answer for the erasure chain rather than a convenient one: a KVKK deletion
   * task that keeps failing against a provider which never held the data would alarm
   * forever and hide the deletions that genuinely did fail.
   *
   * The row is still written, because "we checked and there was nothing there" is an audit
   * fact worth having when someone asks what happened to a voice.
   */
  async deleteVoice(
    _providerVoiceId: string,
    _ctx: ProviderCallContext,
  ): Promise<AdapterResult<void>> {
    return {
      value: undefined,
      usage: [this.usage('tts.voice.delete', this.model(), 'request', 1, 0, 0)],
    };
  }

  /* ── Synthesis ───────────────────────────────────────────────────────────── */

  async synthesize(
    input: SynthesizeInput,
    ctx: ProviderCallContext,
  ): Promise<AdapterResult<SynthesizeOutput>> {
    const apiKey = this.settings.google.apiKey;
    if (!apiKey) {
      throw new ProviderError({
        kind: 'auth',
        provider: this.provider,
        operation: 'tts.synth',
        detail:
          'GOOGLE_GENAI_API_KEY is not set; the free narrator cannot run. Set it with ' +
          'API_MODE=live, or run on the deterministic double with API_MODE=mock.',
      });
    }

    const model = this.model();
    const body = buildSynthesizeRequest({
      text: input.text,
      voiceName: this.voiceFor(input.voice.providerVoiceId),
      languageCode: this.settings.google.languageCode,
      stylePromptTr: this.settings.google.stylePromptTr,
    });

    // Paced before the clock starts, so a chunk that queued still gets its full budget.
    await this.pacer?.acquire(ctx.signal);

    const startedAt = this.now();
    const response = await this.send(
      {
        method: 'POST',
        url: `${this.endpoint(model)}`,
        headers: {
          'x-goog-api-key': apiKey,
          // Stable across retries: a vendor that dedupes must not spend two of the day's
          // fifteen requests on the same chunk.
          'x-goog-request-params': `request_id=${ctx.requestId}`,
        },
        json: body,
        timeoutMs: this.settings.timeouts.synthesizeMs,
        ...(ctx.signal ? { signal: ctx.signal } : {}),
      },
      'tts.synth',
    );

    const latencyMs = this.now() - startedAt;

    let parsed;
    try {
      parsed = parseSynthesizeResponse(decodeJson(response), this.settings.google.sampleRate);
    } catch (error) {
      // A 200 we cannot read is either a safety refusal or a vendor envelope change.
      // `content_blocked` is terminal; the rest is retryable, because an envelope change is
      // usually a partial rollout and the circuit breaker escalates if it is not.
      const detail = error instanceof Error ? error.message : String(error);
      throw new ProviderError({
        kind: /blocked/u.test(detail) ? 'content_blocked' : 'unavailable',
        provider: this.provider,
        operation: 'tts.synth',
        detail,
        cause: error,
      });
    }

    // ⚠️ 24 kHz in, 48 kHz out. See point 1 in the file header.
    const audio =
      parsed.sampleRate === PIPELINE_SAMPLE_RATE
        ? parsed.pcm
        : floatToPcm16(resample(pcm16ToFloat(parsed.pcm), parsed.sampleRate, PIPELINE_SAMPLE_RATE));

    const durationMs = Math.round(
      // 16-bit mono: two bytes per frame.
      (audio.byteLength / 2 / PIPELINE_SAMPLE_RATE) * 1000,
    );

    // The vendor bills TOKENS, our ledger's TTS unit is characters, and the two are not
    // convertible. Characters keep this row comparable with the ElevenLabs and Cartesia
    // rows — which is the entire point of recording free-tier usage: the day the paid
    // provider is switched on, the same column means the same thing.
    //
    // ⚠️ And the resource that actually runs out on the free tier is REQUESTS, not
    // characters. That is countable as `COUNT(*)` over exactly these rows, which is why
    // there is no second, doubled-up "request" row here.
    const billedCharacters = input.text.length;
    const costUsd = roundUsd(priceTtsCall(this.priceBook, input.tier, billedCharacters));

    return {
      value: {
        audio,
        mimeType: 'audio/L16',
        durationMs,
        billedCharacters,
        model: parsed.modelVersion ?? model,
        // No `alignment`: this API returns audio only (point 2 in the file header).
      },
      usage: [
        this.usage(
          'tts.synth',
          parsed.modelVersion ?? model,
          'character',
          billedCharacters,
          costUsd,
          latencyMs,
        ),
      ],
    };
  }

  /**
   * Liveness probe. A cheap `models.get`, never a synthesis: probing with a real call would
   * spend one of the day's handful of free requests every time the circuit half-opens.
   */
  async health(): Promise<{ ok: boolean; latencyMs: number }> {
    const apiKey = this.settings.google.apiKey;
    if (!apiKey) return { ok: false, latencyMs: 0 };
    const startedAt = this.now();
    try {
      const response = await this.transport({
        method: 'GET',
        url: this.endpoint(this.model()).replace(/:generateContent$/u, ''),
        headers: { 'x-goog-api-key': apiKey },
        timeoutMs: Math.min(10_000, this.settings.timeouts.synthesizeMs),
      });
      return { ok: response.status >= 200 && response.status < 300, latencyMs: this.now() - startedAt };
    } catch {
      return { ok: false, latencyMs: this.now() - startedAt };
    }
  }

  /* ── Plumbing ────────────────────────────────────────────────────────────── */

  /**
   * One model for both tiers, deliberately. `draft` versus `quality` is a PRICE decision and
   * both cost zero here; running the same model for both keeps a draft render and the final
   * one byte-identical, which is what makes the chunk cache hit instead of re-spending a
   * request out of a fifteen-a-day budget.
   */
  private model(_tier?: Tier): string {
    return this.settings.google.model;
  }

  private endpoint(model: string): string {
    const base = this.settings.google.baseUrl.replace(/\/+$/u, '');
    return `${base}/${this.settings.google.apiVersion}/models/${encodeURIComponent(model)}:generateContent`;
  }

  /**
   * `system_voices.provider_voice_id` → a prebuilt voice name.
   *
   * An unmapped id falls back to the default voice rather than failing: the seeded catalog
   * (packages/db, frozen) carries ids from a different vendor entirely, and a narrator that
   * refuses to speak because a lookup missed is worse than one that speaks in the wrong
   * timbre. The map is how the three characters a parent chooses between stay distinct.
   */
  private voiceFor(providerVoiceId: string): string {
    return this.voiceMap[providerVoiceId] ?? this.settings.google.defaultVoice;
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
        return Promise.reject(
          mapGoogleTransportError(error, {
            provider: this.provider,
            operation,
            timedOut: true,
            timeoutVar: 'TTS_REQUEST_TIMEOUT_MS',
          }),
        );
      }
      if (error instanceof HttpNetworkError) {
        return Promise.reject(
          mapGoogleTransportError(error, { provider: this.provider, operation, timedOut: false }),
        );
      }
      return Promise.reject(
        ProviderError.from(error, { provider: this.provider, operation }),
      );
    }

    if (response.status >= 200 && response.status < 300) return response;

    // Shared with the text and illustration adapters, which is what makes the free tier's
    // "per-minute throttle vs spent daily allowance" distinction hold here too.
    throw mapGoogleHttpError({
      provider: this.provider,
      operation,
      httpStatus: response.status,
      envelope: decodeJson<GoogleErrorEnvelope>(response),
      rawBody: decodeText(response).slice(0, 400),
      retryAfterHeader: headerRetryAfter(response),
    });
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

/** `retryAfterMs` returns milliseconds; the Google mapper wants the raw header value. */
function headerRetryAfter(response: HttpResponse): string | null {
  const raw = response.headers['retry-after'];
  if (raw !== undefined) return raw;
  const ms = retryAfterMs(response.headers);
  return ms === undefined ? null : String(ms / 1000);
}
