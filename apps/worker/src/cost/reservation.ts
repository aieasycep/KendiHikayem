/**
 * cost/reservation.ts — ⭐ THE RESERVATION PROTOCOL.
 *
 * This is the file where a mistake is silent and expensive. Read
 * `packages/db/src/schema/billing.ts`'s header before changing anything here.
 *
 *   estimateCost() → cost_reservations(held) → entitlements FOR UPDATE → work → commit
 *
 * Why a hold at all, rather than charging at the end? Because two taps 40 ms apart must
 * not both pass the cap. `entitlements.user_id` is the primary key, so
 * `SELECT … FOR UPDATE` is a single-row lock: the second transaction blocks until the
 * first has written its hold, then reads the increased `reserved_cost_usd` and is refused.
 * The check and the increment happen inside one transaction or the protocol is decorative.
 *
 * THREE CEILINGS (SPEC §6.2 rule 6), checked in ascending cost of being wrong:
 *   1. per request  — `maxCostUsdPerRequest`. Pure arithmetic, no database round trip.
 *   2. global / day — the kill switch. One runaway loop must not drain the month.
 *   3. per user / month — `plans.monthly_cost_cap_usd`, under the row lock.
 *
 * All three answer with `COST_CAP_REACHED` and THE JOB NEVER STARTS. Not "starts and gets
 * cancelled" — never enqueued, nothing spent, nothing to refund.
 *
 * Money is `numeric` end to end. Amounts cross the wire as strings and are added in SQL,
 * never in JavaScript floats: `0.1 + 0.2` is the wrong number of dollars.
 */

import { sql } from 'drizzle-orm';
import type { Database } from '@kendihikayem/db';

/** Formats a JS number for a `numeric(10,5)` column. */
export function usd(value: number): string {
  return value.toFixed(5);
}

export interface CostCaps {
  /** Ceiling 1 — a single job may never estimate above this. */
  maxCostUsdPerRequest: number;
  /** Ceiling 2 — global kill switch, USD spent + held across all users today. */
  dailyGlobalUsdCap: number;
  /** How long an unreleased hold survives before the reconcile sweeper reclaims it. */
  reservationTtlMinutes?: number;
  /**
   * Roll an expired entitlement period forward inside the reservation transaction.
   * Without it a parent whose period ended yesterday can never spend again.
   */
  rollExpiredPeriod?: boolean;
}

export type ReservationDenialReason =
  | 'per_request_cap'
  | 'daily_global_cap'
  | 'monthly_cap'
  | 'no_entitlements';

export interface ReservationHold {
  ok: true;
  reservationId: string;
  amountUsd: number;
  expiresAt: Date;
  /** Cap headroom after the hold — surfaced in `GET /v1/entitlements`. */
  remainingUsd: number;
}

export interface ReservationDenied {
  ok: false;
  reason: ReservationDenialReason;
  /** English, for logs. The Turkish text comes from the contract's ERROR_CATALOG. */
  detail: string;
  capUsd?: number;
  usedUsd?: number;
  requestedUsd?: number;
}

export type ReservationResult = ReservationHold | ReservationDenied;

export interface ReserveInput {
  userId: string;
  /** Null while the API is still deciding whether to enqueue; set on the job row after. */
  jobId?: string | null;
  estimateUsd: number;
  caps: CostCaps;
}

/** Type alias, not an interface: `db.execute<T>` constrains T to `Record<string, unknown>`. */
type EntitlementRow = {
  period_cost_usd: string;
  reserved_cost_usd: string;
  monthly_cost_cap_usd: string;
  period_start: Date;
  period_end: Date;
};

/**
 * Places a hold. Returns a denial rather than throwing: a cap is an expected outcome the
 * API turns into `COST_CAP_REACHED`, not an exception.
 */
