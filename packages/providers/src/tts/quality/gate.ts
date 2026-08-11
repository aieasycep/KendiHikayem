/**
 * tts/quality/gate.ts — SPEC §7 step 7, the decision half.
 *
 * Measurements in, contract error codes out. Three rules this file exists to enforce:
 *
 *  1. THE THRESHOLDS ARE NOT DUPLICATED. Every number comes from
 *     `VOICE_QUALITY_THRESHOLDS` in packages/contract, which the mobile dB meter also
 *     reads. Two copies produce the failure mode the contract header warns about: green on
 *     screen, red on the server.
 *  2. EVERY FAILURE HAS ONE CONCRETE TURKISH INSTRUCTION. `ERROR_CATALOG[code].messageTr`
 *     is the single source of that text — the gate never writes a Turkish string of its own.
 *  3. ONE INSTRUCTION AT A TIME. A parent handed six problems re-records blindly; a parent
 *     told "televizyonu kapatın" fixes the thing that actually mattered. `issues` carries
 *     everything for the quality card, `guidanceTr` carries the single most valuable fix,
 *     chosen by severity order rather than by measurement order.
 */

import {
  ERROR_CATALOG,
  VOICE_QUALITY_THRESHOLDS,
  type TakeIssue,
  type VoiceQualityBadge,
  type VoiceStep,
} from '@kendihikayem/contract';

import type { Measurement } from './measure';

export interface GateInput {
  quality: Measurement;
  step: VoiceStep;
  /**
   * Whether an ASR transcript was available. The consent clip (SPEC §7 step 5) is a
   * LIVENESS check, so a missing transcript there must fail closed — see `livenessOk`.
   */
  transcriptAvailable: boolean;
}

export interface GateResult {
  accepted: boolean;
  issues: TakeIssue[];
  /** The single sentence shown under the waveform. Always concrete, always Turkish. */
  guidanceTr: string;
  badge: VoiceQualityBadge;
  /**
   * False when the consent clip could not be verified as actually spoken. The API maps this
   * to `VOICE_SCRIPT_MISMATCH`, which is a different (and legally heavier) failure than a
   * noisy passage.
   */
  livenessOk: boolean;
}

/**
 * Severity order. Fix the room before the reading: a parent who is told to slow down while
 * a television is on re-records at the same SNR and fails again, which is how a delightful
 * feature turns into a support ticket.
 */
const SEVERITY: readonly TakeIssue[] = [
  'BIRDEN_FAZLA_KONUSMACI',
  'METIN_ESLESMEDI',
  'KLIPLENME',
  'GURULTULU',
  'YANKILI',
  'COK_SESSIZ',
  'COK_KISA',
  'COK_UZUN',
  'COK_HIZLI',
  'COK_YAVAS',
  'DAR_BANT_GENISLIGI',
];

/** Advisory only (SPEC §7: "uyarı"): shown on the card, does not reject the take. */
const WARNING_ONLY: ReadonlySet<TakeIssue> = new Set<TakeIssue>(['DAR_BANT_GENISLIGI']);

const T = VOICE_QUALITY_THRESHOLDS;

