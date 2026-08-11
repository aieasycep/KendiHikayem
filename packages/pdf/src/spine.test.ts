import { describe, expect, it } from 'vitest';

import { KARE21_24_SERT, KARE21_32_YUMUSAK } from './formats';
import {
  MIN_SPINE_TEXT_MM,
  SpineInputError,
  calculateSpine,
  coverGeometry,
  resolveSpine,
  spineTakesText,
  type SpineSource,
} from './spine';
import { ptToMm } from './units';

describe('sırt kalınlığı', () => {
  it('24 sayfalık sert kapak için 8,4 mm verir — sözleşme fixture’ıyla aynı sayı', () => {
    const spine = calculateSpine(KARE21_24_SERT);
    // 12 yaprak × 0,17 mm = 2,04 mm blok + 6,35 mm casewrap payı.
    expect(spine.sheets).toBe(12);
    expect(spine.blockMm).toBeCloseTo(2.04, 2);
    expect(spine.spineMm).toBe(8.4);
    expect(spine.source).toBe('formula');
  });

  it('sayfa sayısı arttıkça kalınlaşır ve kâğıt kalınlığına doğrusal bağlıdır', () => {
    const twentyFour = calculateSpine(KARE21_24_SERT, 24).spineMm;
    const forty = calculateSpine(KARE21_24_SERT, 40).spineMm;
    expect(forty - twentyFour).toBeCloseTo(8 * KARE21_24_SERT.paperCaliperMm, 1);
  });

  it('4’ün katı olmayan sayfa sayısını reddeder — böyle bir fiziksel kitap yok', () => {
    expect(() => calculateSpine(KARE21_24_SERT, 26)).toThrow(SpineInputError);
    expect(() => calculateSpine(KARE21_24_SERT, 0)).toThrow(SpineInputError);
  });

  it('yumuşak kapakta mukavva payı yoktur, sırt çok daha ince olur', () => {
    const soft = calculateSpine(KARE21_32_YUMUSAK);
    expect(soft.spineMm).toBeLessThan(calculateSpine(KARE21_24_SERT).spineMm);
    expect(spineTakesText(soft.spineMm)).toBe(false);
    expect(spineTakesText(MIN_SPINE_TEXT_MM)).toBe(true);
  });

  it('matbaa kendi ölçüsünü veriyorsa ONUN değeri kullanılır (SPEC §9 adım 6)', async () => {
    const source: SpineSource = {
      spineMm: async () => ({ spineMm: 9.2, ref: 'lulu:cover-dimensions' }),
    };
    const spine = await resolveSpine(KARE21_24_SERT, 24, source);
    expect(spine.spineMm).toBe(9.2);
    expect(spine.source).toBe('provider');
    expect(spine.providerRef).toBe('lulu:cover-dimensions');
    // 0,8 mm fark toleransın üstünde: ops görsün diye rapor edilir, sipariş durmaz.
    expect(spine.disagreementMm).toBeCloseTo(0.8, 2);
  });

  it('matbaa cevap veremezse yerel formüle düşer, hata fırlatmaz', async () => {
    const broken: SpineSource = {
      spineMm: async () => {
        throw new Error('502');
      },
    };
    const spine = await resolveSpine(KARE21_24_SERT, 24, broken);
    expect(spine.spineMm).toBe(8.4);
    expect(spine.source).toBe('formula');
  });
});

describe('kapak geometrisi', () => {
  it('arka kapak + sırt + ön kapak + kapak payı + taşma payı kadar geniştir', () => {
    const spineMm = calculateSpine(KARE21_24_SERT).spineMm;
    const cover = coverGeometry(KARE21_24_SERT, spineMm);

    const expectedWidthMm =
      KARE21_24_SERT.trimWidthMm * 2 +
      spineMm +
      KARE21_24_SERT.coverWrapMm * 2 +
      KARE21_24_SERT.bleedMm * 2;
    expect(ptToMm(cover.canvas.width)).toBeCloseTo(expectedWidthMm, 1);

    // Paneller bitişiktir: arka | sırt | ön, boşluk yok.
    expect(cover.spinePanel.x).toBeCloseTo(cover.backPanel.x + cover.backPanel.width, 5);
    expect(cover.frontPanel.x).toBeCloseTo(cover.spinePanel.x + cover.spinePanel.width, 5);
    expect(ptToMm(cover.spinePanel.width)).toBeCloseTo(spineMm, 2);

    // Güvenli alan sırt tarafında menteşe payı kadar daha içeride.
    expect(cover.frontSafe.x).toBeGreaterThan(cover.frontPanel.x);
    expect(cover.frontSafe.width).toBeLessThan(cover.frontPanel.width);
  });
});
