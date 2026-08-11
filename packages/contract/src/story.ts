/**
 * story.ts — hikaye üretimi. Sözleşmenin en yüksek getirili tasarım kararı burada.
 *
 * ⏸ İKİ AŞAMA, İKİ KAPI
 *
 *   POST /v1/stories                 → AŞAMA 1: yalnızca İSKELET üretilir (~$0.03)
 *        status: outline_generating → outline_ready
 *   ⏸ KAPI 1  POST /stories/:id/outline/approve
 *        Ebeveyn 12 sahneyi ve 3 karakter varyantını görür, 5 saniyede onaylar.
 *        Onaylanmazsa PAHALI AŞAMA HİÇ ÇALIŞMAZ. Terk eden kullanıcının maliyeti
 *        $0.03'tür, $4 değil — ürünün maliyet kaldıracının tamamı bu kapıdadır.
 *        → AŞAMA 2: dolgu metni + 13 görsel (~$2.4)
 *   ⏸ KAPI 2  POST /stories/:id/approve
 *        `approvedAt` null iken seslendirme ve baskı BAŞLATILAMAZ
 *        (`409 STORY_NOT_APPROVED`). TTS ve 4K yeniden üretim en pahalı adımlardır.
 *
 * Aşamalı teslim: sayfa görselleri hazır oldukça `page.image.ready` olayıyla tek tek
 * gelir; istemci 13/13 beklemeden okuyucuyu açabilir (kısmi başarı kabul edilir).
 */

import {
  ageBandSchema,
  c,
  childIdSchema,
  type AgeBand,
  commonErrorResponses,
  costPreviewSchema,
  freeIdeaSchema,
  humanNameSchema,
  idempotencyHeadersSchema,
  isoDateSchema,
  jobRefSchema,
  pageQuerySchema,
  paginatedSchema,
  signedMediaSchema,
  storyCharacterIdSchema,
  storyIdSchema,
  storyPageIdSchema,
} from './primitives';
import { audioRenditionSummarySchema } from './audio';
import { z } from 'zod';

/* ── Durumlar ────────────────────────────────────────────────── */

export const storyStatusSchema = z.enum([
  'draft',
  'outline_generating',
  /** ⏸ KAPI 1 burada bekler. */
  'outline_ready',
  'outline_rejected',
  'content_generating',
  'content_ready',
  'images_generating',
  /** Okunabilir (bazı görseller eksik olabilir). */
  'ready',
  /** ⏸ KAPI 2 geçildi: seslendirme ve baskı açık. */
  'approved',
  'failed',
]);
export type StoryStatus = z.infer<typeof storyStatusSchema>;

/**
 * Sayfa (spread) sayısı. 6 ve 8, `0-2` bandı için eklenmiştir: bebek/yürüme
 * çağında 12 sayfalık okuma metni anlamsızdır — kitap tek oturuşta, tekrarlı ve
 * çok kısa olmalıdır. 12/14/16 okuyan bantların (3-5, 6-8) seçenekleridir.
 */
export const pageCountSchema = z.union([
  z.literal(6),
  z.literal(8),
  z.literal(12),
  z.literal(14),
  z.literal(16),
]);
export type PageCount = z.infer<typeof pageCountSchema>;

/**
 * Yaş bandına göre İZİN VERİLEN uzunluklar. Sunucu `stories.create` gövdesini
 * bu tabloya göre reddeder (`422 VALIDATION_FAILED`); istemci de uzunluk
 * adımında yalnızca bu seçenekleri gösterir. Sözleşme gövdesine `.refine()`
 * eklenmedi — `ZodEffects` ts-rest'in gövde çıkarımını ve OpenAPI üretimini
 * bozar; kural bu yüzden veri olarak taşınır ve iki tarafta da uygulanır.
 */
export const PAGE_COUNT_OPTIONS_BY_AGE_BAND: Record<AgeBand, readonly PageCount[]> = {
  '0-2': [6, 8],
  '3-5': [12, 14, 16],
  '6-8': [12, 14, 16],
};

