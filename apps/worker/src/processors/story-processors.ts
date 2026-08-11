/**
 * processors/story-processors.ts — the three BullMQ jobs of the text pipeline.
 *
 *   story.outline      stage 1, ends in `waiting_approval` — ⏸ GATE 1
 *   story.fill         stage 2, only ever enqueued by the approve endpoint
 *   story.page_rewrite one page, when a parent asks for one (P02)
 *
 * The orchestration (claim, progress, events, close, settle) is A2's `runStep`/`closeJob`
 * plumbing; the domain is `story-generation.ts`. This file is the seam between them and
 * deliberately thin.
 */

import type { Job } from 'bullmq';

import type { JobPayload } from '../queues';
import type { WorkerRuntime } from '../runtime';
import { appendJobEvent } from '../jobs/events';
import { getJob, transitionJob, updateProgress } from '../jobs/repository';
import {
  StoryGateError,
  runFillStage,
  runOutlineStage,
  runPageRewrite,
  type StoryJobContext,
} from './story-generation';

export type StoryProcessor = (runtime: WorkerRuntime, job: Job<JobPayload>) => Promise<unknown>;

function contextOf(job: Job<JobPayload>): StoryJobContext {
  const storyId = String(job.data.ref?.['storyId'] ?? '');
  if (storyId === '') throw new Error(`${job.name} job ${job.data.jobId} has no storyId`);
  return {
    jobId: job.data.jobId,
    userId: job.data.userId,
    correlationId: job.data.correlationId,
    storyId,
  };
}

/**
 * A gate refusal is not a crash: the parent gets a Turkish sentence and their credit back.
 * It is surfaced as a job event so the client can show the message immediately, and then
 * rethrown so the job fails and `closeJob` releases the whole cost reservation.
 */
async function withGateReporting<T>(
  runtime: WorkerRuntime,
  job: Job<JobPayload>,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof StoryGateError) {
      await appendJobEvent(runtime.db, job.data.jobId, 'job.failed', {
        jobId: job.data.jobId,
        outcome: 'failed',
        error: { code: error.errorCode, messageTr: error.messageTr, retryable: false },
      });
    }
    throw error;
  }
}

/** Stage 1 — the cheap skeleton. Parks in `waiting_approval`; stage 2 is NOT enqueued. */
export const storyOutlineProcessor: StoryProcessor = async (runtime, job) => {
  const context = contextOf(job);
  await ensureRunning(runtime, context.jobId);
  await progress(runtime, context.jobId, 0, 3, 'Hikayenin iskeleti kuruluyor');

  const result = await withGateReporting(runtime, job, () => runOutlineStage(runtime, context));

  await progress(runtime, context.jobId, 3, 3, 'İskelet hazır, onayınızı bekliyor');
  await transitionJob(runtime.db, context.jobId, 'waiting_approval');
  await appendJobEvent(runtime.db, context.jobId, 'job.awaiting_approval', {
    jobId: context.jobId,
    approvalKind: 'skeleton',
  });

  return {
    status: 'waiting_approval',
    scenes: result.outline.scenes.length,
    costUsd: result.costUsd,
  };
};

/** Stage 2 — the expensive fill. Reached only through ⏸ GATE 1. */
export const storyFillProcessor: StoryProcessor = async (runtime, job) => {
  const context = contextOf(job);
  await ensureRunning(runtime, context.jobId);

  const pageCount = Number(job.data.ref?.['pageCount'] ?? 12);
  await progress(runtime, context.jobId, 0, pageCount, 'Hikaye yazılıyor');

  const result = await withGateReporting(runtime, job, () => runFillStage(runtime, context));

  for (const page of result.pages) {
    // Progressive delivery: the reader can open a page as soon as its TEXT exists, long
    // before its illustration does (contract/src/story.ts). The contract's `page.ready`
    // carries the text itself, so the client renders without a round trip.
    await appendJobEvent(runtime.db, context.jobId, 'page.ready', {
      storyId: context.storyId,
      pageNo: page.pageNo,
      textTr: page.textTr,
    });
  }
  await progress(
    runtime,
    context.jobId,
    result.pages.length,
    result.pages.length,
    'Hikaye hazır',
  );

  return {
    status: 'succeeded',
    pages: result.pages.length,
    attempts: result.attempts,
    costUsd: result.costUsd,
    flagged: result.flagged.length,
  };
};

/** One page, on request. The other pages keep their hashes — and their cached media. */
export const storyPageRewriteProcessor: StoryProcessor = async (runtime, job) => {
  const context = contextOf(job);
  await ensureRunning(runtime, context.jobId);

  const pageNo = Number(job.data.pageNo ?? job.data.ref?.['pageNo'] ?? 0);
  if (!Number.isInteger(pageNo) || pageNo < 1) {
    throw new Error(`story.page_rewrite job ${context.jobId} has no page number`);
  }
  const instructionTr = job.data.ref?.['instructionTr'];

  await progress(runtime, context.jobId, 0, 1, `${pageNo}. sayfa yeniden yazılıyor`);

  const result = await withGateReporting(runtime, job, () =>
    runPageRewrite(runtime, context, {
      pageNo,
      instructionTr: typeof instructionTr === 'string' ? instructionTr : undefined,
    }),
  );

  await appendJobEvent(runtime.db, context.jobId, 'page.ready', {
    storyId: context.storyId,
    pageNo: result.pageNo,
    textTr: result.textTr,
  });
  await progress(runtime, context.jobId, 1, 1, 'Sayfa hazır');

  return { status: 'succeeded', pageNo: result.pageNo, costUsd: result.costUsd };
};

/* ── shared plumbing ───────────────────────────────────────────────────────── */

async function ensureRunning(runtime: WorkerRuntime, jobId: string): Promise<void> {
  const job = await getJob(runtime.db, jobId);
  if (job && job.status === 'queued') await transitionJob(runtime.db, jobId, 'running');
}

async function progress(
  runtime: WorkerRuntime,
  jobId: string,
  current: number,
  total: number,
  labelTr: string,
): Promise<void> {
  await updateProgress(runtime.db, jobId, { current, total, labelTr });
  await appendJobEvent(runtime.db, jobId, 'job.progress', {
    jobId,
    progress: { current, total, labelTr },
  });
}
