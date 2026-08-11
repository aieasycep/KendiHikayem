/**
 * media/image/renditions.ts — one render, several files.
 *
 * A rendered page is 2048 px of PNG, which is roughly 4 MB. A parent scrolling a library
 * on a Turkish mobile network must not download that to see a thumbnail, and the reader
 * must not download it twice because the retina variant is a different file. So every page
 * fans out into three WebP renditions plus one JPEG fallback:
 *
 *   thumb  512 px   library grid, share sheet
 *   reader 1024 px  the reading view on a normal-density screen
 *   retina 2048 px  the reading view on a 3× device, and the digital PDF
 *
 * WebP because every device the app supports decodes it and it is ~30% smaller than JPEG
 * at equal quality; one JPEG at reader size as the fallback for anything that cannot.
 *
 * ⚠️ NEVER ENLARGES. `engine.assertNoUpscale` refuses, so a preview-quality source cannot
 * silently become a "retina" file full of invented detail (SPEC §8.4).
 */

import { encode, readInfo, resizeAndEncode, type RasterInfo } from './engine';

export type ScreenRenditionName = 'thumb' | 'reader' | 'retina';

export interface RenditionSpec {
  name: ScreenRenditionName;
  edgePx: number;
  quality: number;
}

/** SPEC §8.2 step 5: "sharp: 3 ekran boyu üret (thumb / reader / retina)". */
export const SCREEN_RENDITIONS: readonly RenditionSpec[] = [
  { name: 'thumb', edgePx: 512, quality: 74 },
  { name: 'reader', edgePx: 1024, quality: 80 },
  { name: 'retina', edgePx: 2048, quality: 82 },
];

export interface Rendition {
  name: ScreenRenditionName | 'fallback';
  bytes: Uint8Array;
  mimeType: string;
  width: number;
  height: number;
  sizeBytes: number;
}

export interface ScreenRenditionSet {
  renditions: Rendition[];
  source: RasterInfo;
}

/**
 * Produces the screen set from one rendered page.
 *
 * Renditions larger than the source are SKIPPED, not upscaled: a 1024-px source yields
 * thumb + reader and no retina, and the client falls back to the largest available. That
 * is the correct degradation — a soft, re-invented face is worse than a smaller image.
 */
export async function buildScreenRenditions(
  image: Uint8Array,
  options: { specs?: readonly RenditionSpec[]; jpegFallback?: boolean } = {},
): Promise<ScreenRenditionSet> {
  const source = await readInfo(image);
  const sourceEdge = Math.max(source.width, source.height);
  const specs = options.specs ?? SCREEN_RENDITIONS;
  const renditions: Rendition[] = [];

  for (const spec of specs) {
    if (spec.edgePx > sourceEdge + 1) continue;
    const { bytes, info } = await resizeAndEncode(
      image,
      { edgePx: spec.edgePx, fit: 'inside', kernel: 'lanczos3' },
      { format: 'webp', quality: spec.quality },
    );
    renditions.push({
      name: spec.name,
      bytes,
      mimeType: 'image/webp',
      width: info.width,
      height: info.height,
      sizeBytes: bytes.byteLength,
    });
  }

  if (options.jpegFallback ?? true) {
    const target = Math.min(1024, sourceEdge);
    const { bytes, info } = await resizeAndEncode(
      image,
      { edgePx: target, fit: 'inside', kernel: 'lanczos3' },
      { format: 'jpeg', quality: 86 },
    );
    renditions.push({
      name: 'fallback',
      bytes,
      mimeType: 'image/jpeg',
      width: info.width,
      height: info.height,
      sizeBytes: bytes.byteLength,
    });
  }

  return { renditions, source };
}

/**
 * The placeholder a page in `manual_review` shows.
 *
 * Deliberately a real image file rather than a client-side blank: the reader lays out
 * pages from image dimensions, and a missing file changes the layout. It carries no text —
 * the Turkish explanation is a UI string, not baked pixels, because baked text cannot be
 * localised, re-worded, or read by a screen reader.
 */
export async function buildPlaceholder(
  edgePx: number,
  colour: { r: number; g: number; b: number } = { r: 237, g: 230, b: 218 },
): Promise<Rendition> {
  const { createSolid } = await import('./engine');
  const png = await createSolid(edgePx, edgePx, colour);
  const { bytes, info } = await encode(png, { format: 'webp', quality: 70 });
  return {
    name: 'reader',
    bytes,
    mimeType: 'image/webp',
    width: info.width,
    height: info.height,
    sizeBytes: bytes.byteLength,
  };
}
