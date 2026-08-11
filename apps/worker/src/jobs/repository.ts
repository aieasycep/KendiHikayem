/**
 * jobs/repository.ts — Postgres is the source of truth for job state.
 *
 * Redis holds the QUEUE; Postgres holds the TRUTH. If Redis is wiped, every job can be
 * rebuilt from `jobs` + `job_steps` (see `recoverableJobs()`), and no parent loses a book
 * they paid for. Nothing in this file reads Redis.
 *
 * The three idempotency levels (schema/jobs.ts header) land here as:
 *   level 2 — `enqueueJob`: `jobs UNIQUE(user_id, idempotency_key)` + `request_hash`.
 *   level 3 — `beginStep`: `job_steps UNIQUE(job_id, step_key)` + `input_hash`, so a
 *             retry resumes where it stopped instead of starting over.
 * Level 1 (HTTP) lives in `apps/api/src/middleware/idempotency.ts`.
 */

import { sql } from 'drizzle-orm';
import type { Database } from '@kendihikayem/db';

import {
  type JobStatus,
  type JobStepStatus,
  assertStepTransition,
  assertTransition,
  deriveOutcome,
  isCancellable,
} from './state-machine';
import { pageNoFromStepKey, uuidv5 } from './hashing';

export type JobKind =
  | 'story_outline'
  | 'story_fill'
  | 'story_page_rewrite'
  | 'voice_create'
  | 'voice_delete'
  | 'image_character_sheet'
  | 'image_book'
  | 'image_page'
  | 'audio_render'
  | 'pdf_build'
  | 'print_submit'
  | 'export_mp4'
  | 'privacy_export'
  | 'privacy_delete';

export type JobRow = {
  id: string;
  user_id: string;
  kind: JobKind;
  status: JobStatus;
  story_id: string | null;
  voice_profile_id: string | null;
  order_id: string | null;
  parent_job_id: string | null;
  priority: number;
  progress_current: number;
  progress_total: number;
  progress_label: string | null;
  eta_ms: number | null;
  idempotency_key: string;
  request_hash: string;
  bull_job_id: string | null;
  attempt: number;
  max_attempts: number;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  error: Record<string, unknown> | null;
  estimated_cost_usd: string | null;
  actual_cost_usd: string;
  reservation_id: string | null;
  correlation_id: string;
  next_retry_at: Date | null;
  queued_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
};

export type JobStepRow = {
  id: string;
  job_id: string;
  step_key: string;
  kind: string;
  status: JobStepStatus;
  attempt: number;
  input_hash: string;
  output: Record<string, unknown> | null;
  provider: string | null;
  provider_model: string | null;
  provider_request_id: string | null;
  cost_usd: string;
  error: Record<string, unknown> | null;
  started_at: Date | null;
  finished_at: Date | null;
};

/** Priority lanes. Lower runs first (schema/jobs.ts). */
export const PRIORITY = {
  paid: 50,
  free: 100,
  /** Where the global kill switch parks new work (SPEC §6.2 rule 6). */
  batch: 200,
} as const;

export class JobIdempotencyConflictError extends Error {
  readonly existingJobId: string;

  constructor(existingJobId: string) {
    super(`idempotency key reused with a different request body (job ${existingJobId})`);
    this.name = 'JobIdempotencyConflictError';
    this.existingJobId = existingJobId;
  }
}

export class JobNotFoundError extends Error {
  constructor(jobId: string) {
    super(`job ${jobId} not found`);
    this.name = 'JobNotFoundError';
  }
}

export class JobNotCancellableError extends Error {
  readonly status: JobStatus;

  constructor(jobId: string, status: JobStatus) {
    super(`job ${jobId} is ${status} and can no longer be cancelled`);
    this.name = 'JobNotCancellableError';
    this.status = status;
  }
}

export interface EnqueueJobInput {
  userId: string;
  kind: JobKind;
  /** Level-2 key. Normally the HTTP `Idempotency-Key`, so the levels agree. */
  idempotencyKey: string;
  requestHash: string;
  correlationId: string;
  storyId?: string | null;
  voiceProfileId?: string | null;
  orderId?: string | null;
  parentJobId?: string | null;
  priority?: number;
  input?: Record<string, unknown>;
  estimatedCostUsd?: number;
  reservationId?: string | null;
  progressTotal?: number;
  /** Shown verbatim to the parent, in Turkish (SPEC §11.0). */
  progressLabel?: string;
  etaMs?: number;
  maxAttempts?: number;
}

