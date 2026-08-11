import { describe, expect, it } from 'vitest';

import {
  ablative,
  accusative,
  dative,
  genitive,
  inflect,
  locative,
  possessed,
  possessive,
  softenFinalConsonant,
} from './inflect';

/**
 * The 14 names called out in the brief plus a few more, every one of them exercised in all
 * five cases. If any single cell here regresses, a parent sees broken Turkish on screen.
 */
interface Row {
  name: string;
  gen: string;
  dat: string;
  acc: string;
  loc: string;
  abl: string;
}

const NAMES: Row[] = [
  // vowel-final, front unrounded
  { name: 'Ayşe', gen: "Ayşe'nin", dat: "Ayşe'ye", acc: "Ayşe'yi", loc: "Ayşe'de", abl: "Ayşe'den" },
  { name: 'İnci', gen: "İnci'nin", dat: "İnci'ye", acc: "İnci'yi", loc: "İnci'de", abl: "İnci'den" },
  // vowel-final, back rounded — harmony must follow the LAST vowel, not the first
  { name: 'Göksu', gen: "Göksu'nun", dat: "Göksu'ya", acc: "Göksu'yu", loc: "Göksu'da", abl: "Göksu'dan" },
  { name: 'Utku', gen: "Utku'nun", dat: "Utku'ya", acc: "Utku'yu", loc: "Utku'da", abl: "Utku'dan" },
  // vowel-final, back unrounded
  { name: 'Çağla', gen: "Çağla'nın", dat: "Çağla'ya", acc: "Çağla'yı", loc: "Çağla'da", abl: "Çağla'dan" },
  { name: 'Ada', gen: "Ada'nın", dat: "Ada'ya", acc: "Ada'yı", loc: "Ada'da", abl: "Ada'dan" },
  // "su" takes a y buffer in the genitive, not the regular n
  { name: 'Su', gen: "Su'yun", dat: "Su'ya", acc: "Su'yu", loc: "Su'da", abl: "Su'dan" },
  // consonant-final, voiced ending → -de / -den
  { name: 'Deniz', gen: "Deniz'in", dat: "Deniz'e", acc: "Deniz'i", loc: "Deniz'de", abl: "Deniz'den" },
  { name: 'Ömer', gen: "Ömer'in", dat: "Ömer'e", acc: "Ömer'i", loc: "Ömer'de", abl: "Ömer'den" },
  { name: 'Oğuz', gen: "Oğuz'un", dat: "Oğuz'a", acc: "Oğuz'u", loc: "Oğuz'da", abl: "Oğuz'dan" },
  // consonant-final, voiceless ending → -te / -ten, and NO written softening
  { name: 'Zeynep', gen: "Zeynep'in", dat: "Zeynep'e", acc: "Zeynep'i", loc: "Zeynep'te", abl: "Zeynep'ten" },
  { name: 'Elif', gen: "Elif'in", dat: "Elif'e", acc: "Elif'i", loc: "Elif'te", abl: "Elif'ten" },
  { name: 'Ahmet', gen: "Ahmet'in", dat: "Ahmet'e", acc: "Ahmet'i", loc: "Ahmet'te", abl: "Ahmet'ten" },
  { name: 'Berk', gen: "Berk'in", dat: "Berk'e", acc: "Berk'i", loc: "Berk'te", abl: "Berk'ten" },
  // extra coverage
  { name: 'Yusuf', gen: "Yusuf'un", dat: "Yusuf'a", acc: "Yusuf'u", loc: "Yusuf'ta", abl: "Yusuf'tan" },
  { name: 'Ecrin', gen: "Ecrin'in", dat: "Ecrin'e", acc: "Ecrin'i", loc: "Ecrin'de", abl: "Ecrin'den" },
  { name: 'Zümrüt', gen: "Zümrüt'ün", dat: "Zümrüt'e", acc: "Zümrüt'ü", loc: "Zümrüt'te", abl: "Zümrüt'ten" },
  { name: 'Poyraz', gen: "Poyraz'ın", dat: "Poyraz'a", acc: "Poyraz'ı", loc: "Poyraz'da", abl: "Poyraz'dan" },
];

describe('possessive (genitive)', () => {
  it.each(NAMES)('$name → $gen', ({ name, gen }) => {
    expect(possessive(name)).toBe(gen);
  });

  it('genitive is an alias of possessive', () => {
    expect(genitive('Elif')).toBe("Elif'in");
  });
});

describe('dative', () => {
  it.each(NAMES)('$name → $dat', ({ name, dat }) => {
    expect(dative(name)).toBe(dat);
  });
});

describe('accusative', () => {
  it.each(NAMES)('$name → $acc', ({ name, acc }) => {
    expect(accusative(name)).toBe(acc);
  });
});

describe('locative', () => {
  it.each(NAMES)('$name → $loc', ({ name, loc }) => {
    expect(locative(name)).toBe(loc);
  });
});

