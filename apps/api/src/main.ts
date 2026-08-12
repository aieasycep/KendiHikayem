/**
 * main.ts — the process entry point, for all three process modes.
 *
 * ⭐ `PROCESS_MODE` (packages/config) decides what this process becomes:
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
 * modes call, with the same arguments. Nothing here knows about "combined mode" except
 * this file. Splitting back into two services is `PROCESS_MODE=api` plus
 * `PROCESS_MODE=worker` on two machines, with no code change and no redeploy of anything
 * else.
 *
 * ⚠️ What the operator gives up in `all` is isolation, and it is a real cost: a runaway
 * `sharp` render competes with request handling for the same event loop, and OOM takes
 * both halves down together. That is the trade the free tier forces, and it is the reason
 * the mode is opt-in rather than the default.
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

import { buildServer } from './server';

interface Booted {
  env: Env;
  dbHandle: DbHandle;
  queues?: QueueRegistry;
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
 * still work, and would still cost two Redis connection pools on a 512 MB box for nothing.
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
      /* replaced below once the halves are attached */
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
    console.info(
      `[worker] queues: ${booted.worker.queues.join(', ')} — resumed ${booted.worker.resume.requeued} job(s) from Postgres`,
    );
  }

  booted.close = async () => {
    booted.worker?.stop();
    // `runtime.close()` closes the queue registry it was handed; when there is no worker
    // half this file owns it directly.
    if (booted.runtime) await booted.runtime.close();
    else await queues?.close();
    await dbHandle.close();
  };

  return booted;
}

async function main(): Promise<void> {
  const env = loadEnv();
  const booted = await boot(env);

  const shutdown = async (signal: string) => {
    console.info(`[${env.PROCESS_MODE}] ${signal} received, closing`);
    await app?.close();
    await booted.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  let app: Awaited<ReturnType<typeof buildServer>>['app'] | undefined;

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

main().catch((error) => {
  console.error('[boot] fatal', error);
  process.exit(1);
});
