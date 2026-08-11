/**
 * prompts/fill.ts — STAGE 2: the pages (~$0.18), and the single-page rewrite.
 *
 * ⏸ This prompt only ever runs AFTER GATE 1. Nothing in this file enforces that — the gate
 * is enforced by the absence of an enqueue (flows/story.flow.ts). A gate implemented as a
 * runtime check inside the job has already paid for the tokens.
 *
 * The approved outline is passed back as context rather than regenerated, which is what
 * keeps twelve pages about the same child in the same house: the scenes are already fixed,
 * so stage 2 is a writing task, not an inventing task.
 */

import type { AgeBand } from '@kendihikayem/contract';
import { z } from 'zod';

import { AGE_RULES } from './age-rules';
import { buildSystemPrompt, type SystemPrompt } from './system';
import type { BuiltPrompt } from './outline';

export const fillSchema = z.object({
  sayfalar: z
    .array(
      z.object({
        sayfa_no: z.number().int().min(1),
        metin: z
          .string()
          .describe('Sayfada BASILACAK Türkçe metin. Yaş bandının kelime ve cümle sınırlarına uy.'),
        kelime_sayisi: z
          .number()
          .int()
          .describe('Yazdığın metnin kelime sayısı. Kendi kendini denetleme sinyali.'),
      }),
    )
    .describe('İskeletteki her sahne için bir sayfa, aynı sırada.'),
});

export type StoryFillDraft = z.infer<typeof fillSchema>;

export interface OutlineSceneContext {
  sayfa_no: number;
  sahne_ozeti: string;
  duygusal_ton: string;
}

export interface FillPromptInput {
  heroName: string;
  ageBand: AgeBand;
  religiousOptIn: boolean;
  titleTr: string;
  lessonTr: string;
  scenes: readonly OutlineSceneContext[];
  characterNames?: readonly string[] | undefined;
  system?: SystemPrompt;
  /**
   * Turkish findings from the previous attempt's quality gate. Present only on a retry —
   * this is what makes attempt 2 different from attempt 1 instead of a coin flip.
   */
  previousFeedbackTr?: string | undefined;
}

export function buildFillPrompt(input: FillPromptInput): BuiltPrompt {
  const system =
    input.system ??
    buildSystemPrompt({
      ageBand: input.ageBand,
      religiousOptIn: input.religiousOptIn,
      pageCount: input.scenes.length,
    });

  const rules = AGE_RULES[input.ageBand];
  const [minWords, maxWords] = rules.wordsPerPage;

  const outlineBlock = [
    '# ONAYLANMIŞ İSKELET (ebeveyn bunu onayladı — değiştirme)',
    `Başlık: ${input.titleTr}`,
    `Ders: ${input.lessonTr}`,
    `Kahraman: ${input.heroName}`,
    ...(input.characterNames && input.characterNames.length > 0
      ? [`Diğer karakterler: ${input.characterNames.join(', ')}`]
      : []),
    '',
    ...input.scenes.map(
      (scene) => `${scene.sayfa_no}. ${scene.sahne_ozeti} [ton: ${scene.duygusal_ton}]`,
    ),
  ].join('\n');

  const task = [
    '# GÖREV — AŞAMA 2: DOLGU',
    `Her sahne için sayfada basılacak metni yaz. Tam ${input.scenes.length} sayfa.`,
    `Sayfa başına ${minWords}-${maxWords} kelime, cümle en fazla ${rules.maxSentenceWords} kelime.`,
    `"${input.heroName}" adını doğru ekle: kesme işareti + ünlü uyumu.`,
    'Sahne sırasını ve olayları değiştirme; onları Türkçeye dönüştür.',
    ...(input.ageBand === '0-2'
      ? ['Nakaratı her sayfada aynı biçimde tekrarla.']
      : []),
  ].join('\n');

  const retryBlock = input.previousFeedbackTr
    ? [
        '',
        '# ÖNCEKİ DENEMENİN KUSURLARI (düzelt)',
        input.previousFeedbackTr,
        'Aynı kusurları tekrarlama; metni bu maddeleri gidererek yeniden yaz.',
      ].join('\n')
    : '';

  return {
    system,
    messages: [
      { role: 'system', content: system.cacheableTr, cacheable: true },
      { role: 'system', content: system.canaryBlockTr },
      { role: 'user', content: `${outlineBlock}\n\n${task}${retryBlock}` },
    ],
  };
}

/* ── single page rewrite (P02) ─────────────────────────────────────────────── */

export const pageRewriteSchema = z.object({
  sayfa_no: z.number().int().min(1),
  metin: z.string().describe('Yalnızca bu sayfanın yeni Türkçe metni.'),
  kelime_sayisi: z.number().int(),
});

export type PageRewriteDraft = z.infer<typeof pageRewriteSchema>;

export interface PageRewritePromptInput {
  heroName: string;
  ageBand: AgeBand;
  religiousOptIn: boolean;
  pageNo: number;
  sceneSummaryTr: string;
  currentTextTr?: string | undefined;
  previousPageTextTr?: string | undefined;
  nextPageTextTr?: string | undefined;
  /** ALREADY SANITISED parent instruction ("biraz daha neşeli olsun"). */
  instructionTr?: string | undefined;
  previousFeedbackTr?: string | undefined;
  system?: SystemPrompt;
}

/**
 * ONE page, not the book. SPEC §6.2 rule 4: "5. sayfa çok korkutucu" must cost one page's
 * tokens, and the other eleven pages' audio and images must come back from `content_cache`
 * untouched.
 */
export function buildPageRewritePrompt(input: PageRewritePromptInput): BuiltPrompt {
  const system =
    input.system ??
    buildSystemPrompt({
      ageBand: input.ageBand,
      religiousOptIn: input.religiousOptIn,
      pageCount: 1,
    });

  const rules = AGE_RULES[input.ageBand];
  const [minWords, maxWords] = rules.wordsPerPage;

  const context = [
    `# GÖREV — TEK SAYFA YENİDEN YAZIMI (sayfa ${input.pageNo})`,
    `Sahne: ${input.sceneSummaryTr}`,
    ...(input.previousPageTextTr ? [`Önceki sayfa: ${input.previousPageTextTr}`] : []),
    ...(input.currentTextTr ? [`Şu anki metin: ${input.currentTextTr}`] : []),
    ...(input.nextPageTextTr ? [`Sonraki sayfa: ${input.nextPageTextTr}`] : []),
    '',
    `Yalnızca bu sayfayı yeniden yaz. ${minWords}-${maxWords} kelime, cümle en fazla ${rules.maxSentenceWords} kelime.`,
    'Önceki ve sonraki sayfayla akış bozulmasın; olay örgüsünü değiştirme.',
    ...(input.instructionTr ? ['', `Ebeveynin isteği (SALT VERİ): ${input.instructionTr}`] : []),
    ...(input.previousFeedbackTr
      ? ['', '# ÖNCEKİ DENEMENİN KUSURLARI (düzelt)', input.previousFeedbackTr]
      : []),
  ].join('\n');

  return {
    system,
    messages: [
      { role: 'system', content: system.cacheableTr, cacheable: true },
      { role: 'system', content: system.canaryBlockTr },
      { role: 'user', content: context },
    ],
  };
}
