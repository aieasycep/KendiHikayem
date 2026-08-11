/**
 * tts/audio/loudness.ts — ITU-R BS.1770-4 integrated loudness, in TypeScript.
 *
 * SPEC §7 step 10 asks for −16 LUFS. That number is not decoration: this is bedtime audio.
 * Twelve chunks synthesised independently arrive at slightly different levels, and a child
 * who has just fallen asleep is woken by page 9 being 4 dB louder than page 8. Peak
 * normalisation cannot fix that — peak measures the loudest instant, loudness measures what
 * an ear experiences — so the real gated-loudness algorithm is implemented here rather than
 * approximated with an RMS.
 *
 * Implemented per the standard: K-weighting (a high-shelf plus a high-pass), mean square
 * over 400 ms blocks with 75% overlap, an absolute gate at −70 LUFS and a relative gate at
 * −10 LU below the ungated mean.
 *
 * ffmpeg's `loudnorm` filter does this too and is absent from this environment; this
 * implementation is tested against known-amplitude signals instead.
 */

/** Second-order section, transposed direct form II. */
interface Biquad {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

/**
 * Stage 1: a +4 dB high shelf at ~1.5 kHz, modelling the acoustic effect of a human head.
 * Coefficients from BS.1770-4 Table 1, specified at 48 kHz and re-derived for other rates.
 */
function shelvingFilter(sampleRate: number): Biquad {
  const gainDb = 3.999843853973347;
  const q = 0.7071752369554196;
  const centreHz = 1681.974450955533;

  const k = Math.tan((Math.PI * centreHz) / sampleRate);
  const vh = 10 ** (gainDb / 20);
  const vb = vh ** 0.4996667741545416;
  const denominator = 1 + k / q + k * k;

  return {
    b0: (vh + (vb * k) / q + k * k) / denominator,
    b1: (2 * (k * k - vh)) / denominator,
    b2: (vh - (vb * k) / q + k * k) / denominator,
    a1: (2 * (k * k - 1)) / denominator,
    a2: (1 - k / q + k * k) / denominator,
  };
}

/** Stage 2: a high-pass at ~38 Hz — rumble contributes nothing to perceived loudness. */
function highPassFilter(sampleRate: number): Biquad {
  const q = 0.5003270373238773;
  const cutoffHz = 38.13547087602444;

  const k = Math.tan((Math.PI * cutoffHz) / sampleRate);
  const denominator = 1 + k / q + k * k;

  return {
    b0: 1,
    b1: -2,
    b2: 1,
    a1: (2 * (k * k - 1)) / denominator,
    a2: (1 - k / q + k * k) / denominator,
  };
}

function applyBiquad(samples: Float32Array, filter: Biquad): Float32Array {
  const out = new Float32Array(samples.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const x0 = samples[i] ?? 0;
    const y0 =
      filter.b0 * x0 + filter.b1 * x1 + filter.b2 * x2 - filter.a1 * y1 - filter.a2 * y2;
    out[i] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }
  return out;
}

const BLOCK_MS = 400;
const OVERLAP = 0.75;
const ABSOLUTE_GATE_LUFS = -70;
const RELATIVE_GATE_LU = -10;

/**
 * Integrated loudness in LUFS. Returns −Infinity for digital silence, which is the correct
 * answer and is why callers must check before computing a gain from it.
 */
export function integratedLoudnessLufs(samples: Float32Array, sampleRate: number): number {
  if (samples.length === 0) return Number.NEGATIVE_INFINITY;

  const weighted = applyBiquad(applyBiquad(samples, shelvingFilter(sampleRate)), highPassFilter(sampleRate));

  const blockSize = Math.round((BLOCK_MS / 1000) * sampleRate);
  const hop = Math.round(blockSize * (1 - OVERLAP));
  if (weighted.length < blockSize || hop <= 0) {
    // Shorter than one block: measure what there is rather than reporting silence.
    return loudnessOf(meanSquare(weighted, 0, weighted.length));
  }

  const blockLoudness: number[] = [];
  const blockPower: number[] = [];
  for (let start = 0; start + blockSize <= weighted.length; start += hop) {
    const power = meanSquare(weighted, start, start + blockSize);
    blockPower.push(power);
    blockLoudness.push(loudnessOf(power));
  }

  // Absolute gate: silence between sentences must not drag the measurement down.
  const absoluteKept: number[] = [];
  for (const [index, loudness] of blockLoudness.entries()) {
    if (loudness > ABSOLUTE_GATE_LUFS) absoluteKept.push(blockPower[index]!);
  }
  if (absoluteKept.length === 0) return Number.NEGATIVE_INFINITY;

  // Relative gate: −10 LU below the ungated mean, so quiet passages do not count either.
  const ungatedMean = absoluteKept.reduce((sum, value) => sum + value, 0) / absoluteKept.length;
  const relativeThreshold = loudnessOf(ungatedMean) + RELATIVE_GATE_LU;

  const gated: number[] = [];
  for (const [index, loudness] of blockLoudness.entries()) {
    if (loudness > ABSOLUTE_GATE_LUFS && loudness > relativeThreshold) {
      gated.push(blockPower[index]!);
    }
  }
  if (gated.length === 0) return loudnessOf(ungatedMean);

  return loudnessOf(gated.reduce((sum, value) => sum + value, 0) / gated.length);
}

function meanSquare(samples: Float32Array, start: number, end: number): number {
  let sum = 0;
  for (let i = start; i < end; i += 1) {
    const value = samples[i] ?? 0;
    sum += value * value;
  }
  return sum / Math.max(1, end - start);
}

/** The BS.1770 offset: −0.691 dB, so that a −20 dBFS sine reads −20 LUFS. */
function loudnessOf(power: number): number {
  return power <= 0 ? Number.NEGATIVE_INFINITY : -0.691 + 10 * Math.log10(power);
}

export interface NormalizeResult {
  samples: Float32Array;
  measuredLufs: number;
  appliedGainDb: number;
  /** True when the true-peak ceiling, not the loudness target, decided the final gain. */
  peakLimited: boolean;
}

/**
 * Normalises to a loudness target, then backs off if that would breach the peak ceiling.
 *
 * The order matters and the peak ceiling wins: reaching −16 LUFS by clipping the loudest
 * consonants trades one audible problem for a worse one. When the ceiling binds, the
 * narration ends up slightly quieter than the target — which for bedtime audio is the
 * error worth making.
 */
export function normalizeLoudness(
  samples: Float32Array,
  sampleRate: number,
  options: { targetLufs: number; peakCeilingDb: number },
): NormalizeResult {
  const measured = integratedLoudnessLufs(samples, sampleRate);
  if (!Number.isFinite(measured)) {
    return { samples, measuredLufs: measured, appliedGainDb: 0, peakLimited: false };
  }

  let gainDb = options.targetLufs - measured;
  let peak = 0;
  for (const sample of samples) {
    const magnitude = Math.abs(sample);
    if (magnitude > peak) peak = magnitude;
  }

  const ceiling = 10 ** (options.peakCeilingDb / 20);
  const peakAfter = peak * 10 ** (gainDb / 20);
  let peakLimited = false;
  if (peakAfter > ceiling && peak > 0) {
    gainDb = 20 * Math.log10(ceiling / peak);
    peakLimited = true;
  }

  const gain = 10 ** (gainDb / 20);
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    out[i] = Math.max(-1, Math.min(1, (samples[i] ?? 0) * gain));
  }

  return {
    samples: out,
    measuredLufs: Number(measured.toFixed(2)),
    appliedGainDb: Number(gainDb.toFixed(2)),
    peakLimited,
  };
}
