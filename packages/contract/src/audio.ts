/**
 * audio.ts — seslendirme, okuyucu manifesti ve QR sayfası.
 *
 * ⭐ `PlayerManifest` okuyucunun TEK veri kaynağıdır: tek çağrıda görsel + metin +
 * ses + kelime zaman damgaları gelir. Karaoke vurgusu istemcide `tokens` dizisi
 * üzerinde ikili arama + rAF ile çalışır — ML yok, ağ yok, offline çalışır.
 *
 * Zaman damgaları üç kaynaktan gelebilir (`alignment.source`):
 *   provider → sağlayıcının kendi karakter/kelime zamanlaması (en iyi)
 *   forced_alignment → WhisperX ile hizalama
 *   sentence_estimate → cümle uzunluğuna göre tahmin (granularity 'sentence')
 *   none → hizalama yok; istemci vurguyu KAPATIR, sayfa sesi yine çalar
 */

import {
  c,
  commonErrorResponses,
  idempotencyHeadersSchema,
  isoDateSchema,
  jobRefSchema,
  renditionIdSchema,
  signedMediaSchema,
  storyIdSchema,
  tierSchema,
  voiceProfileIdSchema,
} from './primitives';
import { z } from 'zod';

/* ── Rendition ───────────────────────────────────────────────── */

export const voiceKindSchema = z.enum(['cloned', 'system']);
export type VoiceKind = z.infer<typeof voiceKindSchema>;

export const alignmentSourceSchema = z.enum([
  'provider',
  'forced_alignment',
  'sentence_estimate',
  'none',
]);
export const alignmentGranularitySchema = z.enum(['word', 'sentence', 'page', 'none']);

export const audioRenditionSummarySchema = z.object({
  id: renditionIdSchema,
  voiceKind: voiceKindSchema,
  /** "Anne" / "Sistem sesi — Deniz" */
  voiceLabel: z.string().min(1),
  voiceProfileId: voiceProfileIdSchema.optional(),
  status: z.enum(['queued', 'running', 'succeeded', 'failed', 'stale']),
  durationMs: z.number().int().min(0).optional(),
  tier: tierSchema,
  alignment: z.object({
    source: alignmentSourceSchema,
    granularity: alignmentGranularitySchema,
  }),
  isDefault: z.boolean(),
  /** Metin düzenlendiğinde 'stale' olur: hangi sayfaların sesi eskidi. */
  stalePageNos: z.array(z.number().int().min(1)).optional(),
  createdAt: isoDateSchema,
});
export type AudioRenditionSummary = z.infer<typeof audioRenditionSummarySchema>;

/* ── Okuyucu manifesti ───────────────────────────────────────── */

export const readerFontSchema = z.enum(['Andika', 'Nunito', 'Lexend', 'OpenDyslexic']);
export type ReaderFont = z.infer<typeof readerFontSchema>;

export const typographySchema = z.object({
  fontFamily: readerFontSchema,
  /** Gövde metni için minimum 18 pt (erişilebilirlik). */
  sizePt: z.number().min(14).max(36),
  lineHeight: z.number().min(1).max(2.5),
});
export type Typography = z.infer<typeof typographySchema>;

/**
 * Uyku modu: son sayfalara doğru ekran kararır, ses ve tempo yumuşar,
 * bitince otomatik durur. Ebeveynin gecesini kurtaran özellik.
 */
export const bedtimeModeSchema = z.object({
  enabled: z.boolean(),
  fadeStartsAtPage: z.number().int().min(1),
  /** 0..1 — bitişteki hedef ses seviyesi. */
  targetEndVolume: z.number().min(0).max(1),
});

