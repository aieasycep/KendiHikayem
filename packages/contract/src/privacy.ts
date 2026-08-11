/**
 * privacy.ts — hukuki metinler, rıza motoru, KVKK veri sahibi talepleri, ihbar.
 *
 * HUKUKİ TASARIM (SPEC §7 adım 2-3, §10.1 madde 2-3-20):
 *  · AYDINLATMA ve AÇIK RIZA ayrı kayıtlardır ve ayrı ekranlardan gelir.
 *    Aydınlatmanın görüntülenmesi `method:'implicit_view'` ile loglanır — RIZA DEĞİLDİR.
 *  · Açık rıza her konu için AYRI çağrıdır; battaniye rıza yoktur. `granted` alanı
 *    varsayılan olarak false'tur, istemci ön-işaretli kutu gösteremez.
 *  · `documentSha256` hangi METNE onay verildiğinin kanıtıdır. İspat yükü veri
 *    sorumlusundadır; sürüm numarası tek başına yetmez.
 */

import {
  c,
  commonErrorResponses,
  idempotencyHeadersSchema,
  isoDateSchema,
  jobIdSchema,
  jobRefSchema,
  legalDocumentIdSchema,
  pageQuerySchema,
  paginatedSchema,
  privacyRequestIdSchema,
  reportIdSchema,
  sha256Schema,
  signedMediaSchema,
  storyIdSchema,
  voiceProfileIdSchema,
} from './primitives';
import { z } from 'zod';

/* ── Hukuki metinler ─────────────────────────────────────────── */

/** SPEC §10.3 — 5 belge ailesi, varyantlarıyla. Birleştirilmez. */
export const legalDocumentKindSchema = z.enum([
  'aydinlatma_genel',
  'aydinlatma_ses',
  'aydinlatma_cocuk',
  'acik_riza_ses_biyometrik',
  'acik_riza_yurtdisi',
  'acik_riza_cocuk_verisi',
  'acik_riza_pazarlama',
  'gizlilik_politikasi',
  'kullanim_kosullari',
  'mesafeli_satis',
  'on_bilgilendirme',
  'cayma_bilgilendirme',
]);
export type LegalDocumentKind = z.infer<typeof legalDocumentKindSchema>;

export const legalDocumentSchema = z.object({
  id: legalDocumentIdSchema,
  kind: legalDocumentKindSchema,
  version: z.string().min(1),
  /** Markdown. İstemci başlık/paragraf/liste dışında bir şey render etmez. */
  bodyMd: z.string().min(1),
  sha256: sha256Schema,
  effectiveFrom: isoDateSchema,
});
export type LegalDocument = z.infer<typeof legalDocumentSchema>;

/* ── Rıza ────────────────────────────────────────────────────── */

export const consentSubjectSchema = z.enum([
  'ses_biyometrik',
  'yurtdisi_aktarim',
  'cocuk_verisi',
  'pazarlama',
  /** Rıza DEĞİL: aydınlatma metninin görüntülendiğinin kanıtı. */
  'aydinlatma_goruntuleme',
]);
export type ConsentSubject = z.infer<typeof consentSubjectSchema>;

/** `ConsentState` anahtarları — aydınlatma görüntüleme bir durum değil, olaydır. */
export const consentStateSubjectSchema = z.enum([
  'ses_biyometrik',
  'yurtdisi_aktarim',
  'cocuk_verisi',
  'pazarlama',
]);
export type ConsentStateSubject = z.infer<typeof consentStateSubjectSchema>;

export const consentMethodSchema = z.enum([
  /** Ön-işaretsiz kutunun kullanıcı tarafından işaretlenmesi (tek geçerli açık rıza yolu). */
  'explicit_checkbox',
  /** Aydınlatma metninin görüntülenmesi. Rıza değildir. */
  'implicit_view',
  /** Kayıt içine gömülü sesli rıza beyanı (V05). */
  'voice_statement',
]);
export type ConsentMethod = z.infer<typeof consentMethodSchema>;

