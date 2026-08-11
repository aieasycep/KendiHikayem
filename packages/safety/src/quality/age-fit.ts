/**
 * quality/age-fit.ts — is this text actually written for THIS child?
 *
 * The contract already carries the target words-per-page per band; this adds the three
 * things a word count cannot see: sentence length, word length and the Ateşman readability
 * score. All three are cheap, deterministic and measured on the text we are about to
 * print — which makes them the only age check in the system that cannot be talked around
 * by a model claiming it wrote for four-year-olds.
 *
 * The thresholds are calibrated against the shipped reference texts in
 * `packages/mock/src/fixtures/story-text.ts` — the two stories a parent sees in the first
 * APK. If the gate rejected those, the gate would be wrong, not the stories, and
 * `quality.test.ts` asserts exactly that.
 */

import { type AgeBand, WORDS_PER_PAGE_BY_AGE_BAND } from '@kendihikayem/contract';
import {
  READABILITY_TARGET_BY_AGE_BAND,
  countSyllables,
  countWords,
  readability,
  words,
} from '@kendihikayem/shared';

import { SAFETY_MESSAGES_TR } from '../messages.tr';
import type { SafetyViolation } from '../types';

/** Hard ceiling for a single sentence. Beyond this a page stops being readable aloud. */
export const MAX_SENTENCE_WORDS: Record<AgeBand, number> = {
  '0-2': 8,
  '3-5': 13,
  '6-8': 20,
};

/** The average matters more than the outlier: one long sentence in twelve is fine. */
export const MAX_AVG_SENTENCE_WORDS: Record<AgeBand, number> = {
  '0-2': 6,
  '3-5': 11,
  '6-8': 15,
};

/** Longest single word. Turkish agglutinates, so this is a real limit, not a formality. */
export const MAX_WORD_SYLLABLES: Record<AgeBand, number> = {
  '0-2': 4,
  '3-5': 5,
  '6-8': 7,
};

/**
 * How far below the band's Ateşman target a SINGLE page may fall. The book-level average
 * must meet the target; one dense page is a warning, not a rewrite.
 */
const PAGE_READABILITY_SLACK = 12;

export interface PageMetrics {
  pageNo: number;
  words: number;
  sentences: number;
  longestSentenceWords: number;
  avgSentenceWords: number;
  longestWordSyllables: number;
  readabilityScore: number;
}

export function measurePage(pageNo: number, text: string): PageMetrics {
  const readabilityResult = readability(text);
  const sentences = splitSentences(text);
  const sentenceWordCounts = sentences.map((sentence) => countWords(sentence));
  const longestSentenceWords = sentenceWordCounts.reduce((max, count) => Math.max(max, count), 0);
  const longestWordSyllables = words(text).reduce(
    (max, word) => Math.max(max, countSyllables(word)),
    0,
  );

  return {
    pageNo,
    words: readabilityResult.words,
    sentences: Math.max(1, sentences.length),
    longestSentenceWords,
    avgSentenceWords: readabilityResult.avgWordsPerSentence,
    longestWordSyllables,
    readabilityScore: readabilityResult.score,
  };
}

export interface AgeFitResult {
  violations: SafetyViolation[];
  metrics: PageMetrics[];
  /** Book-level Ateşman score, computed over the concatenated pages. */
  bookReadability: number;
}

export function checkAgeFit(
  pages: ReadonlyArray<{ pageNo: number; textTr: string }>,
  ageBand: AgeBand,
): AgeFitResult {
  const violations: SafetyViolation[] = [];
  const metrics = pages.map((page) => measurePage(page.pageNo, page.textTr));
  const [minWords, maxWords] = WORDS_PER_PAGE_BY_AGE_BAND[ageBand];
  const target = READABILITY_TARGET_BY_AGE_BAND[ageBand];

  for (const page of metrics) {
    if (page.words < minWords || page.words > maxWords) {
      violations.push(
        violation(
          'PAGE_WORD_COUNT_OUT_OF_RANGE',
          'block',
          `sayfa ${page.pageNo}: ${page.words} kelime (hedef ${minWords}-${maxWords})`,
          page.pageNo,
        ),
      );
    }
    if (page.longestSentenceWords > MAX_SENTENCE_WORDS[ageBand]) {
      violations.push(
        violation(
          'SENTENCE_TOO_LONG',
          'block',
          `sayfa ${page.pageNo}: en uzun cümle ${page.longestSentenceWords} kelime (üst sınır ${MAX_SENTENCE_WORDS[ageBand]})`,
          page.pageNo,
        ),
      );
    } else if (page.avgSentenceWords > MAX_AVG_SENTENCE_WORDS[ageBand]) {
      violations.push(
        violation(
          'SENTENCE_TOO_LONG',
          'flag',
          `sayfa ${page.pageNo}: ortalama cümle ${page.avgSentenceWords} kelime`,
          page.pageNo,
        ),
      );
    }
    if (page.longestWordSyllables > MAX_WORD_SYLLABLES[ageBand]) {
      violations.push(
        violation(
          'WORD_TOO_LONG',
          'flag',
          `sayfa ${page.pageNo}: ${page.longestWordSyllables} heceli kelime`,
          page.pageNo,
        ),
      );
    }
    if (page.readabilityScore < target - PAGE_READABILITY_SLACK) {
      violations.push(
        violation(
          'READABILITY_BELOW_TARGET',
          'flag',
          `sayfa ${page.pageNo}: Ateşman ${page.readabilityScore} (hedef ${target})`,
          page.pageNo,
        ),
      );
    }
  }

  const bookReadability = readability(pages.map((page) => page.textTr).join('\n')).score;
  if (pages.length > 0 && bookReadability < target) {
    violations.push(
      violation(
        'READABILITY_BELOW_TARGET',
        'block',
        `kitap geneli Ateşman ${bookReadability} < hedef ${target}`,
      ),
    );
  }

  return { violations, metrics, bookReadability };
}

function violation(
  code: 'PAGE_WORD_COUNT_OUT_OF_RANGE' | 'SENTENCE_TOO_LONG' | 'WORD_TOO_LONG' | 'READABILITY_BELOW_TARGET',
  severity: 'flag' | 'block',
  detail: string,
  pageNo?: number,
): SafetyViolation {
  return {
    code,
    engine: 'age_rubric',
    severity,
    messageTr: SAFETY_MESSAGES_TR[code],
    detail,
    ...(pageNo !== undefined ? { pageNo } : {}),
  };
}

/** Sentence split that keeps dialogue punctuation from inflating the count. */
function splitSentences(text: string): string[] {
  return text
    .split(/[.!?…]+/u)
    .map((part) => part.trim())
    .filter((part) => countWords(part) > 0);
}
