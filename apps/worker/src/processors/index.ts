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
import { commitReservation, releaseReservation } from '../cost/reservation';
import { actualCostForJob } from '../cost/ledger.pg';
import { estimateCost } from '@kendihikayem/providers';

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

/** Stage 1: the cheap skeleton gate. Ends in `waiting_approval`, not `succeeded`. */
const storyOutline: WorkerProcessor = async (runtime, job) => {
  const { jobId, userId, correlationId } = job.data;
  await ensureRunning(runtime, jobId);
  await emitProgress(runtime, jobId, 0, 3, 'Hikayenin iskeleti kuruluyor');

  const storyId = String(job.data.ref?.['storyId'] ?? '');
  const estimate = estimateCost('story_outline', {}, runtime.priceBook);

  const result = await runStep({
    db: runtime.db,
    jobId,
    userId,
    correlationId,
    stepKey: stepKeys.llmOutline(),
    stepKind: 'llm',
    operation: 'llm.complete',
    stepInput: { storyId, stage: 'outline' },
    router: runtime.routers.llm,
    // TODO(A3): real system prompt + STYLE_DNA, cacheable prefix per SPEC §6.2 rule 2.
    invoke: (adapter, ctx) =>
      adapter.complete(
        {
          purpose: 'outline',
          messages: [
            { role: 'system', content: 'KendiHikayem outline stage', cacheable: true },
            { role: 'user', content: `story:${storyId}` },
          ],
          maxOutputTokens: 2000,
          responseFormat: 'json',
          batch: true,
        },
        ctx,
      ),
    toOutput: (value) => ({ text: value.text, tokens: value.tokens, model: value.model }),
    cache: {
      kind: 'llm',
      provider: runtime.adapters.llm.provider,
      model: 'configured',
      params: { purpose: 'outline' },
      prompt: `story:${storyId}`,
      estimatedUsd: estimate.breakdownUsd.llm,
    },
  });

  if (result.status === 'failed') throw result.error;

  await emitProgress(runtime, jobId, 3, 3, 'İskelet hazır, onayınızı bekliyor');

  // ⏸ GATE 1. The job parks here; stage 2 is enqueued only by the approve endpoint.
  await transitionJob(runtime.db, jobId, 'waiting_approval');
  await appendJobEvent(runtime.db, jobId, 'job.awaiting_approval', {
    jobId,
    approvalKind: 'skeleton',
  });
  return { status: 'waiting_approval' };
};

