/**
 * Turkish noun case inflection ("isim çekimleme").
 *
 * The product says "Elif'in masalı", "Elif'e özel", "Elif'i dinle" everywhere. A wrong
 * suffix reads as broken Turkish to a parent and costs trust immediately, so this module
 * is the most heavily tested piece of packages/shared (see inflect.test.ts).
 *
 * Two orthography rules from TDK that the implementation depends on:
 *
 *  1. Case suffixes on a PROPER noun are separated with an apostrophe: "Elif'in".
 *  2. Final-consonant softening (ünsüz yumuşaması: p→b, ç→c, t→d, k→ğ) is NOT written on
 *     proper nouns. It is "Ahmet'in", never "Ahmed'in"; "Sinop'a", never "Sinob'a".
 *     Softening therefore only runs when `proper: false`.
 */

import {
  BACK_VOWELS,
  ROUNDED_VOWELS,
  endsWithVoicelessConsonant,
  endsWithVowel,
  lastVowelOf,
  toLowerTr,
} from './alphabet';

export type Harmony = 'front' | 'back';

export interface InflectOptions {
  /**
   * `true` (default) → proper noun: apostrophe before the suffix, no written softening.
   * `false` → common noun: suffix is glued on and softening applies ("kitap" → "kitabın").
   */
  proper?: boolean;
  /**
   * Overrides the vowel harmony deduced from spelling. Needed for loanwords whose final
   * `l`/`t` is palatal ("Kemal'e", "saate") — see FRONT_HARMONY_EXCEPTIONS.
   */
  harmony?: Harmony;
}

/**
 * Words that take a front-vowel suffix despite a back final vowel (palatal l/k of Arabic
 * and Persian loans). Extend as real user names surface; the `harmony` option is the
 * escape hatch until then.
 */
const FRONT_HARMONY_EXCEPTIONS = new Set([
  'kemal',
  'cemal',
  'celal',
  'bilal',
  'hilal',
  'ikbal',
  'talat',
  'nihal',
  'kamil',
  'saat',
  'hal',
  'usul',
  'meal',
]);

/**
 * `su` and `ne` take a `y` buffer in the genitive instead of the regular `n`:
 * "suyun", "neyin" — hence "Su'yun". Every other vowel-final word uses `n`,
 * which is why "Göksu" correctly yields "Göksu'nun".
 */
const GENITIVE_Y_BUFFER = new Set(['su', 'ne']);

/** Monosyllabic words that DO soften, against the general monosyllabic rule. */
const MONOSYLLABIC_SOFTENING = new Set(['dip', 'kap', 'kurt', 'yurt', 'uç', 'cep', 'but', 'çok']);

/** Multisyllabic words that do NOT soften (mostly Arabic loans with a geminate root). */
const NO_SOFTENING = new Set([
  'devlet',
  'millet',
  'sanat',
  'hayat',
  'saat',
  'sepet',
  'ahlak',
  'merak',
  'hukuk',
  'bilet',
  'ithalat',
]);

const SOFTENING_MAP: Record<string, string> = { p: 'b', ç: 'c', t: 'd', k: 'ğ' };

function syllableCountRough(word: string): number {
  const lower = toLowerTr(word);
  let count = 0;
  for (const character of lower) if ('aeıioöuü'.includes(character)) count += 1;
  return count;
}

function resolveHarmony(word: string, override?: Harmony): Harmony {
  if (override !== undefined) return override;
  if (FRONT_HARMONY_EXCEPTIONS.has(toLowerTr(word))) return 'front';
  const vowel = lastVowelOf(word);
  // Vowel-less input (initialisms such as "TRT") conventionally takes back harmony.
  if (vowel === undefined) return 'back';
  return BACK_VOWELS.includes(vowel) ? 'back' : 'front';
}

/** Two-way harmony (e/a): dative, locative, ablative. */
function twoWayVowel(word: string, override?: Harmony): string {
  return resolveHarmony(word, override) === 'back' ? 'a' : 'e';
}

/** Four-way harmony (ı/i/u/ü): genitive and accusative. */
function fourWayVowel(word: string, override?: Harmony): string {
  const harmony = resolveHarmony(word, override);
  const vowel = lastVowelOf(word);
  const rounded = vowel !== undefined && ROUNDED_VOWELS.includes(vowel);
  if (harmony === 'back') return rounded ? 'u' : 'ı';
  return rounded ? 'ü' : 'i';
}

/**
 * Applies ünsüz yumuşaması to a common noun before a vowel-initial suffix.
 * Best effort: Turkish softening is partly lexical, so the two exception sets above carry
 * the well-known irregulars. Never called for proper nouns.
 */
