/**
 * sse.ts — olay akışı simülasyonu.
 *
 * Gerçek sunucuda olduğu gibi burada da SSE bir OPTİMİZASYONDUR: `sseEnabled: false`
 * yaparsanız akış 204 döner ve istemcinin polling yoluna düşmesi gerekir. FE'nin
 * her iki yolu da geliştirme sırasında denemesi bilinçli bir tasarım.
 *
 * ⚠️ React Native'de fetch akış gövdesi (streaming body) desteklenmez. Bu yüzden
 * mobil istemci mock ortamında da polling kullanmalıdır — üretimdeki davranışın
 * aynısı. `packages/mock` bunu gizlemez.
 */

import {
  serializeServerEvent,
  SSE_HEARTBEAT_MS,
  type IsoDate,
  type ServerEvent,
} from '@kendihikayem/contract';

import { PROGRESS_SCRIPTS } from './fixtures';
import { mockConfig } from './scenarios';
import { getJobSnapshot, nextSeq, store, type JobRuntime } from './store';

const SSE_HEADERS = {
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-cache, no-transform',
  connection: 'keep-alive',
} as const;

function nowIso(): IsoDate {
  return new Date().toISOString().replace('.000Z', 'Z') as IsoDate;
}

type Emit = (event: ServerEvent) => void;

function sseResponse(run: (emit: Emit, close: () => void) => () => void): Response {
  const encoder = new TextEncoder();
  let stop: (() => void) | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const emit: Emit = (event) => {
        if (closed) return;
        controller.enqueue(encoder.encode(serializeServerEvent(event)));
      };
      const close = () => {
        if (closed) return;
        closed = true;
        controller.close();
      };
      stop = run(emit, close);
    },
    cancel() {
      stop?.();
    },
  });

  return new Response(stream, { status: 200, headers: SSE_HEADERS });
}

/** Görsel üretimi olan iş türlerinde sayfalar tek tek "hazır" olur. */
const IMAGE_JOB_KINDS = new Set(['story_fill', 'image_book', 'image_page']);

/**
 * Tek işin akışı. `Last-Event-ID` verilmişse o sıradan küçük olan olaylar
 * atlanır (replay davranışının mock'taki karşılığı).
 */
export function jobEventStream(jobId: string, lastEventId?: string): Response {
  const runtime = store().jobs.get(jobId);
  const minSeq = lastEventId ? Number.parseInt(lastEventId, 10) : 0;

  return sseResponse((emit, close) => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const send = (event: ServerEvent): void => {
      if (event.seq <= minSeq) return;
      emit(event);
    };

    if (!runtime) {
      send({ seq: nextSeq(), type: 'heartbeat', at: nowIso() } as ServerEvent);
      close();
      return () => undefined;
    }

    const script = PROGRESS_SCRIPTS[runtime.kind];
    const speed = Math.max(1, mockConfig().jobSpeed);
    let offset = 0;

    script.forEach((step, index) => {
      offset += step.realMs / speed;
      timers.push(
        setTimeout(() => {
          const snapshot = getJobSnapshot(jobId);
          if (!snapshot) return;
          send({ seq: nextSeq(), type: 'job.progress', at: nowIso(), job: snapshot.job });

          if (IMAGE_JOB_KINDS.has(runtime.kind) && runtime.storyId) {
            const story = store().stories.get(runtime.storyId);
            const page = story?.pages[index];
            if (page?.image) {
              send({
                seq: nextSeq(),
                type: 'page.image.ready',
                at: nowIso(),
                storyId: story!.id,
                pageNo: page.pageNo,
                image: page.image,
              });
            }
          }
        }, offset),
      );
    });

    timers.push(
      setTimeout(() => {
        const snapshot = getJobSnapshot(jobId);
        if (!snapshot) {
          close();
          return;
        }
        const { job } = snapshot;
        if (job.status === 'failed') {
          send({ seq: nextSeq(), type: 'job.failed', at: nowIso(), job });
        } else if (job.status === 'waiting_approval') {
          send({
            seq: nextSeq(),
            type: 'job.awaiting_approval',
            at: nowIso(),
            jobId: job.id,
            approvalKind: 'skeleton',
          });
        } else {
          send({ seq: nextSeq(), type: 'job.completed', at: nowIso(), job });
          if (runtime.storyId) {
            const story = store().stories.get(runtime.storyId);
            if (story) {
              send({
                seq: nextSeq(),
                type: 'story.updated',
                at: nowIso(),
                storyId: story.id,
                status: story.status,
              });
            }
          }
          if (runtime.voiceProfileId) {
            send({
              seq: nextSeq(),
              type: 'voice.ready',
              at: nowIso(),
              voiceProfileId: runtime.voiceProfileId as never,
            });
          }
        }
        close();
      }, offset + 200),
    );

    return () => {
      for (const timer of timers) clearTimeout(timer);
    };
  });
}

/** Oturumun tüm olayları: kalp atışı + devam eden işlerin ilerlemesi. */
export function sessionEventStream(lastEventId?: string): Response {
  const minSeq = lastEventId ? Number.parseInt(lastEventId, 10) : 0;

  return sseResponse((emit) => {
    const send = (event: ServerEvent): void => {
      if (event.seq <= minSeq) return;
      emit(event);
    };

    send({ seq: nextSeq(), type: 'heartbeat', at: nowIso() } as ServerEvent);

    const heartbeat = setInterval(() => {
      send({ seq: nextSeq(), type: 'heartbeat', at: nowIso() } as ServerEvent);
    }, SSE_HEARTBEAT_MS);

    const poll = setInterval(() => {
      for (const runtime of store().jobs.values() as IterableIterator<JobRuntime>) {
        const snapshot = getJobSnapshot(runtime.id);
        if (!snapshot) continue;
        send({
          seq: nextSeq(),
          type: snapshot.job.status === 'succeeded' ? 'job.completed' : 'job.progress',
          at: nowIso(),
          job: snapshot.job,
        });
      }
    }, 1_000);

    return () => {
      clearInterval(heartbeat);
      clearInterval(poll);
    };
  });
}

/** SSE kapalıyken istemciye "bu kanal yok, polling yap" demenin dürüst yolu. */
export function sseDisabledResponse(): Response {
  return new Response(null, { status: 204 });
}
