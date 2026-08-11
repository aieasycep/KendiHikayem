/**
 * Syllable counting for Turkish.
 *
 * Turkish is a phonetically regular language: every syllable contains exactly one vowel,
 * so the syllable count of a word equals its vowel count. That single fact makes the
 * Ateşman readability score (readability.ts) computable without a dictionary.
 */

import { TURKISH_VOWELS, toLowerTr } from './alphabet';

/** Number of syllables in a single word. Non-letters are ignored. */
export function countSyllables(word: string): number {
  const lower = toLowerTr(word);
  let count = 0;
  for (const character of lower) {
    if (TURKISH_VOWELS.includes(character)) count += 1;
  }
  return count;
}

const WORD_BODY = "[a-zA-ZçğıiöşüÇĞİÖŞÜ0-9]+(?:['’][a-zA-ZçğıiöşüÇĞİÖŞÜ]+)?";
/** Global — only ever used with `String.match`, which resets `lastIndex` itself. */
const WORD_PATTERN_GLOBAL = new RegExp(WORD_BODY, 'gu');
/** Non-global twin for `.test()`, so no `lastIndex` state leaks between calls. */
const WORD_PATTERN = new RegExp(WORD_BODY, 'u');

/** Tokenises a Turkish sentence into words, keeping apostrophe-suffixed names intact. */
export function words(text: string): string[] {
  return text.match(WORD_PATTERN_GLOBAL) ?? [];
}

export function countWords(text: string): number {
  return words(text).length;
}

/**
 * Sentence count. Splits on `.`, `!`, `?`, `…` and newlines. A trailing fragment without
 * punctuation still counts as one sentence, and the result is never 0 so callers can divide.
 */
export function countSentences(text: string): number {
  const trimmed = text.trim();
  if (trimmed === '') return 0;
  const parts = trimmed
    .split(/[.!?…]+|\n+/u)
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && WORD_PATTERN.test(part));
  return Math.max(parts.length, 1);
}

/** Total syllables across a passage. */
export function countSyllablesInText(text: string): number {
  return words(text).reduce((total, word) => total + countSyllables(word), 0);
}
