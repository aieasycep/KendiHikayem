/**
 * Rendition and print-geometry tests.
 *
 * The print numbers are the ones that cost real money to get wrong: a book printed at
 * 250 DPI, or a page whose artwork stops 2 mm short of the bleed, is a reprint plus
 * shipping plus a parent who was promised a keepsake.
 */

import { describe, expect, it } from 'vitest';
import sharp from 'sharp';

import {
  UpscaleForbiddenError,
  assertNoUpscale,
  cropToSquare,
  createSolid,
  readInfo,
  resizeAndEncode,
} from './engine';
import { SCREEN_RENDITIONS, buildPlaceholder, buildScreenRenditions } from './renditions';
import {
  DEFAULT_PRINT_GEOMETRY,
  InsufficientResolutionError,
  buildPrintRendition,
  mmToPx,
  planPrintRendition,
  safeAreaMm,
} from './print';

async function page(edge: number): Promise<Uint8Array> {
  // A gradient, not a flat fill: flat colours compress to nothing and hide size regressions.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${edge}" height="${edge}">
    <defs><linearGradient id="g"><stop offset="0%" stop-color="#F3E3CE"/><stop offset="100%" stop-color="#8A5A3B"/></linearGradient></defs>
    <rect width="${edge}" height="${edge}" fill="url(#g)"/>
    <circle cx="${edge / 2}" cy="${edge / 2}" r="${edge / 4}" fill="#5B7B4A"/>
  </svg>`;
  return new Uint8Array(await sharp(Buffer.from(svg)).png().toBuffer());
}

/* ── the no-upscale rule ───────────────────────────────────────────────────── */

describe('assertNoUpscale', () => {
  it('permits downsampling and same-size work', () => {
    expect(() => assertNoUpscale(2048, 1024)).not.toThrow();
    expect(() => assertNoUpscale(2048, 2048)).not.toThrow();
    // One pixel of rounding slack, not a licence.
    expect(() => assertNoUpscale(2048, 2049)).not.toThrow();
  });

  it('refuses an enlargement — SPEC §8.4, enlarging re-invents the face', () => {
    expect(() => assertNoUpscale(1024, 2048)).toThrow(UpscaleForbiddenError);
  });

  it('is enforced by the resize path, not just documented', async () => {
    const small = await page(512);
    await expect(
      resizeAndEncode(small, { edgePx: 2048 }, { format: 'webp' }),
    ).rejects.toThrow(UpscaleForbiddenError);
  });
});

/* ── screen renditions ─────────────────────────────────────────────────────── */

describe('buildScreenRenditions', () => {
  it('produces thumb, reader, retina and a JPEG fallback from a 2K page', async () => {
    const { renditions } = await buildScreenRenditions(await page(2048));

    expect(renditions.map((r) => r.name)).toEqual(['thumb', 'reader', 'retina', 'fallback']);
    expect(renditions.filter((r) => r.name !== 'fallback').every((r) => r.mimeType === 'image/webp')).toBe(true);
    expect(renditions.at(-1)!.mimeType).toBe('image/jpeg');

    for (const spec of SCREEN_RENDITIONS) {
      const made = renditions.find((r) => r.name === spec.name)!;
      expect(Math.max(made.width, made.height)).toBe(spec.edgePx);
    }
  });

  it('gets smaller as the rendition gets smaller', async () => {
    const { renditions } = await buildScreenRenditions(await page(2048));
    const thumb = renditions.find((r) => r.name === 'thumb')!;
    const retina = renditions.find((r) => r.name === 'retina')!;
    expect(thumb.sizeBytes).toBeLessThan(retina.sizeBytes);
  });

  it('SKIPS a rendition larger than the source instead of upscaling it', async () => {
    const { renditions } = await buildScreenRenditions(await page(1024));
    expect(renditions.map((r) => r.name)).toEqual(['thumb', 'reader', 'fallback']);
  });

  it('produces a placeholder that is a real image with the right dimensions', async () => {
    // A page in manual_review still has to lay out, so the placeholder is a file, not a gap.
    const placeholder = await buildPlaceholder(1024);
    expect(placeholder.width).toBe(1024);
    expect(placeholder.mimeType).toBe('image/webp');
  });
});

/* ── print geometry ────────────────────────────────────────────────────────── */

describe('planPrintRendition', () => {
  it('matches the numbers SPEC §9 states', () => {
    const plan = planPrintRendition(4096, DEFAULT_PRINT_GEOMETRY);
    // 210 mm at 300 DPI.
    expect(plan.trimPx).toBe(2480);
    // 210 + 2×5 mm = 220 mm → 2598 px. (SPEC's 2551 is 21.6 cm, i.e. a 3 mm bleed era
    // number; the 5 mm common denominator is what the schema and this code use.)
    expect(plan.bleedPx).toBe(mmToPx(220, 300));
    expect(plan.bleedMarginPx).toBe(59);
    expect(plan.safeInsetPx).toBe(236);
  });

  it('says a 4K render is more than enough — upscaling is never needed', () => {
    const plan = planPrintRendition(4096);
    expect(plan.sufficient).toBe(true);
    // SPEC §9: "Gemini 4K @ 21 cm = 496 DPI → upscale asla gerekmez".
    expect(plan.effectiveDpi).toBeGreaterThan(450);
  });

  it('says a 2K screen render is NOT enough for print', () => {
    const plan = planPrintRendition(2048);
    expect(plan.sufficient).toBe(false);
    expect(plan.effectiveDpi).toBeLessThan(300);
  });

  it('puts the safe area 25 mm in from the bleed edge', () => {
    // 5 mm bleed + 20 mm safe: no text may sit outside this rectangle.
    expect(safeAreaMm()).toEqual({ x: 25, y: 25, width: 170, height: 170 });
  });
});

describe('buildPrintRendition', () => {
  it('delivers a 300 DPI file at trim + bleed, with the density in the header', async () => {
    const rendition = await buildPrintRendition(await page(4096));

    expect(rendition.widthPx).toBe(mmToPx(220, 300));
    expect(rendition.meetsDpi).toBe(true);
    expect(rendition.effectiveDpi).toBe(300);

    // The header is what a printer's preflight reads; a 72-DPI header fails there.
    const info = await readInfo(rendition.bytes);
    expect(info.density).toBe(300);
  });

  it('carries the geometry the PDF layer needs, so it never opens the file', async () => {
    const rendition = await buildPrintRendition(await page(4096));
    expect(rendition).toMatchObject({ trimMm: 210, bleedMm: 5, safeMm: 20, dpi: 300 });
  });

  it('synthesises bleed by mirroring when the source is trim-sized', async () => {
    const rendition = await buildPrintRendition(await page(2600), {
      synthesiseBleed: true,
    });
    expect(rendition.widthPx).toBe(mmToPx(210, 300) + 59 * 2);
  });

  it('REFUSES a source that is too small rather than upscaling it', async () => {
    // The alternative is a soft print nobody notices until the box arrives.
    await expect(buildPrintRendition(await page(2048))).rejects.toThrow(
      InsufficientResolutionError,
    );
  });

  it('refuses CMYK without an ICC profile', async () => {
    await expect(
      buildPrintRendition(await page(4096), { colourSpace: 'cmyk' }),
    ).rejects.toThrow(/ICC profile/u);
  });
});

/* ── face-ref crop ─────────────────────────────────────────────────────────── */

describe('cropToSquare', () => {
  it('crops with code, not with a model (SPEC §8.2 step 3b)', async () => {
    const sheet = await page(4096);
    const { info } = await cropToSquare(sheet, { left: 200, top: 150, width: 1400, height: 1400 }, 1024);
    expect(info.width).toBe(1024);
    expect(info.height).toBe(1024);
  });

  it('refuses to enlarge a crop smaller than the requested face-ref size', async () => {
    const sheet = await page(2048);
    await expect(
      cropToSquare(sheet, { left: 0, top: 0, width: 400, height: 400 }, 1024),
    ).rejects.toThrow(UpscaleForbiddenError);
  });
});

describe('createSolid', () => {
  it('makes a decodable image at the requested size', async () => {
    const info = await readInfo(await createSolid(64, 64, { r: 10, g: 20, b: 30 }));
    expect(info).toMatchObject({ width: 64, height: 64, format: 'png' });
  });
});
