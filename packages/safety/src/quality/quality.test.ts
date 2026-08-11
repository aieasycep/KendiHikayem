/**
 * The Turkish quality gate, proved in both directions.
 *
 * A gate that only ever passes is decoration. Every check here is asserted twice: once
 * against the SHIPPED reference texts (packages/mock/src/fixtures/story-text.ts — the
 * stories a parent sees in the first APK, and therefore the definition of "good enough"),
 * and once against a deliberately bad text that isolates that one defect.
 *
 * If a threshold ever has to move to keep the reference stories passing, that is a signal
 * the threshold was wrong — not the stories.
 */

import { describe, expect, it } from 'vitest';
import {
  BABY_STORY,
  BABY_STORY_PAGES,
  SAMPLE_STORY,
  SAMPLE_STORY_PAGES,
} from '@kendihikayem/mock/fixtures/story-text';

import { checkStoryQuality } from './index';
import { checkNameUsage } from './name-consistency';
import { checkTranslationese } from './translationese';
import { checkAgeFit } from './age-fit';
import { checkStructure, findRefrain } from './structure';

const elifPages = SAMPLE_STORY_PAGES.map((page) => ({
  pageNo: page.pageNo,
  textTr: page.textTr,
}));
const denizPages = BABY_STORY_PAGES.map((page) => ({
  pageNo: page.pageNo,
  textTr: page.textTr,
}));

const blockCodes = (report: ReturnType<typeof checkStoryQuality>) =>
  report.decision.violations.filter((v) => v.severity === 'block').map((v) => v.code);

/* ── The reference bar ─────────────────────────────────────────────────────── */

describe('shipped reference stories', () => {
  it('passes the 6-8 reference story ("Elif ve Tavan Arasındaki Işık")', () => {
    const report = checkStoryQuality({
      heroName: SAMPLE_STORY.heroName,
      ageBand: '6-8',
      religiousOptIn: false,
      titleTr: SAMPLE_STORY.titleTr,
      pages: elifPages,
    });

    expect(blockCodes(report)).toEqual([]);
    expect(report.decision.verdict).not.toBe('block');
    // The band target is 70; the reference text should clear it with room to spare.
    expect(report.metrics.bookReadability).toBeGreaterThanOrEqual(70);
  });

  it('passes the 0-2 reference story ("Deniz\'e İyi Geceler") and finds its refrain', () => {
    const report = checkStoryQuality({
      heroName: BABY_STORY.heroName,
      ageBand: '0-2',
      religiousOptIn: false,
      titleTr: BABY_STORY.titleTr,
      pages: denizPages,
    });

    expect(blockCodes(report)).toEqual([]);
    expect(report.metrics.refrain).toContain('iyi geceler');
    expect(report.metrics.bookReadability).toBeGreaterThanOrEqual(92);
  });

  it('rejects the 6-8 story when it is submitted as a 0-2 book', () => {
    // Same words, wrong band: this is the check that makes "0-2" a real product decision
    // instead of a label on a shorter version of the same thing.
    const report = checkStoryQuality({
      heroName: SAMPLE_STORY.heroName,
      ageBand: '0-2',
      religiousOptIn: false,
      pages: elifPages,
    });

    expect(report.decision.verdict).toBe('block');
    expect(blockCodes(report)).toContain('PAGE_WORD_COUNT_OUT_OF_RANGE');
    expect(blockCodes(report)).toContain('SENTENCE_TOO_LONG');
  });
});

/* ── 1. Name inflection — the check the whole product rests on ─────────────── */

