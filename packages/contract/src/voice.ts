/**
 * voice.ts — ses klonlama onboarding'i (SPEC §7, 11 adım) + medya yükleme ön-imzası.
 *
 * BAĞLAYICI KURALLAR — bunlar sözleşmede görünür, çünkü ihlali hukuki risktir:
 *  1. Ses özelliği HİÇBİR YERDE ZORUNLU DEĞİLDİR. Sistem sesleriyle ürün tam çalışır.
 *  2. DOSYA YÜKLEME YOKTUR. `uploadsPresign` yalnızca `source:'in_app_microphone'`
 *     kabul eder; kullanıcı galeriden/dosyadan ses gönderemez (deepfake, TCK m.135-136).
 *  3. Okunacak metinler SUNUCUDAN gelir (`voiceScript`): hem prompt enjeksiyonunu
 *     hem de canlılık (liveness) kontrolünü mümkün kılar. TTL 15 dk, TEK KULLANIMLIK.
 *  4. Her pasaj AYRI kaydedilir ve AYRI yeniden kaydedilir — 4. pasajda hata yapan
 *     kullanıcı baştan başlamaz.
 *  5. Silme, sağlayıcıda da tetiklenir ve sonuçları kullanıcıya ÖNCEDEN Türkçe gösterilir.
 */

import {
  assetIdSchema,
  c,
  commonErrorResponses,
  idempotencyHeadersSchema,
  isoDateSchema,
  jobRefSchema,
  signedMediaSchema,
  storyIdSchema,
  takeIssueSchema,
  voiceProfileIdSchema,
  voiceScriptIdSchema,
} from './primitives';
import { consentStateSubjectSchema } from './privacy';
import { z } from 'zod';

/* ────────────────────────────────────────────────────────────────
 * Kalite eşikleri — SPEC §7 adım 7 tablosu
 *
 * TEK KAYNAK: sunucu ölçümü de, V04 mikrofon testindeki canlı dB metre de,
 * V06 kalite kartı da aynı sayıları kullanır. Eşikleri iki yerde tutmak
 * "ekranda yeşil, sunucuda kırmızı" hatasını üretir.
 * ──────────────────────────────────────────────────────────────── */
export const VOICE_QUALITY_THRESHOLDS = {
  /** Sinyal/gürültü oranı, dB. Altında → GURULTULU */
  snrDbMin: 20,
  /** Kliplenme oranı, yüzde. Üstünde → KLIPLENME */
  clippingPctMax: 0.1,
  /** Tepe seviye, dBFS. Aralık dışında → COK_SESSIZ */
  peakDbfsMin: -18,
  peakDbfsMax: -3,
  /** Konuşma hızı, kelime/dakika. Altında COK_YAVAS, üstünde COK_HIZLI */
  wordsPerMinuteMin: 110,
  wordsPerMinuteMax: 180,
  /** Bant genişliği, Hz. Altında → DAR_BANT_GENISLIGI (yalnızca uyarı) */
  bandwidthHzMin: 8000,
  /** Yankı süresi, ms. Üstünde → YANKILI */
  reverbMsMax: 400,
  /** Sessizlik oranı, yüzde. Üstünde → COK_KISA */
  silenceRatioMax: 0.35,
  /** ASR benzerliği (Levenshtein). Altında → METIN_ESLESMEDI */
  asrSimilarityMin: 0.85,
  /** Tespit edilen konuşmacı sayısı. Farklıysa → BIRDEN_FAZLA_KONUSMACI */
  speakerCount: 1,
  /** Referans kaydın toplam hedefi (saniye). 3 dakikayı ASLA geçme. */
  totalTargetSecMin: 100,
  totalTargetSecMax: 120,
  /** Tek pasaj başına kabul aralığı (saniye). */
  passageMinSec: 20,
  passageMaxSec: 45,
  /** Sesli rıza + canlılık klibi hedefi (saniye). */
  consentClipTargetSec: 12,
  /** Aynı adım için üst üste deneme hakkı; sonrasında 24 saat cooldown. */
  maxAttemptsPerStep: 5,
} as const;

