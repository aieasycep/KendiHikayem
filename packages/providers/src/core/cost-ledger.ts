/**
 * core/cost-ledger.ts — where every priced provider call is written down.
 *
 * The router calls `record()` on success AND on cache hits. A cache hit is a zero-cost row
 * with `cacheHit: true`, not a missing row: "USD per completed story" only means something
 * if the denominator counts the calls we avoided as well as the ones we paid for.
 *
 * The interface lives here; the Postgres implementation lives in `apps/worker`
 * (`cost/ledger.pg.ts`) so this package stays free of a database dependency and remains
 * trivially testable with `InMemoryCostLedger`.
 */

import type { ProviderUsage } from './types';
import { totalUsageUsd } from './types';

export interface LedgerContext {
  userId?: string;
  jobStepId?: string;
  correlationId?: string;
}

export interface CostLedger {
  /** Appends one row per usage entry. Must never throw into the caller's happy path. */
  record(usage: readonly ProviderUsage[], ctx: LedgerContext): Promise<void>;
}

/** Test and dry-run double. Also used by the fake adapters' end-to-end smoke path. */
export class InMemoryCostLedger implements CostLedger {
  readonly entries: Array<ProviderUsage & LedgerContext> = [];

  async record(usage: readonly ProviderUsage[], ctx: LedgerContext): Promise<void> {
    for (const u of usage) this.entries.push({ ...u, ...ctx });
  }

  totalUsd(): number {
    return totalUsageUsd(this.entries);
  }

  totalUsdFor(userId: string): number {
    return totalUsageUsd(this.entries.filter((e) => e.userId === userId));
  }

  savedUsd(): number {
    return this.entries.filter((e) => e.cacheHit).reduce((sum, e) => sum + e.costUsd, 0);
  }

  clear(): void {
    this.entries.length = 0;
  }
}

/** Discards everything. For paths where the caller genuinely owns the accounting. */
export const NOOP_COST_LEDGER: CostLedger = {
  async record() {
    /* intentionally empty */
  },
};
