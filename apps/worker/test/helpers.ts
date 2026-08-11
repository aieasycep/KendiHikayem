/**
 * test/helpers.ts — fixtures for the integration tests.
 *
 * These run against a REAL PostgreSQL (the same schema `pnpm db:migrate` produces) because
 * the properties under test — `SELECT … FOR UPDATE` serialising two concurrent
 * reservations, `ON CONFLICT` collapsing a double-tap onto one job — do not exist in a
 * mock. A mocked database would pass while production double-charged.
 */

import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';
import { createDb, type Database, type DbHandle } from '@kendihikayem/db';
import { parseEnv, type Env } from '@kendihikayem/config';

export const TEST_DATABASE_URL =
  process.env['DATABASE_URL'] ??
  'postgresql://kendihikayem:kendihikayem@localhost:5432/kendihikayem';

export const TEST_REDIS_URL = process.env['REDIS_URL'] ?? 'redis://localhost:6379';

export function openDb(max = 5): DbHandle {
  return createDb({ url: TEST_DATABASE_URL, max });
}

export function testEnv(overrides: Record<string, string> = {}): Env {
  return parseEnv({
    NODE_ENV: 'test',
    API_MODE: 'mock',
    AUTH_SECRET: 'test-secret-that-is-definitely-long-enough-32',
    DATABASE_URL: TEST_DATABASE_URL,
    REDIS_URL: TEST_REDIS_URL,
    QUEUE_PREFIX: `khtest_${process.pid}`,
    ...overrides,
  });
}

export interface TestUser {
  userId: string;
  planCode: string;
  capUsd: number;
}

/**
 * Creates a user with entitlements at a known cap. `capUsd` maps onto a plan, and the plan
 * is created if the seeded catalogue does not already have one at that cap — the cap is
 * what the test is about, so it must be exact.
 */
export async function createTestUser(
  db: Database,
  options: { capUsd?: number; periodEndsInDays?: number } = {},
): Promise<TestUser> {
  const capUsd = options.capUsd ?? 10;
  const planCode = `test_cap_${capUsd.toFixed(2).replace('.', '_')}`;

  await db.execute(sql`
    insert into plans (code, title_tr, price_try, period, story_quota, voice_quota,
                       image_tier, tts_tier, monthly_cost_cap_usd, features, is_active)
    values (${planCode}, 'Test', 0, 'once', 100, 1, 'preview', 'draft',
            ${capUsd.toFixed(2)}::numeric, '{}'::jsonb, true)
    on conflict (code) do update set monthly_cost_cap_usd = excluded.monthly_cost_cap_usd
  `);

  const userRows = await db.execute<{ id: string }>(sql`
    insert into users (is_guest, display_name) values (true, 'Test Ebeveyn') returning id
  `);
  const userId = userRows[0]!.id;

  const days = options.periodEndsInDays ?? 30;
  await db.execute(sql`
    insert into entitlements (user_id, plan_code, period_start, period_end,
                              stories_used, credits_balance, period_cost_usd, reserved_cost_usd)
    values (${userId}, ${planCode}, now(), now() + make_interval(days => ${days}), 0, 10, 0, 0)
  `);

  return { userId, planCode, capUsd };
}

export async function readEntitlements(
  db: Database,
  userId: string,
): Promise<{ periodCostUsd: number; reservedCostUsd: number }> {
  const rows = await db.execute<{ period_cost_usd: string; reserved_cost_usd: string }>(sql`
    select period_cost_usd, reserved_cost_usd from entitlements where user_id = ${userId}
  `);
  const row = rows[0]!;
  return {
    periodCostUsd: Number(row.period_cost_usd),
    reservedCostUsd: Number(row.reserved_cost_usd),
  };
}

/** Cascades through jobs, steps, reservations and usage via the schema's FKs. */
export async function deleteTestUser(db: Database, userId: string): Promise<void> {
  await db.execute(sql`delete from users where id = ${userId}`);
}

export function newIdempotencyKey(prefix = 'test'): string {
  return `${prefix}-${randomUUID()}`;
}

/** Waits for a predicate, polling. Used where BullMQ completion is genuinely async. */
export async function waitFor(
  predicate: () => Promise<boolean>,
  { timeoutMs = 15_000, intervalMs = 100 } = {},
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await predicate()) return;
    if (Date.now() > deadline) throw new Error('waitFor timed out');
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

export async function redisAvailable(url = TEST_REDIS_URL): Promise<boolean> {
  const { default: IORedis } = await import('ioredis');
  const client = new IORedis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });
  try {
    await client.connect();
    await client.ping();
    return true;
  } catch {
    return false;
  } finally {
    client.disconnect();
  }
}
