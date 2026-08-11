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
export * from './http';
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
export { WhisperXAlignAdapter } from './align/whisperx';
export type { WhisperXAdapterOptions } from './align/whisperx';

export * from './factory';