/** Sihirbaz bir banda geçtiğinde taslağa yazılan uzunluk. */
export const DEFAULT_PAGE_COUNT_BY_AGE_BAND: Record<AgeBand, PageCount> = {
  '0-2': 8,
  '3-5': 12,
  '6-8': 12,
};

/**
 * Sayfa başına hedef TR kelime aralığı — üretim prompt'unun ve editoryal QA'nın
 * girdisi. `0-2` için tek cümlelik sayfa: 6-14 kelime.
 */
export const WORDS_PER_PAGE_BY_AGE_BAND: Record<AgeBand, readonly [number, number]> = {
  '0-2': [6, 14],
  '3-5': [25, 45],
  '6-8': [40, 70],
};

export function isPageCountAllowed(ageBand: AgeBand, pageCount: number): boolean {
  return (PAGE_COUNT_OPTIONS_BY_AGE_BAND[ageBand] as readonly number[]).includes(pageCount);
}

/** Bant değiştiğinde geçersiz kalan uzunluğu en yakın geçerli seçeneğe çeker. */
export function clampPageCount(ageBand: AgeBand, pageCount: number): PageCount {
  if (isPageCountAllowed(ageBand, pageCount)) return pageCount as PageCount;
  return DEFAULT_PAGE_COUNT_BY_AGE_BAND[ageBand];
}

export const safeZoneSchema = z.enum(['bottom', 'top', 'left', 'right']);

export const imageStatusSchema = z.enum([
  'pending',
  'generating',
  'qa_failed',
  /** Otomatik QA iki kez başarısız: ops kuyruğunda insan bakıyor. Hikaye DURMAZ. */
  'manual_review',
  'ready',
  'failed',
]);
export type ImageStatus = z.infer<typeof imageStatusSchema>;

/* ── Parçalar ────────────────────────────────────────────────── */

export const storyOutlineSchema = z.object({
  titleTr: z.string().min(1),
  lessonTr: z.string().min(1),
  scenes: z.array(
    z.object({
      pageNo: z.number().int().min(1),
      summaryTr: z.string().min(1),
      /** Sahnenin duygusu — görsel prompt'una ve okuyucu temposuna girer. */
      emotion: z.string().min(1),
    }),
  ),
});
export type StoryOutline = z.infer<typeof storyOutlineSchema>;

export const storyCharacterSchema = z.object({
  id: storyCharacterIdSchema,
  role: z.string().min(1),
  nameTr: z.string().min(1),
  isPrimary: z.boolean(),
  /** 4K model sheet (ön / ¾ / yan + ifade yakın planları). */
  sheet: signedMediaSchema.optional(),
  /** Ebeveyn 3 varyanttan birini seçer (S09) — tutarlılık + duygusal bağ. */
  variants: z
    .array(
      z.object({
        id: z.string().min(1),
        image: signedMediaSchema,
        selected: z.boolean().default(false),
      }),
    )
    .optional(),
  /** Aynı çocuğun sonraki hikayelerinde tekrar kullanılabilir mi. */
  reusable: z.boolean().default(false),
});
export type StoryCharacter = z.infer<typeof storyCharacterSchema>;

export const storyPageSchema = z.object({
  id: storyPageIdSchema,
  pageNo: z.number().int().min(1),
  /** Aşama 1'de yok, aşama 2'de dolar. */
  textTr: z.string().optional(),
  summaryTr: z.string().optional(),
  emotion: z.string().optional(),
  wordCount: z.number().int().min(0).optional(),
  image: signedMediaSchema.optional(),
  /** Metin kutusunun oturacağı bölge — görselde o alan sakin bırakılır. */
  safeZone: safeZoneSchema,
  imageStatus: imageStatusSchema,
  editedByUser: z.boolean(),
  /** Kaç kez düzenlendi; `revert` bu numaralara döner. */
  revision: z.number().int().min(0),
});
export type StoryPage = z.infer<typeof storyPageSchema>;