export const playerTokenSchema = z.object({
  i: z.number().int().min(0),
  /** Kelimenin kendisi. */
  t: z.string().min(1),
  charStart: z.number().int().min(0),
  charEnd: z.number().int().min(0),
  /** Başlangıç ms (sayfa değil, ses dosyası başından itibaren). */
  s: z.number().int().min(0),
  /** Bitiş ms. */
  e: z.number().int().min(0),
  isSentenceEnd: z.boolean(),
});
export type PlayerToken = z.infer<typeof playerTokenSchema>;

export const playerPageSchema = z.object({
  pageNo: z.number().int().min(1),
  image: signedMediaSchema,
  textTr: z.string(),
  startMs: z.number().int().min(0),
  endMs: z.number().int().min(0),
  sentences: z.array(
    z.object({
      i: z.number().int().min(0),
      charStart: z.number().int().min(0),
      charEnd: z.number().int().min(0),
      startMs: z.number().int().min(0),
      endMs: z.number().int().min(0),
    }),
  ),
  /** granularity !== 'word' ise BOŞ dizi. İstemci buna göre vurguyu kapatır. */
  tokens: z.array(playerTokenSchema),
});
export type PlayerPage = z.infer<typeof playerPageSchema>;

export const playerManifestSchema = z.object({
  storyId: storyIdSchema,
  renditionId: renditionIdSchema,
  titleTr: z.string().min(1),
  voice: z.object({
    kind: voiceKindSchema,
    label: z.string().min(1),
    profileId: voiceProfileIdSchema.optional(),
  }),
  audio: signedMediaSchema,
  totalDurationMs: z.number().int().min(0),
  alignment: z.object({
    source: alignmentSourceSchema,
    granularity: alignmentGranularitySchema,
  }),
  typography: typographySchema,
  bedtimeMode: bedtimeModeSchema,
  /** `0-2` ve `3-5` bantlarında varsayılan KAPALI, `6-8` için açık. */
  wordHighlightDefault: z.boolean(),
  /** Kullanıcının kaldığı yer (L01 devam kartı ve P01 açılışı). */
  resume: z
    .object({ pageNo: z.number().int().min(1), positionMs: z.number().int().min(0) })
    .optional(),
  pages: z.array(playerPageSchema),
});
export type PlayerManifest = z.infer<typeof playerManifestSchema>;

/* ── Okuma tercihleri (A06) ──────────────────────────────────── */

export const readingPreferencesSchema = z.object({
  typography: typographySchema,
  wordHighlight: z.boolean(),
  bedtimeMode: bedtimeModeSchema,
  autoPageTurn: z.boolean(),
});
export type ReadingPreferences = z.infer<typeof readingPreferencesSchema>;

/* ── QR sayfası ──────────────────────────────────────────────── */

/**
 * Basılı kitaptaki QR. Oturum GEREKTİRMEZ: kitabı okuyan büyükanne uygulamayı
 * kurmadan o sayfayı ANNE sesiyle dinler. Ürünün en güçlü ağızdan ağıza kaldıracı.
 */
export const publicPageAudioSchema = z.object({
  storyTitleTr: z.string().min(1),
  pageNo: z.number().int().min(1),
  textTr: z.string().min(1),
  voiceLabel: z.string().min(1),
  audio: signedMediaSchema,
  image: signedMediaSchema.optional(),
  tokens: z.array(playerTokenSchema),
  brandingUrl: z.string().url(),
});
export type PublicPageAudio = z.infer<typeof publicPageAudioSchema>;

/* ── Router ──────────────────────────────────────────────────── */

