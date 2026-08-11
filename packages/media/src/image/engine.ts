/**
 * media/image/engine.ts — the only file in the repo that imports `sharp`.
 *
 * Two reasons for the funnel:
 *
 *   1. SPEC §8.4 forbids CREATIVE upscaling ("Magnific, Clarity, Recraft Creative") and,
 *      more importantly, forbids upscaling at all in our own code: a 2K page enlarged to
 *      4K for print produces a soft, re-hallucinated face. `assertNoUpscale()` lives here
 *      and every resize path goes through it, so the rule is a thrown error rather than a
 *      paragraph in a document.
 *   2. sharp is native. Keeping it behind one module means the rest of the package is
 *      testable arithmetic and the dependency surface is one import away from being
 *      swapped if a platform ever cannot build it.
 */

import sharp from 'sharp';
import type { Sharp } from 'sharp';

export type RasterFormat = 'png' | 'webp' | 'jpeg' | 'tiff';

export interface RasterInfo {
  width: number;
  height: number;
  format: string;
  channels: number;
  /** Pixels per inch as recorded in the file; 72 when the encoder wrote nothing. */
  density?: number;
  space?: string;
  hasAlpha: boolean;
  sizeBytes: number;
}

export interface RawPixels {
  data: Uint8Array;
  width: number;
  height: number;
  channels: number;
}

export class UpscaleForbiddenError extends Error {
  constructor(from: number, to: number) {
    super(
      `refusing to upscale ${from}px → ${to}px. SPEC §8.4: enlarging a rendered page ` +
        're-invents the face. Render at the higher resolution instead, then downsample.',
    );
    this.name = 'UpscaleForbiddenError';
  }
}

/**
 * ⭐ The rule, in code. Called by every resize in this package.
 *
 * A one-pixel rounding tolerance: a 2048-px source asked for 2049 is a rounding artefact,
 * not an upscale. Anything beyond that is the mistake this exists to prevent.
 */
export function assertNoUpscale(sourceEdgePx: number, targetEdgePx: number): void {
  if (targetEdgePx > sourceEdgePx + 1) {
    throw new UpscaleForbiddenError(sourceEdgePx, targetEdgePx);
  }
}

export async function readInfo(bytes: Uint8Array): Promise<RasterInfo> {
  const metadata = await sharp(Buffer.from(bytes)).metadata();
  return {
    width: metadata.width ?? 0,
    height: metadata.height ?? 0,
    format: metadata.format ?? 'unknown',
    channels: metadata.channels ?? 0,
    ...(metadata.density !== undefined ? { density: metadata.density } : {}),
    ...(metadata.space !== undefined ? { space: metadata.space } : {}),
    hasAlpha: metadata.hasAlpha ?? false,
    sizeBytes: bytes.byteLength,
  };
}

/**
 * Decodes to raw pixels for analysis, optionally downscaled first.
 *
 * The QA gate reads pixels at a fixed analysis width rather than at native size: a 4K page
 * is 16 MB of RGB, thirteen of them per book, and the statistics the gate computes are
 * scale-invariant by construction.
 */
export async function toRawPixels(
  bytes: Uint8Array,
  options: { maxEdgePx?: number; greyscale?: boolean } = {},
): Promise<RawPixels> {
  let pipeline = sharp(Buffer.from(bytes));
  if (options.maxEdgePx) {
    pipeline = pipeline.resize({
      width: options.maxEdgePx,
      height: options.maxEdgePx,
      fit: 'inside',
      // Never enlarges — the analysis path must not invent detail either.
      withoutEnlargement: true,
      kernel: 'lanczos3',
    });
  }
  if (options.greyscale) pipeline = pipeline.greyscale();

  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
  return {
    data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
    width: info.width,
    height: info.height,
    channels: info.channels,
  };
}

export interface EncodeOptions {
  format: RasterFormat;
  quality?: number;
  /** Written into the file's metadata; the print pipeline depends on it being right. */
  densityDpi?: number;
  /** `sharp` strips ICC by default; print output must keep it. */
  keepProfile?: boolean;
}

export interface ResizeOptions {
  /** Target longest edge. Must not exceed the source's — see `assertNoUpscale`. */
  edgePx: number;
  fit?: 'cover' | 'contain' | 'inside';
  /** Lanczos3 for photographic downsampling; SPEC §9 step 2 names it. */
  kernel?: 'lanczos3' | 'mitchell' | 'nearest';
}

/** Resize + encode in one pass. Rejects any request that would enlarge the source. */
export async function resizeAndEncode(
  bytes: Uint8Array,
  resize: ResizeOptions,
  encode: EncodeOptions,
): Promise<{ bytes: Uint8Array; info: RasterInfo }> {
  const source = await readInfo(bytes);
  assertNoUpscale(Math.max(source.width, source.height), resize.edgePx);

  let pipeline = sharp(Buffer.from(bytes)).resize({
    width: resize.edgePx,
    height: resize.edgePx,
    fit: resize.fit ?? 'inside',
    withoutEnlargement: true,
    kernel: resize.kernel ?? 'lanczos3',
  });

  pipeline = applyEncoding(pipeline, encode);
  const out = await pipeline.toBuffer();
  return { bytes: new Uint8Array(out), info: await readInfo(new Uint8Array(out)) };
}

