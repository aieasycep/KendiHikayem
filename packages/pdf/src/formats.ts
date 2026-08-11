/**
 * formats.ts — the physical book, as data.
 *
 * `book_formats.code` in the database and `formatCode` in the contract both resolve to one
 * of these rows. Everything the layout engine, the spine calculator and the preflight need
 * about the physical object lives here and NOWHERE else, so switching printers is editing
 * numbers rather than hunting constants.
 *
 * ⚠️ `paperCaliperMm` and `boardThicknessMm` are PRINTER FACTS, not preferences. They come
 * from the partner's spec sheet (caliper in mm per sheet, or PPI → mm). A wrong caliper
 * produces a cover whose spine does not line up with the block and the printer rejects the
 * file — see spine.ts. Every value here carries its source in a comment.
 *
 * MVP format (SPEC §9): kare21_24_sert — 210×210 mm trim, 24 pages, hardcover casewrap,
 * 170 gsm matt coated interior.
 */

/** How the block is bound; drives the spine allowance and the cover geometry. */
export type BindingKind = 'hardcover_casewrap' | 'softcover_perfect';

export interface BookFormatSpec {
  /** `book_formats.code`. */
  code: string;
  titleTr: string;
  /** Trim size in mm — what the reader holds after cutting. */
  trimWidthMm: number;
  trimHeightMm: number;
  /**
   * Bleed drawn on every outer edge. SPEC §9 "ortak payda kuralı": 5 mm covers Lulu's
   * 3.175 mm and Gelato's 4 mm, so one file satisfies all three providers.
   */
  bleedMm: number;
  /**
   * No text may enter this margin from the trim edge. 20 mm covers Lulu hardcover
   * casewrap's 19 mm requirement.
   */
  safeMarginMm: number;
  /**
   * Extra clearance next to the spine, ON TOP of `safeMarginMm`. A hardcover block does
   * not open flat: text that close to the gutter disappears into the fold.
   */
  gutterMm: number;
  /** Interior sheet count. Must be a multiple of 4 — a sheet carries four pages. */
  pageCount: number;
  binding: BindingKind;
  /** Interior stock, mm per SHEET (two pages). 170 gsm matt coated ≈ 0.17 mm. */
  paperCaliperMm: number;
  /** Greyboard per side for casewrap. 0 for softcover. */
  boardThicknessMm: number;
  /**
   * Hinge/joint allowance added to the spine on top of block + boards. Lulu quotes a flat
   * 6.35 mm (0.25") for casewrap, which already includes both boards; when a partner gives
   * boards separately, put the boards in `boardThicknessMm` and the hinge here.
   */
  spineAllowanceMm: number;
  /** Casewrap turn-in (the part folded around the board). 0 for softcover. */
  coverWrapMm: number;
  paperTr: string;
  bindingTr: string;
}

/**
 * ⭐ MVP format. `spineMm` for a 24-page block computes to 8.4 mm, which is the value the
 * frozen contract fixture (`packages/mock/.../commerce.ts`) shows the parent — the two are
 * derived from the same numbers on purpose.
 */
export const KARE21_24_SERT: BookFormatSpec = {
  code: 'kare21_24_sert',
  titleTr: '21×21 cm • 24 sayfa • sert kapak',
  trimWidthMm: 210,
  trimHeightMm: 210,
  bleedMm: 5,
  safeMarginMm: 20,
  gutterMm: 8,
  pageCount: 24,
  binding: 'hardcover_casewrap',
  // 170 gsm matt coated: partner spec sheet gives 0.17 mm/sheet.
  paperCaliperMm: 0.17,
  // Included in the 6.35 mm casewrap allowance below; kept separate so a partner that
  // quotes boards explicitly can be modelled without touching code.
  boardThicknessMm: 0,
  spineAllowanceMm: 6.35,
  coverWrapMm: 17,
  paperTr: '170 gr mat kuşe',
  bindingTr: 'Sert kapak (mat selefon)',
};

/** V1 second format (SPEC §1): 32 pages, softcover. Present so the code stays generic. */
export const KARE21_32_YUMUSAK: BookFormatSpec = {
  code: 'kare21_32_yumusak',
  titleTr: '21×21 cm • 32 sayfa • yumuşak kapak',
  trimWidthMm: 210,
  trimHeightMm: 210,
  bleedMm: 5,
  safeMarginMm: 15,
  gutterMm: 6,
  pageCount: 32,
  binding: 'softcover_perfect',
  paperCaliperMm: 0.17,
  boardThicknessMm: 0,
  // Perfect binding: the spine is the block plus the two cover sheets and the glue film.
  spineAllowanceMm: 0.6,
  coverWrapMm: 0,
  paperTr: '170 gr mat kuşe',
  bindingTr: 'Yumuşak kapak (mat selefon)',
};

export const BOOK_FORMATS: readonly BookFormatSpec[] = [KARE21_24_SERT, KARE21_32_YUMUSAK];

export class UnknownBookFormatError extends Error {
  constructor(readonly code: string) {
    super(`unknown book format: ${code}`);
    this.name = 'UnknownBookFormatError';
  }
}

export function getBookFormat(code: string): BookFormatSpec {
  const format = BOOK_FORMATS.find((f) => f.code === code);
  if (!format) throw new UnknownBookFormatError(code);
  return format;
}

/** Full sheet size including bleed on all four sides, in mm. */
export function pageCanvasMm(format: BookFormatSpec): { widthMm: number; heightMm: number } {
  return {
    widthMm: format.trimWidthMm + format.bleedMm * 2,
    heightMm: format.trimHeightMm + format.bleedMm * 2,
  };
}
