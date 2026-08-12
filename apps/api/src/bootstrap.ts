/**
 * bootstrap.ts — what this process becomes, decided by `PROCESS_MODE`.
 *
 * ⭐ THE THREE MODES (packages/config):
 *
 *   api     Fastify only. The historical behaviour and the production default: the HTTP
 *           layer is scaled by request rate, and an image fan-out cannot starve
 *           `GET /v1/jobs/:id` because it is not in this process at all.
 *   worker  Queue consumers and schedulers only. Scaled by queue depth.
 *   all     Both, in one process, sharing one Postgres pool and one queue registry.
 *
 * WHY `all` EXISTS, AND WHY IT IS NOT A THIRD ARCHITECTURE. Every free hosting tier gives
 * exactly one always-on process — Render's free plan has web services and no background
 * workers — and a product that cannot be hosted until it earns money cannot earn money.
 * So `all` is a packaging decision, not a design one, and it is written to stay that way:
 * it calls `buildServer()` and `startWorkerRuntime()`, the same two functions the split
 * modes call, with the same arguments. Nothing in the repository knows about "combined
 * mode" except this file. Splitting back into two services is `PROCESS_MODE=api` plus
 * `PROCESS_MODE=worker` on two machines, with no code change anywhere.
 *
 * ⚠️ What the operator gives up in `all` is isolation, and it is a real cost: a runaway
 * `sharp` render competes with request handling for the same event loop, and OOM takes
 * both halves down together. That is the trade the free tier forces, and it is the reason
 * the mode is opt-in rather than the default.
 *
 * ⚠️ THIS MODULE STARTS NOTHING ON IMPORT. `main.ts` is the entry point and does nothing
 * but call `startProcess()`. Keeping the two apart is what lets
 * `test/process-mode.integration.test.ts` boot each mode and assert which halves came up —
 * and that test exists because a mode once came up that was not asked for.
 */

import { loadEnv, runsHttpServer, runsQueueWorkers, type Env } from '@kendihikayem/config';
import { createDbFromEnv, type DbHandle } from '@kendihikayem/db';
import {
  QueueRegistry,
  buildRuntime,
  queueOptionsFromEnv,
  startWorkerRuntime,
  type WorkerHandle,
  type WorkerRuntime,
} from '@kendihikayem/worker';
import type { FastifyInstance } from 'fastify';

import { buildServer } from './server';

export interface Booted {
  env: Env;
  dbHandle: DbHandle;
  /** Absent only when the queue connection could not be built at all. */
  queues?: QueueRegistry;
  /** Present in `worker` and `all`. Its absence in `api` is the point of `api`. */
  runtime?: WorkerRuntime;
  worker?: WorkerHandle;
  close(): Promise<void>;
}

/**
 * One Redis, one pool, whatever the mode.
 *
 * The queue registry is built HERE rather than inside `buildRuntime` so that in `all` mode
 * the API's enqueues and the worker's consumers are provably the same registry — the same
 * prefix, the same connection, the same `FlowProducer`. Two registries in one process would
 * still work, and would still cost a second Redis connection pool on a 512 MB box for
 * nothing, while leaving room for the two halves to drift onto different prefixes. A queue
 * that silently swallows work is the failure mode that costs the most to diagnose.
 */
export async function boot(env: Env = loadEnv()): Promise<Booted> {
  const dbHandle = createDbFromEnv(env);

  let queues: QueueRegistry | undefined;
  try {
    queues = new QueueRegistry(queueOptionsFromEnv(env));
  } catch (error) {
    // Redis is OPTIONAL for the API half on purpose: reading job state, entitlements and
    // estimates needs only Postgres, so a Redis outage degrades the product to "cannot
    // start new work" rather than "cannot use the app at all". It is NOT optional for the
    // worker half — see below.
    console.warn('[boot] queues unavailable; read-only endpoints still work', error);
  }

  const booted: Booted = {
    env,
    dbHandle,
    ...(queues ? { queues } : {}),
    async close() {
      /* replaced below, once it is known what there is to close */
    },
  };

  if (runsQueueWorkers(env)) {
    if (!queues) {
      // A worker with no queue connection is a process that looks healthy and consumes
      // nothing. Failing at boot is the only way the operator finds out.
      throw new Error(
        `PROCESS_MODE=${env.PROCESS_MODE} needs a working REDIS_URL; the queue connection could not be built`,
      );
    }
    booted.runtime = buildRuntime({ env, db: dbHandle.db, queues });
    booted.worker = await startWorkerRuntime(booted.runtime);
  }

  booted.close = async () => {
    booted.worker?.stop();
    // `runtime.close()` closes the queue registry it was handed; with no worker half this
    // file owns it directly. The database handle is always ours — `buildRuntime` was given
    // an open `db`, so it never opened (and will never close) a pool of its own.
    if (booted.runtime) await booted.runtime.close();
    else await queues?.close();
    await dbHandle.close();
  };

  return booted;
}

/** Boots, listens if this mode serves HTTP, and installs the signal handlers. */
export async function startProcess(env: Env = loadEnv()): Promise<void> {
  const booted = await boot(env);
  let app: FastifyInstance | undefined;

  const shutdown = async (signal: string) => {
    console.info(`[${env.PROCESS_MODE}] ${signal} received, closing`);
    await app?.close();
    await booted.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  if (booted.worker) {
    console.info(
      `[worker] queues: ${booted.worker.queues.join(', ')} — resumed ${booted.worker.resume.requeued} job(s) from Postgres`,
    );
  }

  if (runsHttpServer(env)) {
    const built = buildServer({
      db: booted.dbHandle.db,
      env,
      ...(booted.queues ? { queues: booted.queues } : {}),
      logger: true,
    });
    app = built.app;
    await app.listen({ host: env.HOST, port: env.PORT });
    console.info(`[api] listening on http://${env.HOST}:${env.PORT} (mode: ${env.PROCESS_MODE})`);
  } else {
    // `PROCESS_MODE=worker`: no listener, so nothing keeps the event loop alive except the
    // BullMQ workers and the schedulers — which is exactly what should keep it alive.
    console.info(`[worker] running headless (mode: ${env.PROCESS_MODE})`);
  }
}