describe('name inflection', () => {
  it('accepts every correct case form of a front-vowel name', () => {
    const text =
      "Elif'in odası sessizdi. Elif'e bir mektup geldi. Elif'i çağırdılar. " +
      "Elif'te bir cesaret vardı. Elif'ten haber bekliyorlardı. Elif'le birlikte gittiler.";
    expect(checkNameUsage(text, 'Elif')).toEqual([]);
  });

  it('catches back-vowel suffixes on a front-vowel name', () => {
    const violations = checkNameUsage("Elif'a bir kutu verdiler.", 'Elif');
    expect(violations.map((v) => v.code)).toEqual(['NAME_INFLECTION_WRONG']);
    expect(violations[0]?.detail).toContain('ünlü uyumu');
  });

  it('catches front-vowel suffixes on a back-vowel name', () => {
    const violations = checkNameUsage("Oğuz'e seslendi.", 'Oğuz');
    expect(violations.map((v) => v.code)).toEqual(['NAME_INFLECTION_WRONG']);
  });

  it('catches a buffer consonant on a consonant-final name', () => {
    // "Elif'nin" is the single most common LLM error on Turkish names.
    const violations = checkNameUsage("Elif'nin annesi geldi.", 'Elif');
    expect(violations[0]?.detail).toContain('kaynaştırma harfi kullanılmaz');
  });

  it('catches a missing buffer consonant on a vowel-final name', () => {
    const violations = checkNameUsage("Ayşe'e kitabı uzattı.", 'Ayşe');
    expect(violations[0]?.detail).toContain('kaynaştırma harfi gerekir');
    expect(checkNameUsage("Ayşe'ye kitabı uzattı.", 'Ayşe')).toEqual([]);
  });

  it('catches a soft consonant after a voiceless final letter', () => {
    expect(checkNameUsage("Ahmet'de bir ışık vardı.", 'Ahmet')[0]?.detail).toContain(
      'ek t ile başlar',
    );
    expect(checkNameUsage("Ahmet'te bir ışık vardı.", 'Ahmet')).toEqual([]);
    // …and the mirror image: a voiced final letter must NOT harden.
    expect(checkNameUsage("Deniz'te bir kayık vardı.", 'Deniz')[0]?.detail).toContain(
      'ek d ile başlar',
    );
  });

  it('catches a suffix glued on without the apostrophe', () => {
    const violations = checkNameUsage('Elifin çantası masadaydı.', 'Elif');
    expect(violations.map((v) => v.code)).toEqual(['NAME_APOSTROPHE_MISSING']);
  });

  it('does not mistake a longer word for a glued suffix', () => {
    // "Ada" + "let" is not an inflection; a naive matcher would call Adalet an error.
    expect(checkNameUsage('Adalet Sarayı çok büyüktü.', 'Ada')).toEqual([]);
  });

  it('catches dotted/dotless-i drift and stripped diacritics', () => {
    expect(checkNameUsage('Elıf uyudu.', 'Elif').map((v) => v.code)).toEqual([
      'NAME_SPELLING_INCONSISTENT',
    ]);
    expect(checkNameUsage('Ayse gülümsedi.', 'Ayşe').map((v) => v.code)).toEqual([
      'NAME_SPELLING_INCONSISTENT',
    ]);
  });

  it('reports one finding per distinct wrong form, not per occurrence', () => {
    const violations = checkNameUsage("Elif'a bak. Elif'a söyle. Elif'a ver.", 'Elif');
    expect(violations).toHaveLength(1);
  });

  it('honours the loanword harmony exception the shared engine knows about', () => {
    // "Kemal" looks back-harmony by spelling but takes front suffixes.
    expect(checkNameUsage("Kemal'e bir mektup geldi.", 'Kemal')).toEqual([]);
    expect(checkNameUsage("Kemal'a bir mektup geldi.", 'Kemal')).toHaveLength(1);
  });
});

/* ── 2. Age fit ────────────────────────────────────────────────────────────── */

describe('age fit', () => {
  it('rejects a 3-5 page written as one long clause chain', () => {
    const heavy =
      'Küçük kahramanımız, sabahın erken saatlerinde uyandığında, pencerenin önünde ' +
      'birikmiş olan kar tanelerinin arasından süzülen ışığın odanın içerisine ' +
      'yayıldığını fark ettiğinde oldukça şaşırmış bir biçimde yatağından doğruldu.';
    const result = checkAgeFit([{ pageNo: 1, textTr: heavy }], '3-5');
    const codes = result.violations.filter((v) => v.severity === 'block').map((v) => v.code);
    expect(codes).toContain('SENTENCE_TOO_LONG');
  });

  it('rejects a page that is far too short for its band', () => {
    const result = checkAgeFit([{ pageNo: 1, textTr: 'Elif koştu.' }], '6-8');
    expect(result.violations.map((v) => v.code)).toContain('PAGE_WORD_COUNT_OUT_OF_RANGE');
  });
});

/* ── 3. Translation smell ──────────────────────────────────────────────────── */

