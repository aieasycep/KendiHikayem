/**
 * text/turkish.ts — Turkish typography for a printed page.
 *
 * Screen text forgives sloppy punctuation; a printed book does not — it is the one artefact
 * the parent keeps and shows to other people. Three problems this file solves:
 *
 *  1. **Kesme işareti.** The apostrophe in "Elif'in" is U+2019 (’), not the typewriter
 *     U+0027 ('). Fraunces and Nunito draw the typewriter mark as a vertical tick, which
 *     looks like a mistake at 22 pt. Every string is normalised before it is measured, so
 *     the width used for line breaking is the width that is actually printed.
 *
 *  2. **Türkçe hece bölme.** A justified/narrow column in Turkish needs hyphenation, and
 *     Turkish hyphenation is fully rule-based (no dictionary): every syllable has exactly
 *     one vowel, and the consonants between two vowels split V-CV / VC-CV / VCC-CV.
 *     `hyphenateTr` implements exactly that, plus the typographic rule that a single letter
 *     is never left hanging at either end of a line.
 *
 *  3. **Dotted/dotless i.** Uppercasing "ışık" with the ASCII rules gives "ISIK" on the
 *     title page — wrong word. Casing goes through packages/shared, which knows i→İ, ı→I.
 *
 * The hyphenation break points are also what `packages/pdf/text/typeset.ts` uses; nothing
 * else in the package is allowed to cut a word.
 */

import { TURKISH_VOWELS, toLowerTr } from '@kendihikayem/shared';

/** U+2019 RIGHT SINGLE QUOTATION MARK — the correct Turkish kesme işareti. */
export const APOSTROPHE = '’';
/** Soft hyphen is never printed; we only use a real hyphen at an actual break. */
export const HYPHEN = '-';

const DOUBLE_OPEN = '“';
const DOUBLE_CLOSE = '”';
const ELLIPSIS = '…';
const EN_DASH = '–';
const EM_DASH = '—';
const NBSP = ' ';

/**
 * Normalises punctuation for print.
 *
 * - `'` → `’` (apostrophe / kesme işareti)
 * - `"…"` → `“…”` (Turkish uses the same curly pair as English)
 * - `...` → `…`, ` - ` → ` – ` (en dash for parenthetical dashes), `--` → `—`
 * - collapses runs of spaces, strips spaces before `,.;:!?` and after `(`
 * - binds a number to its unit with a non-breaking space ("24 sayfa" never splits)
 */
export function normalizeTypographyTr(input: string): string {
  let text = input.replace(/\r\n?/g, '\n');

  // Straight double quotes → curly, alternating open/close.
  let openNext = true;
  text = text.replace(/"/g, () => {
    const mark = openNext ? DOUBLE_OPEN : DOUBLE_CLOSE;
    openNext = !openNext;
    return mark;
  });

  text = text
    .replace(/'/g, APOSTROPHE)
    .replace(/\.{3,}/g, ELLIPSIS)
    .replace(/ {2,}/g, ' ')
    .replace(/ +([,.;:!?])/g, '$1')
    .replace(/--/g, EM_DASH)
    .replace(/ - /g, ` ${EN_DASH} `)
    .replace(/(\d)\s(?=(sayfa|cm|mm|yaş|TL|dakika|gr))/g, `$1${NBSP}`);

  return text.trim();
}

const isVowel = (character: string): boolean => TURKISH_VOWELS.includes(toLowerTr(character));

const LETTER = /[\p{L}]/u;

/**
 * Consonant pairs that can open a syllable in Turkish loanwords ("e-lek-trik",
 * "kilo-gram"). Native Turkish words never start with a cluster, so this list only exists
 * to hyphenate borrowed vocabulary the way TDK does.
 */
const ONSET_CLUSTERS = new Set([
  'tr', 'dr', 'br', 'pr', 'kr', 'gr', 'fr', 'vr',
  'tl', 'bl', 'pl', 'kl', 'gl', 'fl',
  'st', 'sp', 'sk', 'sl', 'sn', 'kv',
]);

