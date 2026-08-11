/**
 * preflight.test.ts — the preflight has to REFUSE bad input, not merely describe it.
 *
 * Each case below is a real printer rejection reason, reproduced with the smallest possible
 * layout mutation, and each assertion checks the Turkish sentence the parent will read.
 */

import { describe, expect, it } from 'vitest';

import { buildLayout, type BookBuildInput } from '../layout/engine';
import { loadFontSet } from '../fonts/registry';
import { mmToPt } from '../units';
import type { PrintImageRef, QrBlock } from '../layout/types';
import { PreflightBlockedError, assertPrintable, preflight } from './index';

const fonts = loadFontSet();

/** 220 mm at 300 DPI. */
const PRINT_PX = 2598;

function imageRef(overrides: Partial<PrintImageRef> = {}): PrintImageRef {
  return {
    ref: 'asset://page',
    widthPx: PRINT_PX,
    heightPx: PRINT_PX,
    mimeType: 'image/jpeg',
    colorSpace: 'srgb',
    status: 'ready',
    ...overrides,
  };
}

function bookInput(overrides: Partial<BookBuildInput> = {}): BookBuildInput {
  return {
    formatCode: 'kare21_24_sert',
    story: {
      titleTr: 'Elif ve Tavan Arasındaki Işık',
      heroName: 'Elif',
      ageBand: '6-8',
      lessonTr: 'Korkuyla birlikte bir adım daha atabilmek cesarettir.',
      blurbTr: 'Elif bir gece tavan arasından sızan yumuşacık bir ışık fark eder.',
    },
    pages: Array.from({ length: 12 }, (_, index) => ({
      pageNo: index + 1,
      textTr: `Bu ${index + 1}. sayfanın metnidir. Elif’in tilkisi Fındık da yanındaydı.`,
      image: imageRef({ ref: `asset://page-${index + 1}` }),
    })),
    coverImage: imageRef({ ref: 'asset://cover', widthPx: 5580, heightPx: 3001 }),
    fonts,
    ...overrides,
  };
}

const run = (input: BookBuildInput) => preflight(buildLayout(input), { fonts });

describe('preflight — temiz kitap', () => {
  it('300 DPI görsellerle ve sığan metinle geçer', () => {
    const report = run(bookInput());
    expect(report.ok).toBe(true);
    expect(report.checks).toEqual({
      dpiOk: true,
      fontsEmbedded: true,
      safeZoneOk: true,
      bleedOk: true,
    });
    expect(report.warningsTr).toEqual([]);
    expect(report.stats.pages).toBe(24);
    expect(report.stats.images).toBe(13);
  });
});

