/**
 * tts/audio/speakers.ts — "is this one person?" (SPEC §7 step 7, `BIRDEN_FAZLA_KONUSMACI`).
 *
 * Why this check exists at all: a cloned voice is biometric data. If a parent records with
 * a partner or a television talking in the background, the resulting clone is trained on
 * somebody who never consented — a KVKK problem, not an audio-quality problem. So this
 * check fails toward "reject and ask them to re-record", never toward "probably fine".
 *
 * ⚠️ HONEST LIMITS. This is diarisation-by-heuristic, not a speaker-embedding model:
 * per-utterance median pitch plus spectral centroid, 2-means, and a deliberately high bar
 * for declaring a second speaker. It reliably separates voices that differ in register
 * (the common case: two parents, or an adult plus a child). It will NOT separate two
 * same-register speakers — that needs an x-vector model, and the day a real ASR/diarisation
 * provider is wired in (`AlignAdapter`), its speaker labels should take precedence over
 * this. `speakerCount` therefore reports a LOWER BOUND.
 */

import type { SpeechSegments } from './dsp';
import { HOP_MS, fundamentalHz, median } from './dsp';

export interface SpeakerEstimate {
  /** Lower bound: 1 unless the evidence for a second voice is strong. */
  count: number;
  /** 0..1 — how separable the utterance clusters were. Surfaced for ops, never to a parent. */
  separation: number;
  /** Timbre distance between the two candidate clusters, in Hz of zero-crossing rate. */
  timbreGapHz: number;
  utterances: number;
}

/**
 * Pitch analysis runs on a decimated signal (8 kHz): autocorrelation cost is quadratic in
 * the lag range, and no fundamental this side of a dog whistle lives above 4 kHz. At 44.1
 * kHz the same search is ~30× more work for identical answers.
 */
export const PITCH_SAMPLE_RATE = 8000;

interface Utterance {
  pitchHz: number;
  centroidHz: number;
  frames: number;
}

/** Minimum semitone gap between cluster centres before we call it a second speaker. */
const SEPARATION_SEMITONES = 7;
/** A second speaker must own at least this share of the utterances to count. */
const MIN_CLUSTER_SHARE = 0.25;
/**
 * Corroborating timbre distance, in Hz of zero-crossing rate. Roughly the vocal-tract-length
 * difference between an adult male and an adult female voice.
 */
const TIMBRE_GAP_HZ = 80;

/**
 * @param samples mono audio decimated to `PITCH_SAMPLE_RATE`
 * @param speech  the VAD result, whose frame indices are 10 ms apart at any sample rate
 */
export function estimateSpeakerCount(
  samples: Float32Array,
  speech: SpeechSegments,
): SpeakerEstimate {
  const utterances = collectUtterances(samples, speech);
  if (utterances.length < 4) {
    // Too little material to make a claim; err toward "one speaker" so a short but clean
    // take is not rejected with a scary message about strangers in the room.
    return { count: 1, separation: 0, timbreGapHz: 0, utterances: utterances.length };
  }

  const semitones = utterances.map((u) => 12 * Math.log2(u.pitchHz / 100));
  const { assignments, centres } = twoMeans(semitones);

  const lowCount = assignments.filter((a) => a === 0).length;
  const highCount = assignments.length - lowCount;
  const minorityShare = Math.min(lowCount, highCount) / assignments.length;
  const gap = Math.abs((centres[1] ?? 0) - (centres[0] ?? 0));

  // Corroborate with timbre: two people differ in spectral centre of gravity as well as in
  // pitch. Requiring both keeps a single speaker's own intonation range from being split.
  const centroidGap = clusterCentroidGap(utterances, assignments);

  // Two ways to be sure. A pitch gap past an octave — between the MEDIANS of whole
  // utterances, not between frames — is not something one person does while reading a
  // bedtime story, so it stands alone. Between 7 and 12 semitones the timbre has to agree
  // as well, or a single expressive reader would be accused of having company.
  //
  // Measured margins on the synthetic corpus: one speaker reading with normal intonation
  // sits at 0.6–1.2 semitones of utterance-median spread, two speakers at 11. The bar is
  // set closer to the noisy end because the cost of the two errors is asymmetric — a false
  // rejection asks a parent to record again, a false acceptance clones a stranger.
  const separated =
    minorityShare >= MIN_CLUSTER_SHARE &&
    (gap >= 12 || (gap >= SEPARATION_SEMITONES && centroidGap >= TIMBRE_GAP_HZ));

  return {
    count: separated ? 2 : 1,
    separation: Number(Math.min(1, gap / 12).toFixed(2)),
    timbreGapHz: Math.round(centroidGap),
    utterances: utterances.length,
  };
}