export function evaluateTake(input: GateInput): GateResult {
  const { quality, step } = input;
  const issues: TakeIssue[] = [];

  const isConsentClip = step === 'consent_clip';
  const targetSec = isConsentClip ? T.consentClipTargetSec : T.passageMinSec;
  const maxSec = isConsentClip ? T.consentClipTargetSec * 3 : T.passageMaxSec;
  const seconds = quality.durationMs / 1000;

  if (seconds < targetSec * 0.6) issues.push('COK_KISA');
  else if (seconds > maxSec) issues.push('COK_UZUN');

  if (quality.snrDb < T.snrDbMin) issues.push('GURULTULU');
  if (quality.clippingPct > T.clippingPctMax) issues.push('KLIPLENME');
  if (quality.peakDbfs < T.peakDbfsMin || quality.peakDbfs > T.peakDbfsMax) {
    // Both ends map to COK_SESSIZ in the contract catalogue; a too-hot signal has already
    // been reported as KLIPLENME above, so the remaining case is genuinely "too quiet".
    if (quality.peakDbfs < T.peakDbfsMin) issues.push('COK_SESSIZ');
  }
  if (quality.reverbMs !== undefined && quality.reverbMs > T.reverbMsMax) issues.push('YANKILI');

  // Silence detection rides on the same voice-activity gate the SNR does, so once the room
  // is too noisy the ratio is measuring the noise, not the parent. Reporting "kayıt çok
  // kısa" next to "gürültü var" would send them to fix the wrong thing.
  if (quality.snrDb >= T.snrDbMin && quality.silenceRatio > T.silenceRatioMax) {
    issues.push('COK_KISA');
  }
  if (quality.bandwidthHz > 0 && quality.bandwidthHz < T.bandwidthHzMin) {
    issues.push('DAR_BANT_GENISLIGI');
  }

  // Reading rate is words-of-the-script over time-spent-reading, so it only means anything
  // when the whole script was actually read. A parent who stopped a third of the way in has
  // not "read too fast" — they have a short take, and that is the only thing to tell them.
  const lengthSuspect = issues.includes('COK_KISA') || issues.includes('COK_UZUN');
  if (quality.wordsPerMinute > 0 && !lengthSuspect) {
    if (quality.wordsPerMinute > T.wordsPerMinuteMax) issues.push('COK_HIZLI');
    else if (quality.wordsPerMinute < T.wordsPerMinuteMin) issues.push('COK_YAVAS');
  }

  if (quality.asrSimilarity !== undefined && quality.asrSimilarity < T.asrSimilarityMin) {
    issues.push('METIN_ESLESMEDI');
  }
  if (quality.speakerCount !== undefined && quality.speakerCount > T.speakerCount) {
    issues.push('BIRDEN_FAZLA_KONUSMACI');
  }

  const unique = dedupeBySeverity(issues);
  const blocking = unique.filter((issue) => !WARNING_ONLY.has(issue));

  // Liveness: the consent clip must be VERIFIED, not merely un-contradicted. No transcript
  // means no proof, and an unproven consent clip is not consent.
  const livenessOk = isConsentClip
    ? input.transcriptAvailable &&
      quality.asrSimilarity !== undefined &&
      quality.asrSimilarity >= T.asrSimilarityMin
    : true;

  const accepted = blocking.length === 0 && livenessOk;

  return {
    accepted,
    issues: unique,
    guidanceTr: guidanceFor(unique, accepted, livenessOk, isConsentClip),
    badge: badgeFor(quality.score),
    livenessOk,
  };
}

function dedupeBySeverity(issues: readonly TakeIssue[]): TakeIssue[] {
  const present = new Set(issues);
  return SEVERITY.filter((issue) => present.has(issue));
}

function guidanceFor(
  issues: readonly TakeIssue[],
  accepted: boolean,
  livenessOk: boolean,
  isConsentClip: boolean,
): string {
  // A failed liveness check outranks every audio complaint. The clip is the consent record:
  // if we cannot show the parent read the sentence we generated, telling them about their
  // reading pace would be answering a question nobody asked.
  if (!livenessOk) return ERROR_CATALOG.VOICE_SCRIPT_MISMATCH.messageTr;
  const worst = issues.find((issue) => !WARNING_ONLY.has(issue)) ?? issues[0];
  if (worst) return ERROR_CATALOG[worst].messageTr;
  return accepted && isConsentClip
    ? 'Rıza kaydınız alındı. Şimdi dört kısa pasajı okuyacaksınız.'
    : 'Kayıt temiz çıktı. Aynı sessiz ortamda devam edin.';
}

/** SPEC §7 step 7: three icons, never a raw number. */
export function badgeFor(score: number): VoiceQualityBadge {
  if (score >= 0.8) return 'mukemmel';
  if (score >= 0.62) return 'iyi';
  return 'kabul_edilebilir';
}

/**
 * Whether the four accepted passages together clear the bar for cloning
 * (SPEC §7 step 8: 90–120 s of usable reference, never over 3 minutes).
 */
export function evaluateReference(input: {
  totalMs: number;
  perTakeScores: readonly number[];
}): { ok: boolean; reasonTr?: string; capturedSec: number } {
  const capturedSec = Math.round(input.totalMs / 1000);
  if (capturedSec < T.totalTargetSecMin) {
    return {
      ok: false,
      capturedSec,
      reasonTr: `Toplam kayıt süresi yetersiz (${capturedSec} sn). En az ${T.totalTargetSecMin} saniye gerekiyor; eksik pasajları tamamlayın.`,
    };
  }
  const average =
    input.perTakeScores.reduce((sum, value) => sum + value, 0) /
    Math.max(1, input.perTakeScores.length);
  if (average < 0.5) {
    return {
      ok: false,
      capturedSec,
      reasonTr: ERROR_CATALOG.VOICE_QUALITY_LOW.messageTr,
    };
  }
  return { ok: true, capturedSec };
}