/**
 * LEVEL 2 IDEMPOTENCY. Two identical requests collapse onto one job row; the same key with
 * a different body is a conflict, not a silent overwrite. The insert is the check — a
 * SELECT-then-INSERT would race exactly when it matters (double-tap on a slow phone).
 */
export async function enqueueJob(
  db: Database,
  input: EnqueueJobInput,
): Promise<{ job: JobRow; created: boolean }> {
  const inserted = await db.execute<JobRow>(sql`
    insert into jobs (
      user_id, kind, story_id, voice_profile_id, order_id, parent_job_id,
      status, priority, progress_current, progress_total, progress_label, eta_ms,
      idempotency_key, request_hash, input, estimated_cost_usd, reservation_id,
      correlation_id, max_attempts
    ) values (
      ${input.userId}, ${input.kind}, ${input.storyId ?? null}, ${input.voiceProfileId ?? null},
      ${input.orderId ?? null}, ${input.parentJobId ?? null},
      'queued', ${input.priority ?? PRIORITY.free}, 0, ${input.progressTotal ?? 1},
      ${input.progressLabel ?? null}, ${input.etaMs ?? null},
      ${input.idempotencyKey}, ${input.requestHash},
      ${JSON.stringify(input.input ?? {})}::jsonb,
      ${input.estimatedCostUsd !== undefined ? input.estimatedCostUsd.toFixed(5) : null}::numeric,
      ${input.reservationId ?? null}, ${input.correlationId}, ${input.maxAttempts ?? 3}
    )
    on conflict (user_id, idempotency_key) do nothing
    returning *
  `);

  const created = inserted[0];
  if (created) return { job: created, created: true };

  const existingRows = await db.execute<JobRow>(sql`
    select * from jobs where user_id = ${input.userId} and idempotency_key = ${input.idempotencyKey}
  `);
  const existing = existingRows[0];
  if (!existing) throw new Error('job insert conflicted but no existing row was found');

  if (existing.request_hash !== input.requestHash) {
    throw new JobIdempotencyConflictError(existing.id);
  }
  return { job: existing, created: false };
}

export async function getJob(db: Database, jobId: string): Promise<JobRow | null> {
  const rows = await db.execute<JobRow>(sql`select * from jobs where id = ${jobId}`);
  return rows[0] ?? null;
}

export async function getJobSteps(db: Database, jobId: string): Promise<JobStepRow[]> {
  const rows = await db.execute<JobStepRow>(sql`
    select * from job_steps where job_id = ${jobId} order by step_key
  `);
  return [...rows];
}

export interface TransitionPatch {
  progressCurrent?: number;
  progressTotal?: number;
  progressLabel?: string;
  etaMs?: number | null;
  output?: Record<string, unknown> | null;
  error?: Record<string, unknown> | null;
  bullJobId?: string | null;
  attempt?: number;
  nextRetryAt?: Date | null;
  actualCostUsd?: number;
}

/**
 * The only way `jobs.status` changes. Reads the current status under `FOR UPDATE`, asserts
 * the edge is legal, then writes — so two workers racing on the same job cannot produce
 * `succeeded → running`.
 */
export async function transitionJob(
  db: Database,
  jobId: string,
  to: JobStatus,
  patch: TransitionPatch = {},
): Promise<JobRow> {
  return db.transaction(async (tx) => {
    const currentRows = await tx.execute<{ status: JobStatus }>(sql`
      select status from jobs where id = ${jobId} for update
    `);
    const current = currentRows[0];
    if (!current) throw new JobNotFoundError(jobId);

    assertTransition(current.status, to, jobId);

    const startedAt = to === 'running' ? sql`coalesce(started_at, now())` : sql`started_at`;
    const finishedAt =
      to === 'succeeded' || to === 'failed' || to === 'cancelled' || to === 'dead_letter'
        ? sql`now()`
        : sql`finished_at`;

    const rows = await tx.execute<JobRow>(sql`
      update jobs set
        status = ${to},
        started_at = ${startedAt},
        finished_at = ${finishedAt},
        progress_current = coalesce(${patch.progressCurrent ?? null}::int, progress_current),
        progress_total = coalesce(${patch.progressTotal ?? null}::int, progress_total),
        progress_label = coalesce(${patch.progressLabel ?? null}, progress_label),
        eta_ms = ${patch.etaMs === undefined ? sql`eta_ms` : sql`${patch.etaMs}`},
        output = ${patch.output === undefined ? sql`output` : sql`${JSON.stringify(patch.output)}::jsonb`},
        error = ${patch.error === undefined ? sql`error` : sql`${patch.error === null ? null : JSON.stringify(patch.error)}::jsonb`},
        bull_job_id = coalesce(${patch.bullJobId ?? null}, bull_job_id),
        attempt = coalesce(${patch.attempt ?? null}::int, attempt),
        next_retry_at = ${patch.nextRetryAt === undefined ? sql`next_retry_at` : sql`${patch.nextRetryAt}`},
        actual_cost_usd = coalesce(${patch.actualCostUsd !== undefined ? patch.actualCostUsd.toFixed(5) : null}::numeric, actual_cost_usd)
      where id = ${jobId}
      returning *
    `);

    const updated = rows[0];
    if (!updated) throw new JobNotFoundError(jobId);
    return updated;
  });
}