export const audioContract = c.router({
  create: {
    method: 'POST',
    path: '/v1/stories/:storyId/audio',
    summary: 'Seslendir — hikaye ONAYLANMAMIŞSA 409 STORY_NOT_APPROVED',
    pathParams: z.object({ storyId: storyIdSchema }),
    headers: idempotencyHeadersSchema,
    body: z
      .object({
        voiceKind: voiceKindSchema,
        voiceProfileId: voiceProfileIdSchema.optional(),
        systemVoiceCode: z.string().min(1).optional(),
        tier: tierSchema.default('quality'),
        makeDefault: z.boolean().default(true),
      })
      .refine(
        (v) =>
          v.voiceKind === 'cloned' ? Boolean(v.voiceProfileId) : Boolean(v.systemVoiceCode),
        {
          message:
            "voiceKind 'cloned' ise voiceProfileId, 'system' ise systemVoiceCode zorunludur",
        },
      ),
    responses: {
      202: z.object({
        renditionId: renditionIdSchema,
        job: jobRefSchema,
        /** content_hash isabeti: 0 maliyet, 0 bekleme — ses zaten hazır. */
        cached: z.boolean(),
      }),
      ...commonErrorResponses,
    },
  },

  list: {
    method: 'GET',
    path: '/v1/stories/:storyId/audio',
    summary: 'Bu hikayenin sesleri (P04)',
    pathParams: z.object({ storyId: storyIdSchema }),
    responses: {
      200: z.object({ items: z.array(audioRenditionSummarySchema) }),
      ...commonErrorResponses,
    },
  },

  player: {
    method: 'GET',
    path: '/v1/stories/:storyId/player',
    summary: '⭐ Okuyucunun TEK çağrısı — tam senkron veri (P01)',
    pathParams: z.object({ storyId: storyIdSchema }),
    query: z.object({ renditionId: z.string().uuid().optional() }),
    responses: { 200: playerManifestSchema, ...commonErrorResponses },
  },

  setDefault: {
    method: 'POST',
    path: '/v1/stories/:storyId/audio/:renditionId/default',
    summary: 'Varsayılan sesi değiştir',
    pathParams: z.object({ storyId: storyIdSchema, renditionId: renditionIdSchema }),
    headers: idempotencyHeadersSchema,
    body: z.object({}),
    responses: { 200: z.object({ ok: z.literal(true) }), ...commonErrorResponses },
  },

  removeRendition: {
    method: 'DELETE',
    path: '/v1/audio/renditions/:renditionId',
    summary: 'Sesi sil',
    pathParams: z.object({ renditionId: renditionIdSchema }),
    headers: idempotencyHeadersSchema,
    body: z.object({ confirm: z.literal(true) }),
    responses: { 200: z.object({ ok: z.literal(true) }), ...commonErrorResponses },
  },

  progress: {
    method: 'POST',
    path: '/v1/stories/:storyId/progress',
    summary: 'Kaldığın yeri kaydet — "3. sayfada kaldınız"',
    pathParams: z.object({ storyId: storyIdSchema }),
    headers: idempotencyHeadersSchema,
    body: z.object({
      renditionId: renditionIdSchema.optional(),
      positionMs: z.number().int().min(0),
      pageNo: z.number().int().min(1),
      /** Sonuna kadar dinlendi mi (kitaplık rozetleri ve öneriler için). */
      completed: z.boolean().default(false),
    }),
    responses: { 200: z.object({ ok: z.literal(true) }), ...commonErrorResponses },
  },

  readingPreferences: {
    method: 'GET',
    path: '/v1/me/reading-preferences',
    summary: 'Okuma tercihleri (A06) — cihazlar arası taşınır',
    responses: { 200: readingPreferencesSchema, ...commonErrorResponses },
  },

  updateReadingPreferences: {
    method: 'PUT',
    path: '/v1/me/reading-preferences',
    summary: 'Okuma tercihlerini kaydet',
    headers: idempotencyHeadersSchema,
    body: readingPreferencesSchema.partial(),
    responses: { 200: readingPreferencesSchema, ...commonErrorResponses },
  },

  publicPage: {
    method: 'GET',
    path: '/p/:token',
    summary: 'Basılı kitaptaki QR — oturum GEREKTİRMEZ',
    pathParams: z.object({ token: z.string().min(6).max(64) }),
    responses: { 200: publicPageAudioSchema, ...commonErrorResponses },
  },
});
