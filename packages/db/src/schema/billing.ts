/**
 * §10 MALİYET & YETKİLENDİRME (SPEC §6).
 *
 * The reservation protocol — this is the part that must not be "improved" casually:
 *
 *   BEGIN;
 *     SELECT * FROM entitlements WHERE user_id = $1 FOR UPDATE;      -- serialise the user
 *     -- reject if period_cost_usd + reserved_cost_usd + estimate > plan.monthly_cost_cap_usd
 *     UPDATE entitlements SET reserved_cost_usd = reserved_cost_usd + $estimate ...;
 *     INSERT INTO cost_reservations (user_id, job_id, amount_usd, state) VALUES (…, 'held');
 *   COMMIT;
 *
 * On success the worker commits the reservation (`state = 'committed'`, move the real cost
 * from `reserved_cost_usd` into `period_cost_usd`). On failure it releases it. If the
 * worker dies mid-flight nobody releases anything — which is exactly why `expires_at`
 * defaults to now() + 30 minutes and `cost_res_expiry_idx` exists: an ops cron sweeps
 * expired holds so a crashed job cannot permanently consume a parent's monthly cap.
 *
 * `entitlements` is one row per user by design (`user_id` is the PK). That is what makes
 * `FOR UPDATE` a single-row lock instead of a range lock.
 *
 * `provider_usage` is the ground truth: one row per provider call, with the unit price
 * actually charged. Estimates live in `jobs.estimated_cost_usd`; this table is what the
 * invoice is reconciled against.
 *
 * Transcribed from docs/SPEC-DATA-MODEL.md §4.10.
 */
import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { users } from './identity';
import { jobSteps, jobs } from './jobs';
import {
  CIRCUIT_STATE,
  CREDIT_REASON,
  PLAN_PERIOD,
  RESERVATION_STATE,
  SUBSCRIPTION_SOURCE,
  SUBSCRIPTION_STATUS,
  USAGE_BILLING_UNIT,
  type JsonObject,
  inValues,
  tstz,
} from './types';

export const plans = pgTable(
  'plans',
  {
    code: text('code').primaryKey(),
    titleTr: text('title_tr').notNull(),
    priceTry: numeric('price_try', { precision: 10, scale: 2 }).notNull(),
    period: text('period').notNull(),
    /** NULL = unlimited. */
    storyQuota: integer('story_quota'),
    voiceQuota: integer('voice_quota').notNull().default(0),
    imageTier: text('image_tier').notNull().default('preview'),
    ttsTier: text('tts_tier').notNull().default('draft'),
    /** The abuse ceiling. Checked inside the reservation transaction, not after the fact. */
    monthlyCostCapUsd: numeric('monthly_cost_cap_usd', { precision: 10, scale: 2 }).notNull(),
    features: jsonb('features').$type<JsonObject>().notNull().default({}),
    isActive: boolean('is_active').notNull().default(true),
  },
  (t) => [check('plans_period_check', inValues(t.period, PLAN_PERIOD))],
);

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    planCode: text('plan_code')
      .notNull()
      .references(() => plans.code),
    source: text('source').notNull(),
    externalId: text('external_id'),
    status: text('status').notNull(),
    currentPeriodStart: tstz('current_period_start').notNull(),
    currentPeriodEnd: tstz('current_period_end').notNull(),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
    createdAt: tstz('created_at').notNull().defaultNow(),
    updatedAt: tstz('updated_at').notNull().defaultNow(),
  },
  (t) => [
    check('subscriptions_source_check', inValues(t.source, SUBSCRIPTION_SOURCE)),
    check('subscriptions_status_check', inValues(t.status, SUBSCRIPTION_STATUS)),
    /** At most one live subscription per user — enforced by the database, not by a service. */
    uniqueIndex('subs_active_idx')
      .on(t.userId)
      .where(sql`${t.status} in ('trialing','active','past_due')`),
  ],
);