/** Progress is written far more often than status; keep it off the transition path. */
export async function updateProgress(
  db: Database,
  jobId: string,
  progress: { current: number; total?: number; labelTr: string; etaMs?: number },
): Promise<void> {
  await db.execute(sql`
    update jobs
       set progress_current = ${progress.current},
           progress_total = coalesce(${progress.total ?? null}::int, progress_total),
           progress_label = ${progress.labelTr},
           eta_ms = coalesce(${progress.etaMs ?? null}::int, eta_ms)
     where id = ${jobId}
  `);
}

/** `POST /v1/jobs/:id/cancel`. Refuses once the job is past the point of no return. */
export async function cancelJob(db: Database, jobId: string, userId: string): Promise<JobRow> {
  const job = await getJob(db, jobId);
  if (!job || job.user_id !== userId) throw new JobNotFoundError(jobId);
  if (!isCancellable(job.status)) throw new JobNotCancellableError(jobId, job.status);
  return transitionJob(db, jobId, 'cancelled');
}

/* ── Level 3: steps ────────────────────────────────────────────────────────── */

export type StepStart =
  /** Cached/complete: do not rerun, reuse `output`. This is what makes a retry cheap. */
  | { reuse: true; step: JobStepRow; output: Record<string, unknown> | null }
  | { reuse: false; step: JobStepRow };

/**
 * Claims a step for execution, or reports that a previous attempt already finished it.
 *
 * Unchanged `input_hash` + `succeeded`/`skipped` ⇒ reuse. That single rule is what turns
 * "3 of 12 illustrations failed" into "rerun 3", not "rerun 12" — and it is why an
 * interrupted job resumes rather than restarts.
 */
export async function beginStep(
  db: Database,
  input: { jobId: string; stepKey: string; kind: string; inputHash: string },
): Promise<StepStart> {
  return db.transaction(async (tx) => {
    const existingRows = await tx.execute<JobStepRow>(sql`
      select * from job_steps
       where job_id = ${input.jobId} and step_key = ${input.stepKey}
         for update
    `);
    const existing = existingRows[0];

    if (existing) {
      const finished = existing.status === 'succeeded' || existing.status === 'skipped';
      if (finished && existing.input_hash === input.inputHash) {
        return { reuse: true, step: existing, output: existing.output };
      }
      assertStepTransition(existing.status, 'running', input.stepKey);
      const rows = await tx.execute<JobStepRow>(sql`
        update job_steps
           set status = 'running',
               attempt = attempt + 1,
               input_hash = ${input.inputHash},
               started_at = coalesce(started_at, now()),
               finished_at = null,
               error = null
         where id = ${existing.id}
        returning *
      `);
      return { reuse: false, step: rows[0]! };
    }

    const inserted = await tx.execute<JobStepRow>(sql`
      insert into job_steps (job_id, step_key, kind, status, attempt, input_hash, started_at)
      values (${input.jobId}, ${input.stepKey}, ${input.kind}, 'running', 1,
              ${input.inputHash}, now())
      returning *
    `);
    const step = inserted[0]!;

    // provider_request_id = uuidv5(step.id): stable across retries so the PROVIDER can
    // dedupe too — the outermost ring of level-3 idempotency.
    const requestId = uuidv5(step.id);
    await tx.execute(sql`
      update job_steps set provider_request_id = ${requestId} where id = ${step.id}
    `);
    return { reuse: false, step: { ...step, provider_request_id: requestId } };
  });
}

