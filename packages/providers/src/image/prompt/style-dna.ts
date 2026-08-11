/**
 * image/prompt/style-dna.ts — layer ② of the consistency lock (SPEC §8.1 ②).
 *
 * The art style is the OTHER half of "looks like the same book". A character can be
 * perfectly consistent and the book still fall apart if page 3 is watercolour and page 9
 * is airbrushed 3D. So the style is:
 *
 *   · a CLOSED CATALOGUE (`art_styles`), never free parent text — free text is a
 *     consistency risk and a moderation risk at once;
 *   · copied verbatim into every prompt, exactly like the character canon;
 *   · anchored by a rendered STYLE PLATE, a character-free scene the page renders are
 *     conditioned on so the palette and the paper texture stay put.
 *
 * This module holds no catalogue data. Rows come from `art_styles` (packages/db seeds
 * them); the provider layer must not carry a second copy that can drift from the database.
 */

/** One row of `art_styles`, as this package needs it. */
export interface StyleDna {
  /** `art_styles.code`, e.g. `suluboya`. Part of the content-cache key. */
  code: string;
  /** `art_styles.style_dna_en` — copied verbatim, never paraphrased per page. */
  styleDnaEn: string;
  /** `art_styles.negative_prompt_en` — appended to the mandatory negative suffix. */
  negativePromptEn: string;
  /** Rendered once per story; the reference every page is conditioned on. */
  stylePlateAssetId?: string;
}

export class UnknownArtStyleError extends Error {
  constructor(
    readonly code: string,
    readonly known: readonly string[],
  ) {
    super(
      `unknown art style '${code}'. Known: ${known.join(', ')}. ` +
        'Styles come from the art_styles catalogue; free-text styles are not accepted.',
    );
    this.name = 'UnknownArtStyleError';
  }
}

/** Look-up over the catalogue rows the caller loaded. Deliberately not a global registry. */
export class StyleDnaCatalogue {
  private readonly byCode: ReadonlyMap<string, StyleDna>;

  constructor(rows: readonly StyleDna[]) {
    this.byCode = new Map(rows.map((row) => [row.code, row]));
  }

  get codes(): string[] {
    return [...this.byCode.keys()].sort();
  }

  has(code: string): boolean {
    return this.byCode.has(code);
  }

  /** @throws UnknownArtStyleError — the K5 audit's "art_style enum'da mı" check. */
  get(code: string): StyleDna {
    const row = this.byCode.get(code);
    if (!row) throw new UnknownArtStyleError(code, this.codes);
    return row;
  }
}

/**
 * The negative fragment EVERY prompt carries, whatever the style (SPEC §8.4).
 *
 * Text is not "usually fine" in this product, it is never fine: Turkish glyphs
 * (`ş ğ ı İ ç ö ü`) are unmeasured on these models and a 4% error rate over twelve pages is
 * four broken pages. All book text is a vector layer in the PDF, so the illustration must
 * contain no letterforms at all — including on signs, book spines and shopfronts inside
 * the scene, which is where models sneak text back in.
 */
export const NO_TEXT_NEGATIVE_EN =
  'no text, no letters, no words, no numbers, no captions, no signage, no labels, ' +
  'no watermark, no logo, no signature';

/** Anatomy failures that read as "broken" to a parent faster than anything else. */
export const BASE_NEGATIVE_EN =
  'extra fingers, extra limbs, deformed hands, distorted face, blurry, low quality, ' +
  'photorealistic, uncanny, horror, gore, scary';

/** Composes the full negative prompt for a style. Order fixed so prompts hash stably. */
export function composeNegativePrompt(style: StyleDna, extra?: string): string {
  return [NO_TEXT_NEGATIVE_EN, BASE_NEGATIVE_EN, style.negativePromptEn, extra]
    .filter((part): part is string => Boolean(part && part.trim()))
    .map((part) => part.trim().replace(/\s+/gu, ' '))
    .join(', ');
}
