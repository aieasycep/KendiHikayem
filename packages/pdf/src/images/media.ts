/**
 * images/media.ts — the bridge to `packages/media` (A4), without importing it.
 *
 * A4 delivers `buildPrintRendition(bytes, options) → PrintRendition`: a Lanczos-downsampled,
 * 300 DPI, sRGB-or-CMYK raster at trim+bleed size. That is exactly what the renderer needs,
 * so the bridge is a shape adapter and nothing more.
 *
 * The A4 types are matched STRUCTURALLY (`PrintRenditionLike`) instead of imported, for two
 * reasons: `packages/pdf` stays free of `sharp` and of A4's release cycle, and the worker —
 * which owns both — is the single place the two halves are wired together:
 *
 *     new MediaPrintImageSource({
 *       fetchAsset: (assetId) => storage.get(assetId),
 *       buildRendition: (bytes, options) => buildPrintRendition(bytes, options),
 *     })
 */

import type { LoadedPrintImage, PrintImageRequest, PrintImageSource } from './source';
import { PrintImageMissingError } from './source';

/** The subset of A4's `PrintRendition` this package depends on. */
export interface PrintRenditionLike {
  bytes: Uint8Array;
  mimeType: string;
  widthPx: number;
  heightPx: number;
  colourSpace: 'srgb' | 'cmyk';
  effectiveDpi: number;
  meetsDpi: boolean;
}

export interface MediaSourceDeps {
  /** Resolves `assets.id` (or a signed URL) to the original bytes. */
  fetchAsset(assetId: string): Promise<Uint8Array | undefined>;
  /** `buildPrintRendition` from `packages/media`. */
  buildRendition(
    bytes: Uint8Array,
    options: { colourSpace: 'srgb' | 'cmyk'; synthesiseBleed?: boolean },
  ): Promise<PrintRenditionLike>;
  /** Set when the source images are trim-sized and the bleed has to be mirrored outward. */
  synthesiseBleed?: boolean;
}

export function renditionToPrintImage(rendition: PrintRenditionLike): LoadedPrintImage {
  return {
    bytes: rendition.bytes,
    // pdf-lib embeds JPEG or PNG only; anything else is an upstream configuration error.
    mimeType: rendition.mimeType === 'image/png' ? 'image/png' : 'image/jpeg',
    widthPx: rendition.widthPx,
    heightPx: rendition.heightPx,
    colorSpace: rendition.colourSpace,
  };
}

export class MediaPrintImageSource implements PrintImageSource {
  private readonly cache = new Map<string, LoadedPrintImage>();

  constructor(private readonly deps: MediaSourceDeps) {}

  async load(request: PrintImageRequest): Promise<LoadedPrintImage> {
    const key = `${request.ref.ref}@${request.colorMode}`;
    const hit = this.cache.get(key);
    if (hit) return hit;

    const bytes = await this.deps.fetchAsset(request.ref.ref);
    if (!bytes) throw new PrintImageMissingError(request.ref.ref);

    const rendition = await this.deps.buildRendition(bytes, {
      colourSpace: request.colorMode,
      ...(this.deps.synthesiseBleed !== undefined
        ? { synthesiseBleed: this.deps.synthesiseBleed }
        : {}),
    });
    const image = renditionToPrintImage(rendition);
    this.cache.set(key, image);
    return image;
  }
}