describe('ablative', () => {
  it.each(NAMES)('$name → $abl', ({ name, abl }) => {
    expect(ablative(name)).toBe(abl);
  });
});

describe('proper-noun orthography', () => {
  it('never writes consonant softening on a proper noun', () => {
    // "Ahmed'in" and "Sinob'a" are the classic mistakes.
    expect(possessive('Ahmet')).toBe("Ahmet'in");
    expect(dative('Sinop')).toBe("Sinop'a");
    expect(accusative('Zonguldak')).toBe("Zonguldak'ı");
    expect(possessive('Mehmet')).toBe("Mehmet'in");
  });

  it('always separates the suffix with an apostrophe', () => {
    for (const { name } of NAMES) {
      expect(possessive(name)).toContain("'");
      expect(locative(name)).toContain("'");
    }
  });
});

describe('common nouns', () => {
  it('glues the suffix on without an apostrophe and applies softening', () => {
    expect(possessive('kitap', { proper: false })).toBe('kitabın');
    expect(accusative('ağaç', { proper: false })).toBe('ağacı');
    expect(possessive('çocuk', { proper: false })).toBe('çocuğun');
    expect(dative('kanat', { proper: false })).toBe('kanada');
    expect(possessive('renk', { proper: false })).toBe('rengin');
  });

  it('leaves monosyllabic and lexically hard stems alone', () => {
    expect(accusative('at', { proper: false })).toBe('atı');
    expect(accusative('ok', { proper: false })).toBe('oku');
    expect(accusative('sanat', { proper: false })).toBe('sanatı');
    expect(accusative('devlet', { proper: false })).toBe('devleti');
  });

  it('does not soften before a consonant-initial suffix', () => {
    expect(locative('kitap', { proper: false })).toBe('kitapta');
    expect(ablative('çocuk', { proper: false })).toBe('çocuktan');
  });

  it('builds possessive-compound phrases', () => {
    expect(`${possessive('Elif')} ${possessed('masal')}`).toBe("Elif'in masalı");
    expect(`${possessive('Ayşe')} ${possessed('kitap')}`).toBe("Ayşe'nin kitabı");
    expect(`${possessive('Oğuz')} ${possessed('hikaye')}`).toBe("Oğuz'un hikayesi");
  });
});

describe('edge cases', () => {
  it('handles lowercase and uppercase input without breaking harmony', () => {
    expect(possessive('elif')).toBe("elif'in");
    expect(possessive('ELİF')).toBe("ELİF'in");
    expect(possessive('İNCİ')).toBe("İNCİ'nin");
    expect(possessive('IŞIL')).toBe("IŞIL'ın");
  });

  it('trims surrounding whitespace', () => {
    expect(possessive('  Elif  ')).toBe("Elif'in");
  });

  it('returns empty input untouched', () => {
    expect(possessive('')).toBe('');
    expect(dative('   ')).toBe('');
  });

  it('falls back to back harmony for vowel-less input', () => {
    expect(dative('TRT')).toBe("TRT'a");
  });

  it('honours the palatal-l loanword exceptions', () => {
    expect(dative('Kemal')).toBe("Kemal'e");
    expect(possessive('Kemal')).toBe("Kemal'in");
    expect(dative('Bilal')).toBe("Bilal'e");
  });

  it('accepts an explicit harmony override', () => {
    expect(dative('Rıfat', { harmony: 'front' })).toBe("Rıfat'e");
    expect(dative('Rıfat')).toBe("Rıfat'a");
  });

  it('handles multi-word names by inflecting the last token only when asked', () => {
    expect(possessive('Ayşe Nur')).toBe("Ayşe Nur'un");
  });
});

describe('inflect() dispatch', () => {
  it('routes each grammatical case', () => {
    expect(inflect('Elif', 'nominative')).toBe('Elif');
    expect(inflect('Elif', 'genitive')).toBe("Elif'in");
    expect(inflect('Elif', 'dative')).toBe("Elif'e");
    expect(inflect('Elif', 'accusative')).toBe("Elif'i");
    expect(inflect('Elif', 'locative')).toBe("Elif'te");
    expect(inflect('Elif', 'ablative')).toBe("Elif'ten");
  });
});

describe('softenFinalConsonant', () => {
  it('maps p→b, ç→c, t→d, k→ğ, nk→ng', () => {
    expect(softenFinalConsonant('kitap')).toBe('kitab');
    expect(softenFinalConsonant('ağaç')).toBe('ağac');
    expect(softenFinalConsonant('kanat')).toBe('kanad');
    expect(softenFinalConsonant('çocuk')).toBe('çocuğ');
    expect(softenFinalConsonant('renk')).toBe('reng');
    expect(softenFinalConsonant('masal')).toBe('masal');
  });
});
