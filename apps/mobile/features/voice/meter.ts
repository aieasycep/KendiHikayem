/**
 * Live microphone metering — pure math, no native code (testable in vitest).
 *
 * expo-audio delivers a dBFS metering value (~-160…0) every poll interval while
 * recording. From that stream we estimate exactly the numbers the V04 mic test
 * and the V06 live feedback need:
 *
 *   noiseFloorDb — 10th percentile  → is the room quiet?
 *   speechDb     — 90th percentile  → is the reader loud enough?
 *   estSnrDb     — speech − floor   → live proxy of the server's SNR check
 *   peakDb       — max              → clipping / too-quiet detection
 *
 * Thresholds come from the contract's VOICE_QUALITY_THRESHOLDS — the SAME
 * numbers the server enforces, so the meter can never show green for a take the
 * server will reject ("ekranda yeşil, sunucuda kırmızı" hatası, contract voice.ts).
 */

import { ERROR_CATALOG, VOICE_QUALITY_THRESHOLDS } from '@kendihikayem/contract';

export interface MeterStats {
  sampleCount: number;
  currentDb: number;
  peakDb: number;
  noiseFloorDb: number;
  speechDb: number;
  estSnrDb: number;
  /** Samples within 1 dB of full scale — a clipping proxy. */
  clippedCount: number;
}

export const SILENCE_DB = -60;

/** Clamp a raw metering value into a sane dBFS range. */
export function normalizeDb(raw: number | undefined): number {
  if (raw === undefined || Number.isNaN(raw)) return SILENCE_DB;
  return Math.max(-90, Math.min(0, raw));
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return SILENCE_DB;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
  return sorted[index] ?? SILENCE_DB;
}

export function computeMeterStats(samples: number[]): MeterStats {
  if (samples.length === 0) {
    return {
      sampleCount: 0,
      currentDb: SILENCE_DB,
      peakDb: SILENCE_DB,
      noiseFloorDb: SILENCE_DB,
      speechDb: SILENCE_DB,
      estSnrDb: 0,
      clippedCount: 0,
    };
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const noiseFloorDb = percentile(sorted, 0.1);
  const speechDb = percentile(sorted, 0.9);
  return {
    sampleCount: samples.length,
    currentDb: samples[samples.length - 1] ?? SILENCE_DB,
    peakDb: sorted[sorted.length - 1] ?? SILENCE_DB,
    noiseFloorDb,
    speechDb,
    estSnrDb: Math.max(0, speechDb - noiseFloorDb),
    clippedCount: samples.filter((value) => value > -1).length,
  };
}

export type MeterVerdictLevel = 'iyi' | 'uyari' | 'kotu';

export interface MeterVerdict {
  level: MeterVerdictLevel;
  titleTr: string;
  messageTr?: string;
}

const T = VOICE_QUALITY_THRESHOLDS;

/**
 * V04 — 5 s ambient test: the user stays SILENT, we listen to the room.
 * The exact wording of the noisy case comes from SPEC §7 adım 4.
 */
export function ambientVerdict(stats: MeterStats): MeterVerdict {
  if (stats.sampleCount < 5) {
    return { level: 'uyari', titleTr: 'Ölçüm kısa sürdü', messageTr: 'Testi yeniden başlatın.' };
  }
  if (stats.noiseFloorDb > -35) {
    return {
      level: 'kotu',
      titleTr: 'Ortamınız çok gürültülü',
      messageTr: 'Ortamınız çok gürültülü — TV veya klima varsa kapatın.',
    };
  }
  if (stats.noiseFloorDb > -45) {
    return {
      level: 'uyari',
      titleTr: 'Hafif bir uğultu var',
      messageTr: 'Daha sessiz bir köşeye geçerseniz kayıt kalitesi belirgin artar.',
    };
  }
  return {
    level: 'iyi',
    titleTr: 'Ortam kayda uygun',
    messageTr: 'Sessizlik ideal. Telefonu yaklaşık 20 cm uzağınızda tutmayı unutmayın.',
  };
}

/**
 * V05/V06 — live verdict WHILE reading. Uses the same thresholds the server
 * applies afterwards; message text reuses the contract's error catalogue.
 */
export function liveRecordingVerdict(stats: MeterStats): MeterVerdict {
  if (stats.sampleCount < 8) {
    return { level: 'iyi', titleTr: 'Kayıt başladı' };
  }
  if (stats.clippedCount > 2 || stats.peakDb > T.peakDbfsMax) {
    return {
      level: 'kotu',
      titleTr: 'Ses çok yüksek',
      messageTr: ERROR_CATALOG.KLIPLENME.messageTr,
    };
  }
  if (stats.speechDb < T.peakDbfsMin - 8) {
    return {
      level: 'uyari',
      titleTr: 'Ses çok kısık',
      messageTr: ERROR_CATALOG.COK_SESSIZ.messageTr,
    };
  }
  if (stats.estSnrDb < T.snrDbMin && stats.noiseFloorDb > -50) {
    return {
      level: 'uyari',
      titleTr: 'Arka planda gürültü var',
      messageTr: ERROR_CATALOG.GURULTULU.messageTr,
    };
  }
  return { level: 'iyi', titleTr: 'Kayıt temiz görünüyor' };
}