export const storySchema = z.object({
  id: storyIdSchema,
  title: z.string().optional(),
  status: storyStatusSchema,
  childId: childIdSchema.optional(),
  heroName: z.string().min(1),
  ageBand: ageBandSchema,
  themeCode: z.string().optional(),
  artStyleCode: z.string().min(1),
  pageCount: z.number().int().min(1),
  lessonTr: z.string().optional(),
  characters: z.array(storyCharacterSchema),
  outline: storyOutlineSchema.optional(),
  pages: z.array(storyPageSchema),
  audio: z.array(audioRenditionSummarySchema),
  /** Devam eden işler — istemci bunlara abone olur ya da polling yapar. */
  activeJobs: z.array(jobRefSchema),
  cover: signedMediaSchema.optional(),
  isFavorite: z.boolean().default(false),
  /** ⏸ KAPI 2. null ise seslendirme/baskı 409 döner. */
  approvedAt: isoDateSchema.optional(),
  createdAt: isoDateSchema,
  readyAt: isoDateSchema.optional(),
});
export type Story = z.infer<typeof storySchema>;

export const storySummarySchema = z.object({
  id: storyIdSchema,
  title: z.string().min(1),
  cover: signedMediaSchema.optional(),
  childName: z.string().optional(),
  ageBand: ageBandSchema,
  status: storyStatusSchema,
  hasAudio: z.boolean(),
  /** "Anne", "Sistem sesi — Deniz" */
  voiceLabels: z.array(z.string()),
  isFavorite: z.boolean(),
  printedCount: z.number().int().min(0),
  /** L01 "3. sayfada kaldınız" devam kartı için. */
  lastReadPageNo: z.number().int().min(1).optional(),
  createdAt: isoDateSchema,
});
export type StorySummary = z.infer<typeof storySummarySchema>;

/* ── İstek gövdeleri ─────────────────────────────────────────── */

export const createStoryReqSchema = z.object({
  childId: childIdSchema.optional(),
  hero: z.object({
    name: humanNameSchema,
    /** Kahraman çocuğun kendisi mi, yoksa kurgusal biri mi. */
    isChild: z.boolean(),
  }),
  ageBand: ageBandSchema,
  themeCode: z.string().min(1).optional(),
  /** ≤200 karakter. Model tarafında SALT VERİ olarak işaretlenir (spotlighting). */
  freeIdeaTr: freeIdeaSchema.optional(),
  artStyleCode: z.string().min(1),
  /**
   * ⚠️ Bandına göre kısıtlıdır: `PAGE_COUNT_OPTIONS_BY_AGE_BAND[ageBand]` dışında
   * bir değer `422 VALIDATION_FAILED` döner (ör. `0-2` için 12 sayfa reddedilir).
   */
  pageCount: pageCountSchema,
  /** { ten_tonu: 'acik_bugday', sac: 'dalgali_koyu_kahve', ... } — FOTOĞRAF YOK. */
  characterBuilder: z.record(z.string().min(1)),
  lessonHintTr: z.string().trim().max(120).optional(),
  culturalTags: z.array(z.string().min(1)).max(4).optional(),
  /** Varsayılan false; dini içerik yalnızca ebeveyn açıkça isterse. */
  religiousOptIn: z.boolean().default(false),
  /** "Elif'in kahramanı" tekrar kullanılsın. */
  reuseCharacterId: storyCharacterIdSchema.optional(),
});
export type CreateStoryReq = z.infer<typeof createStoryReqSchema>;

export const outlineEditsSchema = z.object({
  titleTr: z.string().trim().min(1).max(80).optional(),
  lessonTr: z.string().trim().min(1).max(200).optional(),
  scenes: z
    .array(
      z.object({
        pageNo: z.number().int().min(1),
        summaryTr: z.string().trim().min(1).max(300),
      }),
    )
    .optional(),
});
export type OutlineEdits = z.infer<typeof outlineEditsSchema>;

