/**
 * media/image/qa.ts — ⭐ the automatic QA gate (SPEC §8.3: "atlanırsa ürün çöker").
 *
 * Every rendered image is judged before a parent ever sees it. A failure means REGENERATE
 * with a hardened prompt; a second failure means `manual_review` and a placeholder, and the
 * book ships regardless (SPEC §8.4 — partial success is first class).
 *
 * THE HONEST PART. SPEC §8.3 lists five checks. Four are computable from pixels with no ML
 * runtime and are implemented here for real:
 *
 *   · text_leak    — letterform detection (the highest-value check, see below)
 *   · palette_drift— dominant-colour ΔE00 against the style plate
 *   · safe_zone    — edge energy inside the area reserved for typeset text
 *   · blank_frame / dimensions — the cheap sanity checks that catch a broken render
 *
 * The fifth — IDENTITY, an ArcFace embedding cosine against `face_ref` — needs a face
 * recognition model. There is none in this environment and shipping a fake number would be
 * worse than shipping none: a QA gate that always says "identity fine" is indistinguishable
 * from no gate, except that it lies in the audit trail. So identity is an INTERFACE with a
 * null implementation that reports `unavailable`. `IMAGE_QA_STRICT` decides whether an
 * unavailable check blocks (fail closed) or is recorded as a gap (fail open, the default —
 * a missing sidecar must degrade the gate, not stop the product).
 *
 * WHY TEXT DETECTION IS WORTH THE MOST HERE. SPEC §8.4 bans text in illustrations outright
 * because Turkish glyphs are unmeasured on these models; the failure is also the one a
 * parent notices instantly. And unlike identity, it is genuinely computable: letterforms
 * have a signature no illustration has — dense vertical stroke edges packed into a
 * horizontal band with quiet rows above and below it. `textArtifactScore` measures exactly
 * that, and `qa.test.ts` proves it separates rendered text from busy artwork.
 */

import { dominantPalette, paletteDistance, type PaletteEntry } from './color';
import { toRawPixels } from './engine';

export type QaCheckId =
  | 'dimensions'
  | 'blank_frame'
  | 'text_leak'
  | 'palette_drift'
  | 'safe_zone'
  | 'identity'
  | 'provider_block';

export type QaCheckStatus = 'pass' | 'fail' | 'unavailable';

export interface QaCheckResult {
  id: QaCheckId;
  status: QaCheckStatus;
  /** The measured value; written to `story_pages.image_qa` for calibration. */
  score?: number;
  threshold?: number;
  /** English, for ops. */
  detail?: string;
}

export interface QaGateResult {
  passed: boolean;
  checks: QaCheckResult[];
  /** Check ids that failed — fed straight into the retry prompt's hardening block. */
  failedChecks: QaCheckId[];
  /**
   * `story_pages.image_qa` JSONB. Field names match the `ImageQa` interface in
   * packages/db so ops dashboards and the calibration query read one shape.
   */
  imageQa: {
    identityCosine?: number;
    ocrHits?: number;
    paletteDeltaE?: number;
    safeZoneVariance?: number;
    textScore?: number;
    unavailableChecks?: string[];
  };
}

export type TextSafeZone = 'bottom' | 'top' | 'left' | 'right';

export interface QaThresholds {
  /** `IMAGE_QA_TEXT_SCORE_MAX`. */
  textScoreMax: number;
  /** `IMAGE_QA_PALETTE_DELTA_E_MAX`. SPEC §8.3 says 20. */
  paletteDeltaEMax: number;
  /** `IMAGE_QA_SAFE_ZONE_MAX` — edge energy in the reserved zone, relative to the frame. */
  safeZoneMax: number;
  /** `IMAGE_QA_FACE_THRESHOLD`. SPEC §8.3: 0.62, TO BE CALIBRATED on the first 200 pages. */
  identityCosineMin: number;
  /** `IMAGE_QA_STRICT` — treat `unavailable` as `fail`. */
  strict: boolean;
}

export const DEFAULT_QA_THRESHOLDS: QaThresholds = {
  /**
   * Calibrated in `qa.test.ts` against rendered text vs. deliberately busy artwork: text
   * scores 0.49–0.90, the worst non-text case scores 0.19. 0.35 sits in that gap.
   * ⚠️ Synthetic calibration. Re-measure on the first real renders — a false positive
   * costs one retry, which is cheap; a false negative ships a book with letters in it.
   */
  textScoreMax: 0.35,
  paletteDeltaEMax: 20,
  safeZoneMax: 0.35,
  identityCosineMin: 0.62,
  strict: false,
};

