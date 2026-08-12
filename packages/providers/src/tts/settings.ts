/**
 * tts/settings.ts — every tunable the voice pipeline reads, resolved from `packages/config`.
 *
 * ⚠️ SPEC §3 rule 6. There is no model id, voice id, endpoint or timeout written as a
 * literal anywhere under `tts/` — they all arrive here, from the environment, and
 * `eslint.config.mjs` turns a hardcoded one into a build error. The practical payoff is the
 * one the brief asks for: when the ElevenLabs key finally exists, `API_MODE=live` plus the
 * key is the whole change. Nothing is recompiled around a new model name.
 */

import type { Env } from '@kendihikayem/config';

export interface VendorEndpoint {
  baseUrl: string;
  apiKey: string | undefined;
  /** Extra fixed headers (pinned API versions and the like). */
  headers: Record<string, string>;
}

export interface VoiceTimbre {
  stability: number;
  similarity: number;
  style: number;
  speakerBoost: boolean;
}

/** The free narrator's knobs. Prosody here is natural language, not numeric timbre. */
export interface GoogleVoiceSettings {
  baseUrl: string;
  apiVersion: string;
  apiKey: string | undefined;
  model: string;
  /** Used when a `provider_voice_id` is not in `voiceMap`. */
  defaultVoice: string;
  /** Raw `GOOGLE_TTS_VOICE_MAP` JSON; parsed by the adapter, which tolerates a typo. */
  voiceMap: string;
  languageCode: string;
  /** Hz the vendor returns. The adapter resamples to the pipeline's 48 kHz. */
  sampleRate: number;
  /** Turkish style directive; empty disables it. See `GOOGLE_TTS_STYLE_PROMPT_TR`. */
  stylePromptTr: string | undefined;
}

export interface TtsSettings {
  elevenlabs: VendorEndpoint;
  cartesia: VendorEndpoint;
  google: GoogleVoiceSettings;
  models: {
    /** Keyed by contract `Tier`. */
    elevenlabs: { draft: string; quality: string };
    cartesia: { draft: string; quality: string };
  };
  /**
   * ⚠️ Cloning the parent's voice. `false` ⇒ a clone request is REFUSED with a Turkish
   * explanation rather than silently served by a system voice (`VOICE_CLONING_ENABLED`).
   */
  cloningEnabled: boolean;
  outputFormat: 'mp3_44100_128' | 'pcm_48000' | 'opus_48000';
  timeouts: { synthesizeMs: number; createVoiceMs: number; alignMs: number };
  chunking: { maxChars: number; concurrency: number; gapMs: number };
  loudness: { targetLufs: number; peakCeilingDb: number; bedtimeEndGain: number };
  timbre: VoiceTimbre;
  slots: { limit: number; highWater: number; idleHours: number; ephemeral: boolean };
  retention: { rawDays: number };
  align: { url: string | undefined; model: string };
  /** Absent ⇒ only WAV uploads can be measured; see `audio/decode.ts`. */
  ffmpegPath: string | undefined;
}

export function ttsSettingsFromEnv(env: Env): TtsSettings {
  return {
    elevenlabs: {
      baseUrl: trimSlash(env.ELEVENLABS_BASE_URL),
      apiKey: env.ELEVENLABS_API_KEY,
      headers: {},
    },
    cartesia: {
      baseUrl: trimSlash(env.CARTESIA_BASE_URL),
      apiKey: env.CARTESIA_API_KEY,
      // Cartesia pins behaviour to a dated wire version; sending none is an error there.
      headers: { 'cartesia-version': env.CARTESIA_API_VERSION },
    },
    google: {
      // The SAME endpoint and the SAME key as text and illustration — one secret brings up
      // the whole free stack.
      baseUrl: trimSlash(env.GOOGLE_GENAI_BASE_URL),
      apiVersion: env.GOOGLE_GENAI_API_VERSION,
      apiKey: env.GOOGLE_GENAI_API_KEY,
      model: env.GOOGLE_TTS_MODEL,
      defaultVoice: env.GOOGLE_TTS_VOICE_DEFAULT,
      voiceMap: env.GOOGLE_TTS_VOICE_MAP,
      languageCode: env.GOOGLE_TTS_LANGUAGE_CODE,
      sampleRate: env.GOOGLE_TTS_SAMPLE_RATE,
      stylePromptTr: env.GOOGLE_TTS_STYLE_PROMPT_TR,
    },
    cloningEnabled: env.VOICE_CLONING_ENABLED,
    models: {
      elevenlabs: { draft: env.TTS_MODEL_DRAFT, quality: env.TTS_MODEL_QUALITY },
      cartesia: { draft: env.CARTESIA_MODEL_DRAFT, quality: env.CARTESIA_MODEL_QUALITY },
    },
    outputFormat: env.TTS_OUTPUT_FORMAT,
    timeouts: {
      synthesizeMs: env.TTS_REQUEST_TIMEOUT_MS,
      createVoiceMs: env.TTS_VOICE_CREATE_TIMEOUT_MS,
      alignMs: env.ALIGN_REQUEST_TIMEOUT_MS,
    },
    chunking: {
      maxChars: env.TTS_CHUNK_MAX_CHARS,
      concurrency: env.TTS_CHUNK_CONCURRENCY,
      gapMs: env.TTS_CHUNK_GAP_MS,
    },
    loudness: {
      targetLufs: env.TTS_LOUDNESS_TARGET_LUFS,
      peakCeilingDb: env.TTS_LOUDNESS_PEAK_CEILING_DB,
      bedtimeEndGain: env.TTS_BEDTIME_END_GAIN,
    },
    timbre: {
      stability: env.TTS_VOICE_STABILITY,
      similarity: env.TTS_VOICE_SIMILARITY,
      style: env.TTS_VOICE_STYLE,
      speakerBoost: env.TTS_VOICE_SPEAKER_BOOST,
    },
    slots: {
      limit: env.VOICE_SLOT_LIMIT,
      highWater: env.VOICE_SLOT_HIGH_WATER,
      idleHours: env.VOICE_BINDING_IDLE_HOURS,
      ephemeral: env.VOICE_EPHEMERAL,
    },
    retention: { rawDays: env.VOICE_RAW_RETENTION_DAYS },
    align: { url: env.WHISPERX_URL, model: env.ALIGN_MODEL },
    ffmpegPath: env.AUDIO_FFMPEG_PATH,
  };
}

function trimSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}
