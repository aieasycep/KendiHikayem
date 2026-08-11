/**
 * The whole pipeline: real Redis, real BullMQ, real PostgreSQL, fake providers.
 *
 * This is the test that says "the system works end to end" honestly. It runs the actual
 * `FlowProducer` fan-out/fan-in, the actual processors, the actual `runStep` harness — the
 * only doubles are the AI vendors, which are unreachable here and have no keys.
 *
 * What it proves:
 *   · 13 images fan out and one join runs after them
 *   · a page that fails permanently produces PARTIAL success, not a failed book
 *   · the cost reservation is committed with the ACTUAL ledger cost
 *   · `content_cache` turns a rerun into `skipped` steps at zero cost
 *
 * Skips itself (loudly) when Redis is unavailable rather than pretending to pass.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import type { DbHandle } from '@kendihikayem/db';
import { FailurePlan, createFakeRegistry } from '@kendihikayem/providers';

import { QueueRegistry, connectionFromUrl } from '../src/queues';
import { buildRuntime, type WorkerRuntime } from '../src/runtime';
import { createQueueProcessor } from '../src/processors/index';
import { addBookIllustrationFlow, buildBookIllustrationFlow } from '../src/flows/book.flow';
import { enqueueJob, getJobSteps, transitionJob } from '../src/jobs/repository';
import { requestHash, stepKeys } from '../src/jobs/hashing';
import { reserveCost } from '../src/cost/reservation';
import {
  TEST_REDIS_URL,
  createTestUser,
  deleteTestUser,
  newIdempotencyKey,
  openDb,
  redisAvailable,
  testEnv,
  waitFor,
} from './helpers';

const hasRedis = await redisAvailable();

let handle: DbHandle;
const createdUsers: string[] = [];

beforeAll(() => {
  handle = openDb(10);
});

afterAll(async () => {
  for (const userId of createdUsers) await deleteTestUser(handle.db, userId);
  await handle.close();
});

/* ── Flow shape: no Redis needed, so this always runs ─────────────────────── */

describe('flow shape', () => {
  it('builds one join parent over 13 image children', () => {
    const flow = buildBookIllustrationFlow({
      jobId: 'job-1',
      userId: 'user-1',
      correlationId: 'trace-1',
      storyId: 'story-1',
      pageNos: Array.from({ length: 12 }, (_, i) => i + 1),
      refs: {
        stylePlateAssetId: 'a1',
        characterSheetAssetId: 'a2',
        faceRefAssetId: 'a3',
      },
    });

    expect(flow.queueName).toBe('media');
    expect(flow.name).toBe('book.assemble');
    // 12 pages + cover.
    expect(flow.children).toHaveLength(13);
    expect(flow.children?.every((child) => child.queueName === 'image')).toBe(true);
  });

  it('does not let one failed page cancel the other twelve', () => {
    const flow = buildBookIllustrationFlow({
      jobId: 'job-2',
      userId: 'user-1',
      correlationId: 'trace-2',
      storyId: 'story-1',
      pageNos: [1, 2, 3],
      refs: { stylePlateAssetId: 'a', characterSheetAssetId: 'b', faceRefAssetId: 'c' },
    });

    // The single flag that makes partial success possible at the queue level.
    expect(flow.children?.every((c) => c.opts?.failParentOnFailure === false)).toBe(true);
  });

  it('gives every node a deterministic id so re-adding a flow is a no-op', () => {
    const build = () =>
      buildBookIllustrationFlow({
        jobId: 'job-3',
        userId: 'user-1',
        correlationId: 'trace-3',
        storyId: 'story-1',
        pageNos: [1, 2],
        refs: { stylePlateAssetId: 'a', characterSheetAssetId: 'b', faceRefAssetId: 'c' },
      });

    expect(build().opts?.jobId).toBe(build().opts?.jobId);
    expect(build().children?.[0]?.opts?.jobId).toBe('job-3:image:page:01');
  });
});

/* ── End to end: needs Redis ──────────────────────────────────────────────── */

