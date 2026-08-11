/**
 * Turkish readability scoring — Ateşman (1997).
 *
 * Flesch was calibrated on English and reports nonsense for an agglutinative language.
 * Ateşman re-fitted the same shape on Turkish corpora:
 *
 *   score = 198.825 − 40.175 × (syllables / words) − 2.610 × (words / sentences)
 *
 * We use it as an age-band gate: a "3-5" story whose pages score below ~85 is too dense
 * for the target reader and gets rewritten (docs/SPEC.md §11 — TR quality is the product's
 * only differentiator).
 */

import { countSentences, countSyllablesInText, countWords } from './syllable';

export type ReadabilityLevel = 'cok_kolay' | 'kolay' | 'orta' | 'zor' | 'cok_zor';

export interface ReadabilityResult {
  /** Ateşman score, clamped to 0..100. Higher = easier. */
  score: number;
  level: ReadabilityLevel;
  /** User-facing label — Turkish, safe to render directly. */
  levelTr: string;
  words: number;
  sentences: number;
  syllables: number;
  avgSyllablesPerWord: number;
  avgWordsPerSentence: number;
}

const LEVEL_LABELS_TR: Record<ReadabilityLevel, string> = {
  cok_kolay: 'Çok kolay',
  kolay: 'Kolay',
  orta: 'Orta güçlükte',
  zor: 'Zor',
  cok_zor: 'Çok zor',
};

export function readabilityLevel(score: number): ReadabilityLevel {
  if (score >= 90) return 'cok_kolay';
  if (score >= 70) return 'kolay';
  if (score >= 50) return 'orta';
  if (score >= 30) return 'zor';
  return 'cok_zor';
}

/**
 * Minimum Ateşman score a story page should reach for each age band. Kept as a literal
 * union rather than importing `AgeBand`: @kendihikayem/shared is a leaf package and must
 * not depend on the contract. The keys mirror `ageBandSchema` — change both together.
 *
 * `0-2` sits near the ceiling of the scale on purpose. At that age a page is one short
 * sentence, so anything scoring below ~92 (roughly: more than one clause, or words past
 * three syllables) is already the wrong kind of text and should be rewritten, not shipped.
 */
export const READABILITY_TARGET_BY_AGE_BAND: Record<'0-2' | '3-5' | '6-8', number> = {
  '0-2': 92,
  '3-5': 85,
  '6-8': 70,
};

export function readability(text: string): ReadabilityResult {
  const wordCount = countWords(text);
  const sentenceCount = countSentences(text);
  const syllableCount = countSyllablesInText(text);

  if (wordCount === 0 || sentenceCount === 0) {
    return {
      score: 0,
      level: 'cok_zor',
      levelTr: LEVEL_LABELS_TR.cok_zor,
      words: 0,
      sentences: 0,
      syllables: 0,
      avgSyllablesPerWord: 0,
      avgWordsPerSentence: 0,
    };
  }

  const avgSyllablesPerWord = syllableCount / wordCount;
  const avgWordsPerSentence = wordCount / sentenceCount;
  const raw = 198.825 - 40.175 * avgSyllablesPerWord - 2.61 * avgWordsPerSentence;
  const score = Math.max(0, Math.min(100, Math.round(raw * 100) / 100));
  const level = readabilityLevel(score);

  return {
    score,
    level,
    levelTr: LEVEL_LABELS_TR[level],
    words: wordCount,
    sentences: sentenceCount,
    syllables: syllableCount,
    avgSyllablesPerWord: Math.round(avgSyllablesPerWord * 1000) / 1000,
    avgWordsPerSentence: Math.round(avgWordsPerSentence * 1000) / 1000,
  };
}

export function meetsAgeBandTarget(text: string, ageBand: '0-2' | '3-5' | '6-8'): boolean {
  return readability(text).score >= READABILITY_TARGET_BY_AGE_BAND[ageBand];
}
