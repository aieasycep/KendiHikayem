/**
 * tts/elevenlabs/wire.ts — request building and response parsing, kept pure.
 *
 * Everything in this file is a plain function over plain data: no network, no clock, no
 * adapter state. That is what makes the vendor contract testable from recorded fixtures
 * (`elevenlabs.test.ts`) while the real API is unreachable — the request that would go out
 * and the parse of the response that came back are both assertable.
 *
 * Response shapes are validated by hand rather than with a schema library. The reason is
 * specific: what arrives is an unaudited third-party payload that decides how much we bill
 * a parent, so each field is checked where it is read and a missing one produces a typed
 * `invalid_request` instead of an `undefined` that silently prices a render at zero.
 */

import type { FormPart, HttpRequest } from '../http';
import type { VoiceTimbre } from '../settings';

/* ── Requests ──────────────────────────────────────────────────────────────── */

export interface ElevenAuth {
  baseUrl: string;
  apiKey: string;
}

function headers(auth: ElevenAuth, extra: Record<string, string> = {}): Record<string, string> {
  return {
    // ⚠️ NOT `Authorization: Bearer`. ElevenLabs authenticates with its own header, and a
    // Bearer token there fails as 401 with no hint about which of the two is wrong.
    'xi-api-key': auth.apiKey,
    accept: 'application/json',
    ...extra,
  };
}

export interface SynthesizeRequestInput {
  auth: ElevenAuth;
  providerVoiceId: string;
  modelId: string;
  text: string;
  outputFormat: string;
  languageCode: string;
  timbre: VoiceTimbre;
  previousText?: string;
  nextText?: string;
  timeoutMs: number;
  /** `job_steps.provider_request_id` — the vendor dedupes on it, so a retry bills once. */
  requestId: string;
  signal?: AbortSignal;
}

/**
 * Text-to-speech WITH character timings.
 *
 * The `/with-timestamps` variant costs the same as the plain endpoint and returns the
 * character-level alignment the karaoke highlight is built on (SPEC §11.1 P01). Calling the
 * plain endpoint and then paying an ASR provider to re-derive timings we were being handed
 * for free is the single most avoidable line item in §6.1.
 */
export function buildSynthesizeRequest(input: SynthesizeRequestInput): HttpRequest {
  const query = new URLSearchParams({ output_format: input.outputFormat });
  return {
    method: 'POST',
    url: `${input.auth.baseUrl}/v1/text-to-speech/${encodeURIComponent(input.providerVoiceId)}/with-timestamps?${query.toString()}`,
    headers: headers(input.auth, { 'x-request-id': input.requestId }),
    json: {
      text: input.text,
      model_id: input.modelId,
      language_code: input.languageCode,
      voice_settings: {
        stability: input.timbre.stability,
        similarity_boost: input.timbre.similarity,
        style: input.timbre.style,
        use_speaker_boost: input.timbre.speakerBoost,
      },
      // Prosody continuity across a chunk boundary: without these the vendor restarts its
      // intonation contour at every chunk and page 4 opens on a different reading of the
      // same sentence than page 3 closed on.
      ...(input.previousText ? { previous_text: input.previousText } : {}),
      ...(input.nextText ? { next_text: input.nextText } : {}),
    },
    timeoutMs: input.timeoutMs,
    ...(input.signal ? { signal: input.signal } : {}),
  };
}

export interface CreateVoiceRequestInput {
  auth: ElevenAuth;
  name: string;
  files: Array<{ filename: string; contentType: string; bytes: Uint8Array }>;
  /** Free-form vendor labels. Carries our consent id so the vendor record is auditable. */
  labels: Record<string, string>;
  description?: string;
  timeoutMs: number;
  requestId: string;
  signal?: AbortSignal;
}

/** Instant Voice Cloning: multipart upload of the stitched reference (SPEC §7 step 8). */
export function buildCreateVoiceRequest(input: CreateVoiceRequestInput): HttpRequest {
  const form: FormPart[] = [{ kind: 'field', name: 'name', value: input.name }];
  if (input.description) {
    form.push({ kind: 'field', name: 'description', value: input.description });
  }
  form.push({ kind: 'field', name: 'labels', value: JSON.stringify(input.labels) });
  for (const file of input.files) {
    form.push({
      kind: 'file',
      name: 'files',
      filename: file.filename,
      contentType: file.contentType,
      bytes: file.bytes,
    });
  }

  return {
    method: 'POST',
    url: `${input.auth.baseUrl}/v1/voices/add`,
    headers: headers(input.auth, { 'x-request-id': input.requestId }),
    form,
    timeoutMs: input.timeoutMs,
    ...(input.signal ? { signal: input.signal } : {}),
  };
}

