/**
 * tts/audio/dsp.ts — the signal-processing primitives the voice quality gate is built on.
 *
 * Everything here is pure: `Float32Array` in, numbers out. That is what lets SPEC §7 step 7
 * be tested honestly — `quality.test.ts` synthesises a deliberately noisy / clipped / fast
 * recording and asserts the exact Turkish error code the parent will see, with no vendor
 * and no ffmpeg in the loop.
 *
 * The frame size (25 ms hop 10 ms) is the standard speech-analysis window: long enough for
 * a stable spectrum, short enough that a syllable boundary is not smeared away.
 */

export const FRAME_MS = 25;
export const HOP_MS = 10;

/** Amplitude ratio → dB, floored so digital silence yields −100 instead of −Infinity. */
export function toDb(amplitude: number): number {
  return amplitude <= 1e-5 ? -100 : 20 * Math.log10(amplitude);
}

export function peakAmplitude(samples: Float32Array): number {
  let peak = 0;
  for (const sample of samples) {
    const magnitude = Math.abs(sample);
    if (magnitude > peak) peak = magnitude;
  }
  return peak;
}

export function rms(samples: Float32Array, start = 0, end = samples.length): number {
  let sum = 0;
  let count = 0;
  for (let i = start; i < end && i < samples.length; i += 1) {
    const value = samples[i] ?? 0;
    sum += value * value;
    count += 1;
  }
  return count === 0 ? 0 : Math.sqrt(sum / count);
}

/**
 * Fraction of samples sitting at (or within a hair of) full scale.
 *
 * Threshold is 0.997 rather than 1.0 on purpose: a recorder that limits before the ADC
 * lands at 0.998 and is audibly just as broken as one that hits 1.0 exactly. Isolated peaks
 * are not clipping — only runs of ≥ 3 consecutive pinned samples count, which is what
 * distinguishes a flattened waveform from a legitimately loud transient.
 */
export function clippingRatio(samples: Float32Array, threshold = 0.997): number {
  let clipped = 0;
  let run = 0;
  for (const sample of samples) {
    if (Math.abs(sample) >= threshold) {
      run += 1;
    } else {
      if (run >= 3) clipped += run;
      run = 0;
    }
  }
  if (run >= 3) clipped += run;
  return samples.length === 0 ? 0 : clipped / samples.length;
}

export interface Frames {
  /** RMS energy of each frame. */
  energy: Float32Array;
  frameSize: number;
  hopSize: number;
  sampleRate: number;
}

export function frameEnergies(samples: Float32Array, sampleRate: number): Frames {
  const frameSize = Math.max(1, Math.round((FRAME_MS / 1000) * sampleRate));
  const hopSize = Math.max(1, Math.round((HOP_MS / 1000) * sampleRate));
  const count = samples.length < frameSize ? 0 : Math.floor((samples.length - frameSize) / hopSize) + 1;
  const energy = new Float32Array(Math.max(0, count));
  for (let i = 0; i < count; i += 1) {
    const start = i * hopSize;
    energy[i] = rms(samples, start, start + frameSize);
  }
  return { energy, frameSize, hopSize, sampleRate };
}

/**
 * Noise floor as the 10th percentile of frame energy.
 *
 * A percentile rather than "the quietest frame": one accidental digital-zero frame (a
 * buffer glitch) would otherwise report a −100 dB noise floor and a fantastic SNR on a
 * recording made next to a running television.
 */
export function noiseFloor(frames: Frames, percentile = 0.1): number {
  if (frames.energy.length === 0) return 0;
  const sorted = Float32Array.from(frames.energy).sort();
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * percentile)));
  return sorted[index] ?? 0;
}

export interface SpeechSegments {
  /** Frame indices flagged as speech. */
  mask: Uint8Array;
  speechFrames: number;
  totalFrames: number;
  /** Contiguous speech runs as [startFrame, endFrame) pairs. */
  runs: Array<[number, number]>;
}