export const consentStatusSchema = z.object({
  granted: z.boolean(),
  grantedAt: isoDateSchema.optional(),
  revokedAt: isoDateSchema.optional(),
  documentVersion: z.string().optional(),
  /** Onay verilen metnin hash'i — kanıt zincirinin taşıyıcısı. */
  documentSha256: sha256Schema.optional(),
  method: consentMethodSchema.optional(),
  /** Metin sürümü değiştiyse true: istemci rızayı yeniden almalı. */
  needsRenewal: z.boolean(),
});
export type ConsentStatus = z.infer<typeof consentStatusSchema>;

export const consentStateSchema = z.object({
  ses_biyometrik: consentStatusSchema,
  yurtdisi_aktarim: consentStatusSchema,
  cocuk_verisi: consentStatusSchema,
  pazarlama: consentStatusSchema,
});
export type ConsentState = z.infer<typeof consentStateSchema>;

/**
 * Rıza geri alınırsa NE OLACAĞI. Kullanıcıya İŞLEMDEN ÖNCE gösterilir
 * (Apple 5.1.1(ii) + SPEC §11.1 A02): "Anne ses profiliniz ve 4 hikayenin sesi
 * silinecek. Hikayeler kalacak, sistem sesine dönecek."
 */
export const consentSideEffectsSchema = z.object({
  subject: consentStateSubjectSchema,
  sideEffectsTr: z.array(z.string().min(1)),
  affectedStoryIds: z.array(storyIdSchema),
  affectedVoiceProfileIds: z.array(voiceProfileIdSchema),
  /** Geri dönüşü olmayan silme var mı? Varsa istemci ikinci onay ister. */
  irreversible: z.boolean(),
});
export type ConsentSideEffects = z.infer<typeof consentSideEffectsSchema>;

/* ── KVKK m.11 talepleri ─────────────────────────────────────── */

export const privacyRequestKindSchema = z.enum([
  'bilgi_talebi',
  'erisim',
  'duzeltme',
  'silme',
  'aktarim_bilgisi',
  'itiraz',
]);
export type PrivacyRequestKind = z.infer<typeof privacyRequestKindSchema>;

export const privacyRequestSchema = z.object({
  id: privacyRequestIdSchema,
  kind: privacyRequestKindSchema,
  status: z.enum(['alindi', 'inceleniyor', 'tamamlandi', 'reddedildi']),
  detailTr: z.string().optional(),
  createdAt: isoDateSchema,
  /** KVKK m.13: en geç 30 gün. */
  dueAt: isoDateSchema,
  resolvedAt: isoDateSchema.optional(),
  responseTr: z.string().optional(),
  /** 'erisim' talebinde hazırlanan veri paketi. */
  export: signedMediaSchema.optional(),
});
export type PrivacyRequest = z.infer<typeof privacyRequestSchema>;

export const dataMapCategorySchema = z.object({
  code: z.string().min(1),
  titleTr: z.string().min(1),
  descriptionTr: z.string().min(1),
  /** Bu kategoride tutulan somut veri kalemleri. */
  itemsTr: z.array(z.string().min(1)),
  retentionTr: z.string().min(1),
  processors: z.array(
    z.object({
      name: z.string().min(1),
      countryTr: z.string().min(1),
      purposeTr: z.string().min(1),
      safeguardTr: z.string().min(1),
    }),
  ),
});
export type DataMapCategory = z.infer<typeof dataMapCategorySchema>;

/* ── İhbar ───────────────────────────────────────────────────── */

export const reportReasonSchema = z.enum([
  'cocuga_uygunsuz_icerik',
  'siddet',
  'nefret_soylemi',
  'izinsiz_ses_kullanimi',
  'telif',
  'kisisel_veri',
  'teknik_hata',
  'diger',
]);
export type ReportReason = z.infer<typeof reportReasonSchema>;

/* ── Router ──────────────────────────────────────────────────── */

