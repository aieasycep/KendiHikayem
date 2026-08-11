/**
 * The three levels of idempotency, against a real PostgreSQL.
 *
 * Level 1 (HTTP) is covered in apps/api's own suite; this file covers levels 2 and 3 plus
 * the property they exist for: an interrupted job RESUMES rather than restarts, so the
 * work already paid for is not paid for again.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import type { DbHandle } from '@kendihikayem/db';

import {
  JobIdempotencyConflictError,
  beginStep,
  cancelJob,
  completeStep,
  enqueueJob,
  failStep,
  finaliseJob,
  getJobSteps,
  transitionJob,
} from '../src/jobs/repository';
import { InvalidJobTransitionError } from '../src/jobs/state-machine';
import { requestHash, stepInputHash, stepKeys, uuidv5 } from '../src/jobs/hashing';
import { createTestUser, deleteTestUser, newIdempotencyKey, openDb } from './helpers';

let handle: DbHandle;
const createdUsers: string[] = [];

beforeAll(() => {
  handle = openDb(5);
});

afterAll(async () => {
  for (const userId of createdUsers) await deleteTestUser(handle.db, userId);
  await handle.close();
});

async function newUser() {
  const user = await createTestUser(handle.db, { capUsd: 50 });
  createdUsers.push(user.userId);
  return user;
}

describe('level 2 — job idempotency', () => {
  it('collapses a double-tap onto one job row', async () => {
    const user = await newUser();
    const key = newIdempotencyKey();
    const hash = requestHash('POST /v1/stories', { childId: 'c1', theme: 'uyku' });

    const first = await enqueueJob(handle.db, {
      userId: user.userId,
      kind: 'story_outline',
      idempotencyKey: key,
      requestHash: hash,
      correlationId: 'trace-1',
    });
    const second = await enqueueJob(handle.db, {
      userId: user.userId,
      kind: 'story_outline',
      idempotencyKey: key,
      requestHash: hash,
      correlationId: 'trace-2',
    });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.job.id).toBe(first.job.id);

    const rows = await handle.db.execute<{ count: string }>(sql`
      select count(*)::text as count from jobs where user_id = ${user.userId}
    `);
    expect(Number(rows[0]!.count)).toBe(1);
  });

  it('holds under genuinely concurrent enqueues', async () => {
    const user = await newUser();
    const key = newIdempotencyKey();
    const hash = requestHash('POST /v1/stories', { childId: 'c2' });

    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        enqueueJob(handle.db, {
          userId: user.userId,
          kind: 'story_outline',
          idempotencyKey: key,
          requestHash: hash,
          correlationId: 'trace-concurrent',
        }),
      ),
    );

    const ids = new Set(results.map((r) => r.job.id));
    expect(ids.size).toBe(1);
    expect(results.filter((r) => r.created)).toHaveLength(1);
  });

  it('rejects the same key with a different body', async () => {
    const user = await newUser();
    const key = newIdempotencyKey();

    await enqueueJob(handle.db, {
      userId: user.userId,
      kind: 'story_outline',
      idempotencyKey: key,
      requestHash: requestHash('POST /v1/stories', { theme: 'uyku' }),
      correlationId: 'trace-a',
    });

    await expect(
      enqueueJob(handle.db, {
        userId: user.userId,
        kind: 'story_outline',
        idempotencyKey: key,
        requestHash: requestHash('POST /v1/stories', { theme: 'macera' }),
        correlationId: 'trace-b',
      }),
    ).rejects.toBeInstanceOf(JobIdempotencyConflictError);
  });
});

describe('level 3 — step idempotency and resume', () => {
  /**
   * The interrupted-job property, end to end. Twelve pages: four finish, then the worker
   * dies. On restart the four completed steps are REUSED (no provider call, no charge) and
   * only the remaining eight run.
   */
  it('resumes an interrupted job from where it stopped', async () => {
    const user = await newUser();
    const { job } = await enqueueJob(handle.db, {
      userId: user.userId,
      kind: 'image_book',
      idempotencyKey: newIdempotencyKey(),
      requestHash: requestHash('POST /v1/stories/x/illustrate', {}),
      correlationId: 'trace-resume',
      progressTotal: 12,
    });
    await transitionJob(handle.db, job.id, 'running');

    const pageInput = (pageNo: number) => ({ pageNo, prompt: `page ${pageNo}` });

    // ── first run: pages 1–4 complete, then the process dies ──
    for (const pageNo of [1, 2, 3, 4]) {
      const claim = await beginStep(handle.db, {
        jobId: job.id,
        stepKey: stepKeys.imagePage(pageNo),
        kind: 'image',
        inputHash: stepInputHash(pageInput(pageNo)),
      });
      expect(claim.reuse).toBe(false);
      await completeStep(handle.db, claim.step.id, {
        output: { sha256: `page-${pageNo}` },
        costUsd: 0.067,
      });
    }

    // ── restart: the whole job is replayed from step 1 ──
    let reused = 0;
    let executed = 0;
    for (let pageNo = 1; pageNo <= 12; pageNo += 1) {
      const claim = await beginStep(handle.db, {
        jobId: job.id,
        stepKey: stepKeys.imagePage(pageNo),
        kind: 'image',
        inputHash: stepInputHash(pageInput(pageNo)),
      });
      if (claim.reuse) {
        reused += 1;
        expect(claim.output).toEqual({ sha256: `page-${pageNo}` });
      } else {
        executed += 1;
        await completeStep(handle.db, claim.step.id, {
          output: { sha256: `page-${pageNo}` },
          costUsd: 0.067,
        });
      }
    }

    expect(reused).toBe(4);
    expect(executed).toBe(8);
  });

  it('reruns a step when its input changed — an edited page is not served from a stale step', async () => {
    const user = await newUser();
    const { job } = await enqueueJob(handle.db, {
      userId: user.userId,
      kind: 'story_page_rewrite',
      idempotencyKey: newIdempotencyKey(),
      requestHash: requestHash('POST /v1/stories/x/pages/3/rewrite', {}),
      correlationId: 'trace-edit',
    });

    const first = await beginStep(handle.db, {
      jobId: job.id,
      stepKey: stepKeys.imagePage(3),
      kind: 'image',
      inputHash: stepInputHash({ text: 'orijinal metin' }),
    });
    await completeStep(handle.db, first.step.id, { output: { sha256: 'old' } });

    const second = await beginStep(handle.db, {
      jobId: job.id,
      stepKey: stepKeys.imagePage(3),
      kind: 'image',
      inputHash: stepInputHash({ text: 'ebeveyn düzenledi' }),
    });

    expect(second.reuse).toBe(false);
    expect(second.step.attempt).toBe(2);
  });

  it('gives the provider a stable dedupe id across retries', async () => {
    const user = await newUser();
    const { job } = await enqueueJob(handle.db, {
      userId: user.userId,
      kind: 'image_page',
      idempotencyKey: newIdempotencyKey(),
      requestHash: requestHash('x', {}),
      correlationId: 'trace-dedupe',
    });

    const first = await beginStep(handle.db, {
      jobId: job.id,
      stepKey: stepKeys.imagePage(7),
      kind: 'image',
      inputHash: 'h1',
    });
    await failStep(handle.db, first.step.id, { code: 'PROVIDER_UNAVAILABLE' });

    const retry = await beginStep(handle.db, {
      jobId: job.id,
      stepKey: stepKeys.imagePage(7),
      kind: 'image',
      inputHash: 'h1',
    });

    expect(retry.step.provider_request_id).toBe(first.step.provider_request_id);
    expect(retry.step.provider_request_id).toBe(uuidv5(first.step.id));
  });
});

