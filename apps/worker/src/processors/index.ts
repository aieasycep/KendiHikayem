/**
 * processors/index.ts — one processor per BullMQ job name, grouped by queue.
 *
 * SCOPE: A2 owns the ORCHESTRATION — claiming the step, calling the router through
 * `runStep`, writing progress, emitting events, closing the job with the right partial /
 * failed / succeeded outcome, and settling the reservation. The DOMAIN content of each
 * step (real prompts, QA gates, ffmpeg graphs, PDF layout) is A3–A6's, and is marked
 * `TODO(A3..A6)` where it belongs.
 *
 * Everything here runs today against the deterministic fakes, so the shape of a finished
 * pipeline — including partial success and cost settlement — is testable before a single
 * vendor key exists.
 */

import type { Job, Processor } from 'bullmq';
import { sql } from 'drizzle-orm';

import type { JobPayload, QueueName } from '../queues';
import type { WorkerRuntime } from '../runtime';
import { runStep } from './run-step';
import { stepKeys } from '../jobs/hashing';
import {
  beginStep,
  completeStep,
  finaliseJob,
  getJob,
  getJobSteps,
  transitionJob,
  updateProgress,
} from '../jobs/repository';
import { appendJobEvent, enqueueOutbox } from '../jobs/events';
import { buildImageContext } from './image-context';
import {
  storyFillProcessor,
  storyOutlineProcessor,
  storyPageRewriteProcessor,
} from './story-processors';
import {
  makeCharacterSheetProcessor,
  makeImagePageProcessor,
  makeStylePlateProcessor,
  memoiseContext,
} from './image';
import { commitReservation, releaseReservation } from '../cost/reservation';
import { createAudioConcatProcessor, createTtsChunkProcessor } from './audio-render';
import { createVoiceCreateProcessor, createVoiceDeleteProcessor } from './audio-voice';
import { pdfBuild, printStatus, printSubmit } from './print';
import { actualCostForJob } from '../cost/ledger.pg';

export type WorkerProcessor = (
  runtime: WorkerRuntime,
  job: Job<JobPayload>,
) => Promise<unknown>;

/* ── Shared helpers ────────────────────────────────────────────────────────── */

/** Marks the job running the first time one of its steps starts. */
async function ensureRunning(runtime: WorkerRuntime, jobId: string): Promise<void> {
  const job = await getJob(runtime.db, jobId);
  if (job && job.status === 'queued') {
    await transitionJob(runtime.db, jobId, 'running');
  }
}

/**
 * Closes a job: derive the outcome from the steps, settle the reservation with the ACTUAL
 * cost from `provider_usage`, emit the SSE event and write the outbox row.
 *
 * The outbox write shares this function's transaction boundary with nothing else on
 * purpose — see the note in `jobs/events.ts`: the row is written with the state change so
 * "finished but never notified" cannot happen.
 */
async function closeJob(
  runtime: WorkerRuntime,
  jobId: string,
  options: { stepPrefix?: string; output?: Record<string, unknown> } = {},
): Promise<void> {
  const { job, outcome, partial } = await finaliseJob(runtime.db, jobId, options);

  const actualUsd = await actualCostForJob(runtime.db, jobId);
  if (job.reservation_id) {
    if (outcome === 'failed') {
      // Nothing usable was produced — hand the whole hold back rather than charging for
      // a book that does not exist.
      await releaseReservation(runtime.db, job.reservation_id);
    } else {
      await commitReservation(runtime.db, job.reservation_id, actualUsd);
    }
  }
  await transitionJobCost(runtime, jobId, actualUsd);

  const eventType = outcome === 'failed' ? 'job.failed' : 'job.completed';
  await appendJobEvent(runtime.db, jobId, eventType, {
    jobId,
    outcome,
    ...(outcome === 'partial' ? { partial } : {}),
  });

  await enqueueOutbox(runtime.db, {
    aggregate: 'job',
    aggregateId: jobId,
    eventType,
    payload: { jobId, kind: job.kind, outcome, userId: job.user_id },
    dedupeKey: `${eventType}:${jobId}`,
  });
}

async function transitionJobCost(
  runtime: WorkerRuntime,
  jobId: string,
  actualUsd: number,
): Promise<void> {
  // Recorded even on failure: what a failed attempt burned is still real money.
  await runtime.db.execute(sql`
    update jobs set actual_cost_usd = ${actualUsd.toFixed(5)}::numeric where id = ${jobId}
  `);
}