/** Stage 2 parent: fill the pages. Children produce the per-page illustration prompts. */
const storyFill: WorkerProcessor = async (runtime, job) => {
  const { jobId, userId, correlationId } = job.data;
  await ensureRunning(runtime, jobId);

  const storyId = String(job.data.ref?.['storyId'] ?? '');
  const pageCount = Number(job.data.ref?.['pageCount'] ?? 12);
  const estimate = estimateCost('story_fill', { pageCount }, runtime.priceBook);

  await emitProgress(runtime, jobId, 0, pageCount, 'Hikaye yazılıyor');

  const result = await runStep({
    db: runtime.db,
    jobId,
    userId,
    correlationId,
    stepKey: stepKeys.llmFill(),
    stepKind: 'llm',
    operation: 'llm.complete',
    stepInput: { storyId, stage: 'fill', pageCount },
    router: runtime.routers.llm,
    // TODO(A3): staged prompts, effort:high, per-page emission of `page.ready`.
    invoke: (adapter, ctx) =>
      adapter.complete(
        {
          purpose: 'fill',
          messages: [
            { role: 'system', content: 'KendiHikayem fill stage', cacheable: true },
            { role: 'user', content: `story:${storyId}:pages:${pageCount}` },
          ],
          maxOutputTokens: 7000,
          effort: 'high',
          batch: true,
        },
        ctx,
      ),
    toOutput: (value) => ({ text: value.text, tokens: value.tokens }),
    cache: {
      kind: 'llm',
      provider: runtime.adapters.llm.provider,
      model: 'configured',
      params: { purpose: 'fill', pageCount },
      prompt: `story:${storyId}`,
      estimatedUsd: estimate.breakdownUsd.llm,
    },
  });

  if (result.status === 'failed') throw result.error;

  await closeJob(runtime, jobId, { stepPrefix: 'llm:illustration_prompt:' });
  return { status: 'succeeded' };
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

/** One page (or the cover). Progressive delivery: emit `page.image.ready` immediately. */
const imagePage: WorkerProcessor = async (runtime, job) => {
  const { jobId, userId, correlationId, stepKey, pageNo } = job.data;
  await ensureRunning(runtime, jobId);

  const storyId = String(job.data.ref?.['storyId'] ?? '');
  const print = Boolean(job.data.ref?.['print']);
  const resolution = print ? 'print_4k' : 'screen_2k';
  const estimate = estimateCost('page_reillustrate', { print }, runtime.priceBook);

  const promptEn = `page ${pageNo ?? 'cover'} of story ${storyId}`;

  const result = await runStep({
    db: runtime.db,
    jobId,
    userId,
    correlationId,
    stepKey: stepKey ?? stepKeys.imagePage(pageNo ?? 1),
    stepKind: 'image',
    operation: 'image.generate',
    stepInput: { storyId, pageNo, resolution, promptEn },
    router: runtime.routers.image,
    // TODO(A4): real refs (style plate, character sheet, face_ref, previous page) and the
    // §8.3 QA gate — identity cosine, OCR leak, palette ΔE, safe zone.
    invoke: (adapter, ctx) =>
      adapter.generate(
        {
          purpose: pageNo === undefined ? 'cover' : 'page',
          promptEn,
          references: [
            { kind: 'style_plate', assetId: String(job.data.ref?.['stylePlateAssetId'] ?? '') },
            {
              kind: 'character_sheet',
              assetId: String(job.data.ref?.['characterSheetAssetId'] ?? ''),
            },
            { kind: 'face_ref', assetId: String(job.data.ref?.['faceRefAssetId'] ?? '') },
          ],
          aspectRatio: '1:1',
          resolution,
          batch: true,
          // ⚠️ Explicit: the vendor default is OFF for a children's product (SPEC §8.2).
          safety: { blockLevel: 'BLOCK_MOST' },
        },
        ctx,
      ),
    toOutput: (value) => ({
      sha256: value.image.sha256,
      width: value.image.width,
      height: value.image.height,
      mimeType: value.image.mimeType,
    }),
    cache: {
      kind: 'image',
      provider: runtime.adapters.image.provider,
      model: 'configured',
      params: { resolution, pageNo },
      prompt: promptEn,
      estimatedUsd: estimate.breakdownUsd.image,
    },
  });

  if (result.status === 'failed') {
    // TODO(A4): flip `story_pages.image_status` to 'manual_review' so ops sees it and the
    // reader shows a placeholder + "yeniden dene" instead of blocking the book.
    throw result.error;
  }

  if (pageNo !== undefined) {
    await appendJobEvent(runtime.db, jobId, 'page.image.ready', {
      storyId,
      pageNo,
      cached: result.status === 'skipped',
    });
  }
  return { status: result.status };
};

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

const ttsChunk: WorkerProcessor = async (runtime, job) => {
  const { jobId, userId, correlationId, stepKey, pageNo } = job.data;
  await ensureRunning(runtime, jobId);

  const ref = job.data.ref ?? {};
  const chunkIndex = Number(ref['chunkIndex'] ?? 0);
  const tier = (ref['tier'] as 'draft' | 'quality') ?? 'quality';
  const voice = ref['voice'] as { kind: 'cloned' | 'system'; providerVoiceId: string };
  // TODO(A5): read the real chunk text; splitting happens on paragraph/page boundaries,
  // never mid-sentence (SPEC §7 step 10).
  const text = String(ref['text'] ?? `chunk ${chunkIndex}`);
  const estimate = estimateCost('audio_render', { characters: text.length, tier }, runtime.priceBook);

  const result = await runStep({
    db: runtime.db,
    jobId,
    userId,
    correlationId,
    stepKey: stepKey ?? stepKeys.ttsChunk(chunkIndex),
    stepKind: 'tts',
    operation: 'tts.synth',
    stepInput: { chunkIndex, textHash: ref['textHash'], tier, voice },
    router: runtime.routers.tts,
    invoke: (adapter, ctx) =>
      adapter.synthesize(
        { text, voice, tier, languageCode: 'tr', outputFormat: 'mp3_44100_128' },
        ctx,
      ),
    toOutput: (value) => ({ durationMs: value.durationMs, billedCharacters: value.billedCharacters }),
    cache: {
      kind: 'tts_chunk',
      provider: runtime.adapters.tts.provider,
      model: 'configured',
      params: { tier, voiceId: voice?.providerVoiceId },
      prompt: String(ref['textHash'] ?? text),
      estimatedUsd: estimate.breakdownUsd.tts,
    },
  });

  if (result.status === 'failed') throw result.error;

  await appendJobEvent(runtime.db, jobId, 'audio.chunk.ready', {
    storyId: String(ref['storyId'] ?? ''),
    renditionId: String(ref['renditionId'] ?? ''),
    pageNo: pageNo ?? 1,
    chunkIndex,
    cached: result.status === 'skipped',
  });
  return { status: result.status };
};

const audioConcat: WorkerProcessor = async (runtime, job) => {
  const { jobId } = job.data;
  // TODO(A5): ffmpeg concat + 350 ms silence + loudnorm −16 LUFS, then WhisperX alignment.
  await closeJob(runtime, jobId, { stepPrefix: 'tts:chunk:' });
  return { status: 'succeeded' };
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
    'story.page_rewrite': skeleton('A3', 'Sayfa yeniden yazılıyor'),
  },
  image: {
    'image.page': imagePage,
    'image.cover': imagePage,
    'image.character_sheet': skeleton('A4', 'Karakter sayfası çiziliyor'),
    'image.style_plate': skeleton('A4', 'Stil plakası hazırlanıyor'),
  },
  voice: {
    'tts.chunk': ttsChunk,
    'voice.create': skeleton('A5', 'Sesiniz hazırlanıyor'),
    'voice.delete': skeleton('A5', 'Ses siliniyor'),
  },
  media: {
    'book.assemble': bookAssemble,
    'audio.concat': audioConcat,
    'export.mp4': skeleton('A5', 'Video hazırlanıyor'),
  },
  print: {
    'pdf.build': skeleton('A6', 'Baskı dosyası hazırlanıyor'),
    'print.submit': skeleton('A6', 'Baskı siparişi iletiliyor'),
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
