/**
 * cost/ledger.pg.ts — the Postgres `CostLedger`.
 *
 * `provider_usage` is the ground truth (schema/billing.ts): one row per provider call with
 * the price actually charged. Estimates live in `jobs.estimated_cost_usd`; this table is
 * what the vendor invoice gets reconciled against and what "USD per completed story" is
 * computed from.
 *
 * Cache hits are recorded too, at zero cost, so the saving is auditable rather than
 * assumed (SPEC §6.2 rule 4).
 */

import { sql } from 'drizzle-orm';
import type { Database } from '@kendihikayem/db';
import type { CostLedger, LedgerContext, ProviderUsage } from '@kendihikayem/providers';

export class PgCostLedger implements CostLedger {
  constructor(private readonly db: Database) {}

  async record(usage: readonly ProviderUsage[], ctx: LedgerContext): Promise<void> {
    if (usage.length === 0) return;

    for (const u of usage) {
      await this.db.execute(sql`
        insert into provider_usage
          (job_step_id, user_id, provider, model, operation, billing_unit,
           billed_units, unit_price_usd, cost_usd, cache_hit, latency_ms)
        values
          (${ctx.jobStepId ?? null}, ${ctx.userId ?? null}, ${u.provider}, ${u.model},
           ${u.operation}, ${u.billingUnit}, ${u.billedUnits.toFixed(2)}::numeric,
           ${u.unitPriceUsd.toFixed(10)}::numeric, ${u.costUsd.toFixed(5)}::numeric,
           ${u.cacheHit}, ${Math.round(u.latencyMs)})
      `);
    }
  }
}

/** Actual USD spent by a job, summed from the ledger — the number `commit` is given. */
export async function actualCostForJob(db: Database, jobId: string): Promise<number> {
  const rows = await db.execute<{ total: string }>(sql`
    select coalesce(sum(pu.cost_usd), 0) as total
      from provider_usage pu
      join job_steps js on js.id = pu.job_step_id
     where js.job_id = ${jobId}
  `);
  return Number(rows[0]?.total ?? 0);
}

export type StoryCostRollup = {
  day: Date;
  stories_completed: number;
  total_usd: string;
  usd_per_story: string;
  cache_saved_usd: string;
};

/**
 * The first-class metric: USD per COMPLETED story. Completed, not started — a book the
 * parent abandoned at the skeleton gate cost $0.03 and must not drag the average down.
 * Used by `schedulers/cost-rollup.ts` and the ops dashboard.
 */
export async function costPerCompletedStory(
  db: Database,
  days = 7,
): Promise<StoryCostRollup[]> {
  const rows = await db.execute<StoryCostRollup>(sql`
    with completed as (
      select date_trunc('day', j.finished_at) as day, j.id as job_id
        from jobs j
       where j.kind = 'story_fill'
         and j.status = 'succeeded'
         and j.finished_at >= now() - make_interval(days => ${days})
    ),
    spend as (
      select c.day, sum(pu.cost_usd) as total_usd,
             count(distinct c.job_id) as stories_completed
        from completed c
        join job_steps js on js.job_id = c.job_id
        left join provider_usage pu on pu.job_step_id = js.id
       group by c.day
    ),
    saved as (
      select date_trunc('day', last_hit_at) as day, sum(saved_usd) as cache_saved_usd
        from content_cache
       where last_hit_at >= now() - make_interval(days => ${days})
       group by 1
    )
    select s.day,
           s.stories_completed,
           coalesce(s.total_usd, 0)::text as total_usd,
           (coalesce(s.total_usd, 0) / greatest(s.stories_completed, 1))::text as usd_per_story,
           coalesce(sv.cache_saved_usd, 0)::text as cache_saved_usd
      from spend s
      left join saved sv on sv.day = s.day
     order by s.day desc
  `);
  return [...rows];
}
