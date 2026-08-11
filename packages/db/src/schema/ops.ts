/**
 * §12 GÜVENLİK & İŞLETİM — moderation, abuse reports, data-subject requests, the provider
 * deletion chain, and the two message boxes.
 *
 * `deletion_tasks` is the table that makes erasure real. Deleting our own rows is the
 * *last* step, not the only one: a cloned voice also exists inside ElevenLabs, page images
 * may sit in a provider's cache, prompts may sit in LLM logs, and objects sit in S3. Each
 * of those is a separate row with its own retry counter, so "the account is deleted" is a
 * claim backed by five completed tasks rather than one `DELETE`.
 *
 * `abuse_reports.reporter_email` is nullable-with-purpose: the person whose voice was
 * cloned without permission is exactly the person who does not have an account here
 * (Apple guideline 1.2 requires they can still report it).
 *
 * Transcribed from docs/SPEC-DATA-MODEL.md §4.12.
 */
import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { assets } from './assets';
import { users } from './identity';
import { stories } from './stories';
import {
  ABUSE_REASON,
  ABUSE_STATUS,
  ABUSE_TARGET_TYPE,
  DELETION_STATUS,
  DELETION_TARGET,
  DSR_KIND,
  DSR_STATUS,
  MODERATION_ACTION,
  MODERATION_ENGINE,
  MODERATION_STAGE,
  MODERATION_SURFACE,
  MODERATION_VERDICT,
  OUTBOX_STATUS,
  type JsonObject,
  inValues,
  tstz,
} from './types';

export const moderationEvents = pgTable(
  'moderation_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    storyId: uuid('story_id').references(() => stories.id, { onDelete: 'cascade' }),
    pageNo: integer('page_no'),
    surface: text('surface').notNull(),
    stage: text('stage').notNull(),
    engine: text('engine').notNull(),
    verdict: text('verdict').notNull(),
    categories: jsonb('categories').$type<JsonObject>(),
    scores: jsonb('scores').$type<JsonObject>(),
    /** A short excerpt only — enough to review, not enough to reconstruct. */
    excerpt: text('excerpt'),
    actionTaken: text('action_taken'),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  (t) => [
    check('moderation_events_surface_check', inValues(t.surface, MODERATION_SURFACE)),
    check('moderation_events_stage_check', inValues(t.stage, MODERATION_STAGE)),
    check('moderation_events_engine_check', inValues(t.engine, MODERATION_ENGINE)),
    check('moderation_events_verdict_check', inValues(t.verdict, MODERATION_VERDICT)),
    check('moderation_events_action_taken_check', inValues(t.actionTaken, MODERATION_ACTION)),
    /** The review queue only ever looks at non-pass verdicts. */
    index('moderation_flagged_idx')
      .on(t.createdAt.desc())
      .where(sql`${t.verdict} <> 'pass'`),
  ],
);

export const abuseReports = pgTable(
  'abuse_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reporterUserId: uuid('reporter_user_id').references(() => users.id),
    /** Session-less reporting path — the voice owner has no account here. */
    reporterEmail: text('reporter_email'),
    targetType: text('target_type').notNull(),
    targetId: uuid('target_id'),
    reason: text('reason').notNull(),
    detail: text('detail'),
    status: text('status').notNull().default('open'),
    /** created_at + 72 hours. */
    slaDueAt: tstz('sla_due_at').notNull(),
    resolution: text('resolution'),
    createdAt: tstz('created_at').notNull().defaultNow(),
    resolvedAt: tstz('resolved_at'),
  },
  (t) => [
    check('abuse_reports_target_type_check', inValues(t.targetType, ABUSE_TARGET_TYPE)),
    check('abuse_reports_reason_check', inValues(t.reason, ABUSE_REASON)),
    check('abuse_reports_status_check', inValues(t.status, ABUSE_STATUS)),
    index('abuse_sla_idx')
      .on(t.slaDueAt)
      .where(sql`${t.status} in ('open','triaged')`),
  ],
);

export const dataSubjectRequests = pgTable(
  'data_subject_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    status: text('status').notNull().default('received'),
    /** created_at + 30 days (KVKK response window). */
    dueAt: tstz('due_at').notNull(),
    note: text('note'),
    /** The generated export archive, when `kind = 'export'`. */
    resultAssetId: uuid('result_asset_id').references(() => assets.id),
    createdAt: tstz('created_at').notNull().defaultNow(),
    completedAt: tstz('completed_at'),
  },
  (t) => [
    check('data_subject_requests_kind_check', inValues(t.kind, DSR_KIND)),
    check('data_subject_requests_status_check', inValues(t.status, DSR_STATUS)),
  ],
);

/** The provider deletion chain. Deleting our rows is not deletion. */
export const deletionTasks = pgTable(
  'deletion_tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    target: text('target').notNull(),
    /** providerVoiceId, an S3 prefix, a log correlation id — meaning depends on `target`. */
    ref: text('ref').notNull(),
    status: text('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    runAt: tstz('run_at').notNull().defaultNow(),
    createdAt: tstz('created_at').notNull().defaultNow(),
    completedAt: tstz('completed_at'),
  },
  (t) => [
    check('deletion_tasks_target_check', inValues(t.target, DELETION_TARGET)),
    check('deletion_tasks_status_check', inValues(t.status, DELETION_STATUS)),
    index('deletion_pending_idx')
      .on(t.status, t.runAt)
      .where(sql`${t.status} <> 'completed'`),
  ],
);

/** Transactional outbox: at-least-once delivery, written in the same tx as the state change. */
export const outbox = pgTable(
  'outbox',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    aggregate: text('aggregate').notNull(),
    aggregateId: uuid('aggregate_id').notNull(),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').$type<JsonObject>().notNull(),
    dedupeKey: text('dedupe_key').notNull().unique(),
    status: text('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    availableAt: tstz('available_at').notNull().defaultNow(),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  (t) => [
    check('outbox_status_check', inValues(t.status, OUTBOX_STATUS)),
    index('outbox_pending_idx').on(t.status, t.availableAt),
  ],
);

/** Inbound webhooks land here first; `(source, external_id)` makes replays free. */
export const webhookInbox = pgTable(
  'webhook_inbox',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    /** 'iyzico', 'lulu', 'elevenlabs', … */
    source: text('source').notNull(),
    externalId: text('external_id').notNull(),
    signatureOk: boolean('signature_ok').notNull(),
    payload: jsonb('payload').$type<JsonObject>().notNull(),
    processedAt: tstz('processed_at'),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  (t) => [unique('webhook_inbox_source_external_key').on(t.source, t.externalId)],
);