/**
 * The pluggable identity check.
 *
 * ⚠️ SPEC §8.3 is explicit that 0.62 is a STARTING POINT to be calibrated against human
 * labels on the first 200 pages, not a constant. Any implementation must expose the raw
 * cosine so that calibration has data to work with.
 */
export interface IdentityScorer {
  /** Cosine similarity in [-1, 1], or `undefined` when no face was found in either image. */
  score(candidate: Uint8Array, faceRef: Uint8Array): Promise<number | undefined>;
}

/**
 * The shipped default: no face-embedding backend, so the check reports `unavailable`.
 *
 * This is a deliberate gap, recorded in `image_qa.unavailableChecks` on every page rather
 * than hidden. Deploying an embedding sidecar and passing an implementation here turns the
 * check on with no other change.
 */
export const NULL_IDENTITY_SCORER: IdentityScorer = {
  async score() {
    return undefined;
  },
};

export interface QaGateInput {
  /** The rendered image. */
  image: Uint8Array;
  /** The style plate, for palette comparison. Omit to skip that check. */
  stylePlate?: Uint8Array;
  /** The face crop, for the identity check. Omit to skip. */
  faceRef?: Uint8Array;
  /** Where the typeset text will go — that area must stay quiet. */
  textSafeZone?: TextSafeZone;
  /** Expected aspect ratio, e.g. 1 for a square page. */
  expectedAspectRatio?: number;
  /** The provider's own refusal, if it refused. Short-circuits everything else. */
  providerBlockedReason?: string;
  /** Minimum acceptable edge; a 256-px "2K page" is a broken render. */
  minEdgePx?: number;
  thresholds?: Partial<QaThresholds>;
  identityScorer?: IdentityScorer;
}

/** Analysis resolution. Every statistic below is scale-invariant by construction. */
const ANALYSIS_EDGE_PX = 640;

/* ── the checks ────────────────────────────────────────────────────────────── */

/**
 * ⭐ Letterform detection without OCR.
 *
 * Text has a signature that illustration does not: many strong horizontal-gradient
 * crossings packed into a few rows (the stroke edges of a line of glyphs), with markedly
 * quieter rows immediately above and below (the interline gaps). Foliage, fur and
 * watercolour texture are busy too, but their business is vertically CONTINUOUS — it does
 * not switch on and off every few rows.
 *
 * So the score is (band density − surrounding density) / (band + surround), gated by the
 * band actually being dense in absolute terms. It returns 0..1 and needs no model,
 * no dictionary, and no language assumption — which matters, because the glyphs we most
 * fear (`ş ğ ı İ`) are the ones an OCR trained on English would miss.
 *
 * It is a HEURISTIC, and `qa.test.ts` measures the separation it achieves rather than
 * asserting it is perfect. False positives cost one retry; the threshold is configurable.
 */
export function textArtifactScore(grey: {
  data: Uint8Array;
  width: number;
  height: number;
}): number {
  const { data, width, height } = grey;
  if (width < 32 || height < 32) return 0;

  /**
   * Row density is measured over a SLIDING HORIZONTAL WINDOW, not the whole row. A shop
   * sign or a stray word in a corner covers an eighth of the frame; averaged across the
   * full width it disappears into the noise floor, which is exactly the leak that reaches
   * production. Locally it is unmistakable.
   */
  const GRADIENT_THRESHOLD = 40;
  const windowPx = Math.max(16, Math.round(width / 8));
  const stride = Math.max(1, Math.round(windowPx / 4));

  const density = new Float64Array(height);
  const prefix = new Int32Array(width + 1);

  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    let running = 0;
    prefix[0] = 0;
    prefix[1] = 0;
    for (let x = 1; x < width; x += 1) {
      if (Math.abs(data[row + x]! - data[row + x - 1]!) > GRADIENT_THRESHOLD) running += 1;
      prefix[x + 1] = running;
    }

    let peak = 0;
    for (let x0 = 0; x0 + windowPx <= width; x0 += stride) {
      const crossings = prefix[x0 + windowPx]! - prefix[x0]!;
      const local = crossings / windowPx;
      if (local > peak) peak = local;
    }
    density[y] = peak;
  }

  // A line of text at book scale occupies a couple of percent of the frame height.
  const bandHeight = Math.max(2, Math.round(height * 0.02));
  const mean = (from: number, to: number): number => {
    const lo = Math.max(0, from);
    const hi = Math.min(height, to);
    if (hi <= lo) return 0;
    let sum = 0;
    for (let y = lo; y < hi; y += 1) sum += density[y]!;
    return sum / (hi - lo);
  };

  let best = 0;
  for (let top = 0; top + bandHeight <= height; top += 1) {
    const band = mean(top, top + bandHeight);
    if (band < 0.08) continue; // Too quiet to be a line of glyphs at all.

    const above = mean(top - bandHeight * 2, top);
    const below = mean(top + bandHeight, top + bandHeight * 3);
    const surround = (above + below) / 2;

    // The discriminator: dense HERE, quiet immediately above and below. Foliage, fur and
    // paper grain are dense too, but their density is vertically continuous.
    const contrast = (band - surround) / (band + surround + 1e-6);
    if (contrast <= 0) continue;

    // Absolute gate: >22% of a window being stroke edges is glyph-dense, not texture.
    const strength = Math.min(1, band / 0.22);
    best = Math.max(best, contrast * strength);
  }

  return Math.min(1, best);
}

