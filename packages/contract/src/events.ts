/**
 * events.ts — SSE olay union'ı ve akış uçları.
 *
 * KANAL SÖZLEŞMESİ
 *  · SSE bir OPTİMİZASYONDUR, teslimat garantisi değildir. İstemci bağlanamazsa
 *    `GET /v1/jobs/:id` polling'ine düşer ve hiçbir şey kaybolmaz.
 *  · Her olayın monoton artan `seq` değeri vardır ve SSE `id:` alanı olarak gider.
 *    Yeniden bağlanmada istemci `Last-Event-ID: <son seq>` gönderir; sunucu o
 *    noktadan itibaren tekrar oynatır (replay).
 *  · `heartbeat` 15 saniyede bir gelir; gelmiyorsa istemci bağlantıyı ölü sayar.
 *
 * İLERLEME METNİ: `job.progress` olayındaki `job.progress.labelTr` doğrudan
 * ekrana basılır — "Elif'in odası çiziliyor". Yüzde göstermeyin.
 */

import { entitlementsSchema } from './billing';
import {
  c,
  commonErrorResponses,
  errorCodeSchema,
  isoDateSchema,
  jobIdSchema,
  renditionIdSchema,
  signedMediaSchema,
  sseHeadersSchema,
  storyCharacterIdSchema,
  storyIdSchema,
  voiceProfileIdSchema,
} from './primitives';
import { jobSchema } from './jobs';
import { orderStatusSchema } from './print';
import { storyStatusSchema } from './story';
import { z } from 'zod';

const eventBase = { seq: z.number().int().min(0), at: isoDateSchema };

export const serverEventSchema = z.discriminatedUnion('type', [
  z.object({ ...eventBase, type: z.literal('job.progress'), job: jobSchema }),
  z.object({
    ...eventBase,
    type: z.literal('job.awaiting_approval'),
    jobId: jobIdSchema,
    /** 'skeleton' → KAPI 1 (S09), 'final' → KAPI 2 (hikaye onayı). */
    approvalKind: z.enum(['skeleton', 'final']),
  }),
  z.object({ ...eventBase, type: z.literal('job.completed'), job: jobSchema }),
  z.object({ ...eventBase, type: z.literal('job.failed'), job: jobSchema }),
  z.object({
    ...eventBase,
    type: z.literal('step.retrying'),
    jobId: jobIdSchema,
    stepKey: z.string().min(1),
    attempt: z.number().int().min(1),
    reason: errorCodeSchema,
  }),
  /** Dolgu aşamasında sayfa METNİ hazır — okuyucu metni görselden önce gösterebilir. */
  z.object({
    ...eventBase,
    type: z.literal('page.ready'),
    storyId: storyIdSchema,
    pageNo: z.number().int().min(1),
    textTr: z.string().min(1),
  }),
  /** Aşamalı teslim: sayfa görseli hazır, istemci ANINDA gösterir. */
  z.object({
    ...eventBase,
    type: z.literal('page.image.ready'),
    storyId: storyIdSchema,
    pageNo: z.number().int().min(1),
    image: signedMediaSchema,
  }),
  /** Sayfa dışı görseller: kapak, karakter sayfası, stil plakası. */
  z.object({
    ...eventBase,
    type: z.literal('image.ready'),
    storyId: storyIdSchema,
    target: z.enum(['cover', 'character_sheet', 'style_plate']),
    characterId: storyCharacterIdSchema.optional(),
    image: signedMediaSchema,
  }),
  /** TTS parça parça geliyor: istemci ilk sayfayı tümü bitmeden çalabilir. */
  z.object({
    ...eventBase,
    type: z.literal('audio.chunk.ready'),
    storyId: storyIdSchema,
    renditionId: renditionIdSchema,
    pageNo: z.number().int().min(1),
    chunkIndex: z.number().int().min(0),
    totalChunks: z.number().int().min(1),
    /** Kısmi ses; yalnızca aşamalı oynatma içindir, kalıcı değildir. */
    audio: signedMediaSchema.optional(),
  }),
  z.object({
    ...eventBase,
    type: z.literal('story.updated'),
    storyId: storyIdSchema,
    status: storyStatusSchema,
  }),
  z.object({
    ...eventBase,
    type: z.literal('audio.ready'),
    storyId: storyIdSchema,
    renditionId: renditionIdSchema,
  }),
  z.object({
    ...eventBase,
    type: z.literal('voice.ready'),
    voiceProfileId: voiceProfileIdSchema,
  }),
  z.object({
    ...eventBase,
    type: z.literal('order.updated'),
    orderId: z.string().uuid(),
    status: orderStatusSchema,
  }),
  z.object({
    ...eventBase,
    type: z.literal('entitlements.updated'),
    entitlements: entitlementsSchema,
  }),
  z.object({ ...eventBase, type: z.literal('heartbeat') }),
]);
export type ServerEvent = z.infer<typeof serverEventSchema>;
export type ServerEventType = ServerEvent['type'];

export const SERVER_EVENT_TYPES = [
  'job.progress',
  'job.awaiting_approval',
  'job.completed',
  'job.failed',
  'step.retrying',
  'page.ready',
  'page.image.ready',
  'image.ready',
  'audio.chunk.ready',
  'story.updated',
  'audio.ready',
  'voice.ready',
  'order.updated',
  'entitlements.updated',
  'heartbeat',
] as const;

/** SSE kalp atışı aralığı (ms). İstemci 2 katı süre sessizlikte yeniden bağlanır. */
export const SSE_HEARTBEAT_MS = 15_000;

/** Olayı SSE tel biçimine çevirir. Sunucu ve mock aynı fonksiyonu kullanır. */
export function serializeServerEvent(event: ServerEvent): string {
  return `id: ${event.seq}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

/**
 * Ham `data:` gövdesini güvenle çözer. Bilinmeyen/bozuk olayda `null` döner —
 * istemci bilinmeyen olay tipini SESSİZCE yok saymalıdır (ileri uyumluluk).
 */
export function parseServerEvent(raw: string): ServerEvent | null {
  try {
    const parsed = serverEventSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export const eventsContract = c.router({
  jobEvents: {
    method: 'GET',
    path: '/v1/jobs/:jobId/events',
    summary: 'Tek işin olay akışı (SSE, Last-Event-ID ile replay)',
    pathParams: z.object({ jobId: jobIdSchema }),
    headers: sseHeadersSchema,
    responses: {
      200: c.otherResponse({
        contentType: 'text/event-stream',
        body: c.type<string>(),
      }),
      ...commonErrorResponses,
    },
  },

  stream: {
    method: 'GET',
    path: '/v1/events',
    summary: 'Oturumun tüm olayları (SSE) — uygulama ön plandayken tek bağlantı',
    headers: sseHeadersSchema,
    responses: {
      200: c.otherResponse({
        contentType: 'text/event-stream',
        body: c.type<string>(),
      }),
      ...commonErrorResponses,
    },
  },
});