/**
 * Energy-gate VAD, thresholded relative to the measured noise floor rather than an absolute
 * dBFS number: a quiet-but-clean recording and a loud-but-clean one must both segment
 * correctly, and only the *relative* gap between speech and background is invariant.
 */
export function detectSpeech(frames: Frames, floor: number, marginDb = 8): SpeechSegments {
  const threshold = Math.max(floor * 10 ** (marginDb / 20), 1e-4);
  const mask = new Uint8Array(frames.energy.length);
  for (let i = 0; i < frames.energy.length; i += 1) {
    mask[i] = (frames.energy[i] ?? 0) >= threshold ? 1 : 0;
  }

  // Close single-frame gaps: a stop consonant (/p/, /t/, /k/) is a 10–20 ms silence in the
  // middle of a word, and counting it as a pause inflates the silence ratio.
  for (let i = 1; i < mask.length - 1; i += 1) {
    if (mask[i] === 0 && mask[i - 1] === 1 && mask[i + 1] === 1) mask[i] = 1;
  }

  const runs: Array<[number, number]> = [];
  let start = -1;
  let speechFrames = 0;
  for (let i = 0; i < mask.length; i += 1) {
    if (mask[i] === 1) {
      speechFrames += 1;
      if (start < 0) start = i;
    } else if (start >= 0) {
      runs.push([start, i]);
      start = -1;
    }
  }
  if (start >= 0) runs.push([start, mask.length]);

  return { mask, speechFrames, totalFrames: mask.length, runs };
}

/**
 * SNR in dB: speech-frame energy over noise-frame energy.
 *
 * Both sides are measured on the same recording, so this is the *usable* SNR the cloner
 * will see, not a lab figure. Returns 0 when there is no speech at all — a silent take
 * fails on duration first, and inventing an SNR would mask that.
 */
export function signalToNoiseDb(frames: Frames, speech: SpeechSegments, floor: number): number {
  if (speech.speechFrames === 0) return 0;
  let signalSum = 0;
  for (let i = 0; i < frames.energy.length; i += 1) {
    if (speech.mask[i] === 1) {
      const value = frames.energy[i] ?? 0;
      signalSum += value * value;
    }
  }
  const signal = Math.sqrt(signalSum / speech.speechFrames);
  const noise = Math.max(floor, 1e-6);
  return Number((20 * Math.log10(signal / noise)).toFixed(2));
}

/* ── Spectrum ──────────────────────────────────────────────────────────────── */

/**
 * In-place iterative radix-2 FFT. Twenty lines of well-specified bit twiddling beats a
 * dependency that would then need auditing for a children's-data service.
 */
export function fft(real: Float64Array, imaginary: Float64Array): void {
  const n = real.length;
  if (n <= 1 || (n & (n - 1)) !== 0) throw new Error('fft length must be a power of two');

  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [real[i], real[j]] = [real[j]!, real[i]!];
      [imaginary[i], imaginary[j]] = [imaginary[j]!, imaginary[i]!];
    }
  }

  for (let length = 2; length <= n; length <<= 1) {
    const angle = (-2 * Math.PI) / length;
    const wReal = Math.cos(angle);
    const wImaginary = Math.sin(angle);
    for (let i = 0; i < n; i += length) {
      let curReal = 1;
      let curImaginary = 0;
      for (let j = 0; j < length / 2; j += 1) {
        const uReal = real[i + j]!;
        const uImaginary = imaginary[i + j]!;
        const vReal = real[i + j + length / 2]! * curReal - imaginary[i + j + length / 2]! * curImaginary;
        const vImaginary =
          real[i + j + length / 2]! * curImaginary + imaginary[i + j + length / 2]! * curReal;
        real[i + j] = uReal + vReal;
        imaginary[i + j] = uImaginary + vImaginary;
        real[i + j + length / 2] = uReal - vReal;
        imaginary[i + j + length / 2] = uImaginary - vImaginary;
        const nextReal = curReal * wReal - curImaginary * wImaginary;
        curImaginary = curReal * wImaginary + curImaginary * wReal;
        curReal = nextReal;
      }
    }
  }
}

