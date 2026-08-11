/**
 * schedulers/index.ts — the four background loops nobody watches until they matter.
 *
 *   1. voice-raw destruction  (+30 days)  — a KVKK promise, not a cleanup task.
 *   2. reservation reconcile              — reclaims holds a crashed worker never released.
 *   3. cost rollup                        — USD per completed story, the first-class metric.
 *   4. outbox processor                   — turns durable rows into push/e-mail.
 *
 * They are plain async functions, each returning what it did, so they run identically from
 * a cron, from `ops`, and from a test. Nothing here depends on being called on a schedule.
 */

import { sql } from 'drizzle-orm';
import type { Database } from '@kendihikayem/db';

import { sweepExpiredReservations } from '../cost/reservation';
import { costPerCompletedStory } from '../cost/ledger.pg';
import { cacheSavings } from '../cache/content-cache';
import {
  claimOutboxBatch,
  markOutboxFailed,
  markOutboxSent,
  type OutboxRow,
} from '../jobs/events';
import { recoverableJobs } from '../jobs/repository';

/* ── 1. Raw voice destruction ──────────────────────────────────────────────── */

/**
 * SPEC §7 step 9: accepting a voice profile schedules `deletion_tasks` for the raw
 * reference audio at +30 days. This runs the due ones.
 *
 * The provider-side delete is A5's (`voice_provider` target); this sweeper drives the
 * queue and records the outcome, because "we deleted our rows" is not erasure — the clip
 * also exists inside the vendor (schema/ops.ts header).
 */
export async function runVoiceRawDestruction(
  db: Database,
  handlers: {
    deleteStorageObject?: (ref: string) => Promise<void>;
    deleteProviderVoice?: (ref: string) => Promise<void>;
    /** The `db_rows` link of the voice chain (A5, `processors/audio-deletion.ts`). */
    deleteDbRows?: (ref: string) => Promise<void>;
  } = {},
  limit = 100,
): Promise<{ completed: number; failed: number }> {
  const due = await db.execute<{ id: string; target: string; ref: string; attempts: number }>(sql`
    select id, target, ref, attempts
      from deletion_tasks
     where status in ('pending', 'failed') and run_at <= now()
     order by run_at
     limit ${limit}
       for update skip locked
  `);

  let completed = 0;
  let failed = 0;

  for (const task of due) {
    try {
      await db.execute(sql`
        update deletion_tasks set status = 'running', attempts = attempts + 1 where id = ${task.id}
      `);

      if (task.target === 'storage_objects') await handlers.deleteStorageObject?.(task.ref);
      else if (task.target === 'voice_provider') await handlers.deleteProviderVoice?.(task.ref);
      // ⚠️ A target with no handler was previously marked `completed` regardless, which
      // reads as "erased" in the audit trail while nothing was erased. A task we cannot
      // carry out must fail loudly and be retried instead.
      else if (task.target === 'db_rows') {
        if (!handlers.deleteDbRows) throw new Error('no db_rows handler registered');
        await handlers.deleteDbRows(task.ref);
      }
      // llm_logs / image_provider are A3/A4's chain links.

      await db.execute(sql`
        update deletion_tasks set status = 'completed', completed_at = now(), last_error = null
         where id = ${task.id}
      `);
      completed += 1;
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      const backoffMinutes = Math.min(1440, 2 ** Math.min(task.attempts, 10) * 5);
      await db.execute(sql`
        update deletion_tasks
           set status = 'failed',
               last_error = ${message.slice(0, 500)},
               run_at = now() + make_interval(mins => ${backoffMinutes})
         where id = ${task.id}
      `);
    }
  }

  return { completed, failed };
}

/**
 * Schedules the +30 day destruction of a raw voice reference. Called by A5 on
 * `POST /voice/profiles/:id/accept`; here because the retention promise is orchestration.
 */