/**
 * Edge energy inside the reserved text area, relative to the whole frame.
 * 1.0 means "as busy as the average of the image"; above ~1.35 the typeset Turkish text
 * will sit on top of detail and become unreadable.
 */
export function safeZoneBusyness(
  grey: { data: Uint8Array; width: number; height: number },
  zone: TextSafeZone,
): number {
  const { data, width, height } = grey;

  const region =
    zone === 'bottom'
      ? { x0: 0, x1: width, y0: Math.floor(height * 0.75), y1: height }
      : zone === 'top'
        ? { x0: 0, x1: width, y0: 0, y1: Math.floor(height * 0.25) }
        : zone === 'left'
          ? { x0: 0, x1: Math.floor(width * 0.25), y0: 0, y1: height }
          : { x0: Math.floor(width * 0.75), x1: width, y0: 0, y1: height };

  let zoneSum = 0;
  let zoneCount = 0;
  let allSum = 0;
  let allCount = 0;

  for (let y = 1; y < height; y += 1) {
    for (let x = 1; x < width; x += 1) {
      const i = y * width + x;
      const gradient =
        Math.abs(data[i]! - data[i - 1]!) + Math.abs(data[i]! - data[i - width]!);
      allSum += gradient;
      allCount += 1;
      if (x >= region.x0 && x < region.x1 && y >= region.y0 && y < region.y1) {
        zoneSum += gradient;
        zoneCount += 1;
      }
    }
  }

  if (zoneCount === 0 || allCount === 0) return 0;
  const frameMean = allSum / allCount;
  if (frameMean === 0) return 0;
  return zoneSum / zoneCount / frameMean;
}

/** Standard deviation of luminance. A near-zero value is a blank or solid-colour render. */
export function luminanceSpread(grey: { data: Uint8Array }): number {
  const { data } = grey;
  if (data.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < data.length; i += 1) sum += data[i]!;
  const mean = sum / data.length;
  let variance = 0;
  for (let i = 0; i < data.length; i += 1) variance += (data[i]! - mean) ** 2;
  return Math.sqrt(variance / data.length) / 255;
}

/* ── the gate ──────────────────────────────────────────────────────────────── */

/**
 * Runs every applicable check and returns the verdict plus the numbers behind it.
 *
 * NEVER THROWS on a bad image: a decode failure is a `fail`, because "we could not read
 * what the provider sent" and "the provider sent something wrong" have the same remedy —
 * render it again.
 */