/**
 * Average magnitude spectrum over the speech frames, Hann-windowed.
 *
 * Runs on the FULL-RATE signal (bandwidth is the whole question here), while the speech
 * mask comes from the 16 kHz analysis signal. Both use a 10 ms hop, so frame index `i` is
 * the same instant in both — only the hop in SAMPLES differs, which is why it is a
 * parameter instead of being read off `Frames`.
 */
export function averageSpectrum(
  samples: Float32Array,
  sampleRate: number,
  speech: SpeechSegments,
  hopSize: number,
  size = 1024,
  want: 0 | 1 = 1,
): Float64Array {
  const spectrum = new Float64Array(size / 2);
  let counted = 0;

  for (let frameIndex = 0; frameIndex < speech.mask.length; frameIndex += 1) {
    if (speech.mask[frameIndex] !== want) continue;
    const start = frameIndex * hopSize;
    if (start + size > samples.length) break;

    const real = new Float64Array(size);
    const imaginary = new Float64Array(size);
    for (let i = 0; i < size; i += 1) {
      const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));
      real[i] = (samples[start + i] ?? 0) * window;
    }
    fft(real, imaginary);
    for (let bin = 0; bin < size / 2; bin += 1) {
      spectrum[bin] = (spectrum[bin] ?? 0) + Math.hypot(real[bin]!, imaginary[bin]!);
    }
    counted += 1;
    if (counted >= 120) break; // ~1.2 s of speech is plenty; the rest is diminishing returns
    frameIndex += 3; // stride: neighbouring 25 ms frames overlap and add little information
  }

  if (counted > 0) {
    for (let bin = 0; bin < spectrum.length; bin += 1) spectrum[bin]! /= counted;
  }
  void sampleRate;
  return spectrum;
}

/**
 * Bandwidth as the highest frequency still carrying meaningful VOICE energy — the point
 * where the cumulative spectrum reaches `energyFraction` of its total.
 *
 * SPEC §7 flags < 8 kHz as a warning (`DAR_BANT_GENISLIGI`): that is the signature of a
 * Bluetooth headset's 8/16 kHz voice profile, which strips exactly the sibilance a cloned
 * voice needs to sound like a person instead of a telephone.
 *
 * `noiseSpectrum` is subtracted first, and that subtraction is the whole point. Broadband
 * hiss is flat all the way to Nyquist, so a recording made next to an air conditioner would
 * otherwise measure a *wider* bandwidth than a clean one — the metric would reward the
 * defect it exists to detect.
 */
export function effectiveBandwidthHz(
  spectrum: Float64Array,
  sampleRate: number,
  noiseSpectrum?: Float64Array,
  rolloffDb = 50,
): number {
  const clean = new Float64Array(spectrum.length);
  for (let bin = 0; bin < spectrum.length; bin += 1) {
    const noise = noiseSpectrum?.[bin] ?? 0;
    // Over-subtract slightly (1.5×): spectral subtraction leaves musical residue otherwise.
    clean[bin] = Math.max(0, (spectrum[bin] ?? 0) - noise * 1.5);
  }

  // Smooth over ~10 bins before looking for the edge: one loud bin is a resonance, and the
  // question here is where the microphone's usable band ENDS, not where a peak sits.
  const smoothed = movingAverage(clean, 10);
  let peak = 0;
  for (const magnitude of smoothed) if (magnitude > peak) peak = magnitude;
  if (peak <= 0) return 0;

  // Highest frequency still within `rolloffDb` of the strongest band. A hard cutoff — which
  // is exactly what a headset's 8 kHz voice profile imposes — shows up as a cliff here.
  // A cumulative-energy criterion was tried first and is unusable: the long, very low
  // tail of a wideband recording accumulates past any percentile, so every take measured
  // near Nyquist regardless of what the microphone actually passed.
  const floorMagnitude = peak * 10 ** (-rolloffDb / 20);
  for (let bin = smoothed.length - 1; bin >= 0; bin -= 1) {
    if ((smoothed[bin] ?? 0) >= floorMagnitude) {
      return Math.round((bin * sampleRate) / (smoothed.length * 2));
    }
  }
  return 0;
}

