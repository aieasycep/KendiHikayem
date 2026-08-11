/**
 * images/source.ts — the seam between A6 (print) and A4 (image pipeline).
 *
 * ⚠️ INTERFACE OWNERSHIP. `packages/media` (A4) is expected to produce print-ready page
 * images: Lanczos downsample to the exact pixel box, sRGB or ISO-Coated ICC embedded,
 * 300 DPI metadata (SPEC §9 step 2). At the time this package was written that module did
 * not exist yet, so the PORT is defined HERE and A4 only has to implement it:
 *
 *     class MediaPrintImageSource implements PrintImageSource { … }
 *
 * Nothing in `packages/pdf` may import `sharp` or reach for a file path of its own — the
 * renderer receives bytes through this interface and nothing else. That is what keeps the
 * layout engine pure and testable with fixtures.
 */

import type { PrintImageRef } from '../layout/types';

export interface LoadedPrintImage {
  bytes: Uint8Array;
  /** pdf-lib can embed exactly these two. A WebP or TIFF must be converted upstream. */
  mimeType: 'image/jpeg' | 'image/png';
  widthPx: number;
  heightPx: number;
  colorSpace: 'srgb' | 'cmyk' | 'gray';
  /** sha256 of `bytes`, when the source knows it — copied into the build record. */
  sha256?: string;
}

export interface PrintImageRequest {
  ref: PrintImageRef;
  /** The pixel box the layout needs to hit 300 DPI at the placed size. */
  targetWidthPx: number;
  targetHeightPx: number;
  /** `cmyk` asks the source for a converted file; sources may answer sRGB and say so. */
  colorMode: 'srgb' | 'cmyk';
}

export interface PrintImageSource {
  load(request: PrintImageRequest): Promise<LoadedPrintImage>;
}

/** Fails loudly instead of rendering a book with holes in it. */
export class PrintImageMissingError extends Error {
  constructor(readonly ref: string) {
    super(`print image not available: ${ref}`);
    this.name = 'PrintImageMissingError';
  }
}

/**
 * In-memory source for tests and for the demo build: a map from `PrintImageRef.ref` to
 * already-print-ready bytes. Deliberately does NO resizing — resizing is A4's job, and a
 * silent upscale here would defeat the whole DPI preflight.
 */
export class MapPrintImageSource implements PrintImageSource {
  constructor(private readonly entries: Map<string, LoadedPrintImage>) {}

  static from(entries: Record<string, LoadedPrintImage>): MapPrintImageSource {
    return new MapPrintImageSource(new Map(Object.entries(entries)));
  }

  async load(request: PrintImageRequest): Promise<LoadedPrintImage> {
    const image = this.entries.get(request.ref.ref);
    if (!image) throw new PrintImageMissingError(request.ref.ref);
    return image;
  }
}
