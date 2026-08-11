/**
 * test/helpers.ts — a real server, a real database, a stub verifier.
 *
 * The auth verifier is the only stub. Everything else — Postgres, the contract router, the
 * middleware chain — is what runs in production, because the behaviour under test
 * (idempotency replay, 501 routing, the polling path) lives in exactly those pieces.
 */

import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';
import { createDb, type Database, type DbHandle } from '@kendihikayem/db';
import { parseEnv, type Env } from '@kendihikayem/config';

import { buildServer, type BuiltServer } from '../src/server';
import { StaticTokenVerifier } from '../src/middleware/auth';
import type { AuthenticatedUser } from '../src/context';

export const TEST_DATABASE_URL =
  process.env['DATABASE_URL'] ??
  'postgresql://kendihikayem:kendihikayem@localhost:5432/kendihikayem';

export function openDb(max = 5): DbHandle {
  return createDb({ url: TEST_DATABASE_URL, max });
}

export function testEnv(overrides: Record<string, string> = {}): Env {
  return parseEnv({
    NODE_ENV: 'test',
    API_MODE: 'mock',
    AUTH_SECRET: 'test-secret-that-is-definitely-long-enough-32',
    DATABASE_URL: TEST_DATABASE_URL,
    ...overrides,
  });
}

export interface TestServer extends BuiltServer {
  token: string;
  userId: string;
  /** Headers every request needs: the client-version gate rejects requests without them. */
  headers(extra?: Record<string, string>): Record<string, string>;
}

export interface TestUser {
  userId: string;
  token: string;
}

export async function createTestUser(
  db: Database,
  options: { capUsd?: number; credits?: number } = {},
): Promise<TestUser> {
  const capUsd = options.capUsd ?? 10;
  const planCode = `apitest_cap_${capUsd.toFixed(2).replace('.', '_')}`;

  await db.execute(sql`
    insert into plans (code, title_tr, price_try, period, story_quota, voice_quota,
                       image_tier, tts_tier, monthly_cost_cap_usd, features, is_active)
    values (${planCode}, 'API Test', 0, 'once', 100, 1, 'preview', 'draft',
            ${capUsd.toFixed(2)}::numeric, '{}'::jsonb, true)
    on conflict (code) do update set monthly_cost_cap_usd = excluded.monthly_cost_cap_usd
  `);

  const rows = await db.execute<{ id: string }>(sql`
    insert into users (is_guest, display_name) values (true, 'API Test') returning id
  `);
  const userId = rows[0]!.id;

  await db.execute(sql`
    insert into entitlements (user_id, plan_code, period_start, period_end,
                              stories_used, credits_balance, period_cost_usd, reserved_cost_usd)
    values (${userId}, ${planCode}, now(), now() + interval '30 days',
            0, ${options.credits ?? 10}, 0, 0)
  `);

  return { userId, token: `test-token-${userId}` };
}

export async function startTestServer(
  db: Database,
  user: TestUser,
  extraUsers: TestUser[] = [],
): Promise<TestServer> {
  const map = new Map<string, AuthenticatedUser>();
  for (const u of [user, ...extraUsers]) {
    map.set(u.token, { userId: u.userId, isGuest: true });
  }

  const built = buildServer({
    db,
    env: testEnv(),
    verifier: new StaticTokenVerifier(map),
    logger: false,
  });

  await built.app.ready();

  return {
    ...built,
    token: user.token,
    userId: user.userId,
    headers: (extra = {}) => ({
      'x-client-version': '1.0.0',
      authorization: `Bearer ${user.token}`,
      ...extra,
    }),
  };
}

export async function deleteTestUser(db: Database, userId: string): Promise<void> {
  await db.execute(sql`delete from users where id = ${userId}`);
}

export function newIdempotencyKey(prefix = 'apitest'): string {
  return `${prefix}-${randomUUID()}`;
}
