/**
 * billing.ts — hak/kota (entitlements), maliyet tahmini, kredi paketleri ve ödeme.
 *
 * ÜRÜN KARARI: MVP'de ABONELİK YOKTUR. Gelir modeli = kredi paketi (dijital hikaye)
 * + tek seferlik basılı kitap satışı. `subscription` ucu sözleşmede yerini korur
 * ama MVP'de daima `{ subscription: null }` döner (SPEC-API §5.4 satırı korunsun diye).
 */

import {
  c,
  commonErrorResponses,
  costPreviewSchema,
  cursorSchema,
  idempotencyHeadersSchema,
  isoDateSchema,
  moneyTrySchema,
  okSchema,
  pageQuerySchema,
  paginatedSchema,
} from './primitives';
import { z } from 'zod';

/* ── Şemalar ─────────────────────────────────────────────────── */

/**
 * Kullanıcının o anki hakları. Sihirbazın her adımı bunu okur; "Oluştur" butonu
 * `credits`/`costCap.blocked` değerine göre kilitlenir — kullanıcı 3 dakika emek
 * verdikten SONRA "kredi yok" duvarına çarpmamalı.
 */
export const entitlementsSchema = z.object({
  planCode: z.string().min(1),
  periodStart: isoDateSchema,
  periodEnd: isoDateSchema,
  stories: z.object({
    used: z.number().int().min(0),
    /** null = sınırsız (yalnızca dahili/ops planları). */
    limit: z.number().int().min(0).nullable(),
  }),
  credits: z.number().int().min(0),
  voiceProfiles: z.object({
    used: z.number().int().min(0),
    limit: z.number().int().min(0),
  }),
  /** USD cinsinden dahili üretim bütçesi. Kullanıcıya TL olarak gösterilmez. */
  costCap: z.object({
    usedUsd: z.number().min(0),
    capUsd: z.number().min(0),
    blocked: z.boolean(),
  }),
  canCloneVoice: z.boolean(),
});
export type Entitlements = z.infer<typeof entitlementsSchema>;

/** Kredi paketi. `isCreditPack:false` yalnızca ileride abonelik gelirse kullanılır. */
export const planSchema = z.object({
  code: z.string().min(1),
  titleTr: z.string().min(1),
  descriptionTr: z.string().min(1),
  /** KURUŞ. 29900 → 299,00 TL */
  priceTry: moneyTrySchema,
  credits: z.number().int().min(0),
  bonusCredits: z.number().int().min(0).default(0),
  badgeTr: z.string().optional(),
  featuresTr: z.array(z.string()),
  isCreditPack: z.boolean(),
  /** Mağaza içi satın alma kimliği (App Store / Play Billing). */
  storeProductId: z.string().optional(),
});
export type Plan = z.infer<typeof planSchema>;

export const creditEntrySchema = z.object({
  id: z.string().min(1),
  at: isoDateSchema,
  /** Pozitif = yükleme, negatif = harcama. */
  delta: z.number().int(),
  balanceAfter: z.number().int().min(0),
  reasonTr: z.string().min(1),
  kind: z.enum(['satin_alma', 'hikaye', 'seslendirme', 'gorsel', 'baski', 'iade', 'hediye']),
  storyId: z.string().uuid().optional(),
});
export type CreditEntry = z.infer<typeof creditEntrySchema>;

/** Kredi harcayan işlemler. `POST /v1/estimates` bunlardan biri için ön maliyet verir. */
export const estimateOperationSchema = z.enum([
  'story_outline',
  'story_fill',
  'page_rewrite',
  'page_reillustrate',
  'audio_render',
  'book_build',
  'export_mp4',
]);
export type EstimateOperation = z.infer<typeof estimateOperationSchema>;

export const subscriptionSchema = z.object({
  planCode: z.string().min(1),
  status: z.enum(['active', 'cancelled', 'past_due']),
  renewsAt: isoDateSchema.optional(),
  cancelledAt: isoDateSchema.optional(),
});
export type Subscription = z.infer<typeof subscriptionSchema>;

/* ── Router ──────────────────────────────────────────────────── */

export const billingContract = c.router({
  entitlements: {
    method: 'GET',
    path: '/v1/entitlements',
    summary: 'Hak/kota durumu — sihirbazın her adımında okunur',
    responses: { 200: entitlementsSchema, ...commonErrorResponses },
  },

  estimate: {
    method: 'POST',
    path: '/v1/estimates',
    summary: 'Kredi düşmeden önce maliyeti göster (S06 özet ekranı)',
    headers: idempotencyHeadersSchema,
    body: z.object({
      operation: estimateOperationSchema,
      /**
       * İşleme özgü parametreler. Serbest biçim çünkü her operasyonun girdisi farklı;
       * sunucu kendi şemasıyla doğrular ve bilinmeyen alanı yok sayar.
       */
      params: z.record(z.union([z.string(), z.number(), z.boolean()])).default({}),
    }),
    responses: { 200: costPreviewSchema, ...commonErrorResponses },
  },

  plans: {
    method: 'GET',
    path: '/v1/billing/plans',
    summary: 'Kredi paketleri',
    responses: { 200: z.object({ items: z.array(planSchema) }), ...commonErrorResponses },
  },

  subscription: {
    method: 'GET',
    path: '/v1/billing/subscription',
    summary: 'Abonelik durumu — MVP: daima null',
    responses: {
      200: z.object({ subscription: subscriptionSchema.nullable() }),
      ...commonErrorResponses,
    },
  },

  credits: {
    method: 'GET',
    path: '/v1/billing/credits',
    summary: 'Kredi bakiyesi ve hareket defteri',
    query: pageQuerySchema,
    responses: {
      200: z.object({
        balance: z.number().int().min(0),
        entries: z.array(creditEntrySchema),
        nextCursor: cursorSchema.nullable(),
      }),
      ...commonErrorResponses,
    },
  },

  checkout: {
    method: 'POST',
    path: '/v1/billing/checkout',
    summary: 'Kredi paketi satın alma başlat',
    headers: idempotencyHeadersSchema,
    body: z.object({
      planCode: z.string().min(1),
      quantity: z.number().int().min(1).max(10).default(1),
      /** Ödeme sonrası dönülecek derin bağlantı (uygulama şeması). */
      returnUrl: z.string().min(1).optional(),
    }),
    responses: {
      200: z.object({
        provider: z.literal('iyzico'),
        redirectUrl: z.string().url(),
        checkoutRef: z.string().min(1),
        expiresAt: isoDateSchema,
      }),
      ...commonErrorResponses,
    },
  },

  cancel: {
    method: 'POST',
    path: '/v1/billing/cancel',
    summary: 'Aboneliği iptal et — MVP: abonelik olmadığı için 409 CONFLICT',
    headers: idempotencyHeadersSchema,
    body: z.object({ reasonTr: z.string().max(500).optional() }),
    responses: {
      200: okSchema.extend({ effectiveAt: isoDateSchema.optional() }),
      ...commonErrorResponses,
    },
  },
});

export const creditLedgerPageSchema = paginatedSchema(creditEntrySchema);
