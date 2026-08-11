/**
 * media/image/print.ts — the print rendition, and the interface A6's PDF builder consumes.
 *
 * SPEC §9 fixes the geometry and this module implements it:
 *
 *   trim   210 mm  → 210 / 25.4 × 300 = 2480 px
 *   bleed  5 mm    → 2 × 59 = 118 px more, so the placed image is 2551 px
 *   safe   20 mm   → 236 px inside the trim, where no text may go
 *
 * The 5 mm bleed is the COMMON DENOMINATOR: it covers Lulu's 3.175 mm and Gelato's 4 mm,
 * so one file goes to any of the three printers. Likewise 20 mm safe area covers Lulu's
 * 19 mm hardcover casewrap.
 *
 * ⚠️ DOWNSAMPLE ONLY. Gemini's 4K output at 21 cm is 496 DPI, so print never needs an
 * upscale — and SPEC §8.4 forbids one, because enlarging a face re-invents it. If the
 * source is too small, `planPrintRendition` says so and the caller re-renders at 4K rather
 * than stretching what it has.
 *
 * BOUNDARY WITH A6: this module produces PIXELS and the geometry that describes them
 * (`PrintRendition`). Page boxes, PDF/X metadata, imposition and preflight belong to
 * `packages/pdf`. `PrintRendition` is the whole contract between the two.
 */

import { encode, extendCanvas, readInfo, resizeAndEncode, toCmyk } from './engine';

export const MM_PER_INCH = 25.4;

export interface PrintGeometry {
  /** `book_formats.trim_w_mm` / `trim_h_mm`. MVP is square, so one value. */
  trimMm: number;
  /** `book_formats.bleed_mm`. */
  bleedMm: number;
  /** `book_formats.safe_mm`. No text inside this margin. */
  safeMm: number;
  /** `book_formats.target_dpi`. */
  dpi: number;
}

/** SPEC §9: the single MVP format, `kare21_24_sert`. */
export const DEFAULT_PRINT_GEOMETRY: PrintGeometry = {
  trimMm: 210,
  bleedMm: 5,
  safeMm: 20,
  dpi: 300,
};

export interface PrintPixelPlan {
  /** Trim size in pixels — the finished page. */
  trimPx: number;
  /** Trim + bleed on both sides: the size the artwork must actually be. */
  bleedPx: number;
  /** Bleed margin on ONE side, in pixels. */
  bleedMarginPx: number;
  /** Safe-area inset from the trim edge, in pixels. */
  safeInsetPx: number;
  /** Effective DPI the source achieves at trim size. Below `dpi` the file is too small. */
  effectiveDpi: number;
  /** False ⇒ re-render at a higher resolution; do NOT upscale (SPEC §8.4). */
  sufficient: boolean;
}

export function mmToPx(mm: number, dpi: number): number {
  return Math.round((mm / MM_PER_INCH) * dpi);
}

export function pxToMm(px: number, dpi: number): number {
  return (px / dpi) * MM_PER_INCH;
}

/**
 * Works out the target pixel geometry and whether the source can reach it.
 *
 * `effectiveDpi` is the number a printer's preflight actually checks: source pixels
 * divided by the physical size they will be printed at. 300 is the floor; SPEC §9 notes
 * a 4K render lands at 496, which is why downsampling is always the right direction.
 */
export function planPrintRendition(
  sourceEdgePx: number,
  geometry: PrintGeometry = DEFAULT_PRINT_GEOMETRY,
): PrintPixelPlan {
  const trimPx = mmToPx(geometry.trimMm, geometry.dpi);
  const bleedMarginPx = mmToPx(geometry.bleedMm, geometry.dpi);
  const bleedPx = trimPx + bleedMarginPx * 2;
  const safeInsetPx = mmToPx(geometry.safeMm, geometry.dpi);

  // What DPI the source achieves once stretched across trim + bleed.
  const physicalInches = (geometry.trimMm + geometry.bleedMm * 2) / MM_PER_INCH;
  const effectiveDpi = sourceEdgePx / physicalInches;

  return {
    trimPx,
    bleedPx,
    bleedMarginPx,
    safeInsetPx,
    effectiveDpi: Math.round(effectiveDpi),
    sufficient: sourceEdgePx >= bleedPx,
  };
}

export type PrintColourSpace = 'srgb' | 'cmyk';

export interface PrintRenditionOptions {
  geometry?: PrintGeometry;
  colourSpace?: PrintColourSpace;
  /** Required for `cmyk`. ISO Coated v2 (ECI) for Turkish coated stock. */
  iccProfilePath?: string;
  /**
   * When the source is already full-bleed (an image rendered at the bleed aspect), set
   * `false`. When the source is a trim-sized image, the outer pixels are mirrored outward
   * to create the bleed — a flat band would show as a frame if the guillotine drifts.
   */
  synthesiseBleed?: boolean;
  format?: 'jpeg' | 'png' | 'tiff';
  quality?: number;
}

/**
 * The artefact `packages/pdf` places on a page. Everything the PDF layer needs to know
 * about the image is here, so it never has to open the file to find out.
 */