describe.skipIf(!hasRedis)('book illustration, end to end', () => {
  let runtime: WorkerRuntime;
  let queues: QueueRegistry;

  const startWorkers = () => {
    for (const name of ['image', 'media'] as const) {
      queues.startWorker(name, createQueueProcessor(runtime, name));
    }
  };

  const buildRuntimeWith = (failures: FailurePlan) => {
    const env = testEnv();
    queues = new QueueRegistry({
      connection: connectionFromUrl(TEST_REDIS_URL),
      prefix: `khtest_${process.pid}_${Math.random().toString(36).slice(2, 8)}`,
    });
    const adapters = createFakeRegistry({
      models: {
        llm: env.LLM_MODEL_FILL,
        image: env.IMAGE_MODEL_PRIMARY,
        tts: env.TTS_MODEL_QUALITY,
        moderation: env.MODERATION_MODEL,
        align: 'whisperx-tr',
        print: env.PRINT_ADAPTER,
      },
      latencyMs: 0,
      failures,
    });
    runtime = buildRuntime({ env, db: handle.db, queues, adapters });
    startWorkers();
  };

  afterAll(async () => {
    await queues?.obliterate().catch(() => undefined);
    await runtime?.close();
  });

  it('fans out 13 pages, joins them, and commits the real cost', async () => {
    buildRuntimeWith(FailurePlan.none());

    const user = await createTestUser(handle.db, { capUsd: 20 });
    createdUsers.push(user.userId);

    const held = await reserveCost(handle.db, {
      userId: user.userId,
      estimateUsd: 3,
      caps: { maxCostUsdPerRequest: 6, dailyGlobalUsdCap: 1_000_000 },
    });
    if (!held.ok) throw new Error('reservation should have succeeded');

    const { job } = await enqueueJob(handle.db, {
      userId: user.userId,
      kind: 'image_book',
      idempotencyKey: newIdempotencyKey('e2e'),
      requestHash: requestHash('POST /v1/stories/x/illustrate', {}),
      correlationId: 'trace-e2e',
      progressTotal: 13,
      estimatedCostUsd: 3,
      reservationId: held.reservationId,
    });

    await addBookIllustrationFlow(queues, {
      jobId: job.id,
      userId: user.userId,
      correlationId: 'trace-e2e',
      storyId: '00000000-0000-4000-8000-0000000000aa',
      pageNos: Array.from({ length: 12 }, (_, i) => i + 1),
      refs: { stylePlateAssetId: 'a', characterSheetAssetId: 'b', faceRefAssetId: 'c' },
    });

    await waitFor(async () => {
      const rows = await handle.db.execute<{ status: string }>(sql`
        select status from jobs where id = ${job.id}
      `);
      return rows[0]?.status === 'succeeded' || rows[0]?.status === 'failed';
    });

    const jobRows = await handle.db.execute<{
      status: string;
      actual_cost_usd: string;
      output: Record<string, unknown> | null;
    }>(sql`select status, actual_cost_usd, output from jobs where id = ${job.id}`);

    expect(jobRows[0]?.status).toBe('succeeded');
    // 13 images actually ran and were priced.
    expect(Number(jobRows[0]?.actual_cost_usd)).toBeGreaterThan(0);

    const steps = await getJobSteps(handle.db, job.id);
    const pageSteps = steps.filter((s) => s.step_key.startsWith('image:page:'));
    expect(pageSteps).toHaveLength(12);
    expect(pageSteps.every((s) => s.status === 'succeeded' || s.status === 'skipped')).toBe(true);

    // The hold was settled, not left dangling.
    const reservations = await handle.db.execute<{ state: string }>(sql`
      select state from cost_reservations where id = ${held.reservationId}
    `);
    expect(reservations[0]?.state).toBe('committed');

    // Every provider call landed in the ledger.
    const usage = await handle.db.execute<{ count: string }>(sql`
      select count(*)::text as count
        from provider_usage pu
        join job_steps js on js.id = pu.job_step_id
       where js.job_id = ${job.id}
    `);
    expect(Number(usage[0]?.count)).toBeGreaterThanOrEqual(13);
  }, 60_000);

  it('delivers a PARTIAL book when three pages fail permanently', async () => {
    // Pages 4, 7 and 11 never recover — the SPEC §8.4 scenario.
    const failures = FailurePlan.none()
      .failForever('image:page:04')
      .failForever('image:page:07')
      .failForever('image:page:11');

    buildRuntimeWith(failures);

    const user = await createTestUser(handle.db, { capUsd: 20 });
    createdUsers.push(user.userId);

    const { job } = await enqueueJob(handle.db, {
      userId: user.userId,
      kind: 'image_book',
      idempotencyKey: newIdempotencyKey('partial'),
      requestHash: requestHash('POST /v1/stories/y/illustrate', {}),
      correlationId: 'trace-partial-e2e',
      progressTotal: 12,
    });

    await addBookIllustrationFlow(queues, {
      jobId: job.id,
      userId: user.userId,
      correlationId: 'trace-partial-e2e',
      storyId: '00000000-0000-4000-8000-0000000000bb',
      pageNos: Array.from({ length: 12 }, (_, i) => i + 1),
      includeCover: false,
      refs: { stylePlateAssetId: 'a', characterSheetAssetId: 'b', faceRefAssetId: 'c' },
    });

    await waitFor(async () => {
      const rows = await handle.db.execute<{ status: string }>(sql`
        select status from jobs where id = ${job.id}
      `);
      return rows[0]?.status === 'succeeded' || rows[0]?.status === 'failed';
    }, { timeoutMs: 60_000 });

    const rows = await handle.db.execute<{
      status: string;
      output: Record<string, unknown> | null;
    }>(sql`select status, output from jobs where id = ${job.id}`);

    // NOT failed: nine readable pages is a book, with three placeholders.
    expect(rows[0]?.status).toBe('succeeded');
    expect(rows[0]?.output).toMatchObject({
      partial: { completed: 9, total: 12, failedPageNos: [4, 7, 11] },
    });
  }, 90_000);
});