/** Encode without resizing. */
export async function encode(
  bytes: Uint8Array,
  options: EncodeOptions,
): Promise<{ bytes: Uint8Array; info: RasterInfo }> {
  const out = await applyEncoding(sharp(Buffer.from(bytes)), options).toBuffer();
  return { bytes: new Uint8Array(out), info: await readInfo(new Uint8Array(out)) };
}

function applyEncoding(pipeline: Sharp, options: EncodeOptions): Sharp {
  let next = pipeline;
  if (options.densityDpi !== undefined) {
    // `withMetadata` is what actually writes the density into the file — setting it on the
    // pipeline alone leaves a 72-DPI header, and a printer believes the header.
    next = next.withMetadata({ density: options.densityDpi });
  } else if (options.keepProfile) {
    next = next.withMetadata();
  }

  switch (options.format) {
    case 'webp':
      return next.webp({ quality: options.quality ?? 82, effort: 4 });
    case 'jpeg':
      return next.jpeg({ quality: options.quality ?? 88, mozjpeg: true, chromaSubsampling: '4:4:4' });
    case 'tiff':
      return next.tiff({ quality: options.quality ?? 90, compression: 'lzw' });
    case 'png':
    default:
      return next.png({ compressionLevel: 9 });
  }
}

export interface ExtendOptions {
  /** Pixels added on every side. Print bleed is the only caller. */
  paddingPx: number;
  /**
   * `edge` mirrors the outermost pixels outward — the right choice for bleed, because a
   * flat colour band would show as a visible frame if the trim drifts.
   */
  strategy?: 'edge' | 'mirror';
}

/** Grows a canvas outward. Not a resize: the artwork keeps its pixel dimensions. */
export async function extendCanvas(
  bytes: Uint8Array,
  options: ExtendOptions,
  encodeOptions: EncodeOptions,
): Promise<{ bytes: Uint8Array; info: RasterInfo }> {
  const pad = Math.round(options.paddingPx);
  const pipeline = sharp(Buffer.from(bytes)).extend({
    top: pad,
    bottom: pad,
    left: pad,
    right: pad,
    extendWith: options.strategy === 'mirror' ? 'mirror' : 'copy',
  });
  const out = await applyEncoding(pipeline, encodeOptions).toBuffer();
  return { bytes: new Uint8Array(out), info: await readInfo(new Uint8Array(out)) };
}

export interface CropRegion {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Crops a region and resizes it to a square.
 *
 * This is SPEC §8.2 step 3b — the `face_ref` crop — and the SPEC is emphatic that it is
 * done "with code, not an API call": a model asked to "crop the face" redraws it.
 */
export async function cropToSquare(
  bytes: Uint8Array,
  region: CropRegion,
  edgePx: number,
  encodeOptions: EncodeOptions = { format: 'png' },
): Promise<{ bytes: Uint8Array; info: RasterInfo }> {
  assertNoUpscale(Math.min(region.width, region.height), edgePx);

  const pipeline = sharp(Buffer.from(bytes))
    .extract({
      left: Math.round(region.left),
      top: Math.round(region.top),
      width: Math.round(region.width),
      height: Math.round(region.height),
    })
    .resize({ width: edgePx, height: edgePx, fit: 'cover', kernel: 'lanczos3' });

  const out = await applyEncoding(pipeline, encodeOptions).toBuffer();
  return { bytes: new Uint8Array(out), info: await readInfo(new Uint8Array(out)) };
}

/** Converts to a CMYK working space with an ICC profile. Print only (SPEC §9 step 2). */
export async function toCmyk(
  bytes: Uint8Array,
  iccProfilePath: string,
  options: { densityDpi: number },
): Promise<{ bytes: Uint8Array; info: RasterInfo }> {
  const out = await sharp(Buffer.from(bytes))
    .withMetadata({ density: options.densityDpi, icc: iccProfilePath })
    .toColourspace('cmyk')
    .tiff({ compression: 'lzw' })
    .toBuffer();
  return { bytes: new Uint8Array(out), info: await readInfo(new Uint8Array(out)) };
}

/** Solid-colour canvas. Placeholders and test fixtures. */
export async function createSolid(
  width: number,
  height: number,
  colour: { r: number; g: number; b: number },
  options: EncodeOptions = { format: 'png' },
): Promise<Uint8Array> {
  const pipeline = sharp({
    create: { width, height, channels: 3, background: colour },
  });
  return new Uint8Array(await applyEncoding(pipeline, options).toBuffer());
}
