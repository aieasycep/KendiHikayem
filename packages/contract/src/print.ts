/**
 * print.ts — baskıya hazır kitap üretimi, sipariş, ödeme ve dışa aktarma.
 *
 * ⚠️ 6502 SAYILI KANUN — CAYMA HAKKI (SPEC §10.1 madde 17)
 * Kişiye özel üretilen kitapta cayma hakkı istisnası vardır AMA istisna ancak
 * ibare sipariş onayından ÖNCE açıkça gösterilmişse işler. Sözleşme bunu ÜÇ
 * katmanda zorlar:
 *   1. `QuoteRes.withdrawalNoticeTr` — FE bu metni birebir basmak zorundadır.
 *   2. `CreateOrderReq.withdrawalWaiverAccepted: true` LİTERAL tipi — `false`
 *      geçen kod DERLENMEZ.
 *   3. `withdrawalDocId` + `distanceContractDocId` — hangi metin sürümünün
 *      onaylandığı siparişe yazılır (kanıt zinciri).
 */

import {
  bookBuildIdSchema,
  c,
  commonErrorResponses,
  exportIdSchema,
  idempotencyHeadersSchema,
  isoDateSchema,
  jobRefSchema,
  legalDocumentIdSchema,
  moneyTrySchema,
  orderIdSchema,
  pageQuerySchema,
  paginatedSchema,
  renditionIdSchema,
  signedMediaSchema,
  storyIdSchema,
} from './primitives';
import { z } from 'zod';

/* ── Kitap üretimi ───────────────────────────────────────────── */

export const bookBuildSchema = z.object({
  id: bookBuildIdSchema,
  storyId: storyIdSchema,
  formatCode: z.string().min(1),
  revision: z.number().int().min(1),
  status: z.enum(['building', 'ready', 'failed']),
  /** Gerçek çift sayfalar — B02 önizlemesinde çevrilerek gezilir. */
  spreads: z.array(
    z.object({
      index: z.number().int().min(0),
      left: signedMediaSchema,
      right: signedMediaSchema,
    }),
  ),
  previewPdf: signedMediaSchema.optional(),
  /** Dijital teslim PDF'i (baskı dosyası DEĞİL). */
  digitalPdf: signedMediaSchema.optional(),
  spineMm: z.number().min(0).optional(),
  /** Preflight sonuçları; hepsi true değilse sipariş açılamaz. */
  checks: z.object({
    dpiOk: z.boolean(),
    fontsEmbedded: z.boolean(),
    safeZoneOk: z.boolean(),
    bleedOk: z.boolean(),
  }),
  warningsTr: z.array(z.string().min(1)),
  qr: z.object({
    enabled: z.boolean(),
    /** "Anne" — QR'ı okutan kişi sayfayı bu sesle dinler. */
    renditionLabel: z.string().optional(),
  }),
  createdAt: isoDateSchema,
});
export type BookBuild = z.infer<typeof bookBuildSchema>;

/* ── Teklif & sipariş ────────────────────────────────────────── */

export const quoteResSchema = z.object({
  /** Tüm tutarlar KURUŞ. */
  unitPriceTry: moneyTrySchema,
  shippingTry: moneyTrySchema,
  discountTry: moneyTrySchema,
  totalTry: moneyTrySchema,
  installmentOptions: z.array(
    z.object({
      count: z.number().int().min(1),
      monthlyTry: moneyTrySchema,
      totalTry: moneyTrySchema,
    }),
  ),
  etaBusinessDays: z.tuple([z.number().int().min(1), z.number().int().min(1)]),
  /** ⭐ FE bunu ZORUNLU olarak, ayrı ve okunur bir kutuda basar (6502). */
  withdrawalNoticeTr: z.string().min(1),
  withdrawalDocId: legalDocumentIdSchema,
  distanceContractDocId: legalDocumentIdSchema,
  /** Teklifin geçerlilik süresi; dolduysa yeniden teklif alınır. */
  expiresAt: isoDateSchema,
});
export type QuoteRes = z.infer<typeof quoteResSchema>;

export const shippingAddressSchema = z.object({
  recipientName: z.string().trim().min(2).max(80),
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/),
  addressLine1: z.string().trim().min(5).max(200),
  addressLine2: z.string().trim().max(200).optional(),
  district: z.string().trim().min(2).max(60),
  city: z.string().trim().min(2).max(60),
  postalCode: z.string().regex(/^\d{5}$/).optional(),
});
export type ShippingAddress = z.infer<typeof shippingAddressSchema>;

export const createOrderReqSchema = z.object({
  buildId: bookBuildIdSchema,
  quantity: z.number().int().min(1).max(20),
  shipping: shippingAddressSchema,
  giftNoteTr: z.string().trim().max(200).optional(),
  /** ⚠️ LİTERAL true — `false` ile DERLENMEZ (6502 kanıt katmanı 2). */
  withdrawalWaiverAccepted: z.literal(true),
  withdrawalDocId: legalDocumentIdSchema,
  distanceContractDocId: legalDocumentIdSchema,
  installment: z.number().int().min(1).max(12).optional(),
});
export type CreateOrderReq = z.infer<typeof createOrderReqSchema>;

export const orderStatusSchema = z.enum([
  'odeme_bekliyor',
  'odendi',
  'uretimde',
  'baskida',
  'kargoya_verildi',
  'teslim_edildi',
  'iptal_edildi',
  'iade_edildi',
]);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