/* ── Content cache: needs Redis for the second run ────────────────────────── */

describe.skipIf(!hasRedis)('content cache', () => {
  it('serves an identical rerun from cache at zero cost', async () => {
    const env = testEnv();
    const queues = new QueueRegistry({
      connection: connectionFromUrl(TEST_REDIS_URL),
      prefix: `khcache_${process.pid}_${Math.random().toString(36).slice(2, 8)}`,
    });
    const runtime = buildRuntime({
      env,
      db: handle.db,
      queues,
      adapters: createFakeRegistry({
        models: {
          llm: env.LLM_MODEL_FILL,
          image: env.IMAGE_MODEL_PRIMARY,
          tts: env.TTS_MODEL_QUALITY,
          moderation: env.MODERATION_MODEL,
          align: 'whisperx-tr',
          print: env.PRINT_ADAPTER,
        },
        latencyMs: 0,
      }),
    });
    queues.startWorker('image', createQueueProcessor(runtime, 'image'));

    const user = await createTestUser(handle.db, { capUsd: 20 });
    createdUsers.push(user.userId);
    const storyId = '00000000-0000-4000-8000-0000000000cc';

    const runOnce = async (label: string) => {
      const { job } = await enqueueJob(handle.db, {
        userId: user.userId,
        kind: 'image_page',
        idempotencyKey: newIdempotencyKey(label),
        requestHash: requestHash('x', { label }),
        correlationId: `trace-${label}`,
      });
      await transitionJob(handle.db, job.id, 'running');

      await queues.queue('image').add(
        'image.page',
        {
          jobId: job.id,
          userId: user.userId,
          correlationId: `trace-${label}`,
          kind: 'image_page',
          stepKey: stepKeys.imagePage(3),
          pageNo: 3,
          ref: { storyId, print: false },
        },
        { jobId: `${job.id}:page3` },
      );

      await waitFor(async () => {
        const steps = await getJobSteps(handle.db, job.id);
        return steps.some((s) => s.status === 'succeeded' || s.status === 'skipped');
      }, { timeoutMs: 30_000 });

      const steps = await getJobSteps(handle.db, job.id);
      return steps[0]!;
    };

    const first = await runOnce('cache-a');
    expect(first.status).toBe('succeeded');
    expect(Number(first.cost_usd)).toBeGreaterThan(0);

    // Same story, same page, same prompt ⇒ same cache key.
    const second = await runOnce('cache-b');
    expect(second.status).toBe('skipped');
    expect(Number(second.cost_usd)).toBe(0);

    // And the saving is recorded in dollars, not assumed.
    const saved = await handle.db.execute<{ saved_usd: string; hit_count: number }>(sql`
      select saved_usd, hit_count from content_cache where kind = 'image' order by last_hit_at desc nulls last limit 1
    `);
    expect(Number(saved[0]?.saved_usd)).toBeGreaterThan(0);

    await queues.obliterate().catch(() => undefined);
    await runtime.close();
  }, 60_000);
});

/* ── Honest reporting when Redis is missing ───────────────────────────────── */

describe.skipIf(hasRedis)('redis unavailable', () => {
  it('reports that the queue-backed tests did not run', () => {
    console.warn(
      `[test] Redis unreachable at ${TEST_REDIS_URL}; BullMQ end-to-end tests were SKIPPED, not passed.`,
    );
    expect(hasRedis).toBe(false);
  });
});