export async function runImageQaGate(input: QaGateInput): Promise<QaGateResult> {
  const thresholds = { ...DEFAULT_QA_THRESHOLDS, ...input.thresholds };
  const checks: QaCheckResult[] = [];

  /* Provider refusal short-circuits: there are no pixels to measure. */
  if (input.providerBlockedReason) {
    checks.push({
      id: 'provider_block',
      status: 'fail',
      detail: input.providerBlockedReason,
    });
    return summarise(checks, thresholds, {});
  }

  let grey: { data: Uint8Array; width: number; height: number; channels: number };
  let colour: { data: Uint8Array; width: number; height: number; channels: number };
  try {
    grey = await toRawPixels(input.image, { maxEdgePx: ANALYSIS_EDGE_PX, greyscale: true });
    colour = await toRawPixels(input.image, { maxEdgePx: ANALYSIS_EDGE_PX });
  } catch (error) {
    checks.push({
      id: 'dimensions',
      status: 'fail',
      detail: `image could not be decoded: ${(error as Error).message}`,
    });
    return summarise(checks, thresholds, {});
  }

  /* 1 ── dimensions */
  const minEdge = input.minEdgePx ?? 0;
  const nativeEdge = Math.max(grey.width, grey.height);
  const aspect = grey.width / Math.max(1, grey.height);
  const expectedAspect = input.expectedAspectRatio;
  const aspectOk = expectedAspect === undefined || Math.abs(aspect - expectedAspect) < 0.06;
  // The analysis buffer is capped, so an undersized source shows up as a smaller edge here.
  const edgeOk = minEdge === 0 || nativeEdge >= Math.min(minEdge, ANALYSIS_EDGE_PX);
  checks.push({
    id: 'dimensions',
    status: aspectOk && edgeOk ? 'pass' : 'fail',
    score: aspect,
    ...(expectedAspect !== undefined ? { threshold: expectedAspect } : {}),
    ...(aspectOk && edgeOk ? {} : { detail: `aspect ${aspect.toFixed(3)}, edge ${nativeEdge}px` }),
  });

  /* 2 ── blank frame */
  const spread = luminanceSpread(grey);
  checks.push({
    id: 'blank_frame',
    status: spread > 0.02 ? 'pass' : 'fail',
    score: spread,
    threshold: 0.02,
    ...(spread > 0.02 ? {} : { detail: 'image is nearly uniform — the render failed' }),
  });

  /* 3 ── text leak (SPEC §8.4: no letterforms at all) */
  const textScore = textArtifactScore(grey);
  checks.push({
    id: 'text_leak',
    status: textScore <= thresholds.textScoreMax ? 'pass' : 'fail',
    score: textScore,
    threshold: thresholds.textScoreMax,
    ...(textScore <= thresholds.textScoreMax
      ? {}
      : { detail: 'letterform-like horizontal bands detected' }),
  });

  /* 4 ── palette drift against the style plate */
  let paletteDeltaE: number | undefined;
  if (input.stylePlate) {
    try {
      const plate = await toRawPixels(input.stylePlate, { maxEdgePx: ANALYSIS_EDGE_PX });
      const candidatePalette: PaletteEntry[] = dominantPalette(colour.data, colour.channels);
      const referencePalette: PaletteEntry[] = dominantPalette(plate.data, plate.channels);
      paletteDeltaE = paletteDistance(candidatePalette, referencePalette);
      checks.push({
        id: 'palette_drift',
        status: paletteDeltaE <= thresholds.paletteDeltaEMax ? 'pass' : 'fail',
        score: paletteDeltaE,
        threshold: thresholds.paletteDeltaEMax,
      });
    } catch (error) {
      checks.push({
        id: 'palette_drift',
        status: 'unavailable',
        detail: `style plate could not be read: ${(error as Error).message}`,
      });
    }
  }

  /* 5 ── safe zone */
  let safeZoneScore: number | undefined;
  if (input.textSafeZone) {
    safeZoneScore = safeZoneBusyness(grey, input.textSafeZone);
    // The configured max is expressed as headroom above parity: 0.35 ⇒ 1.35× the frame mean.
    const limit = 1 + thresholds.safeZoneMax;
    checks.push({
      id: 'safe_zone',
      status: safeZoneScore <= limit ? 'pass' : 'fail',
      score: safeZoneScore,
      threshold: limit,
      ...(safeZoneScore <= limit
        ? {}
        : { detail: `reserved ${input.textSafeZone} zone is ${safeZoneScore.toFixed(2)}× as busy as the frame` }),
    });
  }

  /* 6 ── identity (SPEC §8.3 row 1) */
  let identityCosine: number | undefined;
  if (input.faceRef) {
    const scorer = input.identityScorer ?? NULL_IDENTITY_SCORER;
    identityCosine = await scorer.score(input.image, input.faceRef);
    if (identityCosine === undefined) {
      checks.push({
        id: 'identity',
        status: 'unavailable',
        detail:
          'no face-embedding backend configured; character identity was NOT verified ' +
          '(set IMAGE_QA_STRICT=true to treat this as a failure)',
      });
    } else {
      checks.push({
        id: 'identity',
        status: identityCosine >= thresholds.identityCosineMin ? 'pass' : 'fail',
        score: identityCosine,
        threshold: thresholds.identityCosineMin,
      });
    }
  }

  return summarise(checks, thresholds, {
    ...(identityCosine !== undefined ? { identityCosine } : {}),
    ...(paletteDeltaE !== undefined ? { paletteDeltaE } : {}),
    ...(safeZoneScore !== undefined ? { safeZoneVariance: safeZoneScore } : {}),
    textScore,
  });
}

function summarise(
  checks: QaCheckResult[],
  thresholds: QaThresholds,
  measurements: QaGateResult['imageQa'],
): QaGateResult {
  const unavailable = checks.filter((c) => c.status === 'unavailable').map((c) => c.id);
  const failed = checks
    .filter((c) => c.status === 'fail' || (thresholds.strict && c.status === 'unavailable'))
    .map((c) => c.id);

  return {
    passed: failed.length === 0,
    checks,
    failedChecks: failed,
    imageQa: {
      ...measurements,
      ...(unavailable.length > 0 ? { unavailableChecks: unavailable } : {}),
    },
  };
}
