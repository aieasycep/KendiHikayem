/**
 * media/image/color.ts — the colour maths the palette-drift QA check needs.
 *
 * SPEC §8.3 says: "dominant 5 colours, ΔE against the style plate, `> 20` ⇒ retry".
 * That sentence hides three decisions, all made here:
 *
 *   1. WHICH ΔE. CIEDE2000, not Euclidean RGB distance. RGB distance says a dark navy and
 *      a dark brown are far apart and two light pastels are close; the eye says the
 *      opposite. A threshold of 20 is only meaningful on a perceptual scale.
 *   2. WHICH FIVE COLOURS. Bucketed histogram in RGB, then centroids in Lab. K-means would
 *      be marginally better and is non-deterministic without a fixed seed — and a QA gate
 *      that returns a different verdict on the same image is not a gate.
 *   3. HOW TO COMPARE TWO PALETTES. Greedy nearest-neighbour matching weighted by coverage,
 *      so a background colour that covers 40% of the frame counts more than an accent
 *      that covers 3%.
 *
 * Everything here is pure arithmetic over pixel arrays: no sharp, no I/O, exact tests.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Lab {
  l: number;
  a: number;
  b: number;
}

export interface PaletteEntry {
  rgb: Rgb;
  lab: Lab;
  /** Share of sampled pixels, 0..1. */
  weight: number;
}

/* ── sRGB → CIE Lab (D65) ──────────────────────────────────────────────────── */

function srgbToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function rgbToLab(rgb: Rgb): Lab {
  const r = srgbToLinear(rgb.r);
  const g = srgbToLinear(rgb.g);
  const b = srgbToLinear(rgb.b);

  // sRGB D65 matrix.
  const x = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047;
  const y = r * 0.2126729 + g * 0.7151522 + b * 0.072175;
  const z = (r * 0.0193339 + g * 0.119192 + b * 0.9503041) / 1.08883;

  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);

  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

/**
 * CIEDE2000. Long, unpleasant, and the only ΔE whose thresholds mean anything —
 * ΔE00 ≈ 1 is "just noticeable", ≈ 20 is "clearly a different colour".
 * Reference: Sharma, Wu & Dalal (2005).
 */
export function deltaE2000(one: Lab, two: Lab): number {
  const kL = 1;
  const kC = 1;
  const kH = 1;

  const c1 = Math.hypot(one.a, one.b);
  const c2 = Math.hypot(two.a, two.b);
  const cBar = (c1 + c2) / 2;

  const g = 0.5 * (1 - Math.sqrt(cBar ** 7 / (cBar ** 7 + 25 ** 7)));
  const a1p = (1 + g) * one.a;
  const a2p = (1 + g) * two.a;

  const c1p = Math.hypot(a1p, one.b);
  const c2p = Math.hypot(a2p, two.b);

  const h1p = hueAngle(one.b, a1p);
  const h2p = hueAngle(two.b, a2p);

  const dLp = two.l - one.l;
  const dCp = c2p - c1p;

  let dhp = 0;
  if (c1p * c2p !== 0) {
    const diff = h2p - h1p;
    if (Math.abs(diff) <= 180) dhp = diff;
    else if (diff > 180) dhp = diff - 360;
    else dhp = diff + 360;
  }
  const dHp = 2 * Math.sqrt(c1p * c2p) * Math.sin(toRad(dhp) / 2);

  const lBarP = (one.l + two.l) / 2;
  const cBarP = (c1p + c2p) / 2;

  let hBarP: number;
  if (c1p * c2p === 0) {
    hBarP = h1p + h2p;
  } else if (Math.abs(h1p - h2p) <= 180) {
    hBarP = (h1p + h2p) / 2;
  } else if (h1p + h2p < 360) {
    hBarP = (h1p + h2p + 360) / 2;
  } else {
    hBarP = (h1p + h2p - 360) / 2;
  }

  const t =
    1 -
    0.17 * Math.cos(toRad(hBarP - 30)) +
    0.24 * Math.cos(toRad(2 * hBarP)) +
    0.32 * Math.cos(toRad(3 * hBarP + 6)) -
    0.2 * Math.cos(toRad(4 * hBarP - 63));

  const dTheta = 30 * Math.exp(-(((hBarP - 275) / 25) ** 2));
  const rC = 2 * Math.sqrt(cBarP ** 7 / (cBarP ** 7 + 25 ** 7));
  const rT = -rC * Math.sin(toRad(2 * dTheta));

  const sL = 1 + (0.015 * (lBarP - 50) ** 2) / Math.sqrt(20 + (lBarP - 50) ** 2);
  const sC = 1 + 0.045 * cBarP;
  const sH = 1 + 0.015 * cBarP * t;

  return Math.sqrt(
    (dLp / (kL * sL)) ** 2 +
      (dCp / (kC * sC)) ** 2 +
      (dHp / (kH * sH)) ** 2 +
      rT * (dCp / (kC * sC)) * (dHp / (kH * sH)),
  );
}

