/**
 * spine.ts — ⭐ THE NUMBER THE PRINTER CHECKS FIRST.
 *
 * If the spine is wrong the cover art wraps onto the wrong face and the job is rejected —
 * after the parent has paid, after the 4K images were re-rendered, days into the promised
 * delivery window. So this file does three things and says so out loud:
 *
 *   1. It computes the spine from PRINTER FACTS (caliper per sheet, board, hinge), never
 *      from a rule of thumb.
 *   2. It prefers the PROVIDER'S OWN answer when the provider has one. SPEC §9 step 6 is
 *      explicit: "Lulu'da cover-dimensions endpoint'ini ÇAĞIR (kendi formülünü YAZMA)".
 *      `SpineSource` is that hook: `packages/providers/print` implements it for a provider
 *      that exposes the endpoint, and the local formula is only the fallback.
 *   3. It refuses silently-wrong inputs: an odd page count, a page count that is not a
 *      multiple of four, a caliper of zero.
 *
 * Formula (fallback):
 *
 *     sheets       = pageCount / 2                 24 pages → 12 sheets
 *     blockMm      = sheets × paperCaliperMm       12 × 0.17 = 2.04 mm
 *     spineMm      = blockMm + 2×boardMm + hinge   2.04 + 0 + 6.35 = 8.39 → 8.4 mm
 *
 * The 6.35 mm (0.25") casewrap allowance already contains both greyboards; a partner that
 * quotes boards separately puts them in `boardThicknessMm` and only the joint in
 * `spineAllowanceMm`. Both paths go through the same function.
 */

import { mmToPt, roundMm, type RectPt } from './units';
import type { BookFormatSpec } from './formats';

export class SpineInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SpineInputError';
  }
}

export interface SpineBreakdown {
  spineMm: number;
  /** Interior block only — useful for the ops work order and for partner e-mails. */
  blockMm: number;
  boardsMm: number;
  allowanceMm: number;
  sheets: number;
  source: 'formula' | 'provider';
  /** Set when a provider answered; kept for the audit trail. */
  providerRef?: string;
  /**
   * Set when the provider's number and ours differ by more than the tolerance. A gap means
   * our caliper is stale — worth an ops warning, never a reason to block a paid order.
   */
  disagreementMm?: number;
}

/**
 * What a print provider that publishes cover dimensions implements. Optional by design:
 * `manual_tr` has no such endpoint, so the formula runs; Lulu does, so it wins.
 */
export interface SpineSource {
  /** Returns undefined when the provider cannot answer — the caller then uses the formula. */
  spineMm(input: {
    formatCode: string;
    pageCount: number;
  }): Promise<{ spineMm: number; ref?: string } | undefined>;
}

export function assertPrintablePageCount(pageCount: number): void {
  if (!Number.isInteger(pageCount) || pageCount <= 0) {
    throw new SpineInputError(`page count must be a positive integer, got ${pageCount}`);
  }
  if (pageCount % 4 !== 0) {
    // A press sheet folds into four pages. 26 pages does not exist as a physical book.
    throw new SpineInputError(
      `page count must be a multiple of 4 (a folded sheet is 4 pages), got ${pageCount}`,
    );
  }
}

/** The local fallback. Pure arithmetic over printer facts. */
export function calculateSpine(
  format: BookFormatSpec,
  pageCount: number = format.pageCount,
): SpineBreakdown {
  assertPrintablePageCount(pageCount);
  if (format.paperCaliperMm <= 0) {
    throw new SpineInputError(`paperCaliperMm must be > 0 for format ${format.code}`);
  }

  const sheets = pageCount / 2;
  const blockMm = sheets * format.paperCaliperMm;
  const boardsMm = format.boardThicknessMm * 2;
  const allowanceMm = format.spineAllowanceMm;

  return {
    spineMm: roundMm(blockMm + boardsMm + allowanceMm, 0.1),
    blockMm: roundMm(blockMm, 0.01),
    boardsMm,
    allowanceMm,
    sheets,
    source: 'formula',
  };
}

/**
 * Provider first, formula second. When both answer and they disagree by more than
 * `toleranceMm`, the PROVIDER wins and the disagreement is reported — a mismatch means our
 * caliper is stale, which is worth an ops alert but must never block a paid order.
 */
