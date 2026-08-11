/**
 * karaoke.test.ts — vurgu motorunun saf fonksiyon testleri.
 * Gerçek mock manifest'i (deterministik zamanlama) ile de doğrulanır.
 */

import { describe, expect, it } from 'vitest';

import { PLAYER_MANIFEST } from '@kendihikayem/mock';
import type { PlayerPage, PlayerToken } from '@kendihikayem/contract';

import {
  activeSentenceIndex,
  activeTokenIndex,
  bedtimeDim,
  bedtimeRate,
  bedtimeVolume,
  canWordHighlight,
  pageIndexAtMs,
  pageProgress,
} from './karaoke';

function token(i: number, s: number, e: number): PlayerToken {
  return { i, t: `k${i}`, charStart: i * 3, charEnd: i * 3 + 2, s, e, isSentenceEnd: false };
}

describe('activeTokenIndex (ikili arama)', () => {
  const tokens = [token(0, 100, 300), token(1, 350, 600), token(2, 900, 1200)];

  it('ilk kelimeden önce -1 döner', () => {
    expect(activeTokenIndex(tokens, 0)).toBe(-1);
    expect(activeTokenIndex(tokens, 99)).toBe(-1);
  });

  it('kelime içinde o kelimeyi bulur', () => {
    expect(activeTokenIndex(tokens, 100)).toBe(0);
    expect(activeTokenIndex(tokens, 299)).toBe(0);
    expect(activeTokenIndex(tokens, 400)).toBe(1);
    expect(activeTokenIndex(tokens, 1_200)).toBe(2);
  });

  it('kelimeler arası boşlukta ÖNCEKİ kelimede kalır (titreme yok)', () => {
    expect(activeTokenIndex(tokens, 320)).toBe(0);
    expect(activeTokenIndex(tokens, 700)).toBe(1);
  });

  it('son kelimeden sonra son kelimede kalır', () => {
    expect(activeTokenIndex(tokens, 99_999)).toBe(2);
  });

  it('boş dizide -1 döner (granularity != word)', () => {
    expect(activeTokenIndex([], 500)).toBe(-1);
  });

  it('gerçek mock manifest üzerinde monotonik ilerler', () => {
    const page = PLAYER_MANIFEST.pages[0];
    expect(page).toBeDefined();
    if (page === undefined) return;
    let previous = -1;
    for (let ms = 0; ms <= page.endMs; ms += 97) {
      const index = activeTokenIndex(page.tokens, ms);
      expect(index).toBeGreaterThanOrEqual(previous);
      previous = index;
    }
    expect(previous).toBe(page.tokens.length - 1);
  });
});

describe('pageIndexAtMs', () => {
  it('mock manifest sayfa sınırlarında doğru sayfayı verir', () => {
    const pages = PLAYER_MANIFEST.pages;
    expect(pageIndexAtMs(pages, 0)).toBe(0);
    const second = pages[1];
    if (second !== undefined) {
      expect(pageIndexAtMs(pages, second.startMs)).toBe(1);
      expect(pageIndexAtMs(pages, second.startMs - 1)).toBe(0);
    }
    expect(pageIndexAtMs(pages, PLAYER_MANIFEST.totalDurationMs + 5_000)).toBe(pages.length - 1);
  });
});

describe('activeSentenceIndex', () => {
  it('cümle başlangıçlarına göre ilerler', () => {
    const page = PLAYER_MANIFEST.pages[0] as PlayerPage;
    expect(activeSentenceIndex(page, page.startMs - 1)).toBe(-1);
    const last = page.sentences[page.sentences.length - 1];
    if (last !== undefined) {
      expect(activeSentenceIndex(page, last.startMs)).toBe(last.i);
    }
  });
});

describe('uyku modu eğrileri', () => {
  const base = { totalPages: 12, fadeStartsAtPage: 10, targetEndVolume: 0.35 };

  it('kararma başlamadan ses tam, ekran açık', () => {
    expect(bedtimeVolume({ ...base, pageNo: 1 })).toBe(1);
    expect(bedtimeDim({ ...base, pageNo: 9 })).toBe(0);
    expect(bedtimeRate({ ...base, pageNo: 5 })).toBe(1);
  });

  it('son sayfada hedef sese iner, tempo yumuşar', () => {
    expect(bedtimeVolume({ ...base, pageNo: 12 })).toBeCloseTo(0.35, 5);
    expect(bedtimeRate({ ...base, pageNo: 12 })).toBeLessThan(1);
    expect(bedtimeRate({ ...base, pageNo: 11 })).toBeLessThan(1);
  });

  it('ses ve ekran monoton azalır, ekran asla tam kararmaz', () => {
    let lastVolume = 1.01;
    let lastDim = -0.01;
    for (let page = 1; page <= 12; page += 1) {
      const volume = bedtimeVolume({ ...base, pageNo: page });
      const dim = bedtimeDim({ ...base, pageNo: page });
      expect(volume).toBeLessThanOrEqual(lastVolume);
      expect(dim).toBeGreaterThanOrEqual(lastDim);
      lastVolume = volume;
      lastDim = dim;
    }
    expect(lastDim).toBeLessThanOrEqual(0.6);
    expect(lastVolume).toBeGreaterThan(0);
  });
});

describe('yardımcılar', () => {
  it('canWordHighlight yalnızca word granularity ile açılır', () => {
    expect(canWordHighlight({ alignment: { source: 'provider', granularity: 'word' } })).toBe(true);
    expect(
      canWordHighlight({ alignment: { source: 'sentence_estimate', granularity: 'sentence' } }),
    ).toBe(false);
    expect(canWordHighlight({ alignment: { source: 'none', granularity: 'none' } })).toBe(false);
  });

  it('pageProgress 0..1 aralığında kalır', () => {
    const page = PLAYER_MANIFEST.pages[0] as PlayerPage;
    expect(pageProgress(page, page.startMs - 100)).toBe(0);
    expect(pageProgress(page, page.endMs + 100)).toBe(1);
    const mid = pageProgress(page, (page.startMs + page.endMs) / 2);
    expect(mid).toBeGreaterThan(0.4);
    expect(mid).toBeLessThan(0.6);
  });
});