/** One row per user. The row `SELECT … FOR UPDATE` locks during cost reservation. */
export const entitlements = pgTable('entitlements', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  planCode: text('plan_code')
    .notNull()
    .references(() => plans.code),
  periodStart: tstz('period_start').notNull(),
  periodEnd: tstz('period_end').notNull(),
  storiesUsed: integer('stories_used').notNull().default(0),
  creditsBalance: integer('credits_balance').notNull().default(0),
  /** Already spent this period. */
  periodCostUsd: numeric('period_cost_usd', { precision: 10, scale: 4 }).notNull().default('0'),
  /** Held by in-flight jobs. cap check = period_cost_usd + reserved_cost_usd + estimate. */
  reservedCostUsd: numeric('reserved_cost_usd', { precision: 10, scale: 4 }).notNull().default('0'),
  updatedAt: tstz('updated_at').notNull().defaultNow(),
});

export const costReservations = pgTable(
  'cost_reservations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'cascade' }),
    amountUsd: numeric('amount_usd', { precision: 10, scale: 5 }).notNull(),
    state: text('state').notNull().default('held'),
    /** The crash valve: an unreleased hold expires instead of stranding the user's cap. */
    expiresAt: tstz('expires_at')
      .notNull()
      .default(sql`now() + interval '30 minutes'`),
    createdAt: tstz('created_at').notNull().defaultNow(),
    settledAt: tstz('settled_at'),
  },
  (t) => [
    check('cost_reservations_state_check', inValues(t.state, RESERVATION_STATE)),
    index('cost_res_expiry_idx')
      .on(t.expiresAt)
      .where(sql`${t.state} = 'held'`),
  ],
);

/** The cost ledger: one row per provider call, cache hits included (at zero cost). */
export const providerUsage = pgTable(
  'provider_usage',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    jobStepId: uuid('job_step_id').references(() => jobSteps.id, { onDelete: 'set null' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    /** e.g. 'llm.complete', 'image.generate', 'tts.synth'. */
    operation: text('operation').notNull(),
    billingUnit: text('billing_unit').notNull(),
    billedUnits: numeric('billed_units', { precision: 14, scale: 2 }).notNull(),
    /** Ten decimal places: per-token prices are genuinely that small. */
    unitPriceUsd: numeric('unit_price_usd', { precision: 14, scale: 10 }).notNull(),
    costUsd: numeric('cost_usd', { precision: 10, scale: 5 }).notNull(),
    cacheHit: boolean('cache_hit').notNull().default(false),
    latencyMs: integer('latency_ms'),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  (t) => [
    check('provider_usage_billing_unit_check', inValues(t.billingUnit, USAGE_BILLING_UNIT)),
    index('pu_created_idx').on(t.createdAt.desc()),
    index('pu_user_idx').on(t.userId, t.createdAt.desc()),
  ],
);

/** Append-only. `balance_after` is denormalised so a balance never needs a full replay. */
export const creditLedger = pgTable(
  'credit_ledger',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    delta: integer('delta').notNull(),
    reason: text('reason').notNull(),
    refType: text('ref_type'),
    refId: uuid('ref_id'),
    balanceAfter: integer('balance_after').notNull(),
    /** A replayed IAP webhook must not grant credits twice. */
    idempotencyKey: text('idempotency_key').unique(),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  (t) => [
    check('credit_ledger_reason_check', inValues(t.reason, CREDIT_REASON)),
    index('credit_user_idx').on(t.userId, t.id.desc()),
  ],
);

/** Circuit breaker state, shared across API and worker processes. */
export const providerHealth = pgTable(
  'provider_health',
  {
    provider: text('provider').primaryKey(),
    circuitState: text('circuit_state').notNull().default('closed'),
    errorRate5m: numeric('error_rate_5m', { precision: 5, scale: 4 }),
    p95LatencyMs: integer('p95_latency_ms'),
    openedAt: tstz('opened_at'),
    updatedAt: tstz('updated_at').notNull().defaultNow(),
  },
  (t) => [check('provider_health_circuit_state_check', inValues(t.circuitState, CIRCUIT_STATE))],
);
