/**
 * The reservation protocol, against a real PostgreSQL.
 *
 * These are the tests that justify the design. Each one corresponds to a way a parent gets
 * charged incorrectly if the protocol is wrong:
 *
 *   · two concurrent taps both passing the cap        → overspend
 *   · committing the estimate instead of the actual   → inflated usage
 *   · committing twice after a worker restart         → double charge
 *   · a crashed worker never releasing its hold       → cap permanently shrunk
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import type { DbHandle } from '@kendihikayem/db';

import {
  type CostCaps,
  commitReservation,
  readCostPosition,
  releaseReservation,
  reserveCost,
  sweepExpiredReservations,
} from '../src/cost/reservation';
import { createTestUser, deleteTestUser, openDb, readEntitlements } from './helpers';

const caps: CostCaps = {
  maxCostUsdPerRequest: 6,
  dailyGlobalUsdCap: 1_000_000,
  reservationTtlMinutes: 30,
};

let handle: DbHandle;
const createdUsers: string[] = [];

beforeAll(() => {
  handle = openDb(10);
});

afterAll(async () => {
  for (const userId of createdUsers) await deleteTestUser(handle.db, userId);
  await handle.close();
});

async function newUser(capUsd: number) {
  const user = await createTestUser(handle.db, { capUsd });
  createdUsers.push(user.userId);
  return user;
}

describe('reserveCost — three-level cap', () => {
  it('refuses a single job above the per-request cap without touching the database', async () => {
    const user = await newUser(100);

    const result = await reserveCost(handle.db, {
      userId: user.userId,
      estimateUsd: 6.5,
      caps,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.reason).toBe('per_request_cap');

    // Nothing was held — the job never started, so nothing needs releasing.
    const after = await readEntitlements(handle.db, user.userId);
    expect(after.reservedCostUsd).toBe(0);
  });

  it('refuses when the monthly cap would be exceeded, and holds nothing', async () => {
    const user = await newUser(5);

    const first = await reserveCost(handle.db, {
      userId: user.userId,
      estimateUsd: 4,
      caps,
    });
    expect(first.ok).toBe(true);

    const second = await reserveCost(handle.db, {
      userId: user.userId,
      estimateUsd: 4,
      caps,
    });
    expect(second.ok).toBe(false);
    if (second.ok) throw new Error('unreachable');
    expect(second.reason).toBe('monthly_cap');

    const after = await readEntitlements(handle.db, user.userId);
    expect(after.reservedCostUsd).toBe(4);
  });

  it('refuses when the global daily kill switch is tripped', async () => {
    const user = await newUser(100);

    const result = await reserveCost(handle.db, {
      userId: user.userId,
      estimateUsd: 1,
      caps: { ...caps, dailyGlobalUsdCap: 0.0001 },
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.reason).toBe('daily_global_cap');
  });
});

describe('reserveCost — concurrency', () => {
  /**
   * THE test. Ten simultaneous reservations of $1 against a $5 cap: exactly five may pass.
   * If `FOR UPDATE` were dropped, or the check moved outside the transaction, this test
   * would let seven or eight through — which in production is a parent charged for books
   * their cap said they could not have.
   */
  it('lets exactly floor(cap / estimate) of ten simultaneous requests through', async () => {
    const user = await newUser(5);
    const estimate = 1;

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        reserveCost(handle.db, { userId: user.userId, estimateUsd: estimate, caps }),
      ),
    );

    const accepted = results.filter((r) => r.ok);
    const denied = results.filter((r) => !r.ok);

    expect(accepted).toHaveLength(5);
    expect(denied).toHaveLength(5);
    expect(denied.every((d) => !d.ok && d.reason === 'monthly_cap')).toBe(true);

    const after = await readEntitlements(handle.db, user.userId);
    expect(after.reservedCostUsd).toBe(5);
    expect(after.reservedCostUsd).toBeLessThanOrEqual(user.capUsd);
  });

  it('never lets the sum of holds exceed the cap under mixed amounts', async () => {
    const user = await newUser(10);
    const amounts = [3, 3, 3, 3, 3, 3];

    const results = await Promise.all(
      amounts.map((estimateUsd) =>
        reserveCost(handle.db, { userId: user.userId, estimateUsd, caps }),
      ),
    );

    const acceptedTotal = results
      .filter((r): r is Extract<typeof r, { ok: true }> => r.ok)
      .reduce((sum, r) => sum + r.amountUsd, 0);

    expect(acceptedTotal).toBeLessThanOrEqual(10);

    const after = await readEntitlements(handle.db, user.userId);
    expect(after.reservedCostUsd).toBe(acceptedTotal);
  });
});

