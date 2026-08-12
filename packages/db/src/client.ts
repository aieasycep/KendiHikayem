/**
 * The typed database client: postgres.js + Drizzle.
 *
 * This module deliberately does not read `process.env` — `packages/config` is the only
 * place allowed to do that, and it validates AUTH_SECRET and friends that a migration
 * runner has no business needing. Callers pass the connection string in; `apps/api` and
 * `apps/worker` pass the slice of the validated env they already hold.
 */
import { usePreparedStatements } from '@kendihikayem/config';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema/index';

export { schema };

/** The shape `apps/api` and `apps/worker` get out of `loadEnv()` — no import needed. */
export interface DatabaseEnv {
  DATABASE_URL: string;
  DATABASE_POOL_MAX?: number;
  DATABASE_PREPARED_STATEMENTS?: 'auto' | 'on' | 'off';
}

export interface CreateDbOptions {
  /** postgresql://… */
  url: string;
  /** Pool ceiling. Use 1 for migrations and one-shot scripts. */
  max?: number;
  /** Emit SQL to the logger. Never enable in production: prompts contain child names. */
  logger?: boolean;
  /** Seconds an idle connection may sit in the pool before being closed. */
  idleTimeout?: number;
  /** Seconds a single statement may run before postgres.js aborts it. */
  connectTimeout?: number;
  /**
   * ⚠️ Named prepared statements. `auto` (the default) decides from the connection string —
   * see `usePreparedStatements` in `packages/config`, which is where the Supabase/PgBouncer
   * transaction-pooler rule and its reasoning live. Only pass a boolean to override it.
   */
  prepare?: boolean | 'auto';
}

export type Database = PostgresJsDatabase<typeof schema>;
export type Sql = ReturnType<typeof postgres>;

export interface DbHandle {
  /** The Drizzle query builder. */
  db: Database;
  /** The raw postgres.js connection — needed for `LISTEN`, `COPY` and advisory locks. */
  sql: Sql;
  /** Drains the pool. Always call this in scripts, or node will not exit. */
  close: () => Promise<void>;
}

/**
 * Opens a pool and returns a typed Drizzle instance over the full schema.
 *
 * postgres.js is the chosen driver (SPEC §2). Do not add `pg` alongside it: two pools
 * against the same database means two different transaction visibilities, and the cost
 * reservation protocol in schema/billing.ts depends on `SELECT … FOR UPDATE` behaving
 * predictably.
 */
export function createDb(options: CreateDbOptions): DbHandle {
  const prepare =
    options.prepare === undefined || options.prepare === 'auto'
      ? usePreparedStatements(options.url)
      : options.prepare;

  const sql = postgres(options.url, {
    max: options.max ?? 10,
    idle_timeout: options.idleTimeout ?? 30,
    connect_timeout: options.connectTimeout ?? 10,
    /**
     * ⚠️ Off behind a TRANSACTION-mode pooler (Supabase 6543, PgBouncer). postgres.js names
     * and caches a prepared statement per distinct query; a transaction pooler moves the
     * next transaction to a different backend, where that name does not exist. The symptom
     * is `prepared statement "s3" does not exist` appearing at random under load — never in
     * a test, never at boot. See `usePreparedStatements`.
     */
    prepare,
    onnotice: () => {
      /* PostgreSQL NOTICEs are noise here; real problems arrive as errors. */
    },
  });

  const db = drizzle(sql, { schema, logger: options.logger ?? false });

  return {
    db,
    sql,
    close: async () => {
      await sql.end({ timeout: 5 });
    },
  };
}

/** Convenience wrapper for callers that already hold a validated env object. */
export function createDbFromEnv(env: DatabaseEnv, overrides: Partial<CreateDbOptions> = {}) {
  return createDb({
    url: env.DATABASE_URL,
    max: env.DATABASE_POOL_MAX ?? 10,
    prepare: usePreparedStatements(env.DATABASE_URL, env.DATABASE_PREPARED_STATEMENTS ?? 'auto'),
    ...overrides,
  });
}

/**
 * The connection string used by the CLI entry points (`db:migrate`, `db:seed`).
 *
 * These run outside the API process, before `packages/config` can meaningfully validate a
 * server environment, so they read the environment directly. The fallback is byte-identical
 * to `.env.example` and to `infra/docker/compose.yml`.
 *
 * ⚠️ `DATABASE_MIGRATION_URL` WINS when set, and on Supabase it usually must be set. DDL
 * belongs on a SESSION-mode connection: the transaction pooler (port 6543) hands out a
 * different backend per transaction, which breaks the advisory locking and multi-statement
 * assumptions a migration runner is entitled to make. The application keeps the transaction
 * pooler; the migration takes the session pooler (port 5432) or the direct connection.
 */
export function resolveCliDatabaseUrl(): string {
  const migration = process.env['DATABASE_MIGRATION_URL']?.trim();
  if (migration) return migration;
  return (
    process.env['DATABASE_URL'] ??
    'postgresql://kendihikayem:kendihikayem@localhost:5432/kendihikayem'
  );
}