/**
 * Splits a Turkish word into syllables.
 *
 *   "kitap"    → ki-tap        (CV-CVC)
 *   "arkadaş"  → ar-ka-daş     (VC-CV-CVC)
 *   "Türkçe"   → Türk-çe       (CVCC-CV)
 *   "elektrik" → e-lek-trik    (V-CVC-CCVC)
 *
 * Rule: with `k` consonants between two vowels, the split is after the first vowel when
 * k ≤ 1, after the first consonant when k = 2, and one consonant before the next vowel
 * when k ≥ 3.
 */
export function syllabifyTr(word: string): string[] {
  const letters = [...word];
  if (letters.length === 0) return [];

  const vowelIndexes: number[] = [];
  letters.forEach((letter, index) => {
    if (isVowel(letter)) vowelIndexes.push(index);
  });
  if (vowelIndexes.length <= 1) return [word];

  const cuts: number[] = [];
  for (let i = 0; i < vowelIndexes.length - 1; i += 1) {
    const current = vowelIndexes[i] ?? 0;
    const next = vowelIndexes[i + 1] ?? 0;
    const consonants = next - current - 1;
    if (consonants <= 1) {
      cuts.push(current + 1);
    } else if (consonants === 2) {
      cuts.push(current + 2);
    } else {
      // Three or more: the next syllable takes one consonant, or two when they form a
      // cluster a Turkish syllable may start with ("e-lek-trik", not "e-lekt-rik").
      const pair = `${letters[next - 2] ?? ''}${letters[next - 1] ?? ''}`.toLowerCase();
      cuts.push(ONSET_CLUSTERS.has(pair) ? next - 2 : next - 1);
    }
  }

  const parts: string[] = [];
  let start = 0;
  for (const cut of cuts) {
    parts.push(letters.slice(start, cut).join(''));
    start = cut;
  }
  parts.push(letters.slice(start).join(''));
  return parts.filter((part) => part.length > 0);
}

export interface HyphenationOptions {
  /** Words shorter than this are never split. TDK practice and legibility both say 5. */
  minWordLength?: number;
  /** Letters that must stay on the current line before the hyphen. */
  minPrefix?: number;
  /** Letters that must move to the next line. */
  minSuffix?: number;
}

/**
 * Legal break points inside a word, as prefix lengths (the hyphen goes after this many
 * characters). Empty when the word must not be broken.
 *
 * A word carrying an apostrophe suffix ("Elif’in") is never broken: splitting a proper
 * noun from its case ending reads as an error, not as hyphenation.
 */
export function hyphenationPoints(word: string, options: HyphenationOptions = {}): number[] {
  const minWordLength = options.minWordLength ?? 5;
  const minPrefix = options.minPrefix ?? 2;
  const minSuffix = options.minSuffix ?? 2;

  const letters = [...word];
  if (letters.length < minWordLength) return [];
  if (word.includes(APOSTROPHE) || word.includes("'")) return [];
  if (letters.some((letter) => !LETTER.test(letter))) return [];

  const syllables = syllabifyTr(word);
  if (syllables.length < 2) return [];

  const points: number[] = [];
  let offset = 0;
  for (const syllable of syllables.slice(0, -1)) {
    offset += [...syllable].length;
    if (offset >= minPrefix && letters.length - offset >= minSuffix) points.push(offset);
  }
  return points;
}

/** Convenience: "arkadaşlarım" → "arka-daşlarım" for the longest prefix that fits. */
export function hyphenateTr(word: string, options?: HyphenationOptions): string[] {
  const points = hyphenationPoints(word, options);
  if (points.length === 0) return [word];
  const letters = [...word];
  const parts: string[] = [];
  let start = 0;
  for (const point of points) {
    parts.push(letters.slice(start, point).join(''));
    start = point;
  }
  parts.push(letters.slice(start).join(''));
  return parts;
}