export async function reserveCost(
  db: Database,
  input: ReserveInput,
): Promise<ReservationResult> {
  const { userId, estimateUsd, caps } = input;
  const jobId = input.jobId ?? null;
  const ttlMinutes = caps.reservationTtlMinutes ?? 30;

  /* ── Ceiling 1: per request ──────────────────────────────────────────────
   * Free, so it goes first. A single job estimating above the per-request cap is either
   * a pricing bug or an abuse attempt; either way the database should not be involved. */
  if (estimateUsd > caps.maxCostUsdPerRequest) {
    return {
      ok: false,
      reason: 'per_request_cap',
      detail: `estimate ${usd(estimateUsd)} exceeds per-request cap ${usd(caps.maxCostUsdPerRequest)}`,
      capUsd: caps.maxCostUsdPerRequest,
      requestedUsd: estimateUsd,
    };
  }

  return db.transaction(async (tx) => {
    /* ── Ceiling 2: global daily kill switch ──────────────────────────────
     * Committed spend today plus everything currently held. Deliberately approximate:
     * two users' transactions can both observe the same total and both pass, overshooting
     * by at most one job. Making it exact would need a global lock on every reservation,
     * which trades a bounded overshoot for a hard throughput ceiling. */
    const globalRows = await tx.execute<{ spent: string }>(sql`
      select
        coalesce((select sum(cost_usd) from provider_usage
                  where created_at >= date_trunc('day', now())), 0)
        + coalesce((select sum(amount_usd) from cost_reservations
                    where state = 'held'), 0) as spent
    `);
    const globalSpent = Number(globalRows[0]?.spent ?? 0);
    if (globalSpent + estimateUsd > caps.dailyGlobalUsdCap) {
      return {
        ok: false,
        reason: 'daily_global_cap',
        detail: `global daily spend ${usd(globalSpent)} + ${usd(estimateUsd)} exceeds ${usd(caps.dailyGlobalUsdCap)}`,
        capUsd: caps.dailyGlobalUsdCap,
        usedUsd: globalSpent,
        requestedUsd: estimateUsd,
      } satisfies ReservationDenied;
    }

    /* ── Ceiling 3: per user / month, under the single-row lock ───────────
     * `FOR UPDATE OF e` locks only the entitlements row — joining plans must not take a
     * lock on a shared catalog row that every concurrent reservation also needs. */
    const rows = await tx.execute<EntitlementRow>(sql`
      select e.period_cost_usd, e.reserved_cost_usd, e.period_start, e.period_end,
             p.monthly_cost_cap_usd
        from entitlements e
        join plans p on p.code = e.plan_code
       where e.user_id = ${userId}
         for update of e
    `);

    const row = rows[0];
    if (!row) {
      return {
        ok: false,
        reason: 'no_entitlements',
        detail: `no entitlements row for user ${userId}`,
      } satisfies ReservationDenied;
    }

    let periodCost = Number(row.period_cost_usd);
    const reserved = Number(row.reserved_cost_usd);
    const cap = Number(row.monthly_cost_cap_usd);

    // Period roll-forward, inside the lock so two concurrent requests cannot both roll.
    const rollPeriod = (caps.rollExpiredPeriod ?? true) && row.period_end.getTime() <= Date.now();
    if (rollPeriod) {
      await tx.execute(sql`
        update entitlements
           set period_start   = period_end,
               period_end     = period_end + interval '1 month',
               period_cost_usd = 0,
               stories_used    = 0,
               updated_at      = now()
         where user_id = ${userId}
      `);
      periodCost = 0;
    }

    if (periodCost + reserved + estimateUsd > cap) {
      return {
        ok: false,
        reason: 'monthly_cap',
        detail:
          `monthly cap ${usd(cap)} would be exceeded: ` +
          `spent ${usd(periodCost)} + held ${usd(reserved)} + ${usd(estimateUsd)}`,
        capUsd: cap,
        usedUsd: periodCost + reserved,
        requestedUsd: estimateUsd,
      } satisfies ReservationDenied;
    }

    await tx.execute(sql`
      update entitlements
         set reserved_cost_usd = reserved_cost_usd + ${usd(estimateUsd)}::numeric,
             updated_at = now()
       where user_id = ${userId}
    `);

    const inserted = await tx.execute<{ id: string; expires_at: Date }>(sql`
      insert into cost_reservations (user_id, job_id, amount_usd, state, expires_at)
      values (${userId}, ${jobId}, ${usd(estimateUsd)}::numeric, 'held',
              now() + make_interval(mins => ${ttlMinutes}))
      returning id, expires_at
    `);

    const reservation = inserted[0];
    if (!reservation) throw new Error('cost_reservations insert returned no row');

    return {
      ok: true,
      reservationId: reservation.id,
      amountUsd: estimateUsd,
      expiresAt: reservation.expires_at,
      remainingUsd: cap - (periodCost + reserved + estimateUsd),
    } satisfies ReservationHold;
  });
}

