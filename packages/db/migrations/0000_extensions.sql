-- Extensions the schema depends on. Must run before 0001.
--
--   pgcrypto → gen_random_uuid(), the DEFAULT on every uuid primary key.
--   citext   → users.email, so 'Ayse@x.com' and 'ayse@x.com' cannot both be registered.
--
-- Both ship with PostgreSQL 16 core (postgres:16-alpine included). CREATE EXTENSION needs
-- rights the application role may not have in production; grant them for the migration
-- connection (DATABASE_MIGRATION_URL) rather than widening the runtime role.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS citext;