describe('translationese', () => {
  it('stays silent on the shipped reference text', () => {
    const result = checkTranslationese(elifPages.map((page) => page.textTr).join('\n'));
    expect(result.violations.filter((v) => v.severity === 'block')).toEqual([]);
  });

  it('catches pronoun-subject overuse — the strongest single marker', () => {
    const dubbed =
      'O sabah erken kalktı. O pencereye baktı. O gülümsedi. O annesine seslendi. ' +
      'O sonra mutfağa gitti. O sütünü içti.';
    const result = checkTranslationese(dubbed);
    expect(result.signals.map((s) => s.id)).toContain('pronoun_subject_rate');
    expect(result.violations[0]?.severity).toBe('block');
  });

  it('catches literal English idioms', () => {
    const result = checkTranslationese(
      'Günün sonunda, küçük tilki bir fark yaratmak istediğini anladı.',
    );
    expect(result.signals.map((s) => s.id)).toContain('calque.gunun_sonunda');
    expect(result.violations[0]?.severity).toBe('block');
  });

  it('catches the redundant possessive pronoun', () => {
    const result = checkTranslationese('Onun annesi geldi. Onun kedisi uyudu.');
    expect(result.signals.map((s) => s.id)).toContain('redundant_possessive');
  });

  it('catches "and"-chaining where Turkish would use a converb', () => {
    const result = checkTranslationese(
      'Ali kalktı ve giyindi. Sonra kahvaltı yaptı ve çantasını aldı. ' +
        'Kapıyı açtı ve dışarı çıktı. Otobüse bindi ve okula gitti.',
    );
    expect(result.signals.map((s) => s.id)).toContain('ve_rate');
  });
});

/* ── 4. Book shape ─────────────────────────────────────────────────────────── */

describe('structure', () => {
  it('requires a refrain in the 0-2 band', () => {
    const noRefrain = [
      { pageNo: 1, textTr: 'Deniz topu aldı.' },
      { pageNo: 2, textTr: 'Kedi bahçeye çıktı.' },
      { pageNo: 3, textTr: 'Kuşlar yuvaya girdi.' },
      { pageNo: 4, textTr: 'Deniz uykuya daldı, sıcacık.' },
    ];
    const result = checkStructure({
      ageBand: '0-2',
      heroName: 'Deniz',
      pages: noRefrain,
    });
    expect(result.violations.filter((v) => v.severity === 'block').map((v) => v.code)).toContain(
      'REFRAIN_MISSING',
    );
  });

  it('finds the refrain in the shipped 0-2 story', () => {
    expect(findRefrain(denizPages.map((page) => page.textTr), 0.5)).toContain('iyi geceler');
  });

  it('rejects a cliffhanger ending', () => {
    const result = checkStructure({
      ageBand: '6-8',
      heroName: 'Elif',
      pages: [
        { pageNo: 1, textTr: 'Elif ormana girdi ve etrafına baktı.' },
        { pageNo: 2, textTr: 'Kapı gıcırdadı. Peki ya arkasında ne vardı? Devam edecek.' },
      ],
    });
    expect(result.violations.filter((v) => v.severity === 'block').map((v) => v.code)).toContain(
      'UNRESOLVED_ENDING',
    );
  });

  it("rejects a book that never mentions the child's name", () => {
    const result = checkStructure({
      ageBand: '6-8',
      heroName: 'Elif',
      pages: [
        { pageNo: 1, textTr: 'Küçük kız ormana girdi.' },
        { pageNo: 2, textTr: 'Sonra evine döndü ve mışıl mışıl uyudu.' },
      ],
    });
    expect(result.violations.map((v) => v.code)).toContain('HERO_NAME_MISSING');
  });
});

/* ── 5. End to end on a bad book ───────────────────────────────────────────── */

describe('a bad book fails for the right reasons', () => {
  it('collects every defect in one report', () => {
    const bad = [
      {
        pageNo: 1,
        textTr:
          "O gün Elif'a bir mektup geldi ve o mektubu açtı ve okudu ve şaşırdı. " +
          'Günün sonunda onun annesi geldi.',
      },
      {
        pageNo: 2,
        textTr:
          'Yaramazlık yaparsan öcü gelir dedi. Peki ya sonra ne olacaktı?',
      },
    ];
    const report = checkStoryQuality({
      heroName: 'Elif',
      ageBand: '3-5',
      religiousOptIn: false,
      pages: bad,
    });

    expect(report.decision.verdict).toBe('block');
    const codes = blockCodes(report);
    expect(codes).toContain('NAME_INFLECTION_WRONG');
    expect(codes).toContain('TRANSLATIONESE');
    expect(codes).toContain('BANNED_TERM');
    expect(codes).toContain('UNRESOLVED_ENDING');
    // The regeneration prompt gets actionable Turkish, not a stack trace.
    expect(report.feedbackTr).toContain('Sayfa');
    expect(report.decision.messageTr).toBeTruthy();
  });
});
