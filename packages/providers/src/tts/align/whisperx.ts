/**
 * tts/align/whisperx.ts — forced alignment and read-back transcription.
 *
 * Two jobs, one service:
 *
 *  1. LIVENESS (SPEC §7 step 5). The consent clip is transcribed and compared to the
 *     server-issued sentence. This is the anti-deepfake gate, and it is the reason a
 *     missing aligner must FAIL CLOSED rather than wave a recording through.
 *  2. KARAOKE (SPEC §11.1). When the TTS vendor returns no timings — Cartesia's bytes
 *     endpoint, a cached chunk from a vendor that has since changed — our text is aligned
 *     against the audio to recover word timings.
 *
 * Self-hosted (`WHISPERX_URL`) rather than a hosted ASR because the audio is a parent's
 * voice reading a consent statement: sending it to a third processor would be a second
 * cross-border transfer to disclose, consent to and defend. Alignment is ~$0.002/minute of
 * our own compute (SPEC §6.1) versus a per-minute vendor fee, so this is also the cheap
 * option — the rare case where the privacy-preserving choice is not the expensive one.
 */

import type { AlignAdapter, AlignInput, AlignOutput, WordTiming } from '../../core/adapters';
import type { AdapterResult, ProviderCallContext, ProviderUsage } from '../../core/types';
import { ProviderError } from '../../core/errors';
import { DEFAULT_PRICE_BOOK, type PriceBook, roundUsd } from '../../core/pricing';
import {
  HttpNetworkError,
  HttpTimeoutError,
  type HttpTransport,
  decodeJson,
  fetchTransport,
} from '../http';
import type { TtsSettings } from '../settings';
import { readBackSimilarity } from '../text/turkish';

export interface WhisperXAdapterOptions {
  settings: TtsSettings;
  transport?: HttpTransport;
  priceBook?: PriceBook;
  now?: () => number;
}

interface WhisperXWord {
  word?: string;
  start?: number;
  end?: number;
  score?: number;
}

interface WhisperXResponse {
  text?: string;
  words?: WhisperXWord[];
  segments?: Array<{ words?: WhisperXWord[] }>;
  language?: string;
}

export class WhisperXAlignAdapter implements AlignAdapter {
  readonly provider = 'selfhost' as const;
  readonly kind = 'align' as const;

  private readonly settings: TtsSettings;
  private readonly transport: HttpTransport;
  private readonly priceBook: PriceBook;
  private readonly now: () => number;

  constructor(options: WhisperXAdapterOptions) {
    this.settings = options.settings;
    this.transport = options.transport ?? fetchTransport;
    this.priceBook = options.priceBook ?? DEFAULT_PRICE_BOOK;
    this.now = options.now ?? Date.now;
  }

  async align(input: AlignInput, ctx: ProviderCallContext): Promise<AdapterResult<AlignOutput>> {
    const baseUrl = this.settings.align.url;
    if (!baseUrl) {
      // Not configured is not "skip the check". The consent gate reads this failure and
      // refuses the clip; a voice profile is never created on an unverified consent.
      throw new ProviderError({
        kind: 'unavailable',
        provider: this.provider,
        operation: 'align.transcribe',
        detail: 'WHISPERX_URL is not configured',
      });
    }

    const startedAt = this.now();
    let response;
    try {
      response = await this.transport({
        method: 'POST',
        url: `${baseUrl.replace(/\/$/u, '')}/align`,
        headers: { accept: 'application/json', 'x-request-id': ctx.requestId },
        form: [
          { kind: 'field', name: 'language', value: input.languageCode },
          { kind: 'field', name: 'model', value: this.settings.align.model },
          // Forced alignment, not free transcription: the words are known, only their
          // timings are not — which is both more accurate and cheaper.
          { kind: 'field', name: 'transcript', value: input.text },
          {
            kind: 'file',
            name: 'audio',
            filename: 'take.wav',
            contentType: input.audio.mimeType,
            bytes: input.audio.bytes,
          },
        ],
        timeoutMs: this.settings.timeouts.alignMs,
        ...(ctx.signal ? { signal: ctx.signal } : {}),
      });
    } catch (error) {
      if (error instanceof HttpTimeoutError) {
        throw new ProviderError({
          kind: 'timeout',
          provider: this.provider,
          operation: 'align.transcribe',
          detail: error.message,
        });
      }
      if (error instanceof HttpNetworkError) {
        throw new ProviderError({
          kind: 'unavailable',
          provider: this.provider,
          operation: 'align.transcribe',
          detail: error.message,
        });
      }
      throw ProviderError.from(error, {
        provider: this.provider,
        operation: 'align.transcribe',
      });
    }

    if (response.status < 200 || response.status >= 300) {
      throw new ProviderError({
        kind: response.status >= 500 ? 'unavailable' : 'invalid_request',
        provider: this.provider,
        operation: 'align.transcribe',
        httpStatus: response.status,
        detail: `whisperx returned ${response.status}`,
      });
    }

    const latencyMs = this.now() - startedAt;
    const body = decodeJson<WhisperXResponse>(response) ?? {};
    const words = collectWords(body);
    const durationMs = Math.round((words[words.length - 1]?.endMs ?? 0) || 0);

    const transcript = body.text ?? words.map((word) => word.word).join(' ');
    const minutes = Math.max(durationMs / 60_000, 0);
    const costUsd = roundUsd(this.priceBook.align.perMinuteUsd * minutes);

    const usage: ProviderUsage = {
      provider: this.provider,
      model: this.settings.align.model,
      operation: 'align.transcribe',
      billingUnit: 'second',
      billedUnits: Math.round(durationMs / 1000),
      unitPriceUsd: this.priceBook.align.perMinuteUsd / 60,
      costUsd,
      cacheHit: false,
      latencyMs,
    };

    return {
      value: {
        words,
        // Turkish-aware comparison: apostrophe suffixes and dotted/dotless i are handled in
        // `text/turkish.ts`, and getting them wrong would fail honest parents.
        similarity: readBackSimilarity(input.text, transcript),
        model: this.settings.align.model,
        durationMs,
      },
      usage: [usage],
    };
  }

  async health(): Promise<{ ok: boolean; latencyMs: number }> {
    const baseUrl = this.settings.align.url;
    if (!baseUrl) return { ok: false, latencyMs: 0 };
    const startedAt = this.now();
    try {
      const response = await this.transport({
        method: 'GET',
        url: `${baseUrl.replace(/\/$/u, '')}/health`,
        headers: {},
        timeoutMs: 5_000,
      });
      return { ok: response.status < 400, latencyMs: this.now() - startedAt };
    } catch {
      return { ok: false, latencyMs: this.now() - startedAt };
    }
  }
}

/** WhisperX reports words either flat or nested per segment depending on its version. */
function collectWords(body: WhisperXResponse): WordTiming[] {
  const raw: WhisperXWord[] = body.words ?? body.segments?.flatMap((s) => s.words ?? []) ?? [];
  const words: WordTiming[] = [];
  for (const word of raw) {
    if (typeof word.word !== 'string' || word.word.length === 0) continue;
    if (typeof word.start !== 'number' || typeof word.end !== 'number') continue;
    words.push({
      word: word.word,
      startMs: Math.round(word.start * 1000),
      endMs: Math.round(word.end * 1000),
      ...(typeof word.score === 'number' ? { confidence: word.score } : {}),
    });
  }
  return words;
}
