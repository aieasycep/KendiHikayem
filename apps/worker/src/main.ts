/**
 * main.ts — the worker process entry point.
 *
 * Boots the runtime, attaches one BullMQ worker per queue (each with its vendor-derived
 * rate limiter), starts the four schedulers, and shuts everything down cleanly on a signal.
 * A redeploy that kills workers mid-job must leave the database consistent: jobs stay
 * `running`, their holds expire, and the reconcile sweeper reclaims them.
 */

import { loadEnv } from '@kendihikayem/config';

import { QUEUE_NAMES } from './queues';
import { buildRuntime } from './runtime';
import { createQueueProcessor } from './processors/index';
import {
  runCostRollup,
  runOutboxProcessor,
  runReservationReconcile,
  runVoiceRawDestruction,
  startScheduler,
  type SchedulerHandle,
} from './schedulers/index';

async function main(): Promise<void> {
  const env = loadEnv();
  const runtime = buildRuntime({ env });

  for (const name of QUEUE_NAMES) {
    const worker = runtime.queues.startWorker(name, createQueueProcessor(runtime, name));
    worker.on('failed', (job, error) => {
      console.error(`[worker:${name}] ${job?.name ?? '?'} failed`, {
        jobId: job?.data?.jobId,
        error: error.message,
      });
    });
  }

  const onError = (name: string, error: unknown) =>
    console.error(`[scheduler:${name}]`, error);

  const schedulers: SchedulerHandle[] = [
    startScheduler('reservation-reconcile', 60_000, () => runReservationReconcile(runtime.db), onError),
    startScheduler('outbox', 2_000, () =>
      runOutboxProcessor(runtime.db, async (row) => {
        // TODO(A1): push + e-mail delivery. Until then the row is durable and retried,
        // which is the property that matters — nothing is lost while this is a no-op.
        console.info('[outbox]', row.event_type, row.aggregate_id);
      }),
      onError,
    ),
    startScheduler('voice-raw-destruction', 3_600_000, () => runVoiceRawDestruction(runtime.db), onError),
    startScheduler('cost-rollup', 900_000, async () => {
      const rollup = await runCostRollup(runtime.db);
      console.info('[cost]', {
        todayUsd: rollup.todayUsd,
        heldUsd: rollup.heldUsd,
        perStory: rollup.perStory[0],
      });
    }, onError),
  ];

  const shutdown = async (signal: string) => {
    console.info(`[worker] ${signal} received, draining`);
    for (const s of schedulers) s.stop();
    await runtime.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  console.info(`[worker] listening on queues: ${QUEUE_NAMES.join(', ')}`);
}

main().catch((error) => {
  console.error('[worker] fatal', error);
  process.exit(1);
});