export const privacyContract = c.router({
  legalCurrent: {
    method: 'GET',
    path: '/v1/legal/:kind/current',
    summary: 'Yürürlükteki hukuki metin (auth gerektirmez)',
    pathParams: z.object({ kind: legalDocumentKindSchema }),
    responses: { 200: legalDocumentSchema, ...commonErrorResponses },
  },

  consentsGet: {
    method: 'GET',
    path: '/v1/consents',
    summary: 'Rıza durumu',
    responses: { 200: consentStateSchema, ...commonErrorResponses },
  },

  consentsRecord: {
    method: 'POST',
    path: '/v1/consents',
    summary: 'Tek bir konu için rıza/aydınlatma kaydı — her konu AYRI çağrı',
    headers: idempotencyHeadersSchema,
    body: z.object({
      subject: consentSubjectSchema,
      /** Ön-işaretsiz kutunun sonucu. Sunucu true/false farkını denetler. */
      granted: z.boolean(),
      documentId: legalDocumentIdSchema,
      /** İstemcinin gösterdiği metnin hash'i; sunucudakiyle eşleşmezse 409. */
      documentSha256: sha256Schema,
      method: consentMethodSchema,
    }),
    responses: {
      200: z.object({ consentState: consentStateSchema, recordedAt: isoDateSchema }),
      ...commonErrorResponses,
    },
  },

  consentSideEffects: {
    method: 'GET',
    path: '/v1/consents/:subject/side-effects',
    summary: 'Geri alınırsa ne olacağını ÖNCEDEN göster (A02 ekranı)',
    pathParams: z.object({ subject: consentStateSubjectSchema }),
    responses: { 200: consentSideEffectsSchema, ...commonErrorResponses },
  },

  consentRevoke: {
    method: 'DELETE',
    path: '/v1/consents/:subject',
    summary: 'Rızayı geri al — sonuçlar önce TR gösterilmiş olmalı',
    pathParams: z.object({ subject: consentStateSubjectSchema }),
    headers: idempotencyHeadersSchema,
    body: z.object({
      /** İstemci `consentSideEffects` yanıtını gösterdiğini beyan eder. */
      sideEffectsAcknowledged: z.literal(true),
    }),
    responses: {
      200: z.object({
        consentState: consentStateSchema,
        sideEffectsTr: z.array(z.string().min(1)),
        /** Silme zinciri başlatıldıysa takip edilecek iş. */
        jobId: jobIdSchema.optional(),
      }),
      ...commonErrorResponses,
    },
  },

  privacyRequestCreate: {
    method: 'POST',
    path: '/v1/privacy/requests',
    summary: 'KVKK m.11 başvurusu',
    headers: idempotencyHeadersSchema,
    body: z.object({
      kind: privacyRequestKindSchema,
      detailTr: z.string().max(2000).optional(),
    }),
    responses: { 201: privacyRequestSchema, ...commonErrorResponses },
  },

  privacyRequestList: {
    method: 'GET',
    path: '/v1/privacy/requests',
    summary: 'Başvuru geçmişi',
    query: pageQuerySchema,
    responses: { 200: paginatedSchema(privacyRequestSchema), ...commonErrorResponses },
  },

  privacyExport: {
    method: 'POST',
    path: '/v1/privacy/export',
    summary: 'Verilerimi indir — uzun iş',
    headers: idempotencyHeadersSchema,
    body: z.object({
      /** Ses ham kayıtları pakete dahil edilsin mi (büyük dosya). */
      includeVoiceRaw: z.boolean().default(false),
    }),
    responses: {
      202: z.object({ job: jobRefSchema }),
      ...commonErrorResponses,
    },
  },

  dataMap: {
    method: 'GET',
    path: '/v1/privacy/data-map',
    summary: 'Verilerim nerede, kim işliyor',
    responses: {
      200: z.object({ categories: z.array(dataMapCategorySchema) }),
      ...commonErrorResponses,
    },
  },

  supportReport: {
    method: 'POST',
    path: '/v1/support/report',
    summary: 'İçerik ihbarı — OTURUM GEREKTİRMEZ (Apple 1.2)',
    headers: idempotencyHeadersSchema,
    body: z.object({
      targetType: z.enum(['story', 'page', 'voice_profile', 'user', 'diger']),
      targetId: z.string().max(200).optional(),
      reason: reportReasonSchema,
      detailTr: z.string().min(1).max(2000),
      contactEmail: z.string().email().optional(),
    }),
    responses: {
      201: z.object({
        reportId: reportIdSchema,
        /** Yayımlanmış SLA: 72 saat. */
        slaHours: z.literal(72),
        messageTr: z.string().min(1),
      }),
      ...commonErrorResponses,
    },
  },
});
