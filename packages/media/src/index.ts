/**
 * @kendihikayem/media — the pixels half of the illustration pipeline.
 *
 *   image/engine      the single `sharp` import, and the no-upscale rule in code
 *   image/renditions  thumb / reader / retina WebP + a JPEG fallback
 *   image/print       300 DPI, 5 mm bleed, 20 mm safe area, sRGB or CMYK  → `PrintRendition`
 *   image/qa          the SPEC §8.3 gate that decides whether a render may be shown
 *   image/color       CIEDE2000 and dominant-palette extraction, for palette drift
 *   storage/          `ObjectStore`: S3/MinIO in production, filesystem everywhere else
 *
 * The audio half (ffmpeg concat, loudnorm) is A5's and lands beside this.
 *
 * ⚠️ Server-only. `eslint.config.mjs` walls this off from apps/mobile: it imports `sharp`,
 * which is native, and `node:fs`.
 */
export const PACKAGE_NAME = '@kendihikayem/media' as const;

export * from './image/engine';
export * from './image/color';
export * from './image/qa';
export * from './image/renditions';
export * from './image/print';
export * from './storage/types';
export * from './storage/filesystem';
export * from './storage/s3';
export * from './storage/factory';
