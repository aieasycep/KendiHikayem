/**
 * cold-start.integration.test.ts — waking up with an empty Redis.
 *
 * ⭐ THE SCENARIO THIS EXISTS FOR. A free Render web service sleeps after 15 minutes of no
 * traffic and its filesystem is ephemeral, so the Redis that lives inside the container
 * (`REDIS_MODE=embedded`) comes back EMPTY. Somewhere in Postgres there is a `jobs` row
 * that says `running` and a parent whose phone is still polling `GET /v1/jobs/:id`.
 *
 * `queues.ts` has always claimed this is survivable — "queues hold POINTERS, the payload
 * lives in Postgres, so a lost Redis is a re-enqueue, not a data loss". This test is what
 * turns that sentence into a property. It obliterates the queues (the honest simulation of
 * a container that restarted with no disk), boots the worker half, and asserts the job is
 * back in BullMQ with its identity and its remaining retry budget intact.
 *
 * Real PostgreSQL and real Redis. Skipped, not faked, when either is missing: a mocked
 * queue would pass this test while production woke up with nothing to do.
 */

import { sql } from 'drizzle-orm';
import type { DbHandle } from '@kendihikayem/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { QueueRegistry, connectionFromUrl } from '../src/queues';
import { buildRuntime, fakeAdaptersFromEnv, type WorkerRuntime } from '../src/runtime';
import { resumeRecoverableJobs, startWorkerRuntime } from '../src/main';
import { queueJobId } from '../src/flows/book.flow';
import {
  TEST_REDIS_URL,
  createTestUser,
  deleteTestUser,
  openDb,
  redisAvailable,
  testEnv,
} from './helpers';

/** Sums a BullMQ `getJobCounts()` result. */
const total = (counts: Record<string, number>): number =>
  Object.values(counts).reduce((sum, n) => sum + n, 0);

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

const ready = (await databaseAvailable()) && (await redisAvailable());
const suite = ready ? describe : describe.skip;

suite('cold start: an empty Redis is a re-enqueue, not a lost book', () => {
  const env = testEnv({ QUEUE_PREFIX: `khcold_${process.pid}` });
  let handle: DbHandle;
  let queues: QueueRegistry;
  let runtime: WorkerRuntime;
  let userId: string;

  /** Inserts the row a crashed process would have left behind. */
  async function insertOrphan(
    kind: string,
    options: { attempt?: number; maxAttempts?: number; status?: string } = {},
  ): Promise<string> {
    const rows = await handle.db.execute<{ id: string }>(sql`
      insert into jobs (user_id, kind, status, priority, idempotency_key, request_hash,
                        correlation_id, attempt, max_attempts, input)
      values (${userId}, ${kind}, ${options.status ?? 'running'}, 100,
              ${`cold-${kind}-${Math.random()}`}, 'hash', ${`trace-${kind}`},
              ${options.attempt ?? 0}, ${options.maxAttempts ?? 3},
              ${JSON.stringify({ note: 'pointer only' })}::jsonb)
      returning id
    `);
    return rows[0]!.id;
  }

  beforeAll(async () => {
    handle = openDb(5);
    ({ userId } = await createTestUser(handle.db));
    queues = new QueueRegistry({
      connection: connectionFromUrl(TEST_REDIS_URL),
      prefix: env.QUEUE_PREFIX,
    });
    runtime = buildRuntime({
      env,
      db: handle.db,
      queues,
      adapters: fakeAdaptersFromEnv(env, 0),
    });
    // A container that came back with no disk has no queue state at all.
    await queues.obliterate();
  });

  afterAll(async () => {
    await queues.obliterate();
    await queues.close();
    await deleteTestUser(handle.db, userId);
    await handle.close();
  });

  it('re-enqueues a job Postgres still thinks is running', async () => {
    const jobId = await insertOrphan('story_outline');

    const report = await resumeRecoverableJobs(runtime);
    expect(report.requeued).toBeGreaterThanOrEqual(1);

    const bullJobId = queueJobId(jobId, 'story.outline');
    const restored = await queues.queue('llm').getJob(bullJobId);
    expect(restored).toBeDefined();
    expect(restored!.name).toBe('story.outline');
    // The payload is a POINTER — the job id, the user, the trace. Never the prompt.
    expect(restored!.data.jobId).toBe(jobId);
    expect(restored!.data.userId).toBe(userId);
    expect(restored!.data.correlationId).toBe('trace-story_outline');
  });

  it('is idempotent: running it twice does not duplicate the work', async () => {
    const jobId = await insertOrphan('voice_create');

    await resumeRecoverableJobs(runtime);
    const afterFirst = await queues.queue('voice').getJobCounts();

    const second = await resumeRecoverableJobs(runtime);
    const afterSecond = await queues.queue('voice').getJobCounts();

    // The BullMQ job id is derived from the Postgres job id, so the second add is a no-op:
    // every job the second pass saw was already present, and the queue did not grow.
    expect(second.requeued).toBe(0);
    expect(second.present).toBeGreaterThanOrEqual(1);
    expect(total(afterSecond)).toBe(total(afterFirst));
    expect(await queues.queue('voice').getJob(queueJobId(jobId, 'voice.create'))).toBeDefined();
  });

  it('gives back only the retry budget that is left, not a fresh one', async () => {
    // A job that has already burned two of three attempts must not get three more every
    // time the free-tier service wakes up — that is how a poisoned job bills forever.
    const jobId = await insertOrphan('privacy_export', { attempt: 2, maxAttempts: 3 });
    await resumeRecoverableJobs(runtime);

    const restored = await queues.queue('ops').getJob(queueJobId(jobId, 'privacy.export'));
    expect(restored!.opts.attempts).toBe(1);
  });

  it('leaves finished jobs alone', async () => {
    // Everything recoverable is already queued by now, so a succeeded job adding nothing
    // is the whole assertion: `recoverableJobs` filters on status, not on age.
    await resumeRecoverableJobs(runtime);
    const before = await queues.queue('llm').getJobCounts();
    await insertOrphan('story_outline', { status: 'succeeded' });
    await resumeRecoverableJobs(runtime);
    expect(total(await queues.queue('llm').getJobCounts())).toBe(total(before));
  });

  it('names a fan-out tree it cannot rebuild instead of shipping an empty book', async () => {
    // `image_book` is a flow TREE: the children carry per-page pointers a `jobs` row does
    // not have. Re-adding the parent alone would complete instantly having drawn nothing,
    // so it is reported for its owner rather than silently "recovered".
    const jobId = await insertOrphan('image_book');
    const report = await resumeRecoverableJobs(runtime);
    expect(report.unresumable.map((entry) => entry.jobId)).toContain(jobId);
  });

  it('startWorkerRuntime performs the recovery on boot', async () => {
    const jobId = await insertOrphan('pdf_build');

    // Exactly what the container does on wake: attach the consumers, re-seed from Postgres.
    const worker = await startWorkerRuntime(runtime, { schedulers: false });
    try {
      expect(worker.resume.scanned).toBeGreaterThanOrEqual(1);
      expect(await queues.queue('print').getJob(queueJobId(jobId, 'pdf.build'))).toBeDefined();
    } finally {
      worker.stop();
      await queues.close();
      // Reopen for the afterAll teardown, which obliterates the prefix.
      queues = new QueueRegistry({
        connection: connectionFromUrl(TEST_REDIS_URL),
        prefix: env.QUEUE_PREFIX,
      });
    }
  });
});
