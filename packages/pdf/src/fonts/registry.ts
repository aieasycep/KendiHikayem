/**
 * fonts/registry.ts — the five faces that go into a printed book, and their metrics.
 *
 * ⚠️ LICENCE. Fraunces and Nunito are both SIL OFL 1.1, whose §1 explicitly permits
 * embedding in a document ("the Font Software may be embedded ... in a document"). The
 * licence text ships next to the files (`assets/fonts/OFL.txt`) and must stay there: a
 * printed book is a redistributed document, so the licence is a delivery requirement, not
 * a formality. Do not add a face here without checking its embedding clause.
 *
 * Metrics come from fontkit, the same shaper pdf-lib embeds with, so the width that drives
 * line breaking (`text/typeset.ts`) is the width that ends up on paper. Measuring with one
 * engine and printing with another is how text ends up 2 mm inside the safe zone in the
 * preview and 1 mm outside it on the press sheet.
 *
 * All five faces are checked for the Turkish alphabet at load time (`assertTurkishCoverage`)
 * — ğ Ğ ı İ ş Ş ç Ç ö Ö ü Ü plus the kesme işareti ’ — because a missing glyph does not
 * throw at draw time, it silently prints a box.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import fontkit from '@pdf-lib/fontkit';
import type { Font as FontkitFont } from '@pdf-lib/fontkit';

import { normalizeTypographyTr } from '../text/turkish';

export type FontRole = 'title' | 'titleBold' | 'body' | 'bodyBold' | 'bodyItalic';

export interface FontFileSpec {
  role: FontRole;
  /** PostScript-ish family name used in the PDF and in the ops work order. */
  family: string;
  file: string;
}

/**
 * Fraunces for display (a warm, slightly old-style serif that reads as "story book"),
 * Nunito for body text (round, high x-height, tested at 18–34 pt for early readers).
 */
export const FONT_FILES: readonly FontFileSpec[] = [
  { role: 'title', family: 'Fraunces SemiBold', file: 'Fraunces_600SemiBold.ttf' },
  { role: 'titleBold', family: 'Fraunces Bold', file: 'Fraunces_700Bold.ttf' },
  { role: 'body', family: 'Nunito Regular', file: 'Nunito_400Regular.ttf' },
  { role: 'bodyBold', family: 'Nunito Bold', file: 'Nunito_700Bold.ttf' },
  { role: 'bodyItalic', family: 'Nunito Italic', file: 'Nunito_400Regular_Italic.ttf' },
];

/** Every letter of the Turkish alphabet plus the punctuation a story actually uses. */
export const TURKISH_COVERAGE_SAMPLE =
  'abcçdefgğhıijklmnoöprsştuüvyz' +
  'ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ' +
  '0123456789' +
  '’“”…–—,.;:!?()-';

const HERE = dirname(fileURLToPath(import.meta.url));
/** `packages/pdf/assets/fonts` — resolved from this file, not from process.cwd(). */
export const DEFAULT_FONT_DIR = join(HERE, '..', '..', 'assets', 'fonts');

export class FontCoverageError extends Error {
  constructor(
    readonly family: string,
    readonly missing: string[],
  ) {
    super(`font ${family} is missing glyphs for: ${missing.join(' ')}`);
    this.name = 'FontCoverageError';
  }
}

export interface LoadedFont {
  role: FontRole;
  family: string;
  bytes: Uint8Array;
  font: FontkitFont;
  unitsPerEm: number;
  /** Ascender/descender in em units (0..1), used to place the first baseline. */
  ascender: number;
  descender: number;
  /** Advance width of `text` at `sizePt`, kerning included. */
  widthOf(text: string, sizePt: number): number;
  /** Characters this face cannot draw. Empty is the only acceptable answer for print. */
  missingGlyphs(text: string): string[];
}

function buildLoadedFont(spec: FontFileSpec, bytes: Uint8Array): LoadedFont {
  const font = fontkit.create(bytes);
  const unitsPerEm = font.unitsPerEm;

  const widthCache = new Map<string, number>();

  return {
    role: spec.role,
    family: spec.family,
    bytes,
    font,
    unitsPerEm,
    ascender: font.ascent / unitsPerEm,
    descender: font.descent / unitsPerEm,
    widthOf(text: string, sizePt: number): number {
      if (text === '') return 0;
      let units = widthCache.get(text);
      if (units === undefined) {
        units = font.layout(text).advanceWidth;
        widthCache.set(text, units);
      }
      return (units / unitsPerEm) * sizePt;
    },
    missingGlyphs(text: string): string[] {
      const missing = new Set<string>();
      for (const character of text) {
        const codePoint = character.codePointAt(0);
        if (codePoint === undefined) continue;
        // Whitespace and control characters are handled by the layout, not by a glyph.
        if (codePoint <= 0x20) continue;
        if (!font.hasGlyphForCodePoint(codePoint)) missing.add(character);
      }
      return [...missing];
    },
  };
}

export interface FontSet {
  get(role: FontRole): LoadedFont;
  all(): LoadedFont[];
  /** `[{ family, sha256Prefix }]` for the build record and the ops work order. */
  describe(): Array<{ role: FontRole; family: string; bytes: number }>;
}

let cached: FontSet | undefined;

/**
 * Loads (and memoises) the font set. Synchronous on purpose: it runs once per process at
 * build time and the files are ~130 KB each, so async here would only buy complexity.
 */
export function loadFontSet(fontDir: string = DEFAULT_FONT_DIR): FontSet {
  if (fontDir === DEFAULT_FONT_DIR && cached) return cached;

  const fonts = new Map<FontRole, LoadedFont>();
  for (const spec of FONT_FILES) {
    const bytes = new Uint8Array(readFileSync(join(fontDir, spec.file)));
    const loaded = buildLoadedFont(spec, bytes);
    const missing = loaded.missingGlyphs(TURKISH_COVERAGE_SAMPLE);
    if (missing.length > 0) throw new FontCoverageError(spec.family, missing);
    fonts.set(spec.role, loaded);
  }

  const set: FontSet = {
    get(role) {
      const font = fonts.get(role);
      if (!font) throw new Error(`font role not loaded: ${role}`);
      return font;
    },
    all: () => [...fonts.values()],
    describe: () =>
      [...fonts.values()].map((font) => ({
        role: font.role,
        family: font.family,
        bytes: font.bytes.byteLength,
      })),
  };

  if (fontDir === DEFAULT_FONT_DIR) cached = set;
  return set;
}

/** Test-only: forgets the memoised set so a different directory can be loaded. */
export function resetFontCache(): void {
  cached = undefined;
}

/**
 * Throws unless every character of `text` can be drawn by `font`. Called by the preflight
 * on the ACTUAL page text (after Turkish normalisation), not on a sample.
 */
export function assertTurkishCoverage(font: LoadedFont, text: string): void {
  const missing = font.missingGlyphs(normalizeTypographyTr(text));
  if (missing.length > 0) throw new FontCoverageError(font.family, missing);
}
