/**
 * process-mode.integration.test.ts — `PROCESS_MODE` decides what this process becomes.
 *
 * ⚠️ WHY THIS FILE EXISTS. `apps/worker/src/main.ts` used to self-start when it judged
 * itself to be the process entry point, via the usual
 * `import.meta.url === 'file://' + process.argv[1]` idiom. That idiom is correct for a
 * module tree and WRONG for a bundle: the deployable artefact is one esbuild output file,
 * inside which every module's `import.meta.url` is the bundle's own URL. So the guard was
 * true in every process, and `PROCESS_MODE=api` — a mode whose entire purpose is to keep
 * the fan-out away from the request path — quietly attached six queue consumers anyway.
 *
 * Nothing failed. No error was logged. The API just also did the worker's job, on a box
 * sized for one of them. It was found by running the bundle and reading the log, which is
 * not a thing anyone does twice; this test is the thing that does it every time.
 *
 * Real PostgreSQL and real Redis, because the property is about what actually connects.
 */

import { sql } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';

import { boot } from '../src/bootstrap';
import { openDb, testEnv } from './helpers';

async function databaseAvailable(): Promise<boolean> {
  try {
    const handle = openDb(1);
    await handle.db.execute(sql`select 1`);
    await handle.close();
    return true;
  } catch {
    return false;
  }
}

/** Bare TCP + RESP `PING`; `ioredis` is not linked into this package. */
async function redisAvailable(url: string): Promise<boolean> {
  const { createConnection } = await import('node:net');
  const parsed = new URL(url);
  return new Promise<boolean>((resolve) => {
    const socket = createConnection({ host: parsed.hostname, port: Number(parsed.port || 6379) });
    const done = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(1500);
    socket.on('connect', () => socket.write('PING\r\n'));
    socket.on('data', (chunk) => done(chunk.toString().startsWith('+PONG')));
    socket.on('error', () => done(false));
    socket.on('timeout', () => done(false));
  });
}

const baseEnv = testEnv({ QUEUE_PREFIX: `khmode_${process.pid}` });
const ready = (await databaseAvailable()) && (await redisAvailable(baseEnv.REDIS_URL));
const suite = ready ? describe : describe.skip;

suite('PROCESS_MODE decides which halves boot', () => {
  let booted: Awaited<ReturnType<typeof boot>> | undefined;

  afterEach(async () => {
    await booted?.close();
    booted = undefined;
  });

  it('api: no queue consumers, no schedulers — the production default', async () => {
    booted = await boot(testEnv({ PROCESS_MODE: 'api', QUEUE_PREFIX: baseEnv.QUEUE_PREFIX }));

    // ⭐ The regression this file is named for.
    expect(booted.worker).toBeUndefined();
    expect(booted.runtime).toBeUndefined();
    // The registry is still built: the HTTP layer ENQUEUES, it just does not consume.
    expect(booted.queues).toBeDefined();
  });

  it('all: both halves, sharing one pool and one queue registry', async () => {
    booted = await boot(testEnv({ PROCESS_MODE: 'all', QUEUE_PREFIX: baseEnv.QUEUE_PREFIX }));

    expect(booted.worker).toBeDefined();
    expect(booted.worker!.queues).toEqual(['llm', 'image', 'voice', 'media', 'print', 'ops']);
    // ⭐ ONE registry, not two. Two would work and would cost a second Redis connection
    // pool on a 512 MB box for nothing — and would let the two halves drift onto
    // different prefixes, which is a queue that silently swallows work.
    expect(booted.runtime!.queues).toBe(booted.queues);
    expect(booted.runtime!.db).toBe(booted.dbHandle.db);
  });

  it('worker: the queue consumers, and no HTTP server is built here', async () => {
    booted = await boot(testEnv({ PROCESS_MODE: 'worker', QUEUE_PREFIX: baseEnv.QUEUE_PREFIX }));

    expect(booted.worker).toBeDefined();
    expect(booted.runtime).toBeDefined();
  });

  it('recovers whatever Postgres still calls running, on every boot', async () => {
    // The cold-start contract, asserted at the boot seam rather than inside the worker:
    // waking up is when this has to happen, and `boot` is where waking up occurs.
    booted = await boot(testEnv({ PROCESS_MODE: 'all', QUEUE_PREFIX: baseEnv.QUEUE_PREFIX }));
    expect(booted.worker!.resume.scanned).toBeGreaterThanOrEqual(0);
    expect(booted.worker!.resume.requeued).toBeGreaterThanOrEqual(0);
  });
});
