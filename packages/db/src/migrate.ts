/**
 * Migration runner. `pnpm --filter @kendihikayem/db db:migrate`.
 *
 * Applies every file in `migrations/` that this database has not seen, inside a
 * transaction, tracked in `drizzle.__drizzle_migrations`. Uses a pool of 1: a migration is
 * not a workload, and a second connection only invites a lock ordering surprise.
 *
 * Run through `tsx` (see package.json). `tsx` is not declared here on purpose: it arrives
 * with drizzle-kit, which is already a pinned devDependency of this package. Relative
 * imports stay extensionless so `apps/api` and `apps/worker` can typecheck this package
 * under their own tsconfig, which does not enable `allowImportingTsExtensions`.
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { migrate } from 'drizzle-orm/postgres-js/migrator';

import { createDb, resolveCliDatabaseUrl } from './client';

/**
 * Where the `.sql` files are.
 *
 * ⚠️ `MIGRATIONS_DIR` exists for the container image. The migration SQL is DATA — Drizzle
 * reads it from disk at run time — so it cannot be bundled with the runner, and in the
 * image the runner and the SQL do not sit in the same relative positions they do in the
 * repository. The default is the repository layout, which is what `pnpm db:migrate` uses.
 */
const migrationsFolder =
  process.env['MIGRATIONS_DIR']?.trim() ||
  resolve(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

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