/** Enough utterances to cluster; more only slows the request path the parent is waiting on. */
const MAX_UTTERANCES = 40;
/** Frames sampled inside one utterance. A median over 8 voiced frames is already stable. */
const FRAMES_PER_UTTERANCE = 8;

function collectUtterances(samples: Float32Array, speech: SpeechSegments): Utterance[] {
  const utterances: Utterance[] = [];
  const hopSamples = Math.round((HOP_MS / 1000) * PITCH_SAMPLE_RATE);
  const frameSize = Math.round(0.032 * PITCH_SAMPLE_RATE); // 32 ms holds ≥ 2 pitch periods
  const minFrames = 15; // 150 ms — shorter runs are a cough, not an utterance

  for (const [start, end] of speech.runs) {
    if (end - start < minFrames) continue;
    if (utterances.length >= MAX_UTTERANCES) break;

    const stride = Math.max(1, Math.floor((end - start) / FRAMES_PER_UTTERANCE));
    const pitches: number[] = [];
    const centroids: number[] = [];
    for (let i = start; i < end; i += stride) {
      const at = i * hopSamples;
      const hz = fundamentalHz(samples, at, frameSize, PITCH_SAMPLE_RATE);
      if (hz !== undefined) pitches.push(hz);
      const centroid = spectralCentroid(samples, at, frameSize, PITCH_SAMPLE_RATE);
      if (centroid > 0) centroids.push(centroid);
    }
    if (pitches.length < 3) continue;
    utterances.push({
      pitchHz: median(pitches),
      centroidHz: median(centroids),
      frames: end - start,
    });
  }
  return utterances;
}

/**
 * Spectral centre of gravity computed on the time-domain signal via zero-crossing rate
 * scaled to Hz. Cheaper than an FFT per frame and sufficient as a timbre corroborator:
 * we only need "is this a different-sounding voice", not a formant analysis.
 */
function spectralCentroid(
  samples: Float32Array,
  start: number,
  frameSize: number,
  sampleRate: number,
): number {
  if (start + frameSize > samples.length) return 0;
  let crossings = 0;
  let previous = samples[start] ?? 0;
  for (let i = 1; i < frameSize; i += 1) {
    const value = samples[start + i] ?? 0;
    if ((previous < 0 && value >= 0) || (previous >= 0 && value < 0)) crossings += 1;
    previous = value;
  }
  return (crossings * sampleRate) / (2 * frameSize);
}

function twoMeans(values: readonly number[]): { assignments: number[]; centres: number[] } {
  const sorted = [...values].sort((a, b) => a - b);
  let low = sorted[Math.floor(sorted.length * 0.15)] ?? 0;
  let high = sorted[Math.floor(sorted.length * 0.85)] ?? 0;
  const assignments = new Array<number>(values.length).fill(0);

  for (let iteration = 0; iteration < 20; iteration += 1) {
    let changed = false;
    for (let i = 0; i < values.length; i += 1) {
      const value = values[i]!;
      const next = Math.abs(value - low) <= Math.abs(value - high) ? 0 : 1;
      if (assignments[i] !== next) {
        assignments[i] = next;
        changed = true;
      }
    }
    const lowValues = values.filter((_, i) => assignments[i] === 0);
    const highValues = values.filter((_, i) => assignments[i] === 1);
    if (lowValues.length === 0 || highValues.length === 0) break;
    low = mean(lowValues);
    high = mean(highValues);
    if (!changed) break;
  }

  return { assignments, centres: [low, high] };
}

function clusterCentroidGap(utterances: readonly Utterance[], assignments: readonly number[]): number {
  const low = utterances.filter((_, i) => assignments[i] === 0).map((u) => u.centroidHz);
  const high = utterances.filter((_, i) => assignments[i] === 1).map((u) => u.centroidHz);
  if (low.length === 0 || high.length === 0) return 0;
  return Math.abs(median(low) - median(high));
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}
