/**
 * prompts/outline.ts — STAGE 1: the skeleton (~$0.03).
 *
 * The whole cost model of the product lives in the difference between this file and
 * fill.ts. Stage 1 produces scene summaries, the character canon, three hero variants and a
 * cover idea — enough for a parent to say yes or no in five seconds — and nothing else. If
 * they say no, the expensive stage never runs and the abandoned story cost three cents
 * instead of four dollars (SPEC §6.2 rule 1).
 *
 * Field ORDER in the schema is generation order. The character canon comes before the
 * scenes on purpose: the model fixes who these people are, then writes scenes about them.
 * Reversing it produces twelve scenes starring twelve slightly different children.
 */

import { type AgeBand, type PageCount } from '@kendihikayem/contract';
import { PAGE_EMOTION, STORY_CHARACTER_ROLE } from '@kendihikayem/db';
import { spotlight } from '@kendihikayem/safety';
import type { LlmMessage } from '@kendihikayem/providers';
import { z } from 'zod';

import { buildSystemPrompt, type SystemPrompt } from './system';

/** The six emotions `story_pages.emotion` accepts. A seventh would fail the CHECK. */
const emotionSchema = z.enum(PAGE_EMOTION);
const roleSchema = z.enum(STORY_CHARACTER_ROLE);

export const outlineSchema = z.object({
  kitap_meta: z
    .object({
      baslik: z.string().describe('Masalın adı. En fazla 6 kelime, Türkçe, çocuğun adını içerebilir.'),
      ogrenilen_ders: z
        .string()
        .describe('Tek cümle. Didaktik değil: hikayede yaşanan şeyin özeti.'),
      duygusal_yay: z
        .string()
        .describe('Tek cümle: masal hangi duygudan hangi duyguya gidiyor.'),
    })
    .describe('Kitabın künyesi.'),

  karakter_kanonu: z
    .array(
      z.object({
        rol: roleSchema.describe('kahraman | yardimci | ebeveyn | hayvan | diger'),
        ad: z.string().describe('Türkçe ad. Kahramanın adı ebeveynin verdiği addır, aynen kullan.'),
        gorsel_tarif_en: z
          .string()
          .describe(
            'İNGİLİZCE, 25-40 kelime, sabit. Her illüstrasyon prompt\'unda BİREBİR tekrarlanacak. ' +
              'Marka, gerçek kişi ve telifli karakter YASAK.',
          ),
      }),
    )
    .describe('Görsel tutarlılığın çapası. En fazla 3 karakter.'),

  karakter_varyantlari: z
    .array(
      z.object({
        varyant_id: z.string().describe('v1, v2, v3'),
        ozet_tr: z.string().describe('Ebeveyne gösterilecek tek cümlelik fark.'),
        gorsel_tarif_en: z.string().describe('İNGİLİZCE, kahramanın bu varyantının tarifi.'),
      }),
    )
    .describe('Kahramanın 3 görsel varyantı — ebeveyn S09 ekranında birini seçer.'),

  kapak_fikri: z
    .object({
      ozet_tr: z.string().describe('Kapakta ne görünüyor, tek cümle Türkçe.'),
      gorsel_tarif_en: z.string().describe('İNGİLİZCE kapak sahnesi tarifi.'),
    })
    .describe('Kapak fikri.'),

  sayfalar: z
    .array(
      z.object({
        sayfa_no: z.number().int().min(1),
        sahne_ozeti: z
          .string()
          .describe('Tek cümle Türkçe: bu sayfada NE OLUYOR. Metin değil, özet.'),
        duygusal_ton: emotionSchema,
      }),
    )
    .describe('Sayfa sayısı kadar sahne, sırayla.'),
});

export type StoryOutlineDraft = z.infer<typeof outlineSchema>;

export interface OutlinePromptInput {
  heroName: string;
  ageBand: AgeBand;
  pageCount: PageCount | number;
  religiousOptIn: boolean;
  themeCode?: string | undefined;
  artStyleCode?: string | undefined;
  lessonHintTr?: string | undefined;
  culturalTags?: readonly string[] | undefined;
  /** ALREADY SANITISED (K1). Passing raw input here is a bug, not a risk. */
  freeIdeaTr?: string | undefined;
  characterBuilder?: Record<string, string> | undefined;
  /** Reuse the same system prompt (and canary) across a retry. */
  system?: SystemPrompt;
}

export interface BuiltPrompt {
  messages: LlmMessage[];
  system: SystemPrompt;
}

export function buildOutlinePrompt(input: OutlinePromptInput): BuiltPrompt {
  const system =
    input.system ??
    buildSystemPrompt({
      ageBand: input.ageBand,
      religiousOptIn: input.religiousOptIn,
      pageCount: input.pageCount,
    });

  const parentBlock = spotlight({
    kahraman_adi: input.heroName,
    yas_bandi: input.ageBand,
    sayfa_sayisi: input.pageCount,
    tema_kodu: input.themeCode,
    sanat_stili: input.artStyleCode,
    ders_ipucu: input.lessonHintTr,
    kulturel_etiketler: input.culturalTags ? [...input.culturalTags] : undefined,
    ebeveyn_fikri: input.freeIdeaTr,
    karakter_ozellikleri: input.characterBuilder
      ? Object.entries(input.characterBuilder)
          .map(([key, value]) => `${key}=${value}`)
          .join(', ')
      : undefined,
  });

  const task = [
    '# GÖREV — AŞAMA 1: İSKELET',
    `Tam ${input.pageCount} sahnelik bir iskelet üret. Sayfa METNİ YAZMA — yalnızca sahne özeti.`,
    'Karakter kanonunu önce yaz, sahneleri sonra: sahneler o karakterleri anlatacak.',
    'Kahramanın adını ebeveynin verdiği biçimde kullan ve Türkçe ek kurallarına uy.',
  ].join('\n');

  return {
    system,
    messages: [
      { role: 'system', content: system.cacheableTr, cacheable: true },
      { role: 'system', content: system.canaryBlockTr },
      { role: 'user', content: `${parentBlock}\n\n${task}` },
    ],
  };
}
