/**
 * routes/v1/entitlements.ts — what the parent is allowed to do, read on every wizard step.
 *
 * The product rule this serves (contract/src/billing.ts): the "Oluştur" button is disabled
 * from `credits` and `costCap.blocked` BEFORE the parent invests three minutes in the
 * wizard. Hitting a "yetersiz kredi" wall after all that work is the failure this endpoint
 * exists to prevent.
 *
 * `costCap` is USD — the INTERNAL production budget. It is never shown to a parent in
 * lira; it is an abuse ceiling, not a price.
 */

import { sql } from 'drizzle-orm';
import type { Database } from '@kendihikayem/db';
import type { Entitlements } from '@kendihikayem/contract';
import { readCostPosition } from '@kendihikayem/worker';

import { notFound } from '../../errors';

type EntitlementsRow = {
  plan_code: string;
  period_start: Date;
  period_end: Date;
  stories_used: number;
  credits_balance: number;
  story_quota: number | null;
  voice_quota: number;
};

export async function readEntitlements(db: Database, userId: string): Promise<Entitlements> {
  const rows = await db.execute<EntitlementsRow>(sql`
    select e.plan_code, e.period_start, e.period_end, e.stories_used, e.credits_balance,
           p.story_quota, p.voice_quota
      from entitlements e
      join plans p on p.code = e.plan_code
     where e.user_id = ${userId}
  `);

  const row = rows[0];
  if (!row) throw notFound(`no entitlements for user ${userId}`);

  const cost = await readCostPosition(db, userId);

  const voiceRows = await db.execute<{ used: string }>(sql`
    select count(*)::text as used
      from voice_profiles
     where user_id = ${userId} and status not in ('deleted', 'revoked')
  `);

  return {
    planCode: row.plan_code,
    periodStart: new Date(row.period_start).toISOString() as Entitlements['periodStart'],
    periodEnd: new Date(row.period_end).toISOString() as Entitlements['periodEnd'],
    stories: { used: row.stories_used, limit: row.story_quota },
    credits: row.credits_balance,
    voiceProfiles: { used: Number(voiceRows[0]?.used ?? 0), limit: row.voice_quota },
    costCap: {
      // `used` includes holds: budget promised to work in flight is spent as far as the
      // next request is concerned, and showing it as available would let the parent start
      // something the reservation is about to refuse.
      usedUsd: cost ? cost.usedUsd + cost.reservedUsd : 0,
      capUsd: cost?.capUsd ?? 0,
      blocked: cost?.blocked ?? true,
    },
    canCloneVoice: row.voice_quota > 0,
  };
}
