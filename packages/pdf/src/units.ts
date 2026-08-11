/**
 * units.ts — millimetres, points and pixels in one place.
 *
 * Print geometry is the part of this package where a silent unit mix-up costs real money:
 * a book that is 3 mm short on the bleed is rejected by the printer AFTER the parent has
 * paid. So every dimension in `packages/pdf` is carried in ONE unit — PostScript points —
 * and every conversion goes through this file. Nothing else may multiply by 2.834.
 *
 *   1 pt = 1/72 inch      1 inch = 25.4 mm      1 mm = 72/25.4 pt ≈ 2.8346 pt
 *
 * The DPI helpers are the preflight's arithmetic: an image is "300 DPI" only relative to
 * the physical box it is placed in, never on its own.
 */

export const PT_PER_INCH = 72;
export const MM_PER_INCH = 25.4;
export const PT_PER_MM = PT_PER_INCH / MM_PER_INCH;

/** The floor a commercial printer expects for photographic content. */
export const TARGET_DPI = 300;
/** Below this we refuse to build; between this and TARGET_DPI we warn (SPEC §9 step 8). */
export const MIN_ACCEPTABLE_DPI = 220;

export const mmToPt = (mm: number): number => mm * PT_PER_MM;
export const ptToMm = (pt: number): number => pt / PT_PER_MM;
export const inchToPt = (inch: number): number => inch * PT_PER_INCH;
export const ptToInch = (pt: number): number => pt / PT_PER_INCH;

/** How many pixels a box needs to hit `dpi`. Rounded UP — never deliver a pixel short. */
export const ptToPx = (pt: number, dpi: number = TARGET_DPI): number =>
  Math.ceil((pt / PT_PER_INCH) * dpi);

export const mmToPx = (mm: number, dpi: number = TARGET_DPI): number =>
  ptToPx(mmToPt(mm), dpi);

/**
 * Effective resolution of `pixels` stretched across `pt` points.
 * This — not the file's own metadata — is what the printer sees.
 */
export const effectiveDpi = (pixels: number, pt: number): number =>
  pt <= 0 ? 0 : (pixels / pt) * PT_PER_INCH;

/** A rectangle in points, origin bottom-left (PDF user space). */
export interface RectPt {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const rect = (x: number, y: number, width: number, height: number): RectPt => ({
  x,
  y,
  width,
  height,
});

/** Shrinks (positive inset) or grows (negative) a rectangle on all four sides. */
export function insetRect(box: RectPt, inset: number): RectPt {
  return {
    x: box.x + inset,
    y: box.y + inset,
    width: box.width - inset * 2,
    height: box.height - inset * 2,
  };
}

export function insetRectSides(
  box: RectPt,
  sides: { top?: number; right?: number; bottom?: number; left?: number },
): RectPt {
  const top = sides.top ?? 0;
  const right = sides.right ?? 0;
  const bottom = sides.bottom ?? 0;
  const left = sides.left ?? 0;
  return {
    x: box.x + left,
    y: box.y + bottom,
    width: box.width - left - right,
    height: box.height - top - bottom,
  };
}

/** True when `inner` is fully inside `outer`, allowing `tolerance` points of slack. */
export function containsRect(outer: RectPt, inner: RectPt, tolerance = 0): boolean {
  return (
    inner.x >= outer.x - tolerance &&
    inner.y >= outer.y - tolerance &&
    inner.x + inner.width <= outer.x + outer.width + tolerance &&
    inner.y + inner.height <= outer.y + outer.height + tolerance
  );
}

/** Smallest distance from `inner`'s edges to `outer`'s edges; negative means it spills out. */
export function edgeSlackPt(outer: RectPt, inner: RectPt): number {
  return Math.min(
    inner.x - outer.x,
    inner.y - outer.y,
    outer.x + outer.width - (inner.x + inner.width),
    outer.y + outer.height - (inner.y + inner.height),
  );
}

/** Rounds to `step` mm — printers quote spine widths in tenths, not in float noise. */
export function roundMm(valueMm: number, step = 0.1): number {
  const factor = 1 / step;
  return Math.round(valueMm * factor) / factor;
}