export function softenFinalConsonant(word: string): string {
  const lower = toLowerTr(word);
  const last = lower.slice(-1);
  const replacement = SOFTENING_MAP[last];
  if (replacement === undefined) return word;
  if (NO_SOFTENING.has(lower)) return word;

  // "renk" → "rengi", "ahenk" → "ahengi": nk becomes ng (not nğ), regardless of length.
  if (last === 'k' && lower.endsWith('nk')) return `${word.slice(0, -1)}g`;

  const syllables = syllableCountRough(lower);
  if (syllables <= 1 && !MONOSYLLABIC_SOFTENING.has(lower)) return word;

  return word.slice(0, -1) + replacement;
}

function join(word: string, suffix: string, proper: boolean): string {
  return proper ? `${word}'${suffix}` : `${word}${suffix}`;
}

function stemFor(word: string, proper: boolean): string {
  return proper ? word : softenFinalConsonant(word);
}

function normalize(word: string): string {
  return word.trim();
}

/**
 * Genitive / possessive — "-in" (ilgi hâli).
 * possessive('Elif') → "Elif'in" · possessive('Su') → "Su'yun" · possessive('Ada') → "Ada'nın"
 */
export function possessive(word: string, options: InflectOptions = {}): string {
  const name = normalize(word);
  if (name === '') return name;
  const proper = options.proper ?? true;
  const vowel = fourWayVowel(name, options.harmony);

  if (endsWithVowel(name)) {
    const buffer = GENITIVE_Y_BUFFER.has(toLowerTr(name)) ? 'y' : 'n';
    return join(name, `${buffer}${vowel}n`, proper);
  }
  return join(stemFor(name, proper), `${vowel}n`, proper);
}

/** Alias for {@link possessive} using the grammatical name. */
export const genitive = possessive;

/**
 * Dative — "-e / -a" (yönelme hâli).
 * dative('Elif') → "Elif'e" · dative('Oğuz') → "Oğuz'a" · dative('Ayşe') → "Ayşe'ye"
 */
export function dative(word: string, options: InflectOptions = {}): string {
  const name = normalize(word);
  if (name === '') return name;
  const proper = options.proper ?? true;
  const vowel = twoWayVowel(name, options.harmony);

  if (endsWithVowel(name)) return join(name, `y${vowel}`, proper);
  return join(stemFor(name, proper), vowel, proper);
}

/**
 * Accusative — "-i / -ı / -u / -ü" (belirtme hâli).
 * accusative('Elif') → "Elif'i" · accusative('Çağla') → "Çağla'yı"
 */
export function accusative(word: string, options: InflectOptions = {}): string {
  const name = normalize(word);
  if (name === '') return name;
  const proper = options.proper ?? true;
  const vowel = fourWayVowel(name, options.harmony);

  if (endsWithVowel(name)) return join(name, `y${vowel}`, proper);
  return join(stemFor(name, proper), vowel, proper);
}

/**
 * Locative — "-de / -da / -te / -ta" (bulunma hâli).
 * The suffix never starts with a vowel, so softening never applies here.
 * locative('Ahmet') → "Ahmet'te" · locative('Deniz') → "Deniz'de"
 */
export function locative(word: string, options: InflectOptions = {}): string {
  const name = normalize(word);
  if (name === '') return name;
  const proper = options.proper ?? true;
  const consonant = endsWithVoicelessConsonant(name) ? 't' : 'd';
  return join(name, `${consonant}${twoWayVowel(name, options.harmony)}`, proper);
}

/**
 * Ablative — "-den / -dan / -ten / -tan" (ayrılma hâli).
 * ablative('Elif') → "Elif'ten" · ablative('Ada') → "Ada'dan"
 */
export function ablative(word: string, options: InflectOptions = {}): string {
  const name = normalize(word);
  if (name === '') return name;
  const proper = options.proper ?? true;
  const consonant = endsWithVoicelessConsonant(name) ? 't' : 'd';
  return join(name, `${consonant}${twoWayVowel(name, options.harmony)}n`, proper);
}

/**
 * Third-person possessive on a common noun — "-i / -sı" (iyelik eki).
 * Used for phrases such as `${possessive(name)} ${possessed('masal')}` → "Elif'in masalı".
 */
export function possessed(word: string, options: InflectOptions = {}): string {
  const name = normalize(word);
  if (name === '') return name;
  const proper = options.proper ?? false;
  const vowel = fourWayVowel(name, options.harmony);
  if (endsWithVowel(name)) return join(name, `s${vowel}`, proper);
  return join(stemFor(name, proper), vowel, proper);
}

export type GrammaticalCase =
  | 'nominative'
  | 'genitive'
  | 'dative'
  | 'accusative'
  | 'locative'
  | 'ablative';

const CASE_FUNCTIONS: Record<GrammaticalCase, (w: string, o?: InflectOptions) => string> = {
  nominative: (word) => normalize(word),
  genitive: possessive,
  dative,
  accusative,
  locative,
  ablative,
};

/** Dynamic dispatch for template-driven copy ("{{child|dative}} bir masal"). */
export function inflect(
  word: string,
  grammaticalCase: GrammaticalCase,
  options: InflectOptions = {},
): string {
  return CASE_FUNCTIONS[grammaticalCase](word, options);
}