async function emitProgress(
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

/* ── llm queue ─────────────────────────────────────────────────────────────── */

/**
 * Stage 1 and stage 2 (A3). The DOMAIN — prompts, schema validation, the Turkish quality
 * gate, the six safety layers, the DB writes — lives in `story-generation.ts`; what stays
 * here is this file's job: closing the job so the reservation settles.
 *
 * `story.outline` is NOT closed on purpose: it parks in `waiting_approval` at ⏸ GATE 1 and
 * is closed by the approve (or reject) endpoint.
 */
const storyOutline: WorkerProcessor = storyOutlineProcessor;

const storyFill: WorkerProcessor = async (runtime, job) => {
  const result = await storyFillProcessor(runtime, job);
  await closeJob(runtime, job.data.jobId, { stepPrefix: 'llm:illustration_prompt:' });
  return result;
};

const storyPageRewrite: WorkerProcessor = async (runtime, job) => {
  const result = await storyPageRewriteProcessor(runtime, job);
  await closeJob(runtime, job.data.jobId);
  return result;
};

/** One illustration prompt per page. Failing one page must not stop the other eleven. */
const illustrationPrompt: WorkerProcessor = async (runtime, job) => {
  const { jobId, userId, correlationId, stepKey, pageNo } = job.data;
  const storyId = String(job.data.ref?.['storyId'] ?? '');

  const result = await runStep({
    db: runtime.db,
    jobId,
    userId,
    correlationId,
    stepKey: stepKey ?? stepKeys.illustrationPrompt(pageNo ?? 1),
    stepKind: 'llm',
    operation: 'llm.complete',
    stepInput: { storyId, pageNo },
    router: runtime.routers.llm,
    // TODO(A4): K5 deterministic prompt audit (CHARACTER_DNA verbatim, brand denylist,
    // "no text, no letters" suffix) before the prompt is allowed near the image model.
    invoke: (adapter, ctx) =>
      adapter.complete(
        {
          purpose: 'illustration_prompt',
          messages: [{ role: 'user', content: `story:${storyId}:page:${pageNo}` }],
          maxOutputTokens: 400,
          batch: true,
        },
        ctx,
      ),
    toOutput: (value) => ({ promptEn: value.text }),
  });

  if (result.status === 'failed') throw result.error;
  return { status: result.status };
};

/* ── image queue ───────────────────────────────────────────────────────────── */

/**
 * The illustration processors live in `processors/image.ts` (owner: A4). They are built
 * here rather than imported as constants because each one needs an `ImageContext` — the
 * adapter route chosen by `API_MODE`, the object store, the QA thresholds — and that
 * context is per-runtime, not per-module.
 */
const imageContextFor = memoiseContext((runtime) =>
  buildImageContext({
    db: runtime.db,
    env: runtime.env,
    // Reuse the runtime's image route so mock/live selection and the cost ledger stay in
    // one place; `buildRuntime` already chose it from `API_MODE`.
    adapters: [...runtime.routers.image.route],
    routerOptions: { ledger: runtime.ledger, breakers: runtime.breakers },
  }),
);

const imagePage = makeImagePageProcessor(imageContextFor);
const imageStylePlate = makeStylePlateProcessor(imageContextFor);
const imageCharacterSheet = makeCharacterSheetProcessor(imageContextFor);

/* ── media queue ───────────────────────────────────────────────────────────── */

/**
 * FAN-IN JOIN. Runs after all 13 children settle — including the ones that failed, since
 * `failParentOnFailure` is off. This is where partial success is decided: nine of twelve
 * closes the job as `succeeded` with `partial`, not as `failed`.
 */
const bookAssemble: WorkerProcessor = async (runtime, job) => {
  const { jobId } = job.data;
  const steps = await getJobSteps(runtime.db, jobId);
  const pages = steps.filter((s) => s.step_key.startsWith('image:page:'));
  const done = pages.filter((s) => s.status === 'succeeded' || s.status === 'skipped').length;

  await emitProgress(
    runtime,
    jobId,
    done,
    pages.length,
    `${done}/${pages.length} sayfa hazırlandı`,
  );

  // TODO(A4/A6): assemble the reader manifest and the print-ready asset set here.
  await closeJob(runtime, jobId, { stepPrefix: 'image:page:' });
  return { status: 'succeeded', completed: done, total: pages.length };
};

/* ── voice queue ───────────────────────────────────────────────────────────── */

/**
 * ⭐ The chunk render, the voice clone and the join all live in `audio-*.ts` (A5). They are
 * built per-runtime rather than being plain constants because each one needs the resolved
 * voice settings — chunk size, loudness target, slot policy — which come from config and
 * differ per environment.
 */
const ttsChunk: WorkerProcessor = async (runtime, job) => {
  await ensureRunning(runtime, job.data.jobId);
  return createTtsChunkProcessor({ settings: runtime.ttsSettings })(runtime, job);
};

/**
 * FAN-IN. Joins the chunks, normalises to −16 LUFS, writes the page marks and the word
 * timings, then closes the job. A missing chunk failed the parent already
 * (`failParentOnFailure` in the flow): a hole in the middle of a story is not a partial
 * success the way a missing illustration is.
 */
const audioConcat: WorkerProcessor = async (runtime, job) => {
  const { jobId } = job.data;
  const result = await createAudioConcatProcessor({ settings: runtime.ttsSettings })(runtime, job);
  await closeJob(runtime, jobId, { stepPrefix: 'tts:chunk:' });
  return { status: 'succeeded', ...result };
};

/** Voice cloning: consent chain → stitched reference → vendor voice → preview (SPEC §7 §8). */
const voiceCreate: WorkerProcessor = async (runtime, job) => {
  const { jobId } = job.data;
  await ensureRunning(runtime, jobId);
  await emitProgress(runtime, jobId, 0, 3, 'Sesiniz hazırlanıyor');

  const result = await createVoiceCreateProcessor({ settings: runtime.ttsSettings })(runtime, job);

  await emitProgress(runtime, jobId, 3, 3, 'Sesiniz hazır, dinleyebilirsiniz');
  await closeJob(runtime, jobId);
  return result;
};

/** Erasure: schedules the provider → storage → rows chain (SPEC §7 step 11). */
const voiceDelete: WorkerProcessor = async (runtime, job) => {
  const { jobId } = job.data;
  await ensureRunning(runtime, jobId);
  const result = await createVoiceDeleteProcessor()(runtime, job);
  await closeJob(runtime, jobId);
  return result;
};

/* ── Skeletons for the remaining job kinds ─────────────────────────────────── */

/**
 * Owned by other agents. They record a step and close the job so the state machine, the
 * reservation settlement and the event stream are already correct — the owner replaces the
 * body, not the plumbing.
 */
function skeleton(owner: string, labelTr: string): WorkerProcessor {
  return async (runtime, job) => {
    const { jobId, stepKey } = job.data;
    await ensureRunning(runtime, jobId);
    await emitProgress(runtime, jobId, 0, 1, labelTr);

    const claim = await runStepPlaceholder(runtime, job, stepKey ?? 'placeholder');
    await completeStep(runtime.db, claim, { status: 'succeeded', output: { owner, todo: true } });
    await closeJob(runtime, jobId);
    return { status: 'succeeded', owner };
  };
}

async function runStepPlaceholder(
  runtime: WorkerRuntime,
  job: Job<JobPayload>,
  stepKey: string,
): Promise<string> {
  const claim = await beginStep(runtime.db, {
    jobId: job.data.jobId,
    stepKey,
    kind: 'placeholder',
    inputHash: 'placeholder',
  });
  return claim.step.id;
}

/* ── Registry ──────────────────────────────────────────────────────────────── */

export const PROCESSORS: Record<QueueName, Record<string, WorkerProcessor>> = {
  llm: {
    'story.outline': storyOutline,
    'story.fill': storyFill,
    'llm.illustration_prompt': illustrationPrompt,
    'story.page_rewrite': storyPageRewrite,
  },
  image: {
    'image.page': imagePage,
    'image.cover': imagePage,
    'image.character_sheet': imageCharacterSheet,
    'image.style_plate': imageStylePlate,
  },
  voice: {
    'tts.chunk': ttsChunk,
    'voice.create': voiceCreate,
    'voice.delete': voiceDelete,
  },
  media: {
    'book.assemble': bookAssemble,
    'audio.concat': audioConcat,
    'export.mp4': skeleton('A5', 'Video hazırlanıyor'),
  },
  print: {
    // A6: layout + preflight + PDF bytes, then the partner. `pdf.build` never reaches the
    // printer when the preflight fails — see flows/print.flow.ts.
    'pdf.build': pdfBuild,
    'print.submit': printSubmit,
    'print.status': printStatus,
  },
  ops: {
    'privacy.export': skeleton('A1', 'Verileriniz dışa aktarılıyor'),
    'privacy.delete': skeleton('A1', 'Verileriniz siliniyor'),
  },
};

/** Adapts the registry into a BullMQ processor for one queue. */
export function createQueueProcessor(
  runtime: WorkerRuntime,
  queueName: QueueName,
): Processor<JobPayload> {
  const handlers = PROCESSORS[queueName];
  return async (job) => {
    const handler = handlers[job.name];
    if (!handler) throw new Error(`no processor registered for ${queueName}/${job.name}`);
    return handler(runtime, job);
  };
}
