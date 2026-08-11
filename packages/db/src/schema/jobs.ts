/**
 * §9 İŞ ORKESTRASYONU — the job state machine, and the three levels of idempotency that
 * keep a retry from costing money twice.
 *
 *   Level 1 — HTTP.      `idempotency_keys(user_id, key)`. The client's `Idempotency-Key`
 *                        header. A replayed POST returns the stored response instead of
 *                        enqueuing a second job.
 *   Level 2 — job.       `jobs UNIQUE(user_id, idempotency_key)` plus `request_hash`. Two
 *                        identical requests collapse onto one job row.
 *   Level 3 — step.      `job_steps UNIQUE(job_id, step_key)` plus `input_hash`, plus
 *                        `provider_request_id = uuidv5(step.id)` so the *provider* also
 *                        dedupes. When 3 of 12 illustrations fail, only those 3 rerun.
 *
 * `content_cache` sits underneath all three: keyed by sha256(provider|model|op|params|prompt),
 * it short-circuits regeneration entirely and records `saved_usd` so the saving is
 * measurable rather than assumed.
 *
 * Status machine: queued → running → (waiting_approval) → succeeded | failed → dead_letter,
 * with `cancelled` reachable from any non-terminal state. `jobs_retry_idx` is what the
 * retry sweeper scans.
 *
 * Transcribed from docs/SPEC-DATA-MODEL.md §4.9.
 */
import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigserial,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { assets } from './assets.ts';
import { users } from './identity.ts';
import { orders } from './orders.ts';
import { stories } from './stories.ts';
import {
  CONTENT_CACHE_KIND,
  JOB_KIND,
  JOB_STATUS,
  JOB_STEP_STATUS,
  type JobError,
  type JsonObject,
  inValues,
  tstz,
} from './types.ts';
import { voiceProfiles } from './voice.ts';

export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    storyId: uuid('story_id').references(() => stories.id, { onDelete: 'cascade' }),
    voiceProfileId: uuid('voice_profile_id').references(() => voiceProfiles.id, {
      onDelete: 'cascade',
    }),
    /** Circular with `orders` (an order spawns a print job) — declared lazily. */
    orderId: uuid('order_id').references((): AnyPgColumn => orders.id, { onDelete: 'cascade' }),
    parentJobId: uuid('parent_job_id').references((): AnyPgColumn => jobs.id, {
      onDelete: 'cascade',
    }),
    status: text('status').notNull().default('queued'),
    /** paid = 50, free = 100, batch = 200. Lower runs first. */
    priority: integer('priority').notNull().default(100),
    progressCurrent: integer('progress_current').notNull().default(0),
    progressTotal: integer('progress_total').notNull().default(1),
    /** Shown verbatim to the parent, so it is written in Turkish: "3/12 sayfa çiziliyor". */
    progressLabel: text('progress_label'),
    etaMs: integer('eta_ms'),
    /** Level-2 idempotency. Unique per user. */
    idempotencyKey: text('idempotency_key').notNull(),
    requestHash: text('request_hash').notNull(),
    bullJobId: text('bull_job_id'),
    attempt: integer('attempt').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    input: jsonb('input').$type<JsonObject>(),
    output: jsonb('output').$type<JsonObject>(),
    error: jsonb('error').$type<JobError>(),
    estimatedCostUsd: numeric('estimated_cost_usd', { precision: 10, scale: 5 }),
    actualCostUsd: numeric('actual_cost_usd', { precision: 10, scale: 5 }).notNull().default('0'),
    /** The `cost_reservations` row held for this job; released or committed at the end. */
    reservationId: uuid('reservation_id'),
    /** OpenTelemetry trace id — ties a support ticket to a provider call. */
    correlationId: text('correlation_id').notNull(),
    nextRetryAt: tstz('next_retry_at'),
    queuedAt: tstz('queued_at').notNull().defaultNow(),
    startedAt: tstz('started_at'),
    finishedAt: tstz('finished_at'),
  },
  (t) => [
    check('jobs_kind_check', inValues(t.kind, JOB_KIND)),
    check('jobs_status_check', inValues(t.status, JOB_STATUS)),
    unique('jobs_user_idempotency_key').on(t.userId, t.idempotencyKey),
    index('jobs_user_active_idx').on(t.userId, t.status, t.queuedAt.desc()),
    index('jobs_story_idx').on(t.storyId, t.kind),
    index('jobs_retry_idx')
      .on(t.status, t.nextRetryAt)
      .where(sql`${t.status} in ('queued','failed')`),
  ],
);

/** Level-3 idempotency: the unit of work a retry may skip. */
export const jobSteps = pgTable(
  'job_steps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    /** e.g. 'image:page:07', 'tts:chunk:03'. */
    stepKey: text('step_key').notNull(),
    kind: text('kind').notNull(),
    status: text('status').notNull().default('pending'),
    attempt: integer('attempt').notNull().default(0),
    /** Unchanged input ⇒ do not rerun, reuse `output`. */
    inputHash: text('input_hash').notNull(),
    output: jsonb('output').$type<JsonObject>(),
    provider: text('provider'),
    providerModel: text('provider_model'),
    /** uuidv5(step.id): a stable id the provider itself can dedupe on. */
    providerRequestId: text('provider_request_id'),
    costUsd: numeric('cost_usd', { precision: 10, scale: 5 }).notNull().default('0'),
    error: jsonb('error').$type<JobError>(),
    startedAt: tstz('started_at'),
    finishedAt: tstz('finished_at'),
  },
  (t) => [
    check('job_steps_status_check', inValues(t.status, JOB_STEP_STATUS)),
    unique('job_steps_job_step_key').on(t.jobId, t.stepKey),
  ],
);

/** The SSE replay log. A reconnecting client resumes from `Last-Event-ID` = `seq`. */
export const jobEvents = pgTable(
  'job_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    type: text('type').notNull(),
    payload: jsonb('payload').$type<JsonObject>().notNull(),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  (t) => [unique('job_events_job_seq_key').on(t.jobId, t.seq)],
);

/** Level-1 idempotency: the HTTP layer. `locked_at` guards the in-flight window. */
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    endpoint: text('endpoint').notNull(),
    requestHash: text('request_hash').notNull(),
    responseStatus: integer('response_status'),
    responseBody: jsonb('response_body').$type<JsonObject>(),
    jobId: uuid('job_id').references(() => jobs.id),
    lockedAt: tstz('locked_at'),
    createdAt: tstz('created_at').notNull().defaultNow(),
    expiresAt: tstz('expires_at')
      .notNull()
      .default(sql`now() + interval '24 hours'`),
  },
  (t) => [primaryKey({ name: 'idempotency_keys_pkey', columns: [t.userId, t.key] })],
);

/**
 * The largest single lever on unit cost. `saved_usd` accumulates what a hit avoided
 * paying, so the caching story can be audited against the provider invoice instead of
 * being taken on faith.
 */
export const contentCache = pgTable(
  'content_cache',
  {
    /** sha256(provider|model|op|params|prompt). */
    cacheKey: text('cache_key').primaryKey(),
    kind: text('kind').notNull(),
    assetId: uuid('asset_id').references(() => assets.id),
    payload: jsonb('payload').$type<JsonObject>(),
    hitCount: integer('hit_count').notNull().default(0),
    savedUsd: numeric('saved_usd', { precision: 10, scale: 5 }).notNull().default('0'),
    createdAt: tstz('created_at').notNull().defaultNow(),
    lastHitAt: tstz('last_hit_at'),
  },
  (t) => [check('content_cache_kind_check', inValues(t.kind, CONTENT_CACHE_KIND))],
);
