/**
 * @kendihikayem/db — Drizzle schema, migrations and seeds.
 *
 * Owner: A0-DB (docs/SPEC.md §12). The schema is a literal transcription of
 * docs/SPEC-DATA-MODEL.md §4 — 48 tables. Read the header comment of each module in
 * `src/schema/` for the reasoning behind the non-obvious constraints; the short version:
 *
 *   consents.document_sha256          proof of *what text* was consented to (KVKK)
 *   entitlements + cost_reservations  atomic cost reservation under SELECT … FOR UPDATE
 *   jobs / job_steps / idempotency_keys   three levels of idempotency
 *   content_cache.saved_usd           regeneration avoided, measured in dollars
 *   assets.retention_class            ephemeral_30d vs legal_hold_10y
 *   voice_provider_bindings           rented provider slots with LRU eviction
 *   deletion_tasks                    erasure at the provider, not just in our rows
 *
 * This package is server-only. `eslint.config.mjs` refuses to let a client app import it.
 */
export * from './client.ts';
export * from './schema/index.ts';