export async function scheduleVoiceRawDestruction(
  db: Database,
  input: { userId: string; storageRef: string; days?: number },
): Promise<void> {
  await db.execute(sql`
    insert into deletion_tasks (user_id, target, ref, status, run_at)
    values (${input.userId}, 'storage_objects', ${input.storageRef}, 'pending',
            now() + make_interval(days => ${input.days ?? 30}))
  `);
}

/* ── 2. Reservation reconcile ──────────────────────────────────────────────── */

/**
 * The crash valve, on a timer. A worker that dies mid-flight releases nothing; without
 * this, one crash permanently shrinks a parent's monthly cap and support has to fix it by
 * hand. Also reports jobs that Postgres thinks are live but Redis has forgotten.
 */
export async function runReservationReconcile(
  db: Database,
): Promise<{ releasedHolds: number; releasedUsd: number; orphanJobs: number }> {
  const swept = await sweepExpiredReservations(db);
  const orphans = await recoverableJobs(db, 500);
  return {
    releasedHolds: swept.released,
    releasedUsd: swept.totalUsd,
    orphanJobs: orphans.length,
  };
}

/* ── 3. Cost rollup ────────────────────────────────────────────────────────── */

export interface CostRollup {
  perStory: Awaited<ReturnType<typeof costPerCompletedStory>>;
  cache: Awaited<ReturnType<typeof cacheSavings>>;
  todayUsd: number;
  heldUsd: number;
}

/**
 * "USD per completed story" is a first-class metric (SPEC §6.2). It is computed here, on a
 * schedule, from `provider_usage` — the ledger, not the estimates — so a drift between what
 * we predicted and what we were billed shows up as a number instead of as a surprise.
 */
export async function runCostRollup(db: Database, days = 7): Promise<CostRollup> {
  const [perStory, cache, totals] = await Promise.all([
    costPerCompletedStory(db, days),
    cacheSavings(db),
    db.execute<{ today_usd: string; held_usd: string }>(sql`
      select
        coalesce((select sum(cost_usd) from provider_usage
                  where created_at >= date_trunc('day', now())), 0)::text as today_usd,
        coalesce((select sum(amount_usd) from cost_reservations
                  where state = 'held'), 0)::text as held_usd
    `),
  ]);

  return {
    perStory,
    cache,
    todayUsd: Number(totals[0]?.today_usd ?? 0),
    heldUsd: Number(totals[0]?.held_usd ?? 0),
  };
}

/* ── 4. Outbox processor ───────────────────────────────────────────────────── */

export type OutboxDispatcher = (row: OutboxRow) => Promise<void>;

/**
 * Drains the outbox. Delivery is at-least-once and `dedupe_key` is unique, so a duplicate
 * dispatch is safe; a permanently failing row backs off and eventually goes `dead` rather
 * than spinning forever.
 */
export async function runOutboxProcessor(
  db: Database,
  dispatch: OutboxDispatcher,
  limit = 50,
): Promise<{ sent: number; failed: number }> {
  const batch = await claimOutboxBatch(db, limit);
  let sent = 0;
  let failed = 0;

  for (const row of batch) {
    try {
      await dispatch(row);
      await markOutboxSent(db, row.id);
      sent += 1;
    } catch {
      await markOutboxFailed(db, row.id, row.attempts);
      failed += 1;
    }
  }
  return { sent, failed };
}

/* ── Registration ──────────────────────────────────────────────────────────── */

export interface SchedulerHandle {
  name: string;
  stop(): void;
}

/**
 * Simple interval registration. Not BullMQ repeatable jobs on purpose: these must keep
 * running when Redis is the thing that is broken.
 */
export function startScheduler(
  name: string,
  everyMs: number,
  run: () => Promise<unknown>,
  onError: (name: string, error: unknown) => void = () => {},
): SchedulerHandle {
  const timer = setInterval(() => {
    void run().catch((error) => onError(name, error));
  }, everyMs);
  timer.unref?.();
  return { name, stop: () => clearInterval(timer) };
}
