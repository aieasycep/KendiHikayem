/**
 * render/color.ts — sRGB in, printer colour out.
 *
 * MVP ships sRGB (SPEC §9 step 9a: Lulu/Gelato accept it and convert themselves), but a
 * Turkish printer may ask for CMYK. The layout carries sRGB values and the renderer
 * converts, so the switch is one option rather than a second palette.
 *
 * ⚠️ THE BLACK RULE. Naive RGB→CMYK turns near-black text into c/m/y/k all around 0.8 —
 * "rich black". Four inks need perfect registration; at 18 pt on a press that drifts, the
 * letters look doubled. Anything that is neutral and dark is therefore forced to K-ONLY,
 * which is the same thing SPEC §9 buys with Ghostscript's `-dDeviceGrayToK=true`.
 */

import { cmyk, rgb, type Color } from 'pdf-lib';

import type { ColorMode, Rgb } from '../layout/types';

/** Below this the colour counts as "dark", above it as "light" for the neutral test. */
const NEUTRAL_TOLERANCE = 0.06;

export function isNeutral(color: Rgb): boolean {
  const max = Math.max(color.r, color.g, color.b);
  const min = Math.min(color.r, color.g, color.b);
  return max - min <= NEUTRAL_TOLERANCE;
}

export interface Cmyk {
  c: number;
  m: number;
  y: number;
  k: number;
}

/**
 * Device conversion with the neutral special case. Not colour-managed — a real ICC
 * transform belongs in the Ghostscript step (`ghostscript/pdfx.ts`), which has the ISO
 * Coated profile. This is the "good enough for type and flat panels" path.
 */
export function rgbToCmyk(color: Rgb): Cmyk {
  if (isNeutral(color)) {
    // Neutral → K only. Text, rules and greys all take this branch.
    return { c: 0, m: 0, y: 0, k: 1 - (color.r + color.g + color.b) / 3 };
  }
  const k = 1 - Math.max(color.r, color.g, color.b);
  if (k >= 1) return { c: 0, m: 0, y: 0, k: 1 };
  return {
    c: (1 - color.r - k) / (1 - k),
    m: (1 - color.g - k) / (1 - k),
    y: (1 - color.b - k) / (1 - k),
    k,
  };
}

export function toPdfColor(color: Rgb, mode: ColorMode): Color {
  if (mode === 'srgb') return rgb(color.r, color.g, color.b);
  const converted = rgbToCmyk(color);
  return cmyk(converted.c, converted.m, converted.y, converted.k);
}