describe('preflight — matbaanın reddedeceği durumlar', () => {
  it('düşük çözünürlüklü görseli, sayfasını söyleyerek reddeder', () => {
    const input = bookInput();
    input.pages[2] = {
      pageNo: 3,
      textTr: input.pages[2]?.textTr ?? '',
      image: imageRef({ ref: 'asset://page-3', widthPx: 900, heightPx: 900 }),
    };

    const report = run(input);
    expect(report.ok).toBe(false);
    expect(report.checks.dpiOk).toBe(false);
    const message = report.warningsTr.find((line) => line.includes('Masalın 3. sayfasındaki'));
    expect(message).toMatch(/düşük çözünürlüklü/);
    expect(message).toMatch(/DPI/);
    expect(message).toMatch(/en az 300 DPI gerekir/);
  });

  it('300 DPI’nın biraz altını UYARIR ama siparişi kilitlemez', () => {
    const input = bookInput();
    input.pages[5] = {
      pageNo: 6,
      textTr: input.pages[5]?.textTr ?? '',
      image: imageRef({ ref: 'asset://page-6', widthPx: 2200, heightPx: 2200 }),
    };

    const report = run(input);
    expect(report.ok).toBe(true);
    expect(report.checks.dpiOk).toBe(true);
    expect(report.warningsTr.join(' ')).toMatch(/Masalın 6\. sayfasındaki görsel \d+ DPI/);
  });

  it('insan onayında bekleyen görselle kitabı baskıya bırakmaz', () => {
    const input = bookInput();
    input.pages[7] = {
      pageNo: 8,
      textTr: input.pages[7]?.textTr ?? '',
      image: imageRef({ ref: 'asset://page-8', status: 'manual_review' }),
    };

    const report = run(input);
    expect(report.ok).toBe(false);
    expect(report.warningsTr.join(' ')).toContain('insan onayında bekliyor');
  });

  it('görseli hiç üretilmemiş sayfayı yakalar', () => {
    const input = bookInput();
    input.pages[0] = { pageNo: 1, textTr: 'Metin var ama görsel yok.' };

    const report = run(input);
    expect(report.ok).toBe(false);
    expect(report.warningsTr.join(' ')).toContain('henüz üretilmemiş');
  });

  it('taşma payına ulaşmayan tam sayfa görseli yakalar', () => {
    const layout = buildLayout(bookInput());
    const page = layout.interior.find((entry) => entry.kind === 'story');
    const image = page?.blocks.find((block) => block.kind === 'image');
    if (!page || !image || image.kind !== 'image') throw new Error('fixture bozuk');
    // Görseli 3 mm içeri çek: kesimden sonra kenarda beyaz çizgi kalır.
    image.box = {
      x: image.box.x + mmToPt(3),
      y: image.box.y + mmToPt(3),
      width: image.box.width - mmToPt(6),
      height: image.box.height - mmToPt(6),
    };

    const report = preflight(layout, { fonts });
    expect(report.ok).toBe(false);
    expect(report.checks.bleedOk).toBe(false);
    expect(report.warningsTr.join(' ')).toContain('taşma payına');
  });

  it('güvenli alanın dışına taşan metni yakalar', () => {
    const layout = buildLayout(bookInput());
    const page = layout.interior.find((entry) => entry.kind === 'story');
    const text = page?.blocks.find((block) => block.kind === 'text');
    if (!page || !text || text.kind !== 'text') throw new Error('fixture bozuk');
    text.box = { ...text.box, x: text.box.x - mmToPt(12) };

    const report = preflight(layout, { fonts });
    expect(report.ok).toBe(false);
    expect(report.checks.safeZoneOk).toBe(false);
    expect(report.warningsTr.join(' ')).toContain('güvenli alanın');
  });

  it('sayfaya sığmayan metni kilitler', () => {
    const input = bookInput();
    input.pages[4] = {
      pageNo: 5,
      textTr: 'Elif merdiveni çıktı ve ışığı gördü. '.repeat(60),
      image: imageRef({ ref: 'asset://page-5' }),
    };

    const report = run(input);
    expect(report.ok).toBe(false);
    expect(report.warningsTr.join(' ')).toContain('sayfaya sığmıyor');
  });

  it('yazı tipinin çizemediği karakteri yakalar (kutu basılmasın)', () => {
    const input = bookInput();
    input.pages[1] = {
      pageNo: 2,
      textTr: 'Elif ve tilkisi 🦊 birlikte çıktılar.',
      image: imageRef({ ref: 'asset://page-2' }),
    };

    const report = run(input);
    expect(report.ok).toBe(false);
    expect(report.checks.fontsEmbedded).toBe(false);
    expect(report.warningsTr.join(' ')).toContain('çizemediği karakterler');
  });

  it('okunmayacak kadar küçük karekodu reddeder', () => {
    const layout = buildLayout(
      bookInput({
        qr: { enabled: true, baseUrl: 'https://kendihikayem.com', renditionLabelTr: 'Anne' },
      }),
    );
    const page = layout.interior.find((entry) => entry.qrToken !== undefined);
    const qr = page?.blocks.find((block): block is QrBlock => block.kind === 'qr');
    if (!page || !qr) throw new Error('fixture bozuk');
    qr.box = { ...qr.box, width: mmToPt(10), height: mmToPt(10) };

    const report = preflight(layout, { fonts });
    expect(report.ok).toBe(false);
    expect(report.warningsTr.join(' ')).toMatch(/Karekod|karekod/);
  });

  it('formata sığmayan masalı kilitler', () => {
    const input = bookInput({
      pages: Array.from({ length: 30 }, (_, index) => ({
        pageNo: index + 1,
        textTr: 'Kısa bir cümle.',
        image: imageRef({ ref: `asset://page-${index + 1}` }),
      })),
    });

    const report = run(input);
    expect(report.ok).toBe(false);
    expect(report.warningsTr.join(' ')).toContain('sığmıyor');
  });

  it('assertPrintable temiz olmayan raporda ilk Türkçe hatayı fırlatır', () => {
    const input = bookInput();
    input.pages[0] = { pageNo: 1, textTr: 'Görselsiz sayfa.' };
    const report = run(input);
    expect(() => assertPrintable(report)).toThrow(PreflightBlockedError);
  });
});

describe('preflight — renk profili', () => {
  it('CMYK istenirken RGB görselleri uyarır ama kilitlemez', () => {
    const report = preflight(buildLayout(bookInput({ colorMode: 'cmyk' })), { fonts });
    expect(report.ok).toBe(true);
    expect(report.warningsTr.join(' ')).toContain('RGB');
  });
});
