/**
 * tts/quality/measure.ts — SPEC §7 step 7, the measurement half.
 *
 * One function turns raw recorded bytes into the `TakeQuality` the contract declares. It
 * makes no decisions: `gate.ts` compares these numbers against `VOICE_QUALITY_THRESHOLDS`
 * and produces the Turkish coaching. Splitting them is what makes the thresholds testable
 * (feed known-bad audio, assert the exact code) and the measurement reusable — the same
 * function scores an individual take and the stitched 110-second reference.
 */

import type { TakeQuality } from '@kendihikayem/contract';

import type { AudioBuffer } from '../audio/wav';
import { durationMs, resample, toMono } from '../audio/wav';
import {
  HOP_MS,
  averageSpectrum,
  clippingRatio,
  detectSpeech,
  effectiveBandwidthHz,
  frameEnergies,
  noiseFloor,
  peakAmplitude,
  reverbTimeMs,
  signalToNoiseDb,
  toDb,
} from '../audio/dsp';
import { PITCH_SAMPLE_RATE, estimateSpeakerCount } from '../audio/speakers';
import { comparisonTokens, readBackSimilarity } from '../text/turkish';

/**
 * Speech analysis runs at 16 kHz regardless of what the phone recorded at.
 *
 * This is not a shortcut, it is the standard speech-analysis rate: energy, voicing and
 * timing live below 8 kHz, and the gate runs on the request path while a parent watches a
 * spinner. Only PEAK, CLIPPING and BANDWIDTH read the full-rate signal, because those three
 * are precisely the measurements that would be destroyed by resampling.
 */
const ANALYSIS_SAMPLE_RATE = 16_000;

export interface MeasureInput {
  audio: AudioBuffer;
  /** The passage the parent was asked to read. Drives words-per-minute and the ASR match. */
  expectedText?: string;
  /** Transcript from the ASR/alignment provider. Absent ⇒ similarity is not measured. */
  transcript?: string;
  /** Skip the (relatively expensive) speaker clustering — used for the stitched reference. */
  skipSpeakerCheck?: boolean;
}

export interface Measurement extends TakeQuality {
  /** Speech time excluding pauses, in ms. The denominator of words-per-minute. */
  speechMs: number;
  /** Ops-only detail; never rendered to a parent. */
  detail: {
    noiseFloorDbfs: number;
    speakerSeparation: number;
    speakerTimbreGapHz: number;
    utterances: number;
  };
}

/**
 * `score` is a single 0..1 number the API turns into a badge (`mükemmel` / `iyi` /
 * `kabul edilebilir`). Deliberately NOT shown as a percentage: a parent who sees "72%"
 * re-records forever chasing a number, which is the opposite of the product's promise.
 */