describe('partial success', () => {
  it('closes 9-of-12 as succeeded with a partial summary, not as failed', async () => {
    const user = await newUser();
    const { job } = await enqueueJob(handle.db, {
      userId: user.userId,
      kind: 'image_book',
      idempotencyKey: newIdempotencyKey(),
      requestHash: requestHash('x', {}),
      correlationId: 'trace-partial',
      progressTotal: 12,
    });
    await transitionJob(handle.db, job.id, 'running');

    for (let pageNo = 1; pageNo <= 12; pageNo += 1) {
      const claim = await beginStep(handle.db, {
        jobId: job.id,
        stepKey: stepKeys.imagePage(pageNo),
        kind: 'image',
        inputHash: `h${pageNo}`,
      });
      if ([4, 7, 11].includes(pageNo)) {
        await failStep(handle.db, claim.step.id, { code: 'PROVIDER_UNAVAILABLE' });
      } else {
        await completeStep(handle.db, claim.step.id, { output: { sha256: `p${pageNo}` } });
      }
    }

    const result = await finaliseJob(handle.db, job.id, { stepPrefix: 'image:page:' });

    expect(result.outcome).toBe('partial');
    expect(result.job.status).toBe('succeeded');
    expect(result.partial).toEqual({ completed: 9, total: 12, failedPageNos: [4, 7, 11] });
    expect(result.job.output).toMatchObject({
      partial: { completed: 9, total: 12, failedPageNos: [4, 7, 11] },
    });
  });

  it('fails the job when almost nothing worked', async () => {
    const user = await newUser();
    const { job } = await enqueueJob(handle.db, {
      userId: user.userId,
      kind: 'image_book',
      idempotencyKey: newIdempotencyKey(),
      requestHash: requestHash('x', {}),
      correlationId: 'trace-mostly-failed',
    });
    await transitionJob(handle.db, job.id, 'running');

    for (let pageNo = 1; pageNo <= 12; pageNo += 1) {
      const claim = await beginStep(handle.db, {
        jobId: job.id,
        stepKey: stepKeys.imagePage(pageNo),
        kind: 'image',
        inputHash: `h${pageNo}`,
      });
      if (pageNo <= 10) await failStep(handle.db, claim.step.id, { code: 'INTERNAL' });
      else await completeStep(handle.db, claim.step.id, { output: {} });
    }

    const result = await finaliseJob(handle.db, job.id, { stepPrefix: 'image:page:' });
    expect(result.outcome).toBe('failed');
    expect(result.job.status).toBe('failed');
  });
});

