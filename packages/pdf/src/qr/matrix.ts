/**
 * qr/matrix.ts — QR as VECTOR, never as a bitmap.
 *
 * SPEC §9 step 7 is explicit ("QR SVG (VEKTÖR, raster değil)") and the reason is physical:
 * a rasterised QR is resampled by the RIP and its module edges soften, which is exactly the
 * kind of blur a phone camera fails on in a dim bedroom. Drawing each dark module as a
 * filled rectangle keeps the edges mathematically sharp at any press resolution.
 *
 * Two numbers decide whether a printed code actually scans:
 *   · module size ≥ 0.6 mm  — below that, ink spread on coated stock closes the gaps;
 *   · quiet zone = 4 modules — the standard's requirement, and the one most often dropped.
 * `qrPhysicalCheck` returns both so the preflight can refuse a code that is too small.
 */

import QRCode from 'qrcode';

import { mmToPt, ptToMm } from '../units';

/** Error correction. `M` (15%) survives a fingerprint; `H` would inflate the module count. */
export type QrErrorCorrection = 'L' | 'M' | 'Q' | 'H';

export const QR_QUIET_MODULES = 4;
/** Below this a code printed on coated stock stops scanning reliably. */
export const MIN_QR_MODULE_MM = 0.6;
/** A code smaller than this is hard for a parent to aim at, whatever the maths says. */
export const MIN_QR_SIZE_MM = 18;

export interface QrMatrix {
  /** `modules[row][col]`, row 0 at the TOP (as a QR is read). */
  modules: boolean[][];
  /** Side length in modules, quiet zone excluded. */
  size: number;
  url: string;
  errorCorrection: QrErrorCorrection;
}

/** Builds the matrix. Synchronous — `qrcode`'s `create` does no I/O. */
export function buildQrMatrix(url: string, errorCorrection: QrErrorCorrection = 'M'): QrMatrix {
  const qr = QRCode.create(url, { errorCorrectionLevel: errorCorrection });
  const size = qr.modules.size;
  const data = qr.modules.data;

  const modules: boolean[][] = [];
  for (let row = 0; row < size; row += 1) {
    const line: boolean[] = [];
    for (let col = 0; col < size; col += 1) {
      line.push(Boolean(data[row * size + col]));
    }
    modules.push(line);
  }

  return { modules, size, url, errorCorrection };
}

export interface QrPhysicalCheck {
  ok: boolean;
  moduleMm: number;
  sizeMm: number;
  /** Module count including the quiet zone. */
  totalModules: number;
  reasonTr?: string;
}

/** Judges a matrix drawn into a box of `boxPt` points. */
export function qrPhysicalCheck(matrix: QrMatrix, boxPt: number): QrPhysicalCheck {
  const totalModules = matrix.size + QR_QUIET_MODULES * 2;
  const moduleMm = ptToMm(boxPt) / totalModules;
  const sizeMm = ptToMm(boxPt);

  if (sizeMm < MIN_QR_SIZE_MM) {
    return {
      ok: false,
      moduleMm,
      sizeMm,
      totalModules,
      reasonTr: `Karekod ${sizeMm.toFixed(1)} mm basılacak; telefonla okutmak için en az ${MIN_QR_SIZE_MM} mm olmalı.`,
    };
  }
  if (moduleMm < MIN_QR_MODULE_MM) {
    return {
      ok: false,
      moduleMm,
      sizeMm,
      totalModules,
      reasonTr: `Karekodun kareleri ${moduleMm.toFixed(2)} mm; baskıda mürekkep yayılınca okunmaz. En az ${MIN_QR_MODULE_MM} mm gerekir.`,
    };
  }
  return { ok: true, moduleMm, sizeMm, totalModules };
}

/** Smallest box (points) in which `matrix` still satisfies the module-size floor. */
export function minimumQrBoxPt(matrix: QrMatrix): number {
  const totalModules = matrix.size + QR_QUIET_MODULES * 2;
  return Math.max(mmToPt(MIN_QR_SIZE_MM), mmToPt(totalModules * MIN_QR_MODULE_MM));
}