export async function resolveSpine(
  format: BookFormatSpec,
  pageCount: number = format.pageCount,
  source?: SpineSource,
  toleranceMm = 0.5,
): Promise<SpineBreakdown> {
  const local = calculateSpine(format, pageCount);
  if (!source) return local;

  const remote = await source
    .spineMm({ formatCode: format.code, pageCount })
    .catch(() => undefined);
  if (!remote || !Number.isFinite(remote.spineMm) || remote.spineMm <= 0) return local;

  const disagreementMm = roundMm(Math.abs(remote.spineMm - local.spineMm), 0.01);
  return {
    ...local,
    spineMm: roundMm(remote.spineMm, 0.1),
    source: 'provider',
    ...(remote.ref ? { providerRef: remote.ref } : {}),
    ...(disagreementMm > toleranceMm ? { disagreementMm } : {}),
  };
}

/**
 * The cover is ONE sheet: back cover + spine + front cover, plus bleed all round and — for
 * casewrap — the turn-in that folds behind the board.
 *
 *   ┌────────── coverWrap ──────────────────────────────────────────┐
 *   │  bleed                                                        │
 *   │   ┌── back cover ──┬─ spine ─┬── front cover ──┐              │
 *   │   │                │         │                 │              │
 *   └───┴────────────────┴─────────┴─────────────────┴──────────────┘
 *
 * All boxes are returned in points, origin bottom-left, ready for pdf-lib.
 */
export interface CoverGeometry {
  /** Whole sheet, what MediaBox/BleedBox becomes. */
  canvas: RectPt;
  /** The finished cover after cutting and folding — TrimBox. */
  trim: RectPt;
  backPanel: RectPt;
  spinePanel: RectPt;
  frontPanel: RectPt;
  /** Front panel minus safe margin and hinge — where the title may live. */
  frontSafe: RectPt;
  backSafe: RectPt;
  spineMm: number;
  wrapMm: number;
}

export function coverGeometry(format: BookFormatSpec, spineMm: number): CoverGeometry {
  const bleed = mmToPt(format.bleedMm);
  const wrap = mmToPt(format.coverWrapMm);
  const spine = mmToPt(spineMm);
  const trimW = mmToPt(format.trimWidthMm);
  const trimH = mmToPt(format.trimHeightMm);
  const safe = mmToPt(format.safeMarginMm);
  // Next to the spine the cover has to clear the hinge groove as well.
  const hinge = mmToPt(format.gutterMm);

  const trimWidth = trimW * 2 + spine + wrap * 2;
  const trimHeight = trimH + wrap * 2;
  const canvas: RectPt = {
    x: 0,
    y: 0,
    width: trimWidth + bleed * 2,
    height: trimHeight + bleed * 2,
  };
  const trim: RectPt = { x: bleed, y: bleed, width: trimWidth, height: trimHeight };

  const panelY = bleed + wrap;
  const backX = bleed + wrap;
  const spineX = backX + trimW;
  const frontX = spineX + spine;

  const backPanel: RectPt = { x: backX, y: panelY, width: trimW, height: trimH };
  const spinePanel: RectPt = { x: spineX, y: panelY, width: spine, height: trimH };
  const frontPanel: RectPt = { x: frontX, y: panelY, width: trimW, height: trimH };

  return {
    canvas,
    trim,
    backPanel,
    spinePanel,
    frontPanel,
    frontSafe: {
      x: frontPanel.x + hinge,
      y: frontPanel.y + safe,
      width: frontPanel.width - hinge - safe,
      height: frontPanel.height - safe * 2,
    },
    backSafe: {
      x: backPanel.x + safe,
      y: backPanel.y + safe,
      width: backPanel.width - hinge - safe,
      height: backPanel.height - safe * 2,
    },
    spineMm,
    wrapMm: format.coverWrapMm,
  };
}

/**
 * Text on the spine is only legible — and only survives binding drift — above ~8 mm.
 * Below that the cover is built without spine text instead of with unreadable text.
 */
export const MIN_SPINE_TEXT_MM = 8;

export const spineTakesText = (spineMm: number): boolean => spineMm >= MIN_SPINE_TEXT_MM;
