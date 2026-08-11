/**
 * tts/audio/assemble.ts — twelve chunks become one bedtime story.
 *
 * SPEC §7 step 10 describes this as "ffmpeg concat + 350 ms silence + loudnorm −16 LUFS".
 * There is no ffmpeg in this environment, and for PCM there does not need to be: joining
 * raw samples, trimming silence and applying a measured gain are array operations. That is
 * also why `TTS_OUTPUT_FORMAT` defaults to PCM — asking the vendor for MP3 and stitching
 * that would mean decoding and re-encoding every chunk, stacking generation loss across a
 * whole book to save nothing.
 *
 * The gap between chunks is not cosmetic either: it is the page turn. A child hears the
 * pause, looks up, and the parent (or the auto-turn) moves the page.
 */

import { integratedLoudnessLufs, normalizeLoudness } from './loudness';
import type { AudioBuffer } from './wav';

export interface AssembleChunk {
  /** Mono float samples at `sampleRate`. */
  samples: Float32Array;
  pageNo: number;
  chunkIndex: number;
}

export interface AssembleOptions {
  sampleRate: number;
  gapMs: number;
  targetLufs: number;
  peakCeilingDb: number;
  /** Trim leading/trailing near-silence from each chunk before joining. */
  trimSilence?: boolean;
  /**
   * Bedtime fade: gain at the end of the last chunk relative to the first. The contract's
   * `bedtimeMode.targetEndVolume` is the client-side equivalent; doing it here as well means
   * the QR page and the printed-book listener get the same gentle ending without any player.
   */
  bedtimeEndGain?: number;
}

export interface AssembledAudio {
  audio: AudioBuffer;
  /** Where each chunk landed in the final timeline. Feeds `audio_page_marks`. */
  marks: Array<{ chunkIndex: number; pageNo: number; startMs: number; endMs: number }>;
  totalDurationMs: number;
  measuredLufs: number;
  appliedGainDb: number;
}

/** Below this, a sample is silence for trimming purposes (−50 dBFS). */
const SILENCE_FLOOR = 0.00316;

export function assembleNarration(
  chunks: readonly AssembleChunk[],
  options: AssembleOptions,
): AssembledAudio {
  const gapSamples = Math.max(0, Math.round((options.gapMs / 1000) * options.sampleRate));
  const prepared = chunks.map((chunk) => ({
    ...chunk,
    samples: options.trimSilence === false ? chunk.samples : trimSilence(chunk.samples),
  }));

  const totalSamples =
    prepared.reduce((sum, chunk) => sum + chunk.samples.length, 0) +
    gapSamples * Math.max(0, prepared.length - 1);

  const joined = new Float32Array(totalSamples);
  const marks: AssembledAudio['marks'] = [];
  let cursor = 0;

  for (const [index, chunk] of prepared.entries()) {
    const startMs = Math.round((cursor / options.sampleRate) * 1000);
    joined.set(chunk.samples, cursor);
    cursor += chunk.samples.length;
    marks.push({
      chunkIndex: chunk.chunkIndex,
      pageNo: chunk.pageNo,
      startMs,
      endMs: Math.round((cursor / options.sampleRate) * 1000),
    });
    if (index < prepared.length - 1) cursor += gapSamples;
  }

  // Loudness is measured and corrected on the WHOLE narration, not per chunk. Normalising
  // each chunk separately would flatten the story's own dynamics — the whispered page would
  // come out as loud as the exciting one, which is the opposite of what was recorded.
  const normalized = normalizeLoudness(joined, options.sampleRate, {
    targetLufs: options.targetLufs,
    peakCeilingDb: options.peakCeilingDb,
  });

  const finalSamples =
    options.bedtimeEndGain !== undefined && options.bedtimeEndGain < 1
      ? applyBedtimeFade(normalized.samples, options.bedtimeEndGain)
      : normalized.samples;

  return {
    audio: {
      sampleRate: options.sampleRate,
      channels: [finalSamples],
      length: finalSamples.length,
    },
    marks,
    totalDurationMs: Math.round((finalSamples.length / options.sampleRate) * 1000),
    measuredLufs: normalized.measuredLufs,
    appliedGainDb: normalized.appliedGainDb,
  };
}

/**
 * Removes leading and trailing near-silence, keeping a short pad.
 *
 * TTS vendors bracket every request with 100–300 ms of room tone. Left in place across
 * twelve chunks that is up to four seconds of dead air inside one story, and — worse — it
 * pushes every word timing after chunk 1 progressively later than the audio.
 */
export function trimSilence(samples: Float32Array, padMs = 40, sampleRate = 48_000): Float32Array {
  let start = 0;
  let end = samples.length;
  while (start < end && Math.abs(samples[start] ?? 0) < SILENCE_FLOOR) start += 1;
  while (end > start && Math.abs(samples[end - 1] ?? 0) < SILENCE_FLOOR) end -= 1;
  if (start >= end) return new Float32Array(0);

  const pad = Math.round((padMs / 1000) * sampleRate);
  const from = Math.max(0, start - pad);
  const to = Math.min(samples.length, end + pad);
  return samples.slice(from, to);
}

/**
 * A gentle linear-in-dB fade across the whole narration, starting at the halfway point.
 *
 * The first half is untouched: a story that starts fading immediately sounds like a
 * technical fault rather than a lullaby.
 */
function applyBedtimeFade(samples: Float32Array, endGain: number): Float32Array {
  const out = new Float32Array(samples.length);
  const fadeStart = Math.floor(samples.length / 2);
  const endGainDb = 20 * Math.log10(Math.max(0.01, endGain));

  for (let i = 0; i < samples.length; i += 1) {
    if (i < fadeStart) {
      out[i] = samples[i] ?? 0;
      continue;
    }
    const progress = (i - fadeStart) / Math.max(1, samples.length - fadeStart);
    const gain = 10 ** ((endGainDb * progress) / 20);
    out[i] = (samples[i] ?? 0) * gain;
  }
  return out;
}

/** Convenience for the tests and for the ops smoke check. */
export function measureLufs(audio: AudioBuffer): number {
  return integratedLoudnessLufs(audio.channels[0] ?? new Float32Array(0), audio.sampleRate);
}

/** Raw 16-bit little-endian PCM (what `pcm_48000` returns) → float samples. */
export function pcm16ToFloat(bytes: Uint8Array): Float32Array {
  const count = Math.floor(bytes.byteLength / 2);
  const out = new Float32Array(count);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < count; i += 1) out[i] = view.getInt16(i * 2, true) / 32768;
  return out;
}

/** Float samples → raw 16-bit little-endian PCM. */
export function floatToPcm16(samples: Float32Array): Uint8Array {
  const out = new Uint8Array(samples.length * 2);
  const view = new DataView(out.buffer);
  for (let i = 0; i < samples.length; i += 1) {
    const value = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(i * 2, Math.round(value * 32767), true);
  }
  return out;
}