function movingAverage(values: Float64Array, window: number): Float64Array {
  const out = new Float64Array(values.length);
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i] ?? 0;
    if (i >= window) sum -= values[i - window] ?? 0;
    out[i] = sum / Math.min(i + 1, window);
  }
  return out;
}

/**
 * Reverberation time from the energy decay that follows every loud moment in the take.
 *
 * Measuring true RT60 needs an impulse; on speech we measure the T20 slope (−5 → −25 dB
 * below a local peak) and extrapolate ×3, the standard room-acoustics fallback.
 *
 * ⚠️ Deliberately NOT driven by the VAD's speech runs, which is the obvious implementation
 * and is wrong exactly when it matters: in a genuinely reverberant room the tail fills the
 * gaps between sentences, the noise floor rises to meet the speech, and the VAD reports one
 * long undifferentiated utterance with no offsets to measure. Scanning for decay events
 * directly keeps the measurement working in the room it exists to detect.
 */
export function reverbTimeMs(frames: Frames, snrDb = 60): number | undefined {
  const energy = frames.energy;
  if (energy.length < 20) return undefined;
  const msPerFrame = (frames.hopSize / frames.sampleRate) * 1000;
  const maxTailFrames = Math.ceil(1200 / msPerFrame);

  // Only consider peaks in the upper half of the dynamic range: a decay measured from a
  // quiet frame runs into the noise floor before it has fallen 25 dB.
  const sorted = Float32Array.from(energy).sort();
  const loudThreshold = sorted[Math.floor(sorted.length * 0.75)] ?? 0;
  if (loudThreshold <= 1e-4) return undefined;

  const estimates: number[] = [];
  for (let i = 1; i < energy.length - 3; i += 1) {
    const peak = energy[i] ?? 0;
    if (peak < loudThreshold) continue;
    if (peak <= (energy[i - 1] ?? 0) || peak <= (energy[i + 1] ?? 0)) continue; // local max only

    const peakDb = toDb(peak);
    let startFrame = -1;
    let endFrame = -1;
    for (let j = i + 1; j < Math.min(i + maxTailFrames, energy.length); j += 1) {
      const db = toDb(energy[j] ?? 0) - peakDb;
      if (db > -3 && startFrame >= 0) break; // speech restarted; this decay is not clean
      if (startFrame < 0 && db <= -5) startFrame = j;
      if (startFrame >= 0 && db <= -25) {
        endFrame = j;
        break;
      }
    }
    if (startFrame < 0 || endFrame <= startFrame) continue;

    // T20 → RT60 is ×3 by definition (20 dB of decay extrapolated to 60).
    const rt60 = (endFrame - startFrame) * msPerFrame * 3;
    if (rt60 >= 20 && rt60 <= 3000) estimates.push(rt60);
    if (estimates.length >= 120) break;
  }

  if (estimates.length >= 3) {
    estimates.sort((a, b) => a - b);
    // The 75th percentile rather than the median: a syllable's own amplitude envelope decays
    // fast and would otherwise dominate the statistic, hiding the room behind the voice.
    return Math.round(estimates[Math.floor(estimates.length * 0.75)]!);
  }

  // No measurable decay anywhere. Two very different takes look like this: continuous
  // speech with no pauses (fine), and a room so live that every tail runs into the next
  // word (not fine). The envelope's modulation depth separates them — reverberation fills
  // the valleys between syllables, which is the one thing continuous speech does not do.
  //
  // Background noise fills those valleys too, so below the SNR threshold this cannot tell a
  // hard room from an air conditioner; there `GURULTULU` is already the verdict and adding
  // `YANKILI` would only send the parent to rearrange their furniture as well.
  if (snrDb >= 18 && modulationIndex(frames) < 0.35) return SMEARED_ROOM_MS;
  return undefined;
}