export function measureTake(input: MeasureInput): Measurement {
  const mono = toMono(input.audio);
  const sampleRate = input.audio.sampleRate;
  const totalMs = durationMs(input.audio);

  const analysis = resample(mono, sampleRate, ANALYSIS_SAMPLE_RATE);
  const frames = frameEnergies(analysis, ANALYSIS_SAMPLE_RATE);
  const floor = noiseFloor(frames);
  const speech = detectSpeech(frames, floor);

  const fullRateHop = Math.max(1, Math.round((HOP_MS / 1000) * sampleRate));
  const spectrum = averageSpectrum(mono, sampleRate, speech, fullRateHop);
  const noiseSpectrum = averageSpectrum(mono, sampleRate, speech, fullRateHop, 1024, 0);

  const peak = peakAmplitude(mono);
  const peakDbfs = Number(toDb(peak).toFixed(2));
  const clippingPct = Number((clippingRatio(mono) * 100).toFixed(4));
  const snrDb = signalToNoiseDb(frames, speech, floor);
  const bandwidthHz = effectiveBandwidthHz(spectrum, sampleRate, noiseSpectrum);
  const reverbMs = reverbTimeMs(frames, snrDb);

  const silenceRatio =
    speech.totalFrames === 0 ? 1 : 1 - speech.speechFrames / speech.totalFrames;
  const speechMs = Math.round(speech.speechFrames * HOP_MS);

  const wordCount = input.transcript
    ? comparisonTokens(input.transcript).length
    : input.expectedText
      ? comparisonTokens(input.expectedText).length
      : 0;

  // Rate is words over the SPOKEN SPAN — wall-clock with the leading and trailing silence
  // removed, but the pauses between sentences kept.
  //
  // Not "speech frames only": the VAD's idea of what is speech degrades in exactly the
  // noisy takes where a rate complaint would be most confusing, and a parent who pauses
  // dramatically between sentences genuinely IS taking longer over the passage. Trimming
  // only the ends keeps "I pressed record early" from being read as "I read slowly".
  const spokenSpanMs = spokenSpan(speech, totalMs);
  const wordsPerMinute =
    spokenSpanMs > 0 && wordCount > 0
      ? Number(((wordCount / spokenSpanMs) * 60_000).toFixed(1))
      : 0;

  const speakers =
    input.skipSpeakerCheck === true
      ? { count: 1, separation: 0, timbreGapHz: 0, utterances: speech.runs.length }
      : estimateSpeakerCount(resample(mono, sampleRate, PITCH_SAMPLE_RATE), speech);

  const asrSimilarity =
    input.transcript !== undefined && input.expectedText !== undefined
      ? readBackSimilarity(input.expectedText, input.transcript)
      : undefined;

  const quality: Measurement = {
    snrDb,
    peakDbfs,
    clippingPct,
    silenceRatio: Number(silenceRatio.toFixed(3)),
    wordsPerMinute,
    bandwidthHz,
    durationMs: totalMs,
    speechMs,
    speakerCount: speakers.count,
    score: 0,
    detail: {
      noiseFloorDbfs: Number(toDb(floor).toFixed(2)),
      speakerSeparation: speakers.separation,
      speakerTimbreGapHz: speakers.timbreGapHz,
      utterances: speakers.utterances,
    },
  };
  if (reverbMs !== undefined) quality.reverbMs = reverbMs;
  if (asrSimilarity !== undefined) quality.asrSimilarity = asrSimilarity;

  quality.score = compositeScore(quality);
  return quality;
}

/** First speech onset to last speech offset, in ms. Falls back to the whole take. */
function spokenSpan(speech: { runs: Array<[number, number]> }, totalMs: number): number {
  const first = speech.runs[0];
  const last = speech.runs[speech.runs.length - 1];
  if (!first || !last) return totalMs;
  return Math.max(0, (last[1] - first[0]) * HOP_MS);
}

/**
 * Weighted composite. SNR dominates because it is what actually decides whether the clone
 * sounds like the parent or like the parent inside a fan; the rest are hygiene factors.
 */
function compositeScore(quality: Measurement): number {
  const snr = clamp01((quality.snrDb - 10) / 25); // 10 dB → 0, 35 dB → 1
  const clipping = clamp01(1 - quality.clippingPct / 0.5);
  const level = clamp01(1 - Math.abs(quality.peakDbfs + 9) / 12); // ideal peak ≈ −9 dBFS
  const reverb = quality.reverbMs === undefined ? 0.8 : clamp01(1 - (quality.reverbMs - 150) / 450);
  const bandwidth = clamp01((quality.bandwidthHz - 4000) / 8000);
  const silence = clamp01(1 - (quality.silenceRatio - 0.1) / 0.5);
  const match = quality.asrSimilarity === undefined ? 0.85 : clamp01(quality.asrSimilarity);

  const score =
    0.34 * snr +
    0.14 * clipping +
    0.14 * level +
    0.12 * reverb +
    0.08 * bandwidth +
    0.08 * silence +
    0.1 * match;
  return Number(clamp01(score).toFixed(3));
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
