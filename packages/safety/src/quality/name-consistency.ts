/**
 * quality/name-consistency.ts — does the story spell and inflect the child's name the way
 * a Turkish speaker would?
 *
 * This is the check that protects the product's core promise. The book says the child's
 * name on nearly every page; "Elif'a" instead of "Elif'e" is the kind of error a parent
 * notices in the first three seconds and never forgets — and it is exactly the error a
 * model trained mostly on English makes, because vowel harmony has no English analogue.
 *
 * The check is PHONOLOGICAL rather than a whitelist of allowed forms. Turkish suffixes
 * compose (Elif'lerdekinden), so enumerating valid forms is hopeless; but every valid form
 * obeys three rules that can be checked against the stem:
 *
 *   1. Vowel harmony    — a front-vowel name takes front-vowel suffixes (Elif'e, not Elif'a)
 *   2. Buffer consonant — a vowel-final name takes y/n before a vowel suffix (Ayşe'ye),
 *                         a consonant-final name takes none (Elif'in, never Elif'nin)
 *   3. Assimilation     — after a voiceless consonant, d hardens to t (Ahmet'te, not Ahmet'de)
 *
 * Plus orthography: on a proper noun the suffix is separated by an apostrophe, always.
 */

import {
  BACK_VOWELS,
  FRONT_VOWELS,
  TURKISH_VOWELS,
  dative,
  endsWithVoicelessConsonant,
  endsWithVowel,
  toLowerTr,
} from '@kendihikayem/shared';

import { SAFETY_MESSAGES_TR } from '../messages.tr';
import type { SafetyViolation } from '../types';

/** Case/number suffixes written without an apostrophe are the giveaway of a glued form. */
const BARE_SUFFIXES = new Set([
  'in', 'ın', 'un', 'ün',
  'nin', 'nın', 'nun', 'nün',
  'e', 'a', 'ye', 'ya',
  'i', 'ı', 'u', 'ü', 'yi', 'yı', 'yu', 'yü',
  'de', 'da', 'te', 'ta', 'nde', 'nda',
  'den', 'dan', 'ten', 'tan', 'nden', 'ndan',
  'le', 'la', 'yle', 'yla',
  'ler', 'lar',
]);

const BUFFER_CONSONANTS = new Set(['y', 'n', 's']);

export interface NameCheckOptions {
  pageNo?: number;
}

/**
 * Checks every inflected occurrence of `heroName` in `text`.
 * Returns one violation per distinct wrong form — not per occurrence, so a name misspelt
 * on all twelve pages produces one actionable finding rather than twelve.
 */
export function checkNameUsage(
  text: string,
  heroName: string,
  options: NameCheckOptions = {},
): SafetyViolation[] {
  const name = heroName.trim();
  if (name === '') return [];

  const violations: SafetyViolation[] = [];
  const seen = new Set<string>();
  const push = (
    code: 'NAME_INFLECTION_WRONG' | 'NAME_APOSTROPHE_MISSING' | 'NAME_SPELLING_INCONSISTENT',
    detail: string,
    excerpt: string,
  ) => {
    const key = `${code}:${detail}`;
    if (seen.has(key)) return;
    seen.add(key);
    violations.push({
      code,
      engine: 'deterministic',
      severity: 'block',
      messageTr: SAFETY_MESSAGES_TR[code],
      detail,
      excerpt,
      ...(options.pageNo !== undefined ? { pageNo: options.pageNo } : {}),
    });
  };

  const escaped = escapeRegExp(name);
  const harmony = harmonyOf(name);
  const vowelFinal = endsWithVowel(name);
  const voicelessFinal = endsWithVoicelessConsonant(name);

  // ── 1. apostrophe-separated suffixes: check the phonology ────────────────
  const withApostrophe = new RegExp(`${escaped}['’]([a-zçğıöşü]+)`, 'gu');
  for (const match of text.matchAll(withApostrophe)) {
    const suffix = toLowerTr(match[1] ?? '');
    const problem = inflectionProblem(suffix, { harmony, vowelFinal, voicelessFinal });
    if (problem) {
      push('NAME_INFLECTION_WRONG', `${name}'${suffix} (${problem})`, snippet(text, match.index));
    }
  }

  // ── 2. suffix glued on without the apostrophe ────────────────────────────
  const glued = new RegExp(`${escaped}([a-zçğıöşü]+)`, 'gu');
  for (const match of text.matchAll(glued)) {
    const suffix = toLowerTr(match[1] ?? '');
    // Only a RECOGNISED case suffix counts: "Adalet" must not be read as "Ada" + "let".
    if (!BARE_SUFFIXES.has(suffix)) continue;
    push('NAME_APOSTROPHE_MISSING', `${name}${suffix}`, snippet(text, match.index));
  }

  // ── 3. spelling drift: dotless-i, stripped diacritics, lowercase ─────────
  for (const variant of spellingVariants(name)) {
    const pattern = new RegExp(`(?<![a-zçğıöşüA-ZÇĞİÖŞÜ])${escapeRegExp(variant)}(?![a-zçğıöşü])`, 'u');
    const match = pattern.exec(text);
    if (match) push('NAME_SPELLING_INCONSISTENT', `${variant} ≠ ${name}`, snippet(text, match.index));
  }

  return violations;
}