/**
 * Reported when the envelope is smeared but no individual decay could be timed. Not a
 * measurement — a floor, chosen just above `VOICE_QUALITY_THRESHOLDS.reverbMsMax` so the
 * take is rejected. Anything more precise would be false precision.
 */
const SMEARED_ROOM_MS = 500;

/**
 * Modulation index of the intensity envelope — how deep the valleys between syllables are.
 *
 * The idea comes from the Speech Transmission Index (Houtgast & Steeneken): speech carries
 * a ~4 Hz amplitude modulation from its own syllable rate, and both reverberation and noise
 * shallow it out. Reported as a raw 0..1 index rather than converted to an RT60, because
 * the STI relation needs the DRY source's modulation depth as a reference and we only ever
 * see the room's output — turning this into milliseconds would be inventing precision.
 */
export function modulationIndex(frames: Frames): number {
  const energy = frames.energy;
  if (energy.length < 50) return 1;

  // Intensity envelope (energy², per the STI derivation), restricted to the loud part of
  // the take so leading and trailing silence do not read as infinitely deep modulation.
  const intensities = Array.from(energy, (value) => value * value);
  const sorted = [...intensities].sort((a, b) => a - b);
  const floorIntensity = sorted[Math.floor(sorted.length * 0.05)] ?? 0;
  const active = intensities.filter((value) => value > floorIntensity * 4);
  if (active.length < 40) return 1;

  const mean = active.reduce((sum, value) => sum + value, 0) / active.length;
  if (mean <= 0) return 1;
  const variance = active.reduce((sum, value) => sum + (value - mean) ** 2, 0) / active.length;
  return Math.min(1, Math.sqrt(variance) / mean);
}

/* ── Pitch, for the speaker-count heuristic ────────────────────────────────── */

/**
 * Fundamental frequency of one frame by normalised autocorrelation, searched over the human
 * range (70–400 Hz). Returns undefined for unvoiced frames (fricatives, silence), where a
 * "pitch" would be noise dressed up as a number.
 */
export function fundamentalHz(
  samples: Float32Array,
  start: number,
  frameSize: number,
  sampleRate: number,
): number | undefined {
  const minLag = Math.floor(sampleRate / 400);
  const maxLag = Math.floor(sampleRate / 70);
  if (start + maxLag * 2 > samples.length) return undefined;

  let energy = 0;
  for (let i = 0; i < frameSize; i += 1) {
    const value = samples[start + i] ?? 0;
    energy += value * value;
  }
  if (energy < 1e-6) return undefined;

  const scores = new Float64Array(maxLag + 1);
  let bestLag = -1;
  let bestScore = 0;
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let correlation = 0;
    let lagEnergy = 0;
    for (let i = 0; i < frameSize; i += 1) {
      const a = samples[start + i] ?? 0;
      const b = samples[start + i + lag] ?? 0;
      correlation += a * b;
      lagEnergy += b * b;
    }
    const score = correlation / Math.sqrt(energy * lagEnergy + 1e-12);
    scores[lag] = score;
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }

  // Below 0.35 normalised correlation the frame is not periodic — it is not voiced speech.
  if (bestLag < 0 || bestScore < 0.35) return undefined;

  // ⚠️ OCTAVE ERROR GUARD. Autocorrelation peaks just as hard at 2×, 3× … the true period,
  // and picking the global maximum reports half or a third of the real pitch. An octave
  // error is 12 semitones — precisely the gap the speaker-count check treats as proof of a
  // second person, so without this guard one calm reader is regularly accused of having
  // company. Prefer the SHORTEST lag that is nearly as good as the best.
  const threshold = bestScore * 0.85;
  for (let lag = minLag; lag < bestLag; lag += 1) {
    if ((scores[lag] ?? 0) >= threshold) return sampleRate / lag;
  }
  return sampleRate / bestLag;
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}
