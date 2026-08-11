/**
 * routes/v1/jobs.ts — the polling path the mobile app depends on.
 *
 * ⚠️ `GET /v1/jobs/:jobId` MUST ALWAYS WORK. React Native has no EventSource, so mobile —
 * the primary platform — never opens an SSE stream; it polls this endpoint every 2 s with
 * exponential backoff. If SSE breaks, nobody notices. If this breaks, the product is a
 * spinner that never resolves.
 *
 * Progress is carried as `labelTr` ("Elif'in odası çiziliyor"), not a percentage: telling
 * a parent WHAT is happening turns a 20-second wait into anticipation, while a percentage
 * makes the same wait feel like three minutes (SPEC §11.0).
 */

import { sql } from 'drizzle-orm';
import type { Database } from '@kendihikayem/db';
import {
  type ErrorCode,
  type IsoDate,
  type Job,
  type JobId,
  type JobStatus,
  type OrderId,
  type StoryId,
  type VoiceProfileId,
  ERROR_CATALOG,
  apiErrorFrom,
} from '@kendihikayem/contract';
import {
  type JobRow,
  type JobStepRow,
  type Timestamp,
  cancelJob,
  getJob,
  getJobSteps,
  toDate,
} from '@kendihikayem/worker';

import { forbidden, notFound } from '../../errors';

/**
 * Casts a validated string onto its branded contract type. The value has already been
 * checked (it came out of a uuid column or a zod-parsed param); the brand is a
 * compile-time tag with no runtime representation, so this is the sanctioned crossing.
 * Call sites name the target type explicitly — inference would silently widen to `string`.
 */
function brand<T>(value: string): T {
  return value as T;
}

function brandDate<T>(value: Timestamp): T {
  return toDate(value).toISOString() as T;
}

/**
 * `dead_letter` exists in `packages/db` but NOT in the contract's `JobStatus`. A parent has
 * no use for the distinction — the job failed and will not retry itself — so it is reported
 * as `failed`. See docs/contract-rfc/001.
 */
function toContractStatus(status: string): JobStatus {
  return status === 'dead_letter' ? 'failed' : (status as JobStatus);
}

/** Turkish fallbacks, so the client never has to invent a label. */
const DEFAULT_LABELS: Record<string, string> = {
  queued: 'Sıraya alındı',
  running: 'Hazırlanıyor',
  waiting_approval: 'Onayınızı bekliyor',
  succeeded: 'Hazır',
  failed: 'Tamamlanamadı',
  cancelled: 'İptal edildi',
  dead_letter: 'Tamamlanamadı',
};

export function toContractJob(row: JobRow, steps: JobStepRow[]): Job {
  const output = (row.output ?? {}) as Record<string, unknown>;
  const partial = output['partial'] as
    | { completed: number; total: number; failedPageNos: number[] }
    | undefined;

  const job: Job = {
    id: brand<JobId>(row.id),
    kind: row.kind,
    status: toContractStatus(row.status),
    progress: {
      current: row.progress_current,
      total: Math.max(row.progress_total, 1),
      labelTr: row.progress_label ?? DEFAULT_LABELS[row.status] ?? 'Hazırlanıyor',
    },
    steps: steps.map((step) => ({
      stepKey: step.step_key,
      status: step.status,
      attempt: step.attempt,
    })),
    queuedAt: brandDate<IsoDate>(row.queued_at),
  };

  if (row.eta_ms !== null) job.etaMs = row.eta_ms;
  if (row.story_id) job.storyId = brand<StoryId>(row.story_id);
  if (row.voice_profile_id) job.voiceProfileId = brand<VoiceProfileId>(row.voice_profile_id);
  if (row.order_id) job.orderId = brand<OrderId>(row.order_id);
  if (row.started_at) job.startedAt = brandDate<IsoDate>(row.started_at);
  if (row.finished_at) job.finishedAt = brandDate<IsoDate>(row.finished_at);
  if (partial) job.partial = partial;

  if (row.error) {
    // `jobs.error` is JSONB written by the worker from `ProviderError.toJobError()`. The
    // Turkish text always comes from ERROR_CATALOG via `apiErrorFrom` — never from the
    // provider — so a vendor string can never reach a parent's screen.
    const stored = row.error as Record<string, unknown>;
    const code =
      typeof stored['code'] === 'string' && stored['code'] in ERROR_CATALOG
        ? (stored['code'] as ErrorCode)
        : 'INTERNAL';
    job.error = apiErrorFrom(code, {
      traceId: row.correlation_id,
      ...(typeof stored['detail'] === 'string' ? { detail: stored['detail'] } : {}),
    });
  }

  return job;
}

export async function readJob(db: Database, jobId: string, userId: string): Promise<Job> {
  const row = await getJob(db, jobId);
  // Same 404 for "missing" and "someone else's": existence is itself information.
  if (!row) throw notFound(`job ${jobId} not found`);
  if (row.user_id !== userId) throw forbidden('job belongs to another account');

  const steps = await getJobSteps(db, jobId);
  return toContractJob(row, steps);
}

export interface JobListQuery {
  cursor?: string;
  limit?: number;
  storyId?: string;
  status?: string;
  kind?: string;
}

/**
 * `GET /v1/jobs` — "what is still running?", answered in one call at app start.
 * Keyset pagination on `queued_at`: OFFSET drifts while new jobs are being inserted.
 */
export async function listJobs(
  db: Database,
  userId: string,
  query: JobListQuery,
): Promise<{ items: Job[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
  const cursorDate = query.cursor ? new Date(Buffer.from(query.cursor, 'base64url').toString()) : null;

  const rows = await db.execute<JobRow>(sql`
    select * from jobs
     where user_id = ${userId}
       and (${cursorDate ? sql`queued_at < ${cursorDate}` : sql`true`})
       and (${query.storyId ? sql`story_id = ${query.storyId}` : sql`true`})
       and (${query.status ? sql`status = ${query.status}` : sql`true`})
       and (${query.kind ? sql`kind = ${query.kind}` : sql`true`})
     order by queued_at desc
     limit ${limit + 1}
  `);

  const page = [...rows];
  const hasMore = page.length > limit;
  const items = hasMore ? page.slice(0, limit) : page;

  const jobs: Job[] = [];
  for (const row of items) {
    jobs.push(toContractJob(row, await getJobSteps(db, row.id)));
  }

  const last = items[items.length - 1];
  return {
    items: jobs,
    nextCursor:
      hasMore && last ? Buffer.from(toDate(last.queued_at).toISOString()).toString('base64url') : null,
  };
}

/** `POST /v1/jobs/:jobId/cancel`. Refuses once the job is past the point of no return. */
export async function cancelJobForUser(
  db: Database,
  jobId: string,
  userId: string,
): Promise<Job> {
  const row = await cancelJob(db, jobId, userId);
  const steps = await getJobSteps(db, jobId);
  return toContractJob(row, steps);
}