/* ── Router ──────────────────────────────────────────────────── */

export const storyContract = c.router({
  create: {
    method: 'POST',
    path: '/v1/stories',
    summary: 'AŞAMA 1 — iskelet üretimi başlat (S06)',
    description:
      'Yalnızca iskelet üretilir. Pahalı dolgu ve görseller KAPI 1 onayına kadar çalışmaz.',
    headers: idempotencyHeadersSchema,
    body: createStoryReqSchema,
    responses: {
      202: z.object({
        storyId: storyIdSchema,
        job: jobRefSchema,
        /** Bu aşamada düşülen kredi (iskelet). */
        creditCost: z.number().int().min(0),
        /** Onaylanırsa toplam ne tutacağı — KAPI 1'de gösterilir. */
        fullCostPreview: costPreviewSchema,
      }),
      ...commonErrorResponses,
    },
  },

  list: {
    method: 'GET',
    path: '/v1/stories',
    summary: 'Kitaplık (L01)',
    query: pageQuerySchema.extend({
      childId: z.string().uuid().optional(),
      status: storyStatusSchema.optional(),
      onlyFavorites: z.coerce.boolean().optional(),
      /** Başlık/kahraman adında arama. */
      q: z.string().max(60).optional(),
    }),
    responses: { 200: paginatedSchema(storySummarySchema), ...commonErrorResponses },
  },

  get: {
    method: 'GET',
    path: '/v1/stories/:storyId',
    summary: 'Hikayenin tamamı — polling yolu da budur',
    pathParams: z.object({ storyId: storyIdSchema }),
    responses: { 200: storySchema, ...commonErrorResponses },
  },

  selectCharacterVariant: {
    method: 'POST',
    path: '/v1/stories/:storyId/character-variants/select',
    summary: 'Ebeveyn karakter varyantını seçer (S09)',
    pathParams: z.object({ storyId: storyIdSchema }),
    headers: idempotencyHeadersSchema,
    body: z.object({
      characterId: storyCharacterIdSchema,
      variantId: z.string().min(1),
      /** Bu karakter aynı çocuğun sonraki hikayelerinde tekrar kullanılsın mı. */
      reuseForChild: z.boolean().default(false),
    }),
    responses: { 200: storyCharacterSchema, ...commonErrorResponses },
  },

  approveOutline: {
    method: 'POST',
    path: '/v1/stories/:storyId/outline/approve',
    summary: '⏸ KAPI 1 — iskeleti onayla, PAHALI aşama burada başlar',
    pathParams: z.object({ storyId: storyIdSchema }),
    headers: idempotencyHeadersSchema,
    body: z.object({
      edits: outlineEditsSchema.optional(),
      /** İstemci `fullCostPreview` değerini gösterdiğini beyan eder. */
      costAcknowledged: z.literal(true),
    }),
    responses: {
      202: z.object({ job: jobRefSchema, charged: costPreviewSchema }),
      ...commonErrorResponses,
    },
  },

  rejectOutline: {
    method: 'POST',
    path: '/v1/stories/:storyId/outline/reject',
    summary: 'İskeleti reddet — yeni iskelet üretilir, dolgu HİÇ çalışmaz',
    pathParams: z.object({ storyId: storyIdSchema }),
    headers: idempotencyHeadersSchema,
    body: z.object({
      reasonTr: z.string().trim().max(300).optional(),
      /** false → hikaye 'outline_rejected' kalır, yeni iskelet üretilmez. */
      regenerate: z.boolean().default(true),
    }),
    responses: {
      202: z.object({ job: jobRefSchema.optional(), status: storyStatusSchema }),
      ...commonErrorResponses,
    },
  },

  updatePage: {
    method: 'PATCH',
    path: '/v1/stories/:storyId/pages/:pageNo',
    summary: 'Sayfa metnini düzenle (P02) — moderasyondan geçer, sesi stale yapar',
    pathParams: z.object({
      storyId: storyIdSchema,
      pageNo: z.coerce.number().int().min(1).max(64),
    }),
    headers: idempotencyHeadersSchema,
    body: z.object({ textTr: z.string().trim().min(1).max(1200) }),
    responses: { 200: storyPageSchema, ...commonErrorResponses },
  },

  rewritePage: {
    method: 'POST',
    path: '/v1/stories/:storyId/pages/:pageNo/rewrite',
    summary: 'Tek sayfayı yeniden yaz — TÜM kitap değil',
    pathParams: z.object({
      storyId: storyIdSchema,
      pageNo: z.coerce.number().int().min(1).max(64),
    }),
    headers: idempotencyHeadersSchema,
    body: z.object({ instructionTr: z.string().trim().max(200).optional() }),
    responses: { 202: z.object({ job: jobRefSchema }), ...commonErrorResponses },
  },

  reillustratePage: {
    method: 'POST',
    path: '/v1/stories/:storyId/pages/:pageNo/reillustrate',
    summary: 'Tek sayfanın görselini yenile (P03) — aynı karakter referanslarıyla',
    pathParams: z.object({
      storyId: storyIdSchema,
      pageNo: z.coerce.number().int().min(1).max(64),
    }),
    headers: idempotencyHeadersSchema,
    body: z.object({ instructionTr: z.string().trim().max(200).optional() }),
    responses: { 202: z.object({ job: jobRefSchema }), ...commonErrorResponses },
  },

  revertPage: {
    method: 'POST',
    path: '/v1/stories/:storyId/pages/:pageNo/revert',
    summary: 'Sayfayı önceki sürüme döndür',
    pathParams: z.object({
      storyId: storyIdSchema,
      pageNo: z.coerce.number().int().min(1).max(64),
    }),
    headers: idempotencyHeadersSchema,
    body: z.object({ revision: z.number().int().min(0) }),
    responses: { 200: storyPageSchema, ...commonErrorResponses },
  },

  approve: {
    method: 'POST',
    path: '/v1/stories/:storyId/approve',
    summary: '⏸ KAPI 2 — seslendirme ve baskının ön koşulu',
    pathParams: z.object({ storyId: storyIdSchema }),
    headers: idempotencyHeadersSchema,
    body: z.object({}),
    responses: { 200: storySchema, ...commonErrorResponses },
  },

  sequel: {
    method: 'POST',
    path: '/v1/stories/:storyId/sequel',
    summary: 'Devam hikayesi — aynı karakter sayfasıyla, yeni iskelet',
    pathParams: z.object({ storyId: storyIdSchema }),
    headers: idempotencyHeadersSchema,
    body: z.object({
      themeCode: z.string().min(1).optional(),
      freeIdeaTr: freeIdeaSchema.optional(),
    }),
    responses: {
      202: z.object({ storyId: storyIdSchema, job: jobRefSchema, creditCost: z.number().int().min(0) }),
      ...commonErrorResponses,
    },
  },

  favorite: {
    method: 'POST',
    path: '/v1/stories/:storyId/favorite',
    summary: 'Favorile / favoriden çıkar',
    pathParams: z.object({ storyId: storyIdSchema }),
    headers: idempotencyHeadersSchema,
    body: z.object({ isFavorite: z.boolean() }),
    responses: {
      200: z.object({ id: storyIdSchema, isFavorite: z.boolean() }),
      ...commonErrorResponses,
    },
  },

  remove: {
    method: 'DELETE',
    path: '/v1/stories/:storyId',
    summary: 'Hikayeyi sil',
    pathParams: z.object({ storyId: storyIdSchema }),
    headers: idempotencyHeadersSchema,
    body: z.object({ confirm: z.literal(true) }),
    responses: { 200: z.object({ ok: z.literal(true) }), ...commonErrorResponses },
  },
});
