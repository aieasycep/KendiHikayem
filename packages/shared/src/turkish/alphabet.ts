/**
 * Turkish phonology primitives shared by every helper in this package.
 *
 * Everything here works on the *written* form, because that is what we always have:
 * a name typed by a parent. No pronunciation dictionary, no ML.
 */

export const TURKISH_VOWELS = 'aeıioöuü';

/** kalın (back) vowels — drive the two-way and four-way harmony. */
export const BACK_VOWELS = 'aıou';
/** ince (front) vowels. */
export const FRONT_VOWELS = 'eiöü';
/** yuvarlak (rounded) vowels — only relevant for the four-way harmony. */
export const ROUNDED_VOWELS = 'oöuü';

/**
 * Voiceless consonants — the "Fıstıkçı Şahap" mnemonic. A suffix starting with `d`
 * hardens to `t` after these (Ahmet'**te**, Elif'**ten**).
 */
export const VOICELESS_CONSONANTS = 'fstkçşhp';

/**
 * Turkish-correct lowercase. `'İ'.toLowerCase()` in JavaScript produces `i` plus a
 * combining dot (U+0307), which then breaks every character comparison downstream, and
 * `'I'.toLowerCase()` produces `i` instead of `ı`. Both are fixed before delegating.
 */
export function toLowerTr(value: string): string {
  return value.replace(/İ/g, 'i').replace(/I/g, 'ı').toLowerCase();
}

/**
 * Turkish-correct uppercase: `i → İ` and `ı → I`. Plain `toUpperCase()` maps `i → I`,
 * which is the single most common Turkish text bug in software ("İSTANBUL" vs "ISTANBUL").
 */
export function toUpperTr(value: string): string {
  return value.replace(/i/g, 'İ').replace(/ı/g, 'I').toUpperCase();
}

/** "elif" → "Elif", "AYŞE" → "Ayşe", "ali can" → "Ali Can", "ayşe-nur" → "Ayşe-Nur". */
export function capitalizeTr(value: string): string {
  return value
    .split(/(\s+|-)/)
    .map((part) => {
      if (part.length === 0 || /^(\s+|-)$/.test(part)) return part;
      const lower = toLowerTr(part);
      return toUpperTr(lower.slice(0, 1)) + lower.slice(1);
    })
    .join('');
}

export function isVowel(character: string): boolean {
  return TURKISH_VOWELS.includes(toLowerTr(character));
}

/** Returns the last vowel of a word, or `undefined` for vowel-less input ("Ş", "42"). */
export function lastVowelOf(word: string): string | undefined {
  const lower = toLowerTr(word);
  for (let index = lower.length - 1; index >= 0; index -= 1) {
    const character = lower[index];
    if (character !== undefined && TURKISH_VOWELS.includes(character)) return character;
  }
  return undefined;
}

/** Last *letter* of a word, ignoring trailing punctuation and whitespace. */
export function lastLetterOf(word: string): string | undefined {
  const trimmed = toLowerTr(word).replace(/[^a-zçğıiöşü]+$/u, '');
  return trimmed.length > 0 ? trimmed[trimmed.length - 1] : undefined;
}

export function endsWithVowel(word: string): boolean {
  const letter = lastLetterOf(word);
  return letter !== undefined && TURKISH_VOWELS.includes(letter);
}

export function endsWithVoicelessConsonant(word: string): boolean {
  const letter = lastLetterOf(word);
  return letter !== undefined && VOICELESS_CONSONANTS.includes(letter);
}