export interface SettleResult {
  /** False when the reservation was already settled — the call is a safe no-op. */
  applied: boolean;
  state: 'committed' | 'released' | 'already_settled' | 'not_found';
  amountUsd: number;
}

/**
 * Success path: move `actualUsd` out of `reserved_cost_usd` and into `period_cost_usd`.
 *
 * Idempotent by construction — the reservation row is locked and its state checked, so a
 * worker that crashes after committing and retries on restart does not double-charge.
 * `actualUsd` comes from `provider_usage`, not from the estimate: over-estimating and
 * committing the estimate would quietly inflate every parent's monthly usage.
 */
export async function commitReservation(
  db: Database,
  reservationId: string,
  actualUsd: number,
): Promise<SettleResult> {
  return settle(db, reservationId, 'committed', actualUsd);
}

/** Failure/cancel path: give the whole hold back, charge nothing. */
export async function releaseReservation(
  db: Database,
  reservationId: string,
): Promise<SettleResult> {
  return settle(db, reservationId, 'released', 0);
}

async function settle(
  db: Database,
  reservationId: string,
  nextState: 'committed' | 'released',
  actualUsd: number,
): Promise<SettleResult> {
  return db.transaction(async (tx) => {
    const rows = await tx.execute<{ user_id: string; amount_usd: string; state: string }>(sql`
      select user_id, amount_usd, state
        from cost_reservations
       where id = ${reservationId}
         for update
    `);

    const row = rows[0];
    if (!row) return { applied: false, state: 'not_found', amountUsd: 0 };
    if (row.state !== 'held') {
      return { applied: false, state: 'already_settled', amountUsd: Number(row.amount_usd) };
    }

    const held = Number(row.amount_usd);

    // Lock the entitlements row in the same order reserveCost does (entitlements after
    // the reservation row) — consistent ordering is what keeps this deadlock-free.
    await tx.execute(sql`select 1 from entitlements where user_id = ${row.user_id} for update`);

    await tx.execute(sql`
      update entitlements
         set reserved_cost_usd = greatest(0::numeric, reserved_cost_usd - ${usd(held)}::numeric),
             period_cost_usd   = period_cost_usd + ${usd(actualUsd)}::numeric,
             updated_at = now()
       where user_id = ${row.user_id}
    `);

    await tx.execute(sql`
      update cost_reservations
         set state = ${nextState}, settled_at = now()
       where id = ${reservationId}
    `);

    return { applied: true, state: nextState, amountUsd: held };
  });
}

/**
 * The crash valve. A worker that dies mid-flight releases nothing, so `expires_at`
 * (default now() + 30 min) plus `cost_res_expiry_idx` let an ops cron reclaim the hold —
 * otherwise one crash permanently shrinks that parent's monthly cap.
 *
 * Called by `schedulers/reservation-reconcile.ts`.
 */
export async function sweepExpiredReservations(
  db: Database,
  limit = 200,
): Promise<{ released: number; totalUsd: number }> {
  const expired = await db.execute<{ id: string }>(sql`
    select id from cost_reservations
     where state = 'held' and expires_at < now()
     order by expires_at
     limit ${limit}
  `);

  let released = 0;
  let totalUsd = 0;
  for (const row of expired) {
    const result = await releaseReservation(db, row.id);
    if (result.applied) {
      released += 1;
      totalUsd += result.amountUsd;
    }
  }
  return { released, totalUsd };
}

/** Current cap position for `GET /v1/entitlements`. */
export async function readCostPosition(
  db: Database,
  userId: string,
): Promise<{ usedUsd: number; reservedUsd: number; capUsd: number; blocked: boolean } | null> {
  const rows = await db.execute<{
    period_cost_usd: string;
    reserved_cost_usd: string;
    monthly_cost_cap_usd: string;
  }>(sql`
    select e.period_cost_usd, e.reserved_cost_usd, p.monthly_cost_cap_usd
      from entitlements e
      join plans p on p.code = e.plan_code
     where e.user_id = ${userId}
  `);

  const row = rows[0];
  if (!row) return null;

  const usedUsd = Number(row.period_cost_usd);
  const reservedUsd = Number(row.reserved_cost_usd);
  const capUsd = Number(row.monthly_cost_cap_usd);
  return { usedUsd, reservedUsd, capUsd, blocked: usedUsd + reservedUsd >= capUsd };
}