export interface PrintRendition {
  bytes: Uint8Array;
  mimeType: string;
  /** Pixel dimensions of the delivered file (trim + bleed). */
  widthPx: number;
  heightPx: number;
  /** Physical placement, in millimetres — what goes into the PDF boxes. */
  trimMm: number;
  bleedMm: number;
  safeMm: number;
  dpi: number;
  colourSpace: PrintColourSpace;
  /** Verified, not assumed: recomputed from the delivered pixels. */
  effectiveDpi: number;
  /** True when the delivered file meets `geometry.dpi` at trim size. */
  meetsDpi: boolean;
}

export class InsufficientResolutionError extends Error {
  constructor(
    readonly sourceEdgePx: number,
    readonly requiredEdgePx: number,
  ) {
    super(
      `print rendition needs ${requiredEdgePx}px but the source is ${sourceEdgePx}px. ` +
        'Re-render at print resolution — upscaling a page re-invents the face (SPEC §8.4).',
    );
    this.name = 'InsufficientResolutionError';
  }
}

/**
 * Builds the print-ready raster: Lanczos downsample to trim+bleed, 300 DPI in the file
 * header, sRGB or CMYK, no upscale ever.
 *
 * @throws InsufficientResolutionError when the source is too small — deliberately, because
 *         the alternative is a soft print nobody notices until the box arrives.
 */
export async function buildPrintRendition(
  image: Uint8Array,
  options: PrintRenditionOptions = {},
): Promise<PrintRendition> {
  const geometry = options.geometry ?? DEFAULT_PRINT_GEOMETRY;
  const colourSpace = options.colourSpace ?? 'srgb';
  const format = options.format ?? 'jpeg';

  const source = await readInfo(image);
  const sourceEdge = Math.max(source.width, source.height);
  const plan = planPrintRendition(sourceEdge, geometry);

  const synthesiseBleed = options.synthesiseBleed ?? false;
  const requiredEdge = synthesiseBleed ? plan.trimPx : plan.bleedPx;
  if (sourceEdge < requiredEdge) {
    throw new InsufficientResolutionError(sourceEdge, requiredEdge);
  }

  let working: Uint8Array;
  if (synthesiseBleed) {
    // Trim-sized artwork: downsample to trim, then mirror the edges outward for bleed.
    const trimmed = await resizeAndEncode(
      image,
      { edgePx: plan.trimPx, fit: 'cover', kernel: 'lanczos3' },
      { format: 'png' },
    );
    const extended = await extendCanvas(
      trimmed.bytes,
      { paddingPx: plan.bleedMarginPx, strategy: 'mirror' },
      { format: 'png' },
    );
    working = extended.bytes;
  } else {
    const scaled = await resizeAndEncode(
      image,
      { edgePx: plan.bleedPx, fit: 'cover', kernel: 'lanczos3' },
      { format: 'png' },
    );
    working = scaled.bytes;
  }

  let output: { bytes: Uint8Array; info: Awaited<ReturnType<typeof readInfo>> };
  if (colourSpace === 'cmyk') {
    if (!options.iccProfilePath) {
      // Without a profile the conversion uses a generic one and black text separates into
      // four inks, which mis-registers on press (SPEC §9 step 9b).
      throw new Error('CMYK output requires an ICC profile path (e.g. ISO Coated v2)');
    }
    output = await toCmyk(working, options.iccProfilePath, { densityDpi: geometry.dpi });
  } else {
    output = await encode(working, {
      format,
      ...(options.quality !== undefined ? { quality: options.quality } : { quality: 92 }),
      densityDpi: geometry.dpi,
      keepProfile: true,
    });
  }

  const deliveredEdge = Math.max(output.info.width, output.info.height);
  const physicalInches = (geometry.trimMm + geometry.bleedMm * 2) / MM_PER_INCH;
  const effectiveDpi = Math.round(deliveredEdge / physicalInches);

  return {
    bytes: output.bytes,
    mimeType: mimeFor(colourSpace, format),
    widthPx: output.info.width,
    heightPx: output.info.height,
    trimMm: geometry.trimMm,
    bleedMm: geometry.bleedMm,
    safeMm: geometry.safeMm,
    dpi: geometry.dpi,
    colourSpace,
    effectiveDpi,
    meetsDpi: effectiveDpi >= geometry.dpi,
  };
}

function mimeFor(colourSpace: PrintColourSpace, format: string): string {
  if (colourSpace === 'cmyk') return 'image/tiff';
  if (format === 'png') return 'image/png';
  if (format === 'tiff') return 'image/tiff';
  return 'image/jpeg';
}

/**
 * The safe-area rectangle in millimetres, measured from the top-left of the BLEED canvas.
 * `packages/pdf` positions text boxes against this; SPEC §9 preflight checks nothing
 * crosses it.
 */
export function safeAreaMm(geometry: PrintGeometry = DEFAULT_PRINT_GEOMETRY): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const offset = geometry.bleedMm + geometry.safeMm;
  const size = geometry.trimMm - geometry.safeMm * 2;
  return { x: offset, y: offset, width: size, height: size };
}