/* ── Yükleme ön-imzası ───────────────────────────────────────── */

export const uploadKindSchema = z.enum(['voice_take']);

export const uploadPresignReqSchema = z.object({
  kind: uploadKindSchema,
  /** Uygulama içi kayıttan çıkan biçim. */
  mimeType: z.enum(['audio/wav', 'audio/webm', 'audio/mp4', 'audio/m4a']),
  sizeBytes: z
    .number()
    .int()
    .min(1)
    .max(25 * 1024 * 1024),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  /**
   * ⚠️ LİTERAL. Başka bir kaynak sözleşme düzeyinde imkânsızdır; dosya seçici
   * ile gelen ses yüklenemez (SPEC §10.1 madde 7).
   */
  source: z.literal('in_app_microphone'),
  durationMs: z.number().int().min(1).max(300_000),
});
export type UploadPresignReq = z.infer<typeof uploadPresignReqSchema>;

export const uploadPresignResSchema = z.object({
  assetId: assetIdSchema,
  uploadUrl: z.string().url(),
  /** İstemci PUT isteğinde bu başlıkları BİREBİR göndermek zorundadır. */
  headers: z.record(z.string()),
  expiresAt: isoDateSchema,
});
export type UploadPresignRes = z.infer<typeof uploadPresignResSchema>;

/* ── Profil ──────────────────────────────────────────────────── */

export const voiceRelationSchema = z.enum(['anne', 'baba', 'diger']);
export type VoiceRelation = z.infer<typeof voiceRelationSchema>;

export const voiceProfileStatusSchema = z.enum([
  'draft',
  'recording',
  'processing',
  'preview_ready',
  'ready',
  'failed',
  'revoked',
]);
export type VoiceProfileStatus = z.infer<typeof voiceProfileStatusSchema>;

export const voiceQualityBadgeSchema = z.enum(['mukemmel', 'iyi', 'kabul_edilebilir']);
export type VoiceQualityBadge = z.infer<typeof voiceQualityBadgeSchema>;

export const voiceProfileSchema = z.object({
  id: voiceProfileIdSchema,
  displayName: z.string().min(1).max(40),
  relation: voiceRelationSchema,
  status: voiceProfileStatusSchema,
  /** 0..1 — kullanıcıya sayı olarak DEĞİL, rozet olarak gösterilir. */
  qualityScore: z.number().min(0).max(1).optional(),
  qualityBadge: voiceQualityBadgeSchema.optional(),
  /** V08 önizlemesi: çocuğun adının geçtiği ~15 sn'lik tanıdık cümle. */
  preview: signedMediaSchema.optional(),
  storiesUsingCount: z.number().int().min(0),
  createdAt: isoDateSchema,
  acceptedAt: isoDateSchema.optional(),
  failureReasonTr: z.string().optional(),
});
export type VoiceProfile = z.infer<typeof voiceProfileSchema>;

/* ── Okuma metinleri (sunucu üretimi) ────────────────────────── */

export const voiceStepSchema = z.enum([
  'consent_clip',
  'passage_1',
  'passage_2',
  'passage_3',
  'passage_4',
]);
export type VoiceStep = z.infer<typeof voiceStepSchema>;

export const referencePassageSchema = z.object({
  step: z.enum(['passage_1', 'passage_2', 'passage_3', 'passage_4']),
  /** "Sakin anlatım", "Heyecanlı", "Fısıltıya yakın", "Diyalog" */
  titleTr: z.string().min(1),
  toneHintTr: z.string().min(1),
  /**
   * ~60-75 kelime, MASAL TONUNDA (haber metni gibi değil). IVC delivery style'ı
   * kopyalar: düz okutulursa üretilen tüm hikayeler düz çıkar.
   */
  bodyTr: z.string().min(1),
  targetSec: z.number().int().min(1),
});
export type ReferencePassage = z.infer<typeof referencePassageSchema>;

