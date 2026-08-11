/**
 * processors/image-budget.ts — the cap check that runs BEFORE the first pixel is bought.
 *
 * Illustration is the largest line in the product's cost (SPEC §6.1: ~$1.2 of a ~$2.7
 * digital book, ~$2.8 of a ~$4 print-ready one). It is also the line that runs 13 times per
 * job in parallel, which is exactly the shape of an accident: one loop, thirteen concurrent
 * workers, and a daily budget gone before anyone reads a dashboard.
 *
 * SPEC §6.2 rule 5 is unambiguous — when a ceiling is reached the job "hiç başlamaz". So
 * this check happens before `router.execute`, not after: the failure mode we are avoiding
 * is "started, spent, then cancelled", which costs money AND produces nothing.
 *
 * The reservation itself is placed by `apps/api` before the job is enqueued
 * (`cost/reservation.ts`). This is the SECOND line of defence, for the paths that reach a
 * worker without one: an internally triggered re-illustration, a recovered job whose hold
 * expired, or a bug.
 */

import { sql } from 'drizzle-orm';
import type { Database } from '@kendihikayem/db';

import type { CostCaps } from '../cost/reservation';

export class CostCapReachedError extends Error {
  /** The contract `ErrorCode` the API turns this into. */
  readonly code = 'COST_CAP_REACHED' as const;
  readonly reason: 'per_request_cap' | 'daily_global_cap' | 'monthly_cap';

  constructor(reason: CostCapReachedError['reason'], detail: string) {
    super(`COST_CAP_REACHED (${reason}): ${detail}`);
    this.name = 'CostCapReachedError';
    this.reason = reason;
  }
}

export interface ImageBudgetInput {
  userId: string;
  jobId: string;
  /** What this one image is expected to cost, retry allowance included. */
  estimateUsd: number;
  caps: CostCaps;
}

/**
 * @throws CostCapReachedError — deliberately a throw, not a boolean. Every caller's only
 *         correct response is to stop, and a boolean invites a caller to carry on.
 */
export async function assertImageBudget(db: Database, input: ImageBudgetInput): Promise<void> {
  /* Ceiling 1 — per request. Pure arithmetic, no round trip. */
  if (input.estimateUsd > input.caps.maxCostUsdPerRequest) {
    throw new CostCapReachedError(
      'per_request_cap',
      `image estimate ${input.estimateUsd.toFixed(5)} exceeds per-request cap ` +
        `${input.caps.maxCostUsdPerRequest.toFixed(5)}`,
    );
  }

  /* Ceiling 2 — global daily kill switch. Spent today plus everything held right now. */
  const globalRows = await db.execute<{ spent: string }>(sql`
    select
      coalesce((select sum(cost_usd) from provider_usage
                where created_at >= date_trunc('day', now())), 0)
      + coalesce((select sum(amount_usd) from cost_reservations
                  where state = 'held'), 0) as spent
  `);
  const globalSpent = Number(globalRows[0]?.spent ?? 0);
  if (globalSpent + input.estimateUsd > input.caps.dailyGlobalUsdCap) {
    throw new CostCapReachedError(
      'daily_global_cap',
      `global spend ${globalSpent.toFixed(5)} + ${input.estimateUsd.toFixed(5)} exceeds ` +
        `${input.caps.dailyGlobalUsdCap.toFixed(5)}`,
    );
  }

  /* Ceiling 3 — the parent's monthly cap.
   *
   * A job that already holds a reservation is EXEMPT: its budget was checked and set aside
   * under a row lock when the job was created. Re-checking it here would fail every job
   * whose own hold pushed the account to its ceiling — the reservation would be blocking
   * the work it exists to fund. */
  const jobRows = await db.execute<{ reservation_id: string | null }>(sql`
    select reservation_id from jobs where id = ${input.jobId}
  `);
  if (jobRows[0]?.reservation_id) return;

  const rows = await db.execute<{
    period_cost_usd: string;
    reserved_cost_usd: string;
    monthly_cost_cap_usd: string;
  }>(sql`
    select e.period_cost_usd, e.reserved_cost_usd, p.monthly_cost_cap_usd
      from entitlements e
      join plans p on p.code = e.plan_code
     where e.user_id = ${input.userId}
  `);

  const row = rows[0];
  // No entitlements row is an account-shape problem for `apps/api` to answer, not a reason
  // to refuse work a parent may already have paid for.
  if (!row) return;

  const used = Number(row.period_cost_usd) + Number(row.reserved_cost_usd);
  const cap = Number(row.monthly_cost_cap_usd);
  if (used + input.estimateUsd > cap) {
    throw new CostCapReachedError(
      'monthly_cap',
      `monthly cap ${cap.toFixed(5)} would be exceeded: used ${used.toFixed(5)} + ` +
        `${input.estimateUsd.toFixed(5)}`,
    );
  }
}
