/**
 * @kendihikayem/providers/tts — narration, voice cloning and the karaoke timeline.
 *
 * Owner: A5 (SPEC §12). The public surface is deliberately wide, because three consumers
 * need different slices of it:
 *
 *   apps/api    — the quality gate and the consent chain, on the request path of
 *                 `POST /v1/voice/profiles/:id/takes` (SPEC §7 steps 5–7).
 *   apps/worker — the adapters, chunking, assembly, alignment and the slot policy.
 *   tests       — the signal generator, so a recording that is wrong in a known way can be
 *                 produced without shipping anyone's real voice.
 *
 * Everything vendor-specific sits behind `TtsAdapter`; `createTtsRoute` is the only place
 * that decides which vendor is in play, from configuration.
 */

export * from './settings';
/**
 * `retryAfterMs` is deliberately NOT re-exported: `llm/` has its own header parser of the
 * same name, and `export *` from both would collide. Vendor adapters import it from
 * `./http` directly, which is the only place it is meant to be used anyway.
 */
export {
  fetchTransport,
  decodeJson,
  decodeText,
  HttpNetworkError,
  HttpTimeoutError,
} from './http';
export type { FormPart, HttpRequest, HttpResponse, HttpTransport } from './http';
export * from './chunking';
export * from './alignment';
export * from './consent';
export * from './slots';

export * from './audio/wav';
export * from './audio/dsp';
export * from './audio/speakers';
export * from './audio/duration';
export * from './audio/loudness';
export * from './audio/assemble';

export * from './quality/measure';
export * from './quality/gate';

export * from './text/turkish';
export * from './testing/synth';

export { ElevenLabsTtsAdapter } from './elevenlabs/adapter';
export type { ElevenLabsAdapterOptions } from './elevenlabs/adapter';
export { CartesiaTtsAdapter } from './cartesia/adapter';
export type { CartesiaAdapterOptions } from './cartesia/adapter';
/** ⭐ The free narrator. Real Turkish, prebuilt voices, no cloning — see its header. */
export { GoogleTtsAdapter } from './google/adapter';
export type { GoogleTtsAdapterOptions } from './google/adapter';
export {
  buildSynthesizeRequest as buildGoogleTtsRequest,
  parseSynthesizeResponse as parseGoogleTtsResponse,
  parseVoiceMap as parseGoogleVoiceMap,
  sampleRateFromMimeType,
  GoogleTtsProtocolError,
} from './google/wire';
export { WhisperXAlignAdapter } from './align/whisperx';
export type { WhisperXAdapterOptions } from './align/whisperx';

export * from './factory';