describe('state machine enforcement', () => {
  it('refuses an illegal transition rather than silently accepting it', async () => {
    const user = await newUser();
    const { job } = await enqueueJob(handle.db, {
      userId: user.userId,
      kind: 'story_outline',
      idempotencyKey: newIdempotencyKey(),
      requestHash: requestHash('x', {}),
      correlationId: 'trace-illegal',
    });

    await transitionJob(handle.db, job.id, 'running');
    await transitionJob(handle.db, job.id, 'succeeded');

    await expect(transitionJob(handle.db, job.id, 'running')).rejects.toBeInstanceOf(
      InvalidJobTransitionError,
    );

    const steps = await getJobSteps(handle.db, job.id);
    expect(steps).toHaveLength(0);
  });

  it('refuses to cancel a job that already finished', async () => {
    const user = await newUser();
    const { job } = await enqueueJob(handle.db, {
      userId: user.userId,
      kind: 'story_outline',
      idempotencyKey: newIdempotencyKey(),
      requestHash: requestHash('x', {}),
      correlationId: 'trace-cancel',
    });

    await transitionJob(handle.db, job.id, 'running');
    await transitionJob(handle.db, job.id, 'succeeded');

    await expect(cancelJob(handle.db, job.id, user.userId)).rejects.toThrow(
      /can no longer be cancelled/,
    );
  });
});
