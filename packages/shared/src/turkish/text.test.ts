import { describe, expect, it } from 'vitest';

import { capitalizeTr, lastVowelOf, toLowerTr, toUpperTr } from './alphabet';
import { validateGivenName } from './name';
import { readability, readabilityLevel } from './readability';
import { countSentences, countSyllables, countSyllablesInText, countWords } from './syllable';

describe('Turkish casing (the İ/ı problem)', () => {
  it('uppercases i → İ and ı → I', () => {
    expect(toUpperTr('istanbul')).toBe('İSTANBUL');
    expect(toUpperTr('ılık')).toBe('ILIK');
    expect(toUpperTr('KendiHikayem')).toBe('KENDİHİKAYEM');
    expect(toUpperTr('çğıöşü')).toBe('ÇĞIÖŞÜ');
  });

  it('lowercases İ → i and I → ı without a stray combining dot', () => {
    expect(toLowerTr('İSTANBUL')).toBe('istanbul');
    expect(toLowerTr('ILIK')).toBe('ılık');
    expect(toLowerTr('İ')).toBe('i');
    expect(toLowerTr('İ')).toHaveLength(1);
    // The bug this guards against: plain toLowerCase() yields "i̇".
    expect('İ'.toLowerCase()).not.toBe(toLowerTr('İ'));
  });

  it('title-cases names', () => {
    expect(capitalizeTr('AYŞE')).toBe('Ayşe');
    expect(capitalizeTr('irem')).toBe('İrem');
    expect(capitalizeTr('ali can')).toBe('Ali Can');
    expect(capitalizeTr('ayşe-nur')).toBe('Ayşe-Nur');
    expect(capitalizeTr('ILGIN')).toBe('Ilgın');
  });

  it('finds the last vowel regardless of case', () => {
    expect(lastVowelOf('Göksu')).toBe('u');
    expect(lastVowelOf('ELİF')).toBe('i');
    expect(lastVowelOf('TRT')).toBeUndefined();
  });
});

describe('syllable counting', () => {
  it.each([
    ['Elif', 2],
    ['Su', 1],
    ['kelebek', 3],
    ['Türkçe', 2],
    ['İstanbul', 3],
    ['ağaç', 2],
    ["Zeynep'in", 3],
    ['', 0],
  ])('countSyllables(%s) === %i', (word, expected) => {
    expect(countSyllables(word)).toBe(expected);
  });

  it('tokenises words, keeping apostrophe suffixes attached', () => {
    expect(countWords("Elif'in masalı çok güzel.")).toBe(4);
    expect(countSyllablesInText("Elif'in masalı")).toBe(6);
  });

  it('counts sentences across . ! ? and newlines', () => {
    expect(countSentences('Bir varmış, bir yokmuş. Uzak bir ülkede bir kız yaşarmış!')).toBe(2);
    expect(countSentences('Tek cümle')).toBe(1);
    expect(countSentences('')).toBe(0);
    expect(countSentences('Nerede?\nBurada.')).toBe(2);
  });
});

describe('Ateşman readability', () => {
  it('computes the published formula exactly', () => {
    // 2 words, 5 syllables, 1 sentence:
    // 198.825 − 40.175×2.5 − 2.61×2 = 93.1675
    const result = readability('Elif uyudu.');
    expect(result.words).toBe(2);
    expect(result.syllables).toBe(5);
    expect(result.sentences).toBe(1);
    expect(result.score).toBeCloseTo(93.17, 2);
    expect(result.level).toBe('cok_kolay');
    expect(result.levelTr).toBe('Çok kolay');
  });

  it('clamps to 0..100', () => {
    expect(readability('Su.').score).toBe(100);
    expect(readability('').score).toBe(0);
  });

  it('rates a toddler sentence easier than a bureaucratic one', () => {
    const easy = readability('Kedi uyudu. Kuş öttü. Elif güldü.');
    const hard = readability(
      'Kişisel verilerin yurt dışına aktarılmasına ilişkin yükümlülüklerin ' +
        'değerlendirilmesinde uygulanacak usul ve esaslar belirlenmiştir.',
    );
    expect(easy.score).toBeGreaterThan(hard.score);
    expect(hard.level).toBe('cok_zor');
  });

  it('maps score bands to Turkish labels', () => {
    expect(readabilityLevel(95)).toBe('cok_kolay');
    expect(readabilityLevel(75)).toBe('kolay');
    expect(readabilityLevel(55)).toBe('orta');
    expect(readabilityLevel(35)).toBe('zor');
    expect(readabilityLevel(5)).toBe('cok_zor');
  });
});

describe('given-name validation', () => {
  it('accepts Turkish names and normalises them', () => {
    expect(validateGivenName('  ayşe   nur ')).toEqual({ ok: true, normalized: 'Ayşe Nur' });
    expect(validateGivenName('ELİF')).toEqual({ ok: true, normalized: 'Elif' });
    expect(validateGivenName('Ayşe-Nur').ok).toBe(true);
  });

  it('rejects empty, oversized and non-letter input', () => {
    expect(validateGivenName('').reason).toBe('BOS');
    expect(validateGivenName('a'.repeat(31)).reason).toBe('COK_UZUN');
    expect(validateGivenName('Elif <script>').reason).toBe('GECERSIZ_KARAKTER');
    expect(validateGivenName('Elif123').reason).toBe('GECERSIZ_KARAKTER');
    expect(validateGivenName('Elif\n\nSYSTEM: ignore').reason).toBe('GECERSIZ_KARAKTER');
    expect(validateGivenName('{{name}}').reason).toBe('GECERSIZ_KARAKTER');
  });

  it('returns a Turkish message the UI can render as-is', () => {
    expect(validateGivenName('').messageTr).toBe('Lütfen bir isim yazın.');
  });
});