export function buildDeleteVoiceRequest(input: {
  auth: ElevenAuth;
  providerVoiceId: string;
  timeoutMs: number;
  requestId: string;
}): HttpRequest {
  return {
    method: 'DELETE',
    url: `${input.auth.baseUrl}/v1/voices/${encodeURIComponent(input.providerVoiceId)}`,
    headers: headers(input.auth, { 'x-request-id': input.requestId }),
    timeoutMs: input.timeoutMs,
  };
}

export function buildSubscriptionRequest(input: {
  auth: ElevenAuth;
  timeoutMs: number;
}): HttpRequest {
  return {
    method: 'GET',
    url: `${input.auth.baseUrl}/v1/user/subscription`,
    headers: headers(input.auth),
    timeoutMs: input.timeoutMs,
  };
}

/* ── Responses ─────────────────────────────────────────────────────────────── */

/** Character-level timings, exactly as the vendor returns them. */
export interface ElevenAlignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

export interface ElevenSynthesizeBody {
  /** base64 audio in the requested `output_format`. */
  audio_base64: string;
  alignment?: ElevenAlignment | null;
  normalized_alignment?: ElevenAlignment | null;
}

export class WireFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WireFormatError';
  }
}

export function parseSynthesizeBody(body: unknown): {
  audio: Uint8Array;
  alignment?: ElevenAlignment;
} {
  if (!isRecord(body)) throw new WireFormatError('synthesis response was not an object');
  const audioBase64 = body['audio_base64'];
  if (typeof audioBase64 !== 'string' || audioBase64.length === 0) {
    throw new WireFormatError('synthesis response carried no audio_base64');
  }

  // `normalized_alignment` is timed against the vendor's own text normalisation ("15" read
  // as "on beş"), so its characters no longer line up with OUR page text. The karaoke
  // highlight indexes into the page text, so the raw alignment is the one to use.
  const raw = pickAlignment(body['alignment']) ?? pickAlignment(body['normalized_alignment']);

  return {
    audio: decodeBase64(audioBase64),
    ...(raw ? { alignment: raw } : {}),
  };
}

function pickAlignment(value: unknown): ElevenAlignment | undefined {
  if (!isRecord(value)) return undefined;
  const characters = value['characters'];
  const starts = value['character_start_times_seconds'];
  const ends = value['character_end_times_seconds'];
  if (!Array.isArray(characters) || !Array.isArray(starts) || !Array.isArray(ends)) {
    return undefined;
  }
  // Ragged arrays would silently shift every word timing after the first mismatch.
  if (characters.length !== starts.length || characters.length !== ends.length) return undefined;
  if (characters.length === 0) return undefined;

  return {
    characters: characters.map((c) => String(c)),
    character_start_times_seconds: starts.map((s) => Number(s)),
    character_end_times_seconds: ends.map((e) => Number(e)),
  };
}

export function parseCreateVoiceBody(body: unknown): { providerVoiceId: string } {
  if (!isRecord(body)) throw new WireFormatError('voice creation response was not an object');
  const voiceId = body['voice_id'];
  if (typeof voiceId !== 'string' || voiceId.length === 0) {
    throw new WireFormatError('voice creation response carried no voice_id');
  }
  return { providerVoiceId: voiceId };
}

export function parseSubscriptionBody(body: unknown): { used: number; limit: number } {
  if (!isRecord(body)) throw new WireFormatError('subscription response was not an object');
  const used = Number(body['voice_slots_used'] ?? body['voice_add_edit_counter'] ?? 0);
  const limit = Number(body['voice_limit'] ?? 0);
  if (!Number.isFinite(used) || !Number.isFinite(limit)) {
    throw new WireFormatError('subscription response carried no usable slot counters');
  }
  return { used, limit };
}

/** The vendor's error envelope, which nests differently per endpoint. */
export function parseErrorBody(body: unknown): { status?: string; message?: string } {
  if (!isRecord(body)) return {};
  const detail = body['detail'];

  if (typeof detail === 'string') return { message: detail };
  if (isRecord(detail)) {
    const status = detail['status'];
    const message = detail['message'];
    return {
      ...(typeof status === 'string' ? { status } : {}),
      ...(typeof message === 'string' ? { message } : {}),
    };
  }
  // 422 validation errors arrive as an array of per-field objects.
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0];
    if (isRecord(first) && typeof first['msg'] === 'string') return { message: first['msg'] };
  }
  const message = body['message'];
  return typeof message === 'string' ? { message } : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function decodeBase64(value: string): Uint8Array {
  // Buffer is available in every runtime this package targets (Node worker + API).
  return new Uint8Array(Buffer.from(value, 'base64'));
}
