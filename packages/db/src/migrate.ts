/**
 * Migration runner. `pnpm --filter @kendihikayem/db db:migrate`.
 *
 * Applies every file in `migrations/` that this database has not seen, inside a
 * transaction, tracked in `drizzle.__drizzle_migrations`. Uses a pool of 1: a migration is
 * not a workload, and a second connection only invites a lock ordering surprise.
 *
 * Runs under Node's native TypeScript stripping — no transpiler in the dependency graph.
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { migrate } from 'drizzle-orm/postgres-js/migrator';

import { createDb, resolveCliDatabaseUrl } from './client.ts';

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

async function main(): Promise<void> {
  const url = resolveCliDatabaseUrl();
  // Never print the password back to the operator.
  const redacted = url.replace(/\/\/([^:]+):[^@]*@/, '//$1:***@');
  process.stdout.write(`[db:migrate] hedef: ${redacted}\n`);
  process.stdout.write(`[db:migrate] klasör: ${migrationsFolder}\n`);

  const handle = createDb({ url, max: 1 });
  try {
    await migrate(handle.db, { migrationsFolder });
    process.stdout.write('[db:migrate] tamam — tüm migration\'lar uygulandı.\n');
  } finally {
    await handle.close();
  }
}

await main();