export const voiceScriptBundleSchema = z.object({
  scriptId: voiceScriptIdSchema,
  /** TTL 15 dk, TEK KULLANIMLIK. Süresi geçmiş script ile take gönderilemez. */
  expiresAt: isoDateSchema,
  consentClip: z.object({
    step: z.literal('consent_clip'),
    /** Canlılık kanıtı: sunucuda rastgele üretilir, tekrar kullanılamaz. */
    randomSentenceTr: z.string().min(1),
    /** "Ben Ayşe Yılmaz, sesimin ... işlenmesine izin veriyorum." */
    consentStatementTr: z.string().min(1),
    targetSec: z.number().int().min(1),
  }),
  passages: z.array(referencePassageSchema).length(4),
  totalTargetSec: z.number().int().min(1),
  /** V04/V06 ekranındaki maddeler: "Sessiz bir oda seçin", "Telefonu 20 cm uzakta tutun"... */
  guidanceTr: z.array(z.string().min(1)),
});
export type VoiceScriptBundle = z.infer<typeof voiceScriptBundleSchema>;

/* ── Take kalite ölçümü ──────────────────────────────────────── */

export const takeQualitySchema = z.object({
  snrDb: z.number(),
  peakDbfs: z.number(),
  clippingPct: z.number().min(0),
  silenceRatio: z.number().min(0).max(1),
  wordsPerMinute: z.number().min(0),
  bandwidthHz: z.number().min(0),
  reverbMs: z.number().min(0).optional(),
  asrSimilarity: z.number().min(0).max(1).optional(),
  speakerCount: z.number().int().min(0).optional(),
  durationMs: z.number().int().min(0),
  /** 0..1 birleşik skor. */
  score: z.number().min(0).max(1),
});
export type TakeQuality = z.infer<typeof takeQualitySchema>;

export const submitTakeResSchema = z.object({
  accepted: z.boolean(),
  quality: takeQualitySchema,
  /** Ölçüm eşiği aşan tüm sorunlar. Boş dizi = temiz kayıt. */
  issues: z.array(takeIssueSchema),
  /** TEK CÜMLELİK SOMUT DÜZELTME: "Biraz daha yavaş okuyun." */
  guidanceTr: z.string().min(1),
  canRetry: z.boolean(),
  attemptsLeft: z.number().int().min(0),
  /** Deneme hakkı bittiyse cooldown bitiş zamanı. */
  cooldownUntil: isoDateSchema.optional(),
  progress: z.object({
    completedSteps: z.array(voiceStepSchema),
    nextStep: voiceStepSchema.optional(),
    /** "72 / 110 saniye" ilerleme göstergesi. */
    capturedSec: z.number().min(0),
    targetSec: z.number().min(0),
  }),
});
export type SubmitTakeRes = z.infer<typeof submitTakeResSchema>;

/* ── Router ──────────────────────────────────────────────────── */

