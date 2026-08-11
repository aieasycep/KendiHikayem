/**
 * demo/demo-book.test.ts — the end-to-end proof.
 *
 * Builds the demo story ("Elif ve Tavan Arasındaki Işık", 12 pages, 12 real illustrations)
 * into an actual interior PDF, cover PDF and preview PDF, then re-opens the bytes and
 * asserts what a printer would check: page count, sheet size, TrimBox/BleedBox, embedded
 * font programs, and that the QR codes carry the tokens we minted.
 *
 * It also proves the preflight is not decorative: the SAME story built from the 1024 px
 * demo assets is REFUSED for print, in Turkish, naming the page.
 *
 * Set `KH_PDF_OUT=/some/dir` to keep the produced files for inspection
 * (`pdfinfo`, `pdfimages`, a phone camera pointed at the QR).
 */

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { buildPrintFiles } from '../index';
import { inspectRenderedFonts } from '../preflight/index';
import { ptToMm } from '../units';
import { KARE21_24_SERT } from '../formats';
import { calculateSpine } from '../spine';
import { demoBookInput } from './story';
import { SharpPrintImageSource } from './sharp-image-source';

const OUT_DIR = process.env['KH_PDF_OUT'] ?? mkdtempSync(join(tmpdir(), 'kh-pdf-'));
mkdirSync(OUT_DIR, { recursive: true });
const BASE_URL = 'https://kendihikayem.com';

describe('demo kitabı — gerçek PDF üretimi', () => {
  it(
    'baskıya hazır iç blok, kapak ve önizleme üretir',
    async () => {
      const input = demoBookInput({
        printReady: true,
        dedicationTr: 'Karanlıktan korkup yine de merdiveni çıkan bütün çocuklara.',
        orderNo: 'KH-2026-000001',
        qr: { enabled: true, baseUrl: BASE_URL, renditionLabelTr: 'Anne' },
      });

      const result = await buildPrintFiles(input, {
        images: new SharpPrintImageSource({ allowUpscale: true, quality: 90 }),
        metadata: { producedAt: new Date('2026-08-11T09:00:00Z') },
      });

      expect(result.preflight.warningsTr).toEqual([]);
      expect(result.preflight.ok).toBe(true);
      expect(result.preflight.checks).toEqual({
        dpiOk: true,
        fontsEmbedded: true,
        safeZoneOk: true,
        bleedOk: true,
      });
      expect(result.preflight.stats.minDpi).toBeGreaterThanOrEqual(300);
      expect(result.interiorPdf).toBeDefined();
      expect(result.coverPdf).toBeDefined();
      expect(result.previewPdf).toBeDefined();

      const interior = await PDFDocument.load(result.interiorPdf as Uint8Array);
      expect(interior.getPageCount()).toBe(24);

      const first = interior.getPage(0);
      const media = first.getMediaBox();
      const trim = first.getTrimBox();
      const bleed = first.getBleedBox();
      // 210 mm trim + 2×5 mm bleed = 220 mm sheet.
      expect(Math.round(ptToMm(media.width))).toBe(220);
      expect(Math.round(ptToMm(trim.width))).toBe(210);
      expect(Math.round(ptToMm(bleed.width))).toBe(220);
      // TrimBox ⊆ BleedBox ⊆ MediaBox — the invariant a POD validator checks first.
      expect(trim.x).toBeGreaterThanOrEqual(bleed.x);
      expect(trim.width).toBeLessThanOrEqual(bleed.width);

      const fonts = await inspectRenderedFonts(result.interiorPdf as Uint8Array);
      expect(fonts.embeddedFontPrograms).toBeGreaterThan(0);
      expect(fonts.allEmbedded).toBe(true);
      expect(fonts.families.join(' ')).toMatch(/Nunito/);
      expect(fonts.families.join(' ')).toMatch(/Fraunces/);

      // Cover: one sheet wide enough for two boards plus the spine.
      const cover = await PDFDocument.load(result.coverPdf as Uint8Array);
      expect(cover.getPageCount()).toBe(1);
      const coverBox = cover.getPage(0).getMediaBox();
      const spine = calculateSpine(KARE21_24_SERT);
      const expectedWidthMm =
        KARE21_24_SERT.trimWidthMm * 2 +
        spine.spineMm +
        KARE21_24_SERT.coverWrapMm * 2 +
        KARE21_24_SERT.bleedMm * 2;
      expect(Math.round(ptToMm(coverBox.width))).toBe(Math.round(expectedWidthMm));

      // Preview: reader spreads, so half the page count.
      const preview = await PDFDocument.load(result.previewPdf as Uint8Array);
      expect(preview.getPageCount()).toBe(12);

      // Every story page carries its own revocable token.
      const tokens = Object.values(result.layout.meta.qrTokens);
      expect(tokens).toHaveLength(12);
      expect(new Set(tokens).size).toBe(12);
      for (const token of tokens) expect(token).toMatch(/^[0-9A-HJKMNP-TV-Z]{16}$/);

      writeFileSync(join(OUT_DIR, 'interior.pdf'), result.interiorPdf as Uint8Array);
      writeFileSync(join(OUT_DIR, 'cover.pdf'), result.coverPdf as Uint8Array);
      writeFileSync(join(OUT_DIR, 'preview.pdf'), result.previewPdf as Uint8Array);
      writeFileSync(
        join(OUT_DIR, 'qr-tokens.json'),
        JSON.stringify(
          {
            baseUrl: BASE_URL,
            spineMm: result.layout.spine.spineMm,
            fonts: fonts.families,
            tokens: result.layout.meta.qrTokens,
            preflight: result.preflight,
          },
          null,
          2,
        ),
      );
    },
    240_000,
  );

  it(
    'demo görselleri baskı çözünürlüğünde olmadığı için siparişi KİLİTLER',
    async () => {
      // The demo assets really are 1024 px — ~118 DPI at 21 cm.
      const input = demoBookInput({ printReady: false });
      const result = await buildPrintFiles(input, {
        images: new SharpPrintImageSource({ allowUpscale: false }),
      });

      expect(result.preflight.ok).toBe(false);
      expect(result.preflight.checks.dpiOk).toBe(false);
      expect(result.interiorPdf).toBeUndefined();

      const messages = result.preflight.warningsTr;
      expect(messages[0]).toContain('DPI');
      // The parent is told WHICH story page is the problem, not "preflight failed".
      expect(messages.some((message) => /Masalın \d+\. sayfasındaki görsel/.test(message))).toBe(
        true,
      );
      expect(messages.some((message) => message.includes('Kapaktaki görsel'))).toBe(true);
    },
    120_000,
  );
});
