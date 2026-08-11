/**
 * ops.ts — İÇ OPERASYON PANELİ (O01-O05). AYRI ROUTER.
 *
 * ⚠️ Bu router `@kendihikayem/contract` kök dışa aktarımına DAHİL DEĞİLDİR.
 * Kullanıcı uygulaması (apps/mobile) bu tipleri görmemeli; yalnızca `apps/ops`
 * `@kendihikayem/contract/ops` yolundan içeri alır. Sebep: ops uçları farklı
 * yetki modeline (admin) ve farklı sürüm hızına sahiptir.
 */

import {
  baseHeadersSchema,
  bookBuildIdSchema,
  c,
  commonErrorResponses,
  idempotencyHeadersSchema,
  isoDateSchema,
  moneyTrySchema,
  orderIdSchema,
  pageQuerySchema,
  paginatedSchema,
  reportIdSchema,
  signedMediaSchema,
  storyIdSchema,
  userIdSchema,
} from './primitives';
import { orderStatusSchema } from './print';
import { reportReasonSchema } from './privacy';
import { z } from 'zod';

/* ── O01 Sipariş kuyruğu ─────────────────────────────────────── */

export const opsOrderRowSchema = z.object({
  id: orderIdSchema,
  orderNo: z.string().min(1),
  status: orderStatusSchema,
  buildId: bookBuildIdSchema,
  storyTitle: z.string().min(1),
  quantity: z.number().int().min(1),
  totalTry: moneyTrySchema,
  city: z.string().min(1),
  district: z.string().min(1),
  recipientName: z.string().min(1),
  printPdf: signedMediaSchema.optional(),
  coverPdf: signedMediaSchema.optional(),
  /** Basımevine gidecek iş emri. */
  workOrder: signedMediaSchema.optional(),
  createdAt: isoDateSchema,
  paidAt: isoDateSchema.optional(),
});
export type OpsOrderRow = z.infer<typeof opsOrderRowSchema>;

/* ── O02 Görsel insan-onayı kuyruğu ──────────────────────────── */

export const opsImageReviewSchema = z.object({
  id: z.string().min(1),
  storyId: storyIdSchema,
  pageNo: z.number().int().min(1),
  image: signedMediaSchema,
  faceRef: signedMediaSchema.optional(),
  /** Otomatik QA neden düşürdü. */
  qa: z.object({
    identityCosine: z.number().optional(),
    ocrTextFound: z.string().optional(),
    paletteDeltaE: z.number().optional(),
    safeZoneOk: z.boolean().optional(),
    providerBlockedReason: z.string().optional(),
  }),
  attempt: z.number().int().min(0),
  createdAt: isoDateSchema,
});
export type OpsImageReview = z.infer<typeof opsImageReviewSchema>;

/* ── O03 Moderasyon kuyruğu ──────────────────────────────────── */

export const opsModerationItemSchema = z.object({
  id: z.string().min(1),
  layer: z.enum(['K1', 'K2', 'K3', 'K4', 'K5', 'K6']),
  storyId: storyIdSchema.optional(),
  userId: userIdSchema.optional(),
  /** Şüpheli girdi/çıktı — ops panelinde ham gösterilir. */
  sampleText: z.string(),
  verdict: z.enum(['blocked', 'flagged', 'allowed']),
  reason: z.string().min(1),
  createdAt: isoDateSchema,
});
export type OpsModerationItem = z.infer<typeof opsModerationItemSchema>;

/* ── O04 İhbar kuyruğu (72 saat SLA) ─────────────────────────── */

export const opsReportSchema = z.object({
  id: reportIdSchema,
  targetType: z.enum(['story', 'page', 'voice_profile', 'user', 'diger']),
  targetId: z.string().optional(),
  reason: reportReasonSchema,
  detailTr: z.string().min(1),
  contactEmail: z.string().optional(),
  status: z.enum(['acik', 'inceleniyor', 'kapatildi']),
  createdAt: isoDateSchema,
  /** SLA bitişi; ops panelinde geri sayım gösterilir. */
  dueAt: isoDateSchema,
  resolvedAt: isoDateSchema.optional(),
  resolutionTr: z.string().optional(),
});
export type OpsReport = z.infer<typeof opsReportSchema>;

/* ── O05 Maliyet + sağlayıcı sağlığı ─────────────────────────── */

export const opsCostSummarySchema = z.object({
  windowTr: z.string().min(1),
  totalUsd: z.number().min(0),
  byStage: z.array(z.object({ stage: z.string().min(1), usd: z.number().min(0) })),
  /** content_cache sayesinde harcanmayan tutar — kaldıracın kanıtı. */
  savedUsd: z.number().min(0),
  storiesCreated: z.number().int().min(0),
  avgUsdPerStory: z.number().min(0),
  capUsd: z.number().min(0),
  killSwitchActive: z.boolean(),
});
export type OpsCostSummary = z.infer<typeof opsCostSummarySchema>;

export const opsProviderHealthSchema = z.object({
  providers: z.array(
    z.object({
      key: z.string().min(1),
      role: z.enum(['llm', 'image', 'tts', 'align', 'moderation', 'print', 'payment']),
      state: z.enum(['healthy', 'degraded', 'circuit_open', 'disabled']),
      p95LatencyMs: z.number().int().min(0),
      errorRate: z.number().min(0).max(1),
      /** ElevenLabs ses slotu gibi sert tavanlar. */
      capacity: z
        .object({ used: z.number().int().min(0), limit: z.number().int().min(0) })
        .optional(),
      /** KVKK m.9: standart sözleşme imzalanmadan sağlayıcı açılamaz. */
      requiresScc: z.boolean(),
      sccSigned: z.boolean(),
      lastCheckedAt: isoDateSchema,
    }),
  ),
});
export type OpsProviderHealth = z.infer<typeof opsProviderHealthSchema>;

