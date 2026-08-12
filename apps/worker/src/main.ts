/**
 * main.ts — the worker half: its queue consumers and its schedulers.
 *
 * Two things live here on purpose.
 *
 *  1. `startWorkerRuntime()` — attaches one BullMQ worker per queue (each with its
 *     vendor-derived rate limiter), starts the four schedulers, and hands back a handle
 *     that stops all of it. It takes a `WorkerRuntime` and returns a handle: it does not
 *     read configuration, open a pool or own a lifetime. That is what lets `apps/api`
 *     reuse it verbatim in `PROCESS_MODE=all` instead of reimplementing it — see the note
 *     on `processModeSchema` in packages/config for why that mode exists at all.
 *
 *  2. `runWorkerProcess()` — builds the runtime from the environment, calls the same
 *     function, and wires the signals.
 *
 * ⚠️ THIS MODULE STARTS NOTHING ON IMPORT, and there is no `import.meta.url === argv[1]`
 * guard trying to make that safe. Such a guard was here and it was WRONG: the deployable
 * artefact is an esbuild bundle (infra/bundle/server.mjs), and inside a bundle every
 * module's `import.meta.url` is the bundle's own URL — so the guard was true in every
 * process, and `PROCESS_MODE=api` silently ran six queue consumers it was explicitly
 * configured not to run. Nothing announced it; the API just quietly did the worker's job
 * too. The only reliable rule is the one now in force: modules do not self-start.
 *
 * The single process entry point for all three modes is `apps/api/src/main.ts`, which
 * reads `PROCESS_MODE` and calls into here when it says so. Running the worker alone is
 * `PROCESS_MODE=worker` on that same entry — one binary, one entry, three topologies.
 *
 * A redeploy that kills workers mid-job must leave the database consistent: jobs stay
 * `running`, their holds expire, and the reconcile sweeper reclaims them.
 */

import { loadEnv, type Env } from '@kendihikayem/config';

import { QUEUE_NAMES, type JobPayload, type QueueName } from './queues';
import { buildRuntime, type WorkerRuntime } from './runtime';
import { createQueueProcessor } from './processors/index';
import { recoverableJobs, type JobRow } from './jobs/repository';
import { queueJobId } from './flows/book.flow';
import {
  runCostRollup,
  runOutboxProcessor,
  runReservationReconcile,
  runVoiceRawDestruction,
  startScheduler,
  type SchedulerHandle,
} from './schedulers/index';

/* ── Cold-start recovery ───────────────────────────────────────────────────── */

/**
 * `jobs.kind` → the queue and BullMQ job name that carries it.
 *
 * This is the inverse of the flow builders, and it exists because Redis is allowed to
 * disappear. `queues.ts` states the invariant it rests on: queues hold POINTERS, the
 * payload lives in Postgres. So a job whose Redis entry is gone is fully described by its
 * `jobs` row, and re-enqueueing it is a re-enqueue rather than a guess.
 *
 * ⚠️ FAN-OUT PARENTS ARE NOT LISTED. `story_fill`, `image_book`, `audio_render` and
 * `print_submit` are flow TREES: their children carry per-page and per-chunk pointers that
 * a `jobs` row does not contain, and rebuilding a tree from a parent row would produce a
 * tree with no children — a job that completes instantly having drawn nothing. Those are
 * reported and left alone, so the operator sees them instead of the product silently
 * shipping an empty book. Restoring them belongs with whoever owns the fan-out (SPEC §12).
 */
const RESUMABLE: Partial<Record<string, { queue: QueueName; name: string }>> = {
  story_outline: { queue: 'llm', name: 'story.outline' },
  story_page_rewrite: { queue: 'llm', name: 'story.page_rewrite' },
  image_character_sheet: { queue: 'image', name: 'image.character_sheet' },
  image_page: { queue: 'image', name: 'image.page' },
  voice_create: { queue: 'voice', name: 'voice.create' },
  voice_delete: { queue: 'voice', name: 'voice.delete' },
  pdf_build: { queue: 'print', name: 'pdf.build' },
  export_mp4: { queue: 'media', name: 'export.mp4' },
  privacy_export: { queue: 'ops', name: 'privacy.export' },
  privacy_delete: { queue: 'ops', name: 'privacy.delete' },
};

export interface ResumeReport {
  scanned: number;
  requeued: number;
  /** Already present in BullMQ — the ordinary case after a plain restart. */
  present: number;
  /** Fan-out trees and unknown kinds. Named, so they are visible rather than lost. */
  unresumable: Array<{ jobId: string; kind: string }>;
}

/**
 * Re-seeds BullMQ from Postgres for every job that should be running and is not queued.
 *
 * ⭐ THIS IS WHAT MAKES A FREE-TIER DEPLOY HONEST. Render's free web service sleeps after
 * 15 minutes and its disk is ephemeral, so an embedded Redis starts EMPTY on every wake —
 * and even a hosted Redis can be flushed or fall out of its retention. The architecture
 * already promised this was survivable (`queues.ts`: "a lost Redis is a re-enqueue, not a
 * data loss"); until now nothing actually performed the re-enqueue, so the promise was a
 * comment. `recoverableJobs()` had exactly one caller, which counted the orphans and threw
 * the number away.
 *
 * The re-enqueue is idempotent because the BullMQ job id is derived from the Postgres job
 * id (`queueJobId`): adding a job whose id already exists is a no-op in BullMQ, so running
 * this on every boot cannot duplicate work, and neither can two processes running it at
 * once.
 */