describe('settlement', () => {
  it('commits the ACTUAL cost, not the estimate', async () => {
    const user = await newUser(50);

    const held = await reserveCost(handle.db, {
      userId: user.userId,
      estimateUsd: 4,
      caps,
    });
    if (!held.ok) throw new Error('reservation should have succeeded');

    // The job came in under budget: the parent must be charged 2.41, not 4.
    const settled = await commitReservation(handle.db, held.reservationId, 2.41);
    expect(settled.applied).toBe(true);

    const after = await readEntitlements(handle.db, user.userId);
    expect(after.reservedCostUsd).toBe(0);
    expect(after.periodCostUsd).toBeCloseTo(2.41, 4);
  });

  it('is idempotent — a worker that restarts after committing does not double charge', async () => {
    const user = await newUser(50);

    const held = await reserveCost(handle.db, {
      userId: user.userId,
      estimateUsd: 3,
      caps,
    });
    if (!held.ok) throw new Error('reservation should have succeeded');

    const first = await commitReservation(handle.db, held.reservationId, 2);
    const second = await commitReservation(handle.db, held.reservationId, 2);
    const third = await releaseReservation(handle.db, held.reservationId);

    expect(first.applied).toBe(true);
    expect(second.applied).toBe(false);
    expect(second.state).toBe('already_settled');
    expect(third.applied).toBe(false);

    const after = await readEntitlements(handle.db, user.userId);
    expect(after.periodCostUsd).toBeCloseTo(2, 4);
    expect(after.reservedCostUsd).toBe(0);
  });

  it('release gives the whole hold back and charges nothing', async () => {
    const user = await newUser(50);

    const held = await reserveCost(handle.db, {
      userId: user.userId,
      estimateUsd: 3.5,
      caps,
    });
    if (!held.ok) throw new Error('reservation should have succeeded');

    await releaseReservation(handle.db, held.reservationId);

    const after = await readEntitlements(handle.db, user.userId);
    expect(after.reservedCostUsd).toBe(0);
    expect(after.periodCostUsd).toBe(0);
  });
});

describe('crash valve', () => {
  it('sweeps an expired hold so a dead worker cannot permanently consume the cap', async () => {
    const user = await newUser(20);

    const held = await reserveCost(handle.db, {
      userId: user.userId,
      estimateUsd: 5,
      caps,
    });
    if (!held.ok) throw new Error('reservation should have succeeded');

    // Simulate the worker dying: nobody ever settles, and the TTL passes.
    await handle.db.execute(sql`
      update cost_reservations set expires_at = now() - interval '1 minute'
       where id = ${held.reservationId}
    `);

    const before = await readEntitlements(handle.db, user.userId);
    expect(before.reservedCostUsd).toBe(5);

    const swept = await sweepExpiredReservations(handle.db);
    expect(swept.released).toBeGreaterThanOrEqual(1);

    const after = await readEntitlements(handle.db, user.userId);
    expect(after.reservedCostUsd).toBe(0);

    // And the cap is usable again.
    const retry = await reserveCost(handle.db, {
      userId: user.userId,
      estimateUsd: 5,
      caps,
    });
    expect(retry.ok).toBe(true);
  });
});

describe('readCostPosition', () => {
  it('reports used, reserved and blocked for GET /v1/entitlements', async () => {
    const user = await newUser(4);

    await reserveCost(handle.db, { userId: user.userId, estimateUsd: 4, caps });
    const position = await readCostPosition(handle.db, user.userId);

    expect(position).not.toBeNull();
    expect(position!.capUsd).toBe(4);
    expect(position!.reservedUsd).toBe(4);
    expect(position!.blocked).toBe(true);
  });
});