/* ── Router ──────────────────────────────────────────────────── */

export const opsContract = c.router({
  ordersList: {
    method: 'GET',
    path: '/v1/ops/orders',
    summary: 'O01 sipariş kuyruğu',
    query: pageQuerySchema.extend({ status: orderStatusSchema.optional() }),
    responses: { 200: paginatedSchema(opsOrderRowSchema), ...commonErrorResponses },
  },

  orderGet: {
    method: 'GET',
    path: '/v1/ops/orders/:orderId',
    summary: 'O01 sipariş detayı + baskı dosyaları',
    pathParams: z.object({ orderId: orderIdSchema }),
    responses: { 200: opsOrderRowSchema, ...commonErrorResponses },
  },

  orderUpdateStatus: {
    method: 'POST',
    path: '/v1/ops/orders/:orderId/status',
    summary: 'O01 durum + kargo bilgisi güncelle',
    pathParams: z.object({ orderId: orderIdSchema }),
    headers: idempotencyHeadersSchema,
    body: z.object({
      status: orderStatusSchema,
      tracking: z
        .object({
          carrier: z.string().min(1),
          number: z.string().min(1),
          url: z.string().url(),
        })
        .optional(),
      noteTr: z.string().max(500).optional(),
    }),
    responses: { 200: opsOrderRowSchema, ...commonErrorResponses },
  },

  orderWorkOrder: {
    method: 'POST',
    path: '/v1/ops/orders/:orderId/work-order',
    summary: 'O01 basımevi iş emri üret',
    pathParams: z.object({ orderId: orderIdSchema }),
    headers: idempotencyHeadersSchema,
    body: z.object({ printerCode: z.string().min(1) }),
    responses: {
      200: z.object({ workOrder: signedMediaSchema }),
      ...commonErrorResponses,
    },
  },

  imageReviewList: {
    method: 'GET',
    path: '/v1/ops/image-reviews',
    summary: 'O02 görsel insan-onayı kuyruğu',
    query: pageQuerySchema,
    responses: { 200: paginatedSchema(opsImageReviewSchema), ...commonErrorResponses },
  },

  imageReviewDecide: {
    method: 'POST',
    path: '/v1/ops/image-reviews/:reviewId/decide',
    summary: 'O02 onayla / yeniden üret / elle yükle',
    pathParams: z.object({ reviewId: z.string().min(1) }),
    headers: idempotencyHeadersSchema,
    body: z.object({
      decision: z.enum(['approve', 'regenerate', 'drop']),
      instructionTr: z.string().max(300).optional(),
    }),
    responses: { 200: z.object({ ok: z.literal(true) }), ...commonErrorResponses },
  },

  moderationList: {
    method: 'GET',
    path: '/v1/ops/moderation',
    summary: 'O03 moderasyon kuyruğu',
    query: pageQuerySchema.extend({ verdict: z.enum(['blocked', 'flagged', 'allowed']).optional() }),
    responses: { 200: paginatedSchema(opsModerationItemSchema), ...commonErrorResponses },
  },

  moderationDecide: {
    method: 'POST',
    path: '/v1/ops/moderation/:itemId/decide',
    summary: 'O03 karar ver (yanlış pozitifleri geri al)',
    pathParams: z.object({ itemId: z.string().min(1) }),
    headers: idempotencyHeadersSchema,
    body: z.object({
      decision: z.enum(['uphold', 'overturn']),
      noteTr: z.string().max(500).optional(),
    }),
    responses: { 200: z.object({ ok: z.literal(true) }), ...commonErrorResponses },
  },

  reportsList: {
    method: 'GET',
    path: '/v1/ops/reports',
    summary: 'O04 ihbar kuyruğu — 72 saat SLA sayacı',
    query: pageQuerySchema.extend({ status: z.enum(['acik', 'inceleniyor', 'kapatildi']).optional() }),
    responses: { 200: paginatedSchema(opsReportSchema), ...commonErrorResponses },
  },

  reportResolve: {
    method: 'POST',
    path: '/v1/ops/reports/:reportId/resolve',
    summary: 'O04 ihbarı sonuçlandır',
    pathParams: z.object({ reportId: reportIdSchema }),
    headers: idempotencyHeadersSchema,
    body: z.object({
      action: z.enum(['icerik_kaldirildi', 'ses_silindi', 'hesap_kisitlandi', 'islem_yok']),
      resolutionTr: z.string().min(1).max(1000),
    }),
    responses: { 200: opsReportSchema, ...commonErrorResponses },
  },

  costSummary: {
    method: 'GET',
    path: '/v1/ops/health/cost',
    summary: 'O05 maliyet paneli',
    query: z.object({ window: z.enum(['24h', '7d', '30d']).default('24h') }),
    responses: { 200: opsCostSummarySchema, ...commonErrorResponses },
  },

  providerHealth: {
    method: 'GET',
    path: '/v1/ops/health/providers',
    summary: 'O05 sağlayıcı sağlık paneli',
    responses: { 200: opsProviderHealthSchema, ...commonErrorResponses },
  },
}, { baseHeaders: baseHeadersSchema });