export async function resumeRecoverableJobs(
  runtime: WorkerRuntime,
  options: { limit?: number } = {},
): Promise<ResumeReport> {
  const rows = await recoverableJobs(runtime.db, options.limit ?? 500);
  const report: ResumeReport = { scanned: rows.length, requeued: 0, present: 0, unresumable: [] };

  for (const row of rows) {
    const route = RESUMABLE[row.kind];
    if (!route) {
      report.unresumable.push({ jobId: row.id, kind: row.kind });
      continue;
    }

    const queue = runtime.queues.queue(route.queue);
    const bullJobId = row.bull_job_id ?? queueJobId(row.id, route.name);

    if (await queue.getJob(bullJobId)) {
      report.present += 1;
      continue;
    }

    await queue.add(route.name, payloadFor(row), {
      jobId: bullJobId,
      priority: row.priority,
      // The Postgres row is the source of truth for `attempt`; give BullMQ what is left of
      // the budget rather than a fresh one, so a job that has already failed twice does not
      // get three more tries every time the service wakes up.
      attempts: Math.max(1, row.max_attempts - row.attempt),
      backoff: { type: 'exponential', delay: 2_000 },
    });
    report.requeued += 1;
  }

  return report;
}

/** The pointer payload, rebuilt from the row. Never user content — see `queues.ts`. */
function payloadFor(row: JobRow): JobPayload {
  const input = (row.input ?? {}) as Record<string, unknown>;
  const ref: Record<string, unknown> = {};
  if (row.story_id) ref['storyId'] = row.story_id;
  if (row.voice_profile_id) ref['voiceProfileId'] = row.voice_profile_id;
  if (row.order_id) ref['orderId'] = row.order_id;
  for (const [key, value] of Object.entries(input)) {
    if (value !== null && value !== undefined) ref[key] = value;
  }

  return {
    jobId: row.id,
    userId: row.user_id,
    correlationId: row.correlation_id,
    kind: row.kind,
    ref,
  };
}

/* ── Bootstrap ─────────────────────────────────────────────────────────────── */

export interface WorkerHandle {
  /** What the queue consumers were attached to, for logging and for tests. */
  queues: readonly QueueName[];
  resume: ResumeReport;
  /** Stops the schedulers. The BullMQ workers are closed by `runtime.close()`. */
  stop(): void;
}

export interface StartWorkerOptions {
  /**
   * Re-seed BullMQ from Postgres before consuming. On by default: a worker that starts
   * without it silently ignores every job that was in flight when the process last died.
   */
  resume?: boolean;
  /** Test affordance: skip the periodic loops and keep the run deterministic. */
  schedulers?: boolean;
}

/**
 * Attaches the queue consumers and the schedulers to an already-built runtime.
 *
 * Does NOT own the runtime: it neither built the pool nor the queue registry, and it does
 * not close them. In `PROCESS_MODE=all` the API owns both and this function borrows them,
 * which is exactly why the two halves can share one process without either one learning
 * about the other.
 */
export async function startWorkerRuntime(
  runtime: WorkerRuntime,
  options: StartWorkerOptions = {},
): Promise<WorkerHandle> {
  for (const name of QUEUE_NAMES) {
    const worker = runtime.queues.startWorker(name, createQueueProcessor(runtime, name));
    worker.on('failed', (job, error) => {
      console.error(`[worker:${name}] ${job?.name ?? '?'} failed`, {
        jobId: job?.data?.jobId,
        error: error.message,
      });
    });
  }

  let resume: ResumeReport = { scanned: 0, requeued: 0, present: 0, unresumable: [] };
  if (options.resume ?? true) {
    resume = await resumeRecoverableJobs(runtime);
    if (resume.requeued > 0 || resume.unresumable.length > 0) {
      console.info('[worker] cold start recovery', {
        scanned: resume.scanned,
        requeued: resume.requeued,
        alreadyQueued: resume.present,
        needsOwnerAttention: resume.unresumable.length,
      });
    }
  }

  const onError = (name: string, error: unknown) => console.error(`[scheduler:${name}]`, error);

  const schedulers: SchedulerHandle[] =
    (options.schedulers ?? true)
      ? [
          startScheduler(
            'reservation-reconcile',
            60_000,
            () => runReservationReconcile(runtime.db),
            onError,
          ),
          startScheduler(
            'outbox',
            2_000,
            () =>
              runOutboxProcessor(runtime.db, async (row) => {
                // TODO(A1): push + e-mail delivery. Until then the row is durable and
                // retried, which is the property that matters — nothing is lost while this
                // is a no-op.
                console.info('[outbox]', row.event_type, row.aggregate_id);
              }),
            onError,
          ),
          startScheduler(
            'voice-raw-destruction',
            3_600_000,
            () => runVoiceRawDestruction(runtime.db),
            onError,
          ),
          startScheduler(
            'cost-rollup',
            900_000,
            async () => {
              const rollup = await runCostRollup(runtime.db);
              console.info('[cost]', {
                todayUsd: rollup.todayUsd,
                heldUsd: rollup.heldUsd,
                perStory: rollup.perStory[0],
              });
            },
            onError,
          ),
        ]
      : [];

  return {
    queues: QUEUE_NAMES,
    resume,
    stop() {
      for (const s of schedulers) s.stop();
    },
  };
}

/* ── The worker process, assembled (PROCESS_MODE=worker) ───────────────────── */

/**
 * Builds a runtime from the environment, starts the worker half, and owns the signals.
 *
 * Called by `apps/api/src/main.ts` — never on import. See the ⚠️ note in the file header
 * for what happened the last time this module tried to start itself.
 */
export async function runWorkerProcess(env: Env = loadEnv()): Promise<void> {
  const runtime = buildRuntime({ env });
  const handle = await startWorkerRuntime(runtime);

  const shutdown = async (signal: string) => {
    console.info(`[worker] ${signal} received, draining`);
    handle.stop();
    await runtime.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  console.info(`[worker] listening on queues: ${QUEUE_NAMES.join(', ')}`);
}
