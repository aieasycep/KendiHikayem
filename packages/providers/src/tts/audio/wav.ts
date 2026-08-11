/**
 * tts/audio/wav.ts — a self-contained RIFF/WAVE codec.
 *
 * Why hand-rolled instead of ffmpeg: the quality gate (SPEC §7 step 7) runs on the request
 * path of `POST /voice/profiles/:id/takes`, and the parent is staring at the screen waiting
 * for "biraz daha yavaş okuyun". Shelling out per take is a process spawn plus a temp file
 * per attempt; decoding 30 seconds of PCM in-process is microseconds. It also means the
 * gate is testable in vitest against generated signals with no binary dependency at all —
 * which is the only way it could be tested in this environment, where ffmpeg is absent.
 *
 * Scope is deliberately narrow: uncompressed PCM (u8/s16/s24/s32) and IEEE float32, which
 * is what every mobile recorder emits when asked for WAV. Compressed containers (m4a/webm)
 * go through `decode.ts`, which needs ffmpeg and says so out loud instead of guessing.
 */

/** Decoded audio, always float32 in [-1, 1], one array per channel. */
export interface AudioBuffer {
  sampleRate: number;
  /** Channel-major: `channels[0]` is the left/mono channel. */
  channels: Float32Array[];
  /** Frames per channel. */
  length: number;
}

export class WavFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WavFormatError';
  }
}

const FORMAT_PCM = 1;
const FORMAT_FLOAT = 3;
const FORMAT_EXTENSIBLE = 0xfffe;

function ascii(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

/** True when the bytes start with a RIFF/WAVE header. Cheap sniff before decoding. */
export function isWav(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 12) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return ascii(view, 0) === 'RIFF' && ascii(view, 8) === 'WAVE';
}

export function decodeWav(bytes: Uint8Array): AudioBuffer {
  if (!isWav(bytes)) throw new WavFormatError('not a RIFF/WAVE file');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  let offset = 12;
  let formatTag = 0;
  let channelCount = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let dataStart = -1;
  let dataLength = 0;

  // Chunk walk rather than "fmt is always at 12": recorders interleave LIST/JUNK chunks.
  while (offset + 8 <= bytes.byteLength) {
    const id = ascii(view, offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;

    if (id === 'fmt ') {
      if (size < 16) throw new WavFormatError('fmt chunk too short');
      formatTag = view.getUint16(body, true);
      channelCount = view.getUint16(body + 2, true);
      sampleRate = view.getUint32(body + 4, true);
      bitsPerSample = view.getUint16(body + 14, true);
      if (formatTag === FORMAT_EXTENSIBLE && size >= 40) {
        // WAVE_FORMAT_EXTENSIBLE hides the real tag in the first two bytes of the GUID.
        formatTag = view.getUint16(body + 24, true);
      }
    } else if (id === 'data') {
      dataStart = body;
      // Streaming writers leave size = 0 or 0xffffffff; trust the file length instead.
      dataLength = size === 0 || body + size > bytes.byteLength ? bytes.byteLength - body : size;
    }

    offset = body + size + (size % 2); // chunks are word-aligned
    if (dataStart >= 0 && formatTag !== 0) break;
  }

  if (dataStart < 0) throw new WavFormatError('no data chunk');
  if (channelCount < 1) throw new WavFormatError('no channels');
  if (sampleRate < 1) throw new WavFormatError('no sample rate');

  const bytesPerSample = Math.max(1, bitsPerSample >> 3);
  const frameCount = Math.floor(dataLength / (bytesPerSample * channelCount));
  const channels = Array.from(
    { length: channelCount },
    () => new Float32Array(frameCount),
  );

  const read = sampleReader(formatTag, bitsPerSample);
  for (let frame = 0; frame < frameCount; frame += 1) {
    const frameStart = dataStart + frame * bytesPerSample * channelCount;
    for (let channel = 0; channel < channelCount; channel += 1) {
      channels[channel]![frame] = read(view, frameStart + channel * bytesPerSample);
    }
  }

  return { sampleRate, channels, length: frameCount };
}

function sampleReader(
  formatTag: number,
  bitsPerSample: number,
): (view: DataView, at: number) => number {
  if (formatTag === FORMAT_FLOAT && bitsPerSample === 32) {
    return (view, at) => view.getFloat32(at, true);
  }
  if (formatTag === FORMAT_FLOAT && bitsPerSample === 64) {
    return (view, at) => view.getFloat64(at, true);
  }
  if (formatTag !== FORMAT_PCM) {
    throw new WavFormatError(`unsupported WAVE format tag ${formatTag} (compressed?)`);
  }
  switch (bitsPerSample) {
    case 8:
      // 8-bit PCM is unsigned with 128 as silence — the one place the sign convention flips.
      return (view, at) => (view.getUint8(at) - 128) / 128;
    case 16:
      return (view, at) => view.getInt16(at, true) / 32768;
    case 24:
      return (view, at) => {
        const lo = view.getUint8(at);
        const mid = view.getUint8(at + 1);
        const hi = view.getInt8(at + 2);
        return ((hi << 16) | (mid << 8) | lo) / 8388608;
      };
    case 32:
      return (view, at) => view.getInt32(at, true) / 2147483648;
    default:
      throw new WavFormatError(`unsupported bit depth ${bitsPerSample}`);
  }
}

export interface EncodeWavOptions {
  sampleRate: number;
  /** 16 for storage, 32-float when the samples feed another processing stage. */
  bitDepth?: 16 | 24 | 32;
  float?: boolean;
}

/** Encodes float channels back to a RIFF/WAVE buffer. Values outside [-1,1] are clamped. */
export function encodeWav(channels: Float32Array[], options: EncodeWavOptions): Uint8Array {
  const channelCount = channels.length;
  if (channelCount === 0) throw new WavFormatError('encodeWav needs at least one channel');
  const frameCount = channels[0]!.length;
  const float = options.float ?? false;
  const bitDepth = float ? 32 : (options.bitDepth ?? 16);
  const bytesPerSample = bitDepth >> 3;
  const dataBytes = frameCount * channelCount * bytesPerSample;

  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, float ? FORMAT_FLOAT : FORMAT_PCM, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, options.sampleRate, true);
  view.setUint32(28, options.sampleRate * channelCount * bytesPerSample, true);
  view.setUint16(32, channelCount * bytesPerSample, true);
  view.setUint16(34, bitDepth, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataBytes, true);

  let at = 44;
  for (let frame = 0; frame < frameCount; frame += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      const raw = channels[channel]![frame] ?? 0;
      const value = Math.max(-1, Math.min(1, raw));
      if (float) {
        view.setFloat32(at, value, true);
      } else if (bitDepth === 16) {
        view.setInt16(at, Math.round(value * 32767), true);
      } else if (bitDepth === 24) {
        const scaled = Math.round(value * 8388607);
        view.setUint8(at, scaled & 0xff);
        view.setUint8(at + 1, (scaled >> 8) & 0xff);
        view.setInt8(at + 2, scaled >> 16);
      } else {
        view.setInt32(at, Math.round(value * 2147483647), true);
      }
      at += bytesPerSample;
    }
  }

  return new Uint8Array(buffer);
}

