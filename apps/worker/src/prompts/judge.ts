/**
 * prompts/judge.ts — LAYER K4c: the age-rubric judge (~$0.002).
 *
 * The judge exists because the two cheap layers cannot see what it sees. A denylist matches
 * words; a moderation API scores categories tuned for adults. Neither can answer "is this
 * frightening for a four-year-old?" — and that question is the difference between a story a
 * parent reads twice and a story that ends the subscription.
 *
 * It runs on the cheap tier by design: this is a rubric-grading task, not a writing task,
 * and at ~$0.002 it can run on every generation without anyone proposing to skip it.
 */

import type { AgeBand } from '@kendihikayem/contract';
import type { LlmMessage } from '@kendihikayem/providers';
import { JUDGE_DIMENSIONS, rubricPromptTr } from '@kendihikayem/safety';
import { z } from 'zod';

export const judgeSchema = z.object({
  uygun: z.boolean().describe('Metin bu yaş bandı için uygun mu?'),
  ihlaller: z
    .array(
      z.object({
        boyut: z.enum(JUDGE_DIMENSIONS).describe('Hangi rubrik boyutu ihlal edildi.'),
        sayfa_no: z.number().int().min(0).describe('İhlalin geçtiği sayfa; bilinmiyorsa 0.'),
        kanit: z.string().describe('İhlali gösteren KISA alıntı (en fazla bir cümle).'),
      }),
    )
    .describe('Boş dizi = ihlal yok.'),
  not: z.string().describe('Tek cümlelik gerekçe. İhlal yoksa boş bırakma, "uygun" yaz.'),
});

export type JudgeDraft = z.infer<typeof judgeSchema>;

export interface JudgePromptInput {
  ageBand: AgeBand;
  religiousOptIn: boolean;
  titleTr: string;
  pages: ReadonlyArray<{ pageNo: number; textTr: string }>;
}

export function buildJudgePrompt(input: JudgePromptInput): LlmMessage[] {
  // The judge's system prompt is band-scoped and otherwise fixed → fully cacheable.
  const system = [
    '# ROL',
    'Türk çocuk edebiyatı editörüsün. Yazmıyorsun; DENETLİYORSUN.',
    'Sana verilen masalı yaş bandı rubriğine göre puanla ve yalnızca JSON döndür.',
    '',
    `# RUBRİK (${input.ageBand})`,
    rubricPromptTr(input.ageBand, input.religiousOptIn),
    '',
    '# NASIL KARAR VERİRSİN',
    '- KOŞULLU satırlarda koşul sağlanıyorsa ihlal sayma.',
    '- Emin değilsen ihlal olarak işaretle; masal yeniden üretilir, bu ucuzdur.',
    '- Üslup, dilbilgisi ya da beğeni yorumu yapma; yalnızca rubrik.',
    '- Kanıtı metinden birebir alıntıla, uydurma.',
  ].join('\n');

  const body = [
    `Başlık: ${input.titleTr}`,
    '',
    ...input.pages.map((page) => `[${page.pageNo}] ${page.textTr}`),
  ].join('\n');

  return [
    { role: 'system', content: system, cacheable: true },
    { role: 'user', content: `<masal>\n${body}\n</masal>` },
  ];
}