export const voiceContract = c.router({
  uploadsPresign: {
    method: 'POST',
    path: '/v1/uploads/presign',
    summary: 'Uygulama içi mikrofon kaydı için doğrudan yükleme adresi',
    headers: idempotencyHeadersSchema,
    body: uploadPresignReqSchema,
    responses: { 200: uploadPresignResSchema, ...commonErrorResponses },
  },

  listProfiles: {
    method: 'GET',
    path: '/v1/voice/profiles',
    summary: 'Ses profillerim (A03 "Sesim" ekranı)',
    responses: {
      200: z.object({
        items: z.array(voiceProfileSchema),
        /** Hesap başına aktif profil üst sınırı (SPEC §10.1 madde 10: 2). */
        limit: z.number().int().min(0),
        /** Yeni profil için beklenmesi gereken süre (kötüye kullanım koruması). */
        cooldownUntil: isoDateSchema.optional(),
      }),
      ...commonErrorResponses,
    },
  },

  getProfile: {
    method: 'GET',
    path: '/v1/voice/profiles/:voiceProfileId',
    summary: 'Tek ses profili (V07 bekleme ekranı polling yolu)',
    pathParams: z.object({ voiceProfileId: voiceProfileIdSchema }),
    responses: { 200: voiceProfileSchema, ...commonErrorResponses },
  },

  createProfile: {
    method: 'POST',
    path: '/v1/voice/profiles',
    summary: 'Ses profili taslağı aç (V03 sonrası)',
    headers: idempotencyHeadersSchema,
    body: z.object({
      displayName: z.string().trim().min(1).max(40),
      relation: voiceRelationSchema,
    }),
    responses: {
      201: z.object({
        profile: voiceProfileSchema,
        /**
         * Eksik açık rızalar. Boş değilse istemci V02/V03 ekranlarına döner;
         * eksikken take gönderirse `403 CONSENT_REQUIRED` alır.
         */
        consentRequired: z.array(consentStateSubjectSchema),
      }),
      ...commonErrorResponses,
    },
  },

  script: {
    method: 'GET',
    path: '/v1/voice/profiles/:voiceProfileId/script',
    summary: 'Okunacak metinler — sunucu üretimi, TTL 15 dk, tek kullanımlık',
    pathParams: z.object({ voiceProfileId: voiceProfileIdSchema }),
    responses: { 200: voiceScriptBundleSchema, ...commonErrorResponses },
  },

  submitTake: {
    method: 'POST',
    path: '/v1/voice/profiles/:voiceProfileId/takes',
    summary: 'Tek kayıt gönder — ANINDA kalite geri bildirimi (V06)',
    pathParams: z.object({ voiceProfileId: voiceProfileIdSchema }),
    headers: idempotencyHeadersSchema,
    body: z.object({
      step: voiceStepSchema,
      assetId: assetIdSchema,
      scriptId: voiceScriptIdSchema,
      /** İstemcinin ölçtüğü süre; sunucu ölçümüyle çelişirse sunucu kazanır. */
      clientDurationMs: z.number().int().min(0).optional(),
    }),
    responses: { 200: submitTakeResSchema, ...commonErrorResponses },
  },

  submit: {
    method: 'POST',
    path: '/v1/voice/profiles/:voiceProfileId/submit',
    summary: 'Profili üret — klon + önizleme (uzun iş, V07)',
    pathParams: z.object({ voiceProfileId: voiceProfileIdSchema }),
    headers: idempotencyHeadersSchema,
    body: z.object({
      /** Önizleme cümlesinde geçecek çocuk adı (V08 duygusal doğrulama). */
      previewChildName: z.string().trim().min(1).max(30).optional(),
    }),
    responses: { 202: z.object({ job: jobRefSchema }), ...commonErrorResponses },
  },

  accept: {
    method: 'POST',
    path: '/v1/voice/profiles/:voiceProfileId/accept',
    summary: 'Önizlemeyi onayla → status=ready, ham kayıt 30 gün sonra imha edilir',
    pathParams: z.object({ voiceProfileId: voiceProfileIdSchema }),
    headers: idempotencyHeadersSchema,
    body: z.object({}),
    responses: { 200: voiceProfileSchema, ...commonErrorResponses },
  },

  redo: {
    method: 'POST',
    path: '/v1/voice/profiles/:voiceProfileId/redo',
    summary: 'Tek bir pasajı yeniden kaydet — baştan başlamak GEREKMEZ',
    pathParams: z.object({ voiceProfileId: voiceProfileIdSchema }),
    headers: idempotencyHeadersSchema,
    body: z.object({
      /** Verilmezse tüm pasajlar sıfırlanır; verilirse yalnızca o adım. */
      fromStep: voiceStepSchema.optional(),
    }),
    responses: { 200: voiceScriptBundleSchema, ...commonErrorResponses },
  },

  remove: {
    method: 'DELETE',
    path: '/v1/voice/profiles/:voiceProfileId',
    summary: 'Sil — sağlayıcıda da siler; hikayeler kalır, sistem sesine döner',
    pathParams: z.object({ voiceProfileId: voiceProfileIdSchema }),
    headers: idempotencyHeadersSchema,
    body: z.object({ sideEffectsAcknowledged: z.literal(true) }),
    responses: {
      202: z.object({
        job: jobRefSchema,
        affectedStoryIds: z.array(storyIdSchema),
        /** "Anne ses profiliniz ve 4 hikayenin sesi silinecek." */
        sideEffectsTr: z.array(z.string().min(1)),
      }),
      ...commonErrorResponses,
    },
  },
});
