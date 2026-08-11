import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit configuration.
 *
 * `migrations/` holds plain SQL, checked in and reviewed like any other code: an auditor
 * must be able to read what the database actually does without running a generator. Never
 * hand-edit a file drizzle-kit produced — add a new migration instead.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  dbCredentials: {
    url:
      process.env['DATABASE_MIGRATION_URL'] ||
      process.env['DATABASE_URL'] ||
      'postgresql://kendihikayem:kendihikayem@localhost:5432/kendihikayem',
  },
  casing: 'snake_case',
  strict: true,
  verbose: true,
});