function hueAngle(b: number, ap: number): number {
  if (b === 0 && ap === 0) return 0;
  const degrees = (Math.atan2(b, ap) * 180) / Math.PI;
  return degrees >= 0 ? degrees : degrees + 360;
}

function toRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/* ── Dominant palette ──────────────────────────────────────────────────────── */

export interface PaletteOptions {
  /** How many dominant colours to keep. SPEC §8.3 says five. */
  size?: number;
  /** Buckets per channel. 4 → 64 bins, coarse enough to be stable across renders. */
  bucketsPerChannel?: number;
  /**
   * Skip near-white and near-black pixels. Paper white dominates a watercolour frame and
   * would make every palette look identical, hiding exactly the drift we are hunting.
   */
  ignoreExtremes?: boolean;
}

/**
 * Extracts the dominant colours from a packed RGB(A) buffer.
 * DETERMINISTIC: histogram buckets, ties broken by bucket index.
 */
export function dominantPalette(
  pixels: Uint8Array | Uint8ClampedArray,
  channels: number,
  options: PaletteOptions = {},
): PaletteEntry[] {
  const size = options.size ?? 5;
  const buckets = options.bucketsPerChannel ?? 4;
  const ignoreExtremes = options.ignoreExtremes ?? true;
  const step = 256 / buckets;

  const counts = new Map<number, { count: number; r: number; g: number; b: number }>();
  let sampled = 0;

  for (let i = 0; i + channels - 1 < pixels.length; i += channels) {
    const r = pixels[i]!;
    const g = pixels[i + 1]!;
    const b = pixels[i + 2]!;

    if (ignoreExtremes) {
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (luma > 245 || luma < 12) continue;
    }

    const key =
      Math.min(buckets - 1, Math.floor(r / step)) * buckets * buckets +
      Math.min(buckets - 1, Math.floor(g / step)) * buckets +
      Math.min(buckets - 1, Math.floor(b / step));

    const entry = counts.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
    entry.count += 1;
    entry.r += r;
    entry.g += g;
    entry.b += b;
    counts.set(key, entry);
    sampled += 1;
  }

  if (sampled === 0) return [];

  return [...counts.entries()]
    // Count descending, then bucket index ascending: a stable order for equal counts.
    .sort((a, b) => b[1].count - a[1].count || a[0] - b[0])
    .slice(0, size)
    .map(([, entry]) => {
      const rgb = {
        r: Math.round(entry.r / entry.count),
        g: Math.round(entry.g / entry.count),
        b: Math.round(entry.b / entry.count),
      };
      return { rgb, lab: rgbToLab(rgb), weight: entry.count / sampled };
    });
}

/**
 * Distance between two palettes: for each colour of `candidate`, the ΔE00 to its nearest
 * colour in `reference`, averaged with the candidate's coverage weights.
 *
 * Asymmetric on purpose. The question the QA gate asks is "did this page introduce colours
 * the style does not have", not "does this page use every colour the style plate has" — a
 * night scene legitimately omits the plate's daylight colours.
 */
export function paletteDistance(
  candidate: readonly PaletteEntry[],
  reference: readonly PaletteEntry[],
): number {
  if (candidate.length === 0 || reference.length === 0) return 0;

  let weighted = 0;
  let totalWeight = 0;
  for (const entry of candidate) {
    let nearest = Number.POSITIVE_INFINITY;
    for (const ref of reference) {
      nearest = Math.min(nearest, deltaE2000(entry.lab, ref.lab));
    }
    weighted += nearest * entry.weight;
    totalWeight += entry.weight;
  }
  return totalWeight === 0 ? 0 : weighted / totalWeight;
}
