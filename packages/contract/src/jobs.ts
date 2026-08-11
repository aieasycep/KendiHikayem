/**
 * jobs.ts — uzun işlerin durumu.
 *
 * SÖZLEŞME KURALI: SSE İSTEĞE BAĞLIDIR. İstemci her zaman `GET /v1/jobs/:id`
 * polling'ine düşebilir (2 sn, exponential backoff). Gerçek teslimat kanalı
 * push bildirimi + e-postadır; kullanıcı uygulamayı kapatabilir, işi kaçırmaz.
 *
 * İLERLEME YÜZDE DEĞİL, NE OLDUĞUDUR: `progress.labelTr` ekranda birebir gösterilir
 * ("Elif'in odası çiziliyor"). Yüzde göstermek 20 saniyelik bir işi 3 dakika gibi
 * hissettirir; ne olduğunu söylemek bekleme süresini değere çevirir (SPEC §11.0).
 */

import {
  apiErrorSchema,
  bookBuildIdSchema,
  c,
  commonErrorResponses,
  costPreviewSchema,
  exportIdSchema,
  idempotencyHeadersSchema,
  isoDateSchema,
  jobIdSchema,
  jobKindSchema,
  jobProgressSchema,
  jobStatusSchema,
  orderIdSchema,
  pageQuerySchema,
  paginatedSchema,
  renditionIdSchema,
  signedMediaSchema,
  storyIdSchema,
  voiceProfileIdSchema,
} from './primitives';
import { z } from 'zod';

export const jobStepStatusSchema = z.enum([
  'pending',
  'running',
  'succeeded',
  'failed',
  /** content_cache isabeti: adım hiç çalışmadı, maliyet 0. */
  'skipped',
  'retrying',
]);

export const jobResultSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('story'), storyId: storyIdSchema }),
  z.object({ kind: z.literal('voice'), voiceProfileId: voiceProfileIdSchema }),
  z.object({
    kind: z.literal('audio'),
    renditionId: renditionIdSchema,
    durationMs: z.number().int().min(0),
  }),
  z.object({ kind: z.literal('book'), buildId: bookBuildIdSchema }),
  z.object({
    kind: z.literal('export'),
    exportId: exportIdSchema,
    media: signedMediaSchema,
  }),
]);
export type JobResult = z.infer<typeof jobResultSchema>;

export const jobSchema = z.object({
  id: jobIdSchema,
  kind: jobKindSchema,
  status: jobStatusSchema,
  progress: jobProgressSchema,
  etaMs: z.number().int().min(0).optional(),
  storyId: storyIdSchema.optional(),
  voiceProfileId: voiceProfileIdSchema.optional(),
  orderId: orderIdSchema.optional(),
  /** Teknik adımlar. Kullanıcıya gösterilmez; ops paneli ve hata ayıklama içindir. */
  steps: z.array(
    z.object({
      stepKey: z.string().min(1),
      status: jobStepStatusSchema,
      attempt: z.number().int().min(0),
    }),
  ),
  result: jobResultSchema.optional(),
  error: apiErrorSchema.optional(),
  costPreview: costPreviewSchema.optional(),
  /** Kısmi başarı: 13/13 zorunlu değil (SPEC §8.4). */
  partial: z
    .object({
      completed: z.number().int().min(0),
      total: z.number().int().min(0),
      failedPageNos: z.array(z.number().int().min(1)),
    })
    .optional(),
  queuedAt: isoDateSchema,
  startedAt: isoDateSchema.optional(),
  finishedAt: isoDateSchema.optional(),
});
export type Job = z.infer<typeof jobSchema>;

export const jobsContract = c.router({
  get: {
    method: 'GET',
    path: '/v1/jobs/:jobId',
    summary: 'İş durumu — SSE yoksa polling yolu budur',
    pathParams: z.object({ jobId: jobIdSchema }),
    responses: { 200: jobSchema, ...commonErrorResponses },
  },

  list: {
    method: 'GET',
    path: '/v1/jobs',
    summary: 'Devam eden işler (uygulama açılışında tek çağrı)',
    query: pageQuerySchema.extend({
      storyId: z.string().uuid().optional(),
      status: jobStatusSchema.optional(),
      kind: jobKindSchema.optional(),
    }),
    responses: { 200: paginatedSchema(jobSchema), ...commonErrorResponses },
  },

  cancel: {
    method: 'POST',
    path: '/v1/jobs/:jobId/cancel',
    summary: 'İşi iptal et — tamamlanmak üzereyse 409 JOB_NOT_CANCELLABLE',
    pathParams: z.object({ jobId: jobIdSchema }),
    headers: idempotencyHeadersSchema,
    body: z.object({}),
    responses: { 200: jobSchema, ...commonErrorResponses },
  },
});
