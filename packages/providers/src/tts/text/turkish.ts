/**
 * tts/text/turkish.ts — Turkish-aware tokenisation and read-back comparison.
 *
 * Two places in the voice pipeline depend on getting Turkish word boundaries right, and
 * both fail in ways the parent feels immediately:
 *
 *   1. LIVENESS (SPEC §7 step 5). The parent reads a server-generated sentence; we compare
 *      the ASR transcript to it. Compare too strictly and every honest parent is told they
 *      read the wrong text (`VOICE_SCRIPT_MISMATCH`); compare too loosely and a replayed
 *      recording passes the anti-deepfake gate.
 *   2. KARAOKE (SPEC §11.1 P01). A word highlight that splits "Elif'in" into "Elif" and
 *      "in" makes the child's own name blink twice.
 *
 * The apostrophe rule is the crux. Turkish attaches suffixes to proper nouns with an
 * apostrophe — Elif'in, Ankara'ya, KendiHikayem'de — and both the straight (') and curly (’)
 * forms occur in real text. These are ONE word for highlighting, and the suffix must not be
 * treated as a separate token when scoring a read-back either.
 */

import { countSyllables, toLowerTr } from '@kendihikayem/shared';

/**
 * A word: letters/digits, optionally followed by apostrophe-attached suffixes.
 * Turkish-specific letters are listed explicitly because `\p{L}` alone would also match
 * the dotted/dotless i pair inconsistently once the string is lower-cased.
 */
const WORD_SOURCE = "[\\p{L}\\p{N}]+(?:['’’][\\p{L}\\p{N}]+)*";
const WORD_PATTERN_GLOBAL = new RegExp(WORD_SOURCE, 'gu');

export interface TokenSpan {
  text: string;
  /** Offsets into the ORIGINAL string, so the reader can highlight the source characters. */
  charStart: number;
  charEnd: number;
}

/** Tokenises keeping character offsets, with apostrophe-suffixed words kept whole. */
export function tokenizeWithSpans(text: string): TokenSpan[] {
  const spans: TokenSpan[] = [];
  for (const match of text.matchAll(WORD_PATTERN_GLOBAL)) {
    const value = match[0];
    const index = match.index ?? 0;
    if (value.length === 0) continue;
    spans.push({ text: value, charStart: index, charEnd: index + value.length });
  }
  return spans;
}

export function tokenize(text: string): string[] {
  return tokenizeWithSpans(text).map((span) => span.text);
}

/**
 * Normalised form for comparison: Turkish lower-case (İ→i, I→ı), apostrophes unified,
 * punctuation dropped, whitespace collapsed.
 *
 * ⚠️ `toLowerCase()` is wrong here and silently so: it maps "I" to "i" instead of "ı", so
 * "IŞIK" and "ışık" would compare as different words.
 */
export function normalizeForComparison(text: string): string {
  return toLowerTr(text)
    .replace(/['’’]/gu, "'")
    .replace(/[^\p{L}\p{N}'\s]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

/**
 * Comparison tokens. Apostrophes are STRIPPED here (unlike display tokenisation) because an
 * ASR engine writes "Elifin" as often as "Elif'in", and punishing the parent for the
 * transcriber's convention would be unfair.
 */
export function comparisonTokens(text: string): string[] {
  return normalizeForComparison(text)
    .split(' ')
    .map((word) => word.replace(/'/gu, ''))
    .filter((word) => word.length > 0);
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  let current = new Array<number>(b.length + 1).fill(0);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1]! + 1, previous[j]! + 1, previous[j - 1]! + cost);
    }
    [previous, current] = [current, previous];
  }
  return previous[b.length]!;
}

/**
 * Word-level similarity in 0..1, the number compared against
 * `VOICE_QUALITY_THRESHOLDS.asrSimilarityMin`.
 *
 * Word-level rather than character-level on purpose: a transcriber that writes "sekiz"
 * where the parent said "8", or drops a comma, should not cost 5% of the score. Words are
 * matched with a per-word Levenshtein tolerance so a single mis-recognised letter inside a
 * long agglutinated word ("çağırdığında" → "çağırdıgında") counts as a match.
 */
export function readBackSimilarity(expected: string, actual: string): number {
  const expectedWords = comparisonTokens(expected);
  const actualWords = comparisonTokens(actual);
  if (expectedWords.length === 0) return actualWords.length === 0 ? 1 : 0;
  if (actualWords.length === 0) return 0;

  // Word-level edit distance where substitution cost is itself fuzzy.
  const rows = expectedWords.length;
  const columns = actualWords.length;
  let previous = Array.from({ length: columns + 1 }, (_, i) => i);
  let current = new Array<number>(columns + 1).fill(0);

  for (let i = 1; i <= rows; i += 1) {
    current[0] = i;
    for (let j = 1; j <= columns; j += 1) {
      const cost = wordSubstitutionCost(expectedWords[i - 1]!, actualWords[j - 1]!);
      current[j] = Math.min(current[j - 1]! + 1, previous[j]! + 1, previous[j - 1]! + cost);
    }
    [previous, current] = [current, previous];
  }

  const distance = previous[columns]!;
  return Number(Math.max(0, 1 - distance / Math.max(rows, columns)).toFixed(3));
}

/** 0 = same word, 0.5 = near miss (one edit per 4 characters), 1 = different word. */
function wordSubstitutionCost(expected: string, actual: string): number {
  if (expected === actual) return 0;
  const distance = levenshtein(expected, actual);
  const tolerance = Math.max(1, Math.floor(Math.max(expected.length, actual.length) / 4));
  return distance <= tolerance ? 0.5 : 1;
}

/* ── Sentences ─────────────────────────────────────────────────────────────── */

export interface SentenceSpan {
  index: number;
  charStart: number;
  charEnd: number;
  text: string;
}

const SENTENCE_PATTERN = /[^.!?…]+[.!?…]*/gu;

/**
 * Sentence spans with offsets. Used both for the reader manifest and for chunking, so a
 * chunk boundary can never land mid-sentence (SPEC §7 step 10).
 */
export function sentenceSpans(text: string): SentenceSpan[] {
  const spans: SentenceSpan[] = [];
  for (const match of text.matchAll(SENTENCE_PATTERN)) {
    const raw = match[0];
    const offset = match.index ?? 0;
    const leading = raw.length - raw.trimStart().length;
    const value = raw.trim();
    if (value.length === 0) continue;
    spans.push({
      index: spans.length,
      charStart: offset + leading,
      charEnd: offset + leading + value.length,
      text: value,
    });
  }
  return spans;
}

/**
 * Relative spoken duration of a word.
 *
 * Turkish is syllable-timed and phonetically regular — one vowel per syllable — so syllable
 * count is a far better duration proxy than character count. It matters most exactly where
 * Turkish differs from English: "gördüklerimizden" is 6 syllables in 16 characters, while
 * "stres" is 1 syllable in 5. Character-proportional estimation stretches the first and
 * clips the second, and the karaoke highlight visibly drifts by the end of a page.
 */
export function spokenWeight(word: string): number {
  const syllables = Math.max(1, countSyllables(word));
  // Consonant clusters and word-final stops add a little time beyond the vowel count.
  const trailingConsonants = /[bcçdfgğhjklmnprsştvyz]{2,}$/iu.test(word) ? 0.2 : 0;
  return syllables + trailingConsonants;
}