type Harmony = 'front' | 'back';

/**
 * Harmony is derived from the shared inflection engine rather than re-implemented: the
 * dative of a back-harmony name ends in "a", a front-harmony one in "e". Deriving it this
 * way means the loanword exceptions ("Kemal'e", not "Kemal'a") are honoured for free.
 */
function harmonyOf(name: string): Harmony {
  return dative(name).endsWith('a') ? 'back' : 'front';
}

interface Phonology {
  harmony: Harmony;
  vowelFinal: boolean;
  voicelessFinal: boolean;
}

/** Returns a short Turkish description of what is wrong, or undefined when the form is fine. */
function inflectionProblem(suffix: string, phonology: Phonology): string | undefined {
  const first = suffix[0];
  if (first === undefined) return undefined;

  const firstIsVowel = TURKISH_VOWELS.includes(first);

  if (phonology.vowelFinal && firstIsVowel) {
    return 'ünlüyle biten ada kaynaştırma harfi gerekir';
  }
  if (!phonology.vowelFinal && BUFFER_CONSONANTS.has(first) && hasVowelAt(suffix, 1)) {
    return 'ünsüzle biten adda kaynaştırma harfi kullanılmaz';
  }
  if (first === 'd' && phonology.voicelessFinal) {
    return 'sert ünsüzden sonra ek t ile başlar';
  }
  if (first === 't' && !phonology.voicelessFinal && !phonology.vowelFinal) {
    return 'yumuşak ünsüzden sonra ek d ile başlar';
  }

  const vowel = firstVowelOf(suffix);
  if (vowel !== undefined) {
    const isBack = BACK_VOWELS.includes(vowel);
    const isFront = FRONT_VOWELS.includes(vowel);
    if (phonology.harmony === 'front' && isBack) return 'ünlü uyumu: ince ada kalın ek';
    if (phonology.harmony === 'back' && isFront) return 'ünlü uyumu: kalın ada ince ek';
  }
  return undefined;
}

function hasVowelAt(text: string, index: number): boolean {
  const character = text[index];
  return character !== undefined && TURKISH_VOWELS.includes(character);
}

function firstVowelOf(text: string): string | undefined {
  for (const character of text) {
    if (TURKISH_VOWELS.includes(character)) return character;
  }
  return undefined;
}

/**
 * The two ways a model mangles a Turkish name unambiguously: it drops the diacritics
 * (Ayşe → Ayse) or it confuses dotted and dotless i (Elif → Elıf).
 *
 * A lowercase occurrence is deliberately NOT checked: half the popular Turkish names are
 * also ordinary nouns (Deniz, Su, Ada, Yağmur, Bulut), so "deniz" in a story about the sea
 * is correct Turkish, and flagging it would fail good books to catch a rarer error.
 */
function spellingVariants(name: string): string[] {
  const variants = new Set<string>();

  const asciiFolded = name
    .replace(/ı/gu, 'i')
    .replace(/İ/gu, 'I')
    .replace(/ş/gu, 's')
    .replace(/Ş/gu, 'S')
    .replace(/ğ/gu, 'g')
    .replace(/Ğ/gu, 'G')
    .replace(/ü/gu, 'u')
    .replace(/Ü/gu, 'U')
    .replace(/ö/gu, 'o')
    .replace(/Ö/gu, 'O')
    .replace(/ç/gu, 'c')
    .replace(/Ç/gu, 'C');
  if (asciiFolded !== name) variants.add(asciiFolded);

  // Single pass: two chained replaces would swap the letters back again.
  const dotSwapped = name.replace(/[iı]/gu, (character) => (character === 'i' ? 'ı' : 'i'));
  if (dotSwapped !== name) variants.add(dotSwapped);

  return [...variants];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function snippet(text: string, index: number): string {
  return text.slice(Math.max(0, index - 40), index + 60).replace(/\s+/gu, ' ').trim();
}
