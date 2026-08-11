import { describe, expect, it } from 'vitest';

import {
  APOSTROPHE,
  hyphenateTr,
  hyphenationPoints,
  normalizeTypographyTr,
  syllabifyTr,
} from './turkish';

describe('Türkçe tipografi', () => {
  it('düz kesme işaretini gerçek kesme işaretine çevirir', () => {
    expect(normalizeTypographyTr("Elif'in tilkisi")).toBe(`Elif${APOSTROPHE}in tilkisi`);
  });

  it('tırnakları açık/kapalı çifte, üç noktayı tek karaktere çevirir', () => {
    expect(normalizeTypographyTr('"Sen de gördün, değil mi?"')).toBe(
      '“Sen de gördün, değil mi?”',
    );
    expect(normalizeTypographyTr('Bekledi...')).toBe('Bekledi…');
  });

  it('noktalama önündeki boşluğu ve çift boşlukları temizler', () => {
    expect(normalizeTypographyTr('Elif  geldi , sonra gitti .')).toBe('Elif geldi, sonra gitti.');
  });
});

describe('hece bölme', () => {
  it.each([
    ['kitap', ['ki', 'tap']],
    ['arkadaş', ['ar', 'ka', 'daş']],
    ['Türkçe', ['Türk', 'çe']],
    ['elektrik', ['e', 'lek', 'trik']],
    ['ışık', ['ı', 'şık']],
    ['gözlük', ['göz', 'lük']],
  ])('%s → %s', (word, expected) => {
    expect(syllabifyTr(word)).toEqual(expected);
  });

  it('tek heceli kelimeyi bölmez', () => {
    expect(syllabifyTr('göz')).toEqual(['göz']);
    expect(hyphenationPoints('göz')).toEqual([]);
  });

  it('kesme işaretli özel ismi ASLA bölmez — "Elif-’in" okunmaz bir hatadır', () => {
    expect(hyphenationPoints(`Elif${APOSTROPHE}in`)).toEqual([]);
    expect(hyphenationPoints("Ahmet'in")).toEqual([]);
  });

  it('satır sonunda tek harf bırakmaz', () => {
    // "ışık" → ı-şık; ilk hece tek harf olduğu için o noktadan bölünmez.
    expect(hyphenationPoints('ışık')).toEqual([]);
    expect(hyphenateTr('arkadaşlarım')).toEqual(['ar', 'ka', 'daş', 'la', 'rım']);
  });

  it('çok kısa kelimeleri bölmez', () => {
    expect(hyphenationPoints('kedi')).toEqual([]);
  });
});