/** Averages every channel into one. Voice analysis and cloning are mono end to end. */
export function toMono(audio: AudioBuffer): Float32Array {
  const first = audio.channels[0];
  if (!first) return new Float32Array(0);
  if (audio.channels.length === 1) return first;

  const out = new Float32Array(audio.length);
  for (let i = 0; i < audio.length; i += 1) {
    let sum = 0;
    for (const channel of audio.channels) sum += channel[i] ?? 0;
    out[i] = sum / audio.channels.length;
  }
  return out;
}

/**
 * Resample with anti-aliasing on the way down.
 *
 * ⚠️ The low-pass is not optional and its absence is silent. Dropping 44.1 kHz to 8 kHz for
 * pitch analysis without filtering first folds every fricative (4–11 kHz) back under 4 kHz
 * as noise: the pitch tracker then reads octave-confused garbage and — the way this was
 * actually discovered — two clearly different voices measure an identical timbre, because
 * what is being compared is the aliasing rather than the speakers.
 *
 * Interpolation itself is linear, which is ample here: analysis rates are integer-ish
 * fractions of the source and the signal is already band-limited by the filter.
 */
export function resample(samples: Float32Array, from: number, to: number): Float32Array {
  if (from === to || samples.length === 0) return samples;
  if (to < from) samples = lowPass(samples, from, to * 0.42);
  const ratio = to / from;
  const outLength = Math.max(1, Math.round(samples.length * ratio));
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i += 1) {
    const source = i / ratio;
    const index = Math.floor(source);
    const frac = source - index;
    const a = samples[Math.min(index, samples.length - 1)] ?? 0;
    const b = samples[Math.min(index + 1, samples.length - 1)] ?? 0;
    out[i] = a + (b - a) * frac;
  }
  return out;
}

/**
 * Four cascaded one-pole low-passes ≈ 24 dB/octave. Applied forward then backward so the
 * filter is zero-phase: timings measured after resampling (speech onsets, decay slopes)
 * must not be shifted by the filter that prepared the signal.
 */
function lowPass(samples: Float32Array, sampleRate: number, cutoffHz: number): Float32Array {
  const rc = 1 / (2 * Math.PI * cutoffHz);
  const dt = 1 / sampleRate;
  const alpha = dt / (rc + dt);

  const current = Float32Array.from(samples);
  for (let pass = 0; pass < 2; pass += 1) {
    let value = current[0] ?? 0;
    for (let i = 0; i < current.length; i += 1) {
      value += alpha * ((current[i] ?? 0) - value);
      current[i] = value;
    }
    value = current[current.length - 1] ?? 0;
    for (let i = current.length - 1; i >= 0; i -= 1) {
      value += alpha * ((current[i] ?? 0) - value);
      current[i] = value;
    }
  }
  return current;
}

export function durationMs(audio: { sampleRate: number; length: number }): number {
  return Math.round((audio.length / audio.sampleRate) * 1000);
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
}
