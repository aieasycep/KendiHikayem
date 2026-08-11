/**
 * prompts/age-rules.ts — what "written for this age" means, as data.
 *
 * These numbers are the same ones the quality gate enforces after generation
 * (`packages/safety/src/quality/age-fit.ts`). That is the point: the model is TOLD the
 * limit and then MEASURED against it, and both halves read from one table — a prompt that
 * asks for 25-45 words while the gate demands 15-35 would fail every attempt forever.
 *
 * The Turkish-specific correction matters as much as the numbers: English picture-book
 * word counts do not transfer. Turkish is agglutinative — "okuluna gidebilirdi" is one word
 * where English needs six — so the same story is roughly a quarter to a third shorter in
 * words (docs/research/03-story.md §3).
 */

import { type AgeBand, WORDS_PER_PAGE_BY_AGE_BAND } from '@kendihikayem/contract';
import { MAX_SENTENCE_WORDS } from '@kendihikayem/safety';

export interface AgeRules {
  /** Turkish label used in the prompt header. */
  labelTr: string;
  wordsPerPage: readonly [number, number];
  maxSentenceWords: number;
  tensesTr: string;
  forbiddenStructuresTr: string;
  vocabularyTr: string;
  refrainTr: string;
  dialogueTr: string;
  resolutionTr: string;
  /** One sentence describing what the book IS, for the top of the prompt. */
  formTr: string;
}

export const AGE_RULES: Record<AgeBand, AgeRules> = {
  '0-2': {
    labelTr: '0-2 yaş (bebek / yürüme çağı)',
    wordsPerPage: WORDS_PER_PAGE_BY_AGE_BAND['0-2'],
    maxSentenceWords: MAX_SENTENCE_WORDS['0-2'],
    tensesTr: 'geçmiş zaman (-di) ve geniş zaman; tek yüklem',
    forbiddenStructuresTr:
      'yan cümle, sıfat-fiil (-dığı/-acağı), ulaç (-ken, -ip), soyut kavram, olay örgüsü',
    vocabularyTr: 'somut, günlük, en fazla üç heceli kelimeler; ses taklitleri serbest',
    refrainTr:
      'ZORUNLU: her sayfada aynı nakarat döner (ör. "İyi geceler ..."). Nakarat kitabın omurgasıdır.',
    dialogueTr: 'diyalog yok',
    resolutionTr: 'çatışma YOK; kitap bir ninni ritmidir ve uykuyla kapanır',
    formTr:
      'Bu bir OLAY ÖRGÜSÜ DEĞİL, bir ninnidir: her sayfa tek cümledir, tekrar eder ve uykuya götürür.',
  },
  '3-5': {
    labelTr: '3-5 yaş (okul öncesi)',
    wordsPerPage: WORDS_PER_PAGE_BY_AGE_BAND['3-5'],
    maxSentenceWords: MAX_SENTENCE_WORDS['3-5'],
    tensesTr: 'geçmiş zaman (-di), şimdiki zaman (-yor)',
    forbiddenStructuresTr:
      'sıfat-fiiller (-dığı/-acağı), ağır yan cümleler, iç içe geçmiş ulaçlar',
    vocabularyTr: 'somut ve günlük; soyut kavram yok',
    refrainTr: 'her 3-4 sayfada bir tekrar eden cümle iyi olur',
    dialogueTr: 'kısa, tek satırlık diyalog',
    resolutionTr: 'gerilim en fazla 2 sayfa sürer ve mutlaka çözülür',
    formTr: 'Tek bir küçük sorun, tanıdık bir dünyada, sıcak bir çözümle.',
  },
  '6-8': {
    labelTr: '6-8 yaş (ilk okuma)',
    wordsPerPage: WORDS_PER_PAGE_BY_AGE_BAND['6-8'],
    maxSentenceWords: MAX_SENTENCE_WORDS['6-8'],
    tensesTr: 'geçmiş zaman (-di), şimdiki zaman (-yor), duyulan geçmiş (-mış)',
    forbiddenStructuresTr: 'ağır iç içe yan cümleler, resmî/kurumsal dil',
    vocabularyTr: 'sınırlı soyut kavram serbest ("cesaret", "merak")',
    refrainTr: 'nakarat zorunlu değil',
    dialogueTr: 'serbest',
    resolutionTr: 'çatışma kitabın sonunda çözülür; son sayfa sakinleştirir',
    formTr: 'Bir çocuğun kendi başına attığı bir adım; ders sonda söylenmez, hikayede yaşanır.',
  },
};

/** Renders one band's rules as the prompt's language section. */
export function ageRulesPromptTr(ageBand: AgeBand, pageCount: number): string {
  const rules = AGE_RULES[ageBand];
  const [min, max] = rules.wordsPerPage;
  return [
    `# BİÇİM (${rules.labelTr})`,
    rules.formTr,
    '',
    '# DİL KURALLARI',
    `- Sayfa sayısı: ${pageCount}`,
    `- Sayfa başına: ${min}-${max} kelime (Türkçe kelime; sondan eklemeli dilde bu İngilizceden azdır)`,
    `- Cümle: en fazla ${rules.maxSentenceWords} kelime`,
    `- Zaman kipi: ${rules.tensesTr}`,
    `- Yasak yapı: ${rules.forbiddenStructuresTr}`,
    `- Kelime hazinesi: ${rules.vocabularyTr}`,
    `- Nakarat: ${rules.refrainTr}`,
    `- Diyalog: ${rules.dialogueTr}`,
    `- Çözüm: ${rules.resolutionTr}`,
  ].join('\n');
}