export const orderSchema = z.object({
  id: orderIdSchema,
  orderNo: z.string().min(1),
  status: orderStatusSchema,
  storyId: storyIdSchema,
  storyTitle: z.string().min(1),
  cover: signedMediaSchema.optional(),
  quantity: z.number().int().min(1),
  totalTry: moneyTrySchema,
  etaDeliveryAt: isoDateSchema.optional(),
  tracking: z
    .object({
      carrier: z.string().min(1),
      number: z.string().min(1),
      url: z.string().url(),
    })
    .optional(),
  /** Kullanıcıya gösterilen zaman çizelgesi; her adım Türkçe cümle. */
  timeline: z.array(z.object({ at: isoDateSchema, statusTr: z.string().min(1) })),
  createdAt: isoDateSchema,
});
export type Order = z.infer<typeof orderSchema>;

/* ── Dışa aktarma ────────────────────────────────────────────── */

export const storyExportSchema = z.object({
  id: exportIdSchema,
  kind: z.enum(['pdf', 'mp4']),
  status: z.enum(['queued', 'running', 'ready', 'failed']),
  media: signedMediaSchema.optional(),
  createdAt: isoDateSchema,
  expiresAt: isoDateSchema.optional(),
});
export type StoryExport = z.infer<typeof storyExportSchema>;

/* ── Router ──────────────────────────────────────────────────── */

export const printContract = c.router({
  createBookBuild: {
    method: 'POST',
    path: '/v1/stories/:storyId/book-builds',
    summary: 'Baskıya hazır kitap üret — 4K yeniden üretim burada başlar (B01)',
    description:
      'En pahalı adım. Hikaye onaylanmamışsa 409 STORY_NOT_APPROVED döner. 4K görseller ' +
      'yalnızca baskı siparişinde üretilir (SPEC §6.2 madde 1).',
    pathParams: z.object({ storyId: storyIdSchema }),
    headers: idempotencyHeadersSchema,
    body: z.object({
      formatCode: z.string().min(1),
      dedicationTr: z.string().trim().max(300).optional(),
      includeQr: z.boolean().default(false),
      /** QR hangi sesi çalacak. includeQr true ise zorunlu. */
      qrRenditionId: renditionIdSchema.optional(),
    }),
    responses: {
      202: z.object({ buildId: bookBuildIdSchema, job: jobRefSchema }),
      ...commonErrorResponses,
    },
  },

  getBookBuild: {
    method: 'GET',
    path: '/v1/book-builds/:buildId',
    summary: 'Spread önizleme + preflight sonuçları (B02)',
    pathParams: z.object({ buildId: bookBuildIdSchema }),
    responses: { 200: bookBuildSchema, ...commonErrorResponses },
  },

  quote: {
    method: 'POST',
    path: '/v1/orders/quote',
    summary: 'Fiyat teklifi — CAYMA HAKKI ibaresi bu yanıtta gelir (B06)',
    headers: idempotencyHeadersSchema,
    body: z.object({
      buildId: bookBuildIdSchema,
      quantity: z.number().int().min(1).max(20),
      city: z.string().trim().min(2).max(60),
      district: z.string().trim().min(2).max(60),
      couponCode: z.string().trim().max(40).optional(),
    }),
    responses: { 200: quoteResSchema, ...commonErrorResponses },
  },

  createOrder: {
    method: 'POST',
    path: '/v1/orders',
    summary: 'Sipariş oluştur → iyzico ödeme sayfasına yönlendir',
    headers: idempotencyHeadersSchema,
    body: createOrderReqSchema,
    responses: {
      201: z.object({
        order: orderSchema,
        payment: z.object({
          provider: z.literal('iyzico'),
          redirectUrl: z.string().url(),
          expiresAt: isoDateSchema,
        }),
      }),
      ...commonErrorResponses,
    },
  },

  listOrders: {
    method: 'GET',
    path: '/v1/orders',
    summary: 'Siparişlerim (B08)',
    query: pageQuerySchema.extend({ status: orderStatusSchema.optional() }),
    responses: { 200: paginatedSchema(orderSchema), ...commonErrorResponses },
  },

  getOrder: {
    method: 'GET',
    path: '/v1/orders/:orderId',
    summary: 'Sipariş takibi',
    pathParams: z.object({ orderId: orderIdSchema }),
    responses: { 200: orderSchema, ...commonErrorResponses },
  },

  cancelOrder: {
    method: 'POST',
    path: '/v1/orders/:orderId/cancel',
    summary: 'Sipariş iptali — baskıya girdikten sonra mümkün değildir',
    pathParams: z.object({ orderId: orderIdSchema }),
    headers: idempotencyHeadersSchema,
    body: z.object({ reasonTr: z.string().trim().max(300).optional() }),
    responses: { 200: orderSchema, ...commonErrorResponses },
  },

  createExport: {
    method: 'POST',
    path: '/v1/stories/:storyId/exports',
    summary: 'PDF / MP4 dışa aktar (P05 paylaş)',
    pathParams: z.object({ storyId: storyIdSchema }),
    headers: idempotencyHeadersSchema,
    body: z.object({
      kind: z.enum(['pdf', 'mp4']),
      /** MP4 için hangi ses kullanılacak. */
      renditionId: renditionIdSchema.optional(),
    }),
    responses: {
      202: z.object({ exportId: exportIdSchema, job: jobRefSchema }),
      ...commonErrorResponses,
    },
  },

  listExports: {
    method: 'GET',
    path: '/v1/stories/:storyId/exports',
    summary: 'Hazır dışa aktarmalar',
    pathParams: z.object({ storyId: storyIdSchema }),
    responses: {
      200: z.object({ items: z.array(storyExportSchema) }),
      ...commonErrorResponses,
    },
  },
});
