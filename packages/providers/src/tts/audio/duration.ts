/**
 * tts/audio/duration.ts — how long is this audio, without decoding it?
 *
 * The duration of every chunk is needed for three things that all happen before anyone
 * listens: the page marks in `audio_page_marks`, the offset that shifts chunk N's word
 * timings into whole-file time, and the second-based half of the cost ledger. Fully
 * decoding an MP3 to count frames would be the obvious approach and is wasteful — the
 * information is in the container, or in the alignment we were already handed.
 */

import type { ElevenAlignment } from '../elevenlabs/wire';

export interface DurationInput {
  mimeType: string;
  /** For raw PCM, which carries no header at all. */
  sampleRate: number;
  bitsPerSample: number;
  channels: number;
  /** Vendor character timings — the most accurate source when present. */
  alignment?: ElevenAlignment | undefined;
}

export function audioDurationMs(bytes: Uint8Array, input: DurationInput): number {
  // 1. The alignment knows exactly when the last character stopped being spoken.
  const fromAlignment = alignmentDurationMs(input.alignment);
  if (fromAlignment !== undefined) return fromAlignment;

  // 2. Raw PCM: bytes ÷ (rate × channels × bytes-per-sample). Exact, no parsing.
  if (input.mimeType.startsWith('audio/L') || input.mimeType === 'audio/pcm') {
    const bytesPerFrame = (input.bitsPerSample >> 3) * input.channels;
    if (bytesPerFrame <= 0 || input.sampleRate <= 0) return 0;
    return Math.round((bytes.byteLength / bytesPerFrame / input.sampleRate) * 1000);
  }

  // 3. MP3: walk the frame headers. Exact for CBR and VBR alike.
  if (input.mimeType === 'audio/mpeg') {
    const mp3 = mp3DurationMs(bytes);
    if (mp3 !== undefined) return mp3;
  }

  // 4. Nothing else parses here. Zero is honest — the caller substitutes an estimate — and
  // a wrong non-zero would put every page mark in the wrong place.
  return 0;
}

function alignmentDurationMs(alignment: ElevenAlignment | undefined): number | undefined {
  if (!alignment) return undefined;
  const ends = alignment.character_end_times_seconds;
  const last = ends[ends.length - 1];
  if (last === undefined || !Number.isFinite(last) || last <= 0) return undefined;
  return Math.round(last * 1000);
}

const MPEG_BITRATES_V1_L3 = [
  0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0,
] as const;
const MPEG_BITRATES_V2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0] as const;
const MPEG_RATES_V1 = [44_100, 48_000, 32_000, 0] as const;
const MPEG_RATES_V2 = [22_050, 24_000, 16_000, 0] as const;
const MPEG_RATES_V25 = [11_025, 12_000, 8_000, 0] as const;

/**
 * Sums MP3 frame durations by walking the frame headers.
 *
 * Deliberately not "file size ÷ bitrate": that is wrong for VBR (which is what a TTS vendor
 * returns) and wrong for any file carrying an ID3 tag, and both errors are silent — the
 * audio plays fine while every word timing on the page drifts.
 */
function mp3DurationMs(bytes: Uint8Array): number | undefined {
  let offset = 0;

  // Skip an ID3v2 tag if present: its size is a 28-bit synchsafe integer.
  if (
    bytes.byteLength > 10 &&
    bytes[0] === 0x49 &&
    bytes[1] === 0x44 &&
    bytes[2] === 0x33
  ) {
    const size =
      ((bytes[6]! & 0x7f) << 21) |
      ((bytes[7]! & 0x7f) << 14) |
      ((bytes[8]! & 0x7f) << 7) |
      (bytes[9]! & 0x7f);
    offset = 10 + size;
  }

  let totalMs = 0;
  let frames = 0;

  while (offset + 4 <= bytes.byteLength) {
    const b0 = bytes[offset]!;
    const b1 = bytes[offset + 1]!;
    if (b0 !== 0xff || (b1 & 0xe0) !== 0xe0) {
      offset += 1; // resync
      continue;
    }

    const versionBits = (b1 >> 3) & 0x03;
    const layerBits = (b1 >> 1) & 0x03;
    if (versionBits === 1 || layerBits === 0) {
      offset += 1;
      continue;
    }

    const b2 = bytes[offset + 2]!;
    const bitrateIndex = (b2 >> 4) & 0x0f;
    const rateIndex = (b2 >> 2) & 0x03;
    const padding = (b2 >> 1) & 0x01;

    const isVersion1 = versionBits === 3;
    const bitrate =
      (isVersion1 ? MPEG_BITRATES_V1_L3[bitrateIndex] : MPEG_BITRATES_V2_L3[bitrateIndex]) ?? 0;
    const sampleRate =
      (versionBits === 3
        ? MPEG_RATES_V1[rateIndex]
        : versionBits === 2
          ? MPEG_RATES_V2[rateIndex]
          : MPEG_RATES_V25[rateIndex]) ?? 0;
    if (bitrate === 0 || sampleRate === 0) {
      offset += 1;
      continue;
    }

    const samplesPerFrame = isVersion1 ? 1152 : 576;
    const frameBytes = Math.floor((samplesPerFrame / 8) * ((bitrate * 1000) / sampleRate)) + padding;
    if (frameBytes <= 0) break;

    totalMs += (samplesPerFrame / sampleRate) * 1000;
    frames += 1;
    offset += frameBytes;
  }

  return frames > 0 ? Math.round(totalMs) : undefined;
}