export async function completeStep(
  db: Database,
  stepId: string,
  result: {
    output?: Record<string, unknown> | null;
    provider?: string;
    providerModel?: string;
    costUsd?: number;
    /** `skipped` = content_cache hit: the step never ran and cost nothing. */
    status?: 'succeeded' | 'skipped';
  },
): Promise<void> {
  await db.execute(sql`
    update job_steps
       set status = ${result.status ?? 'succeeded'},
           output = ${JSON.stringify(result.output ?? {})}::jsonb,
           provider = coalesce(${result.provider ?? null}, provider),
           provider_model = coalesce(${result.providerModel ?? null}, provider_model),
           cost_usd = ${(result.costUsd ?? 0).toFixed(5)}::numeric,
           finished_at = now(),
           error = null
     where id = ${stepId}
  `);
}

export async function failStep(
  db: Database,
  stepId: string,
  error: Record<string, unknown>,
): Promise<void> {
  await db.execute(sql`
    update job_steps
       set status = 'failed', error = ${JSON.stringify(error)}::jsonb, finished_at = now()
     where id = ${stepId}
  `);
}

/* ── Partial success ───────────────────────────────────────────────────────── */

export interface PartialSummary {
  completed: number;
  total: number;
  failedPageNos: number[];
}

/**
 * PARTIAL SUCCESS IS FIRST CLASS (SPEC §8.4). Twelve pages with nine illustrations is a
 * book to read tonight; the three that failed show a placeholder and a "yeniden dene"
 * button, and they sit in `manual_review` for ops. The job is NOT failed.
 *
 * Scoped to `image:page:NN` steps because those are the ones a parent can see missing.
 */
export async function summarisePartial(
  db: Database,
  jobId: string,
  stepPrefix = 'image:page:',
): Promise<PartialSummary> {
  const steps = await getJobSteps(db, jobId);
  const relevant = steps.filter((s) => s.step_key.startsWith(stepPrefix));

  const failedPageNos = relevant
    .filter((s) => s.status === 'failed')
    .map((s) => pageNoFromStepKey(s.step_key))
    .filter((n): n is number => n !== null)
    .sort((a, b) => a - b);

  const completed = relevant.filter(
    (s) => s.status === 'succeeded' || s.status === 'skipped',
  ).length;

  return { completed, total: relevant.length, failedPageNos };
}

/** Derives the terminal status from the step tally, honouring the partial-success rule. */
export async function finaliseJob(
  db: Database,
  jobId: string,
  options: { stepPrefix?: string; output?: Record<string, unknown>; minimumSuccessRatio?: number } = {},
): Promise<{ job: JobRow; outcome: 'succeeded' | 'partial' | 'failed'; partial: PartialSummary }> {
  const steps = await getJobSteps(db, jobId);
  const counts = {
    total: steps.length,
    succeeded: steps.filter((s) => s.status === 'succeeded').length,
    skipped: steps.filter((s) => s.status === 'skipped').length,
    failed: steps.filter((s) => s.status === 'failed').length,
  };

  const outcome = deriveOutcome(counts, {
    ...(options.minimumSuccessRatio !== undefined
      ? { minimumSuccessRatio: options.minimumSuccessRatio }
      : {}),
  });
  const partial = await summarisePartial(db, jobId, options.stepPrefix);

  const output = {
    ...(options.output ?? {}),
    ...(outcome === 'partial' ? { partial } : {}),
  };

  const job = await transitionJob(db, jobId, outcome === 'failed' ? 'failed' : 'succeeded', {
    output,
    progressCurrent: counts.succeeded + counts.skipped,
    progressTotal: counts.total,
  });

  return { job, outcome, partial };
}

/* ── Recovery ──────────────────────────────────────────────────────────────── */

/**
 * Jobs that should be running but are not in any queue. Redis losing its data must be a
 * latency event, not a data-loss event: this is what re-seeds BullMQ from Postgres.
 */
export async function recoverableJobs(db: Database, limit = 500): Promise<JobRow[]> {
  const rows = await db.execute<JobRow>(sql`
    select * from jobs
     where status in ('queued', 'running')
        or (status = 'failed' and next_retry_at is not null and next_retry_at <= now()
            and attempt < max_attempts)
     order by priority, queued_at
     limit ${limit}
  `);
  return [...rows];
}

/** Marks a job for a later retry attempt without moving it out of `failed`. */
export async function scheduleRetry(
  db: Database,
  jobId: string,
  nextRetryAt: Date,
): Promise<void> {
  await db.execute(sql`
    update jobs set next_retry_at = ${nextRetryAt} where id = ${jobId}
  `);
}
