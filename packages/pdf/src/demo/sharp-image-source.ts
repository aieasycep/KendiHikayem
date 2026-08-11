/**
 * demo/sharp-image-source.ts — ⚠️ DEV / TEST ONLY.
 *
 * `sharp` is a devDependency of this package and MUST NOT be imported from production code:
 * the real print images come from `packages/media` (A4) through the same
 * `PrintImageSource` port. This implementation exists so the demo book can be built from
 * the WebP demo assets in the repo, and so the DPI preflight can be exercised against real
 * pixels rather than a stub.
 *
 * It performs exactly the steps SPEC §9 step 2 assigns to the media package — Lanczos
 * resample, sRGB, 300 DPI metadata, JPEG quality 92 with 4:4:4 chroma (a children's book is
 * full of flat colour edges; 4:2:0 smears them) — so the geometry it produces is the
 * geometry A4 will produce.
 */

import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

import sharp from 'sharp';

import type {
  LoadedPrintImage,
  PrintImageRequest,
  PrintImageSource,
} from '../images/source';

export interface SharpSourceOptions {
  /**
   * Allow enlarging beyond the source pixels. FALSE is the honest default: an upscale
   * fakes resolution the picture does not have. `true` only in the demo, to simulate the
   * 4K images A4's pipeline will deliver.
   */
  allowUpscale?: boolean;
  quality?: number;
  colorMode?: 'srgb' | 'cmyk';
}

export class SharpPrintImageSource implements PrintImageSource {
  private readonly cache = new Map<string, LoadedPrintImage>();

  constructor(private readonly options: SharpSourceOptions = {}) {}

  async load(request: PrintImageRequest): Promise<LoadedPrintImage> {
    const key = `${request.ref.ref}@${request.targetWidthPx}x${request.targetHeightPx}`;
    const hit = this.cache.get(key);
    if (hit) return hit;

    const input = await readFile(request.ref.ref);
    const wantsCmyk = (this.options.colorMode ?? request.colorMode) === 'cmyk';

    let pipeline = sharp(input).resize({
      width: request.targetWidthPx,
      height: request.targetHeightPx,
      fit: 'cover',
      kernel: 'lanczos3',
      withoutEnlargement: this.options.allowUpscale !== true,
    });

    if (wantsCmyk) pipeline = pipeline.toColourspace('cmyk');

    const { data, info } = await pipeline
      .jpeg({ quality: this.options.quality ?? 92, chromaSubsampling: '4:4:4' })
      .withMetadata({ density: 300 })
      .toBuffer({ resolveWithObject: true });

    const loaded: LoadedPrintImage = {
      bytes: new Uint8Array(data),
      mimeType: 'image/jpeg',
      widthPx: info.width,
      heightPx: info.height,
      colorSpace: wantsCmyk ? 'cmyk' : 'srgb',
      sha256: createHash('sha256').update(data).digest('hex'),
    };
    this.cache.set(key, loaded);
    return loaded;
  }
}
