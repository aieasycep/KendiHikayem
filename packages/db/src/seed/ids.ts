/**
 * Deterministic identifiers for seed data.
 *
 * The seed must be re-runnable: `pnpm db:seed` twice in a row has to leave the database in
 * the same state, not create a second Elif. Random UUIDs make that impossible, so every
 * seeded row derives its id from its name through UUIDv5 under a fixed namespace.
 *
 * The same function is what workers use for `job_steps.provider_request_id` — a stable id
 * the provider can dedupe on across our retries.
 */
import { createHash } from 'node:crypto';

/** Fixed namespace UUID for KendiHikayem seed data. Never change it: every id would move. */
const NAMESPACE_UUID = '6b656e64-6968-4696-b861-79656d2d6462';
const NAMESPACE = Buffer.from(NAMESPACE_UUID.replace(/-/g, ''), 'hex');

/** RFC 4122 §4.3 name-based UUID, SHA-1 flavour. */
export function uuidv5(name: string): string {
  const hash = createHash('sha1').update(NAMESPACE).update(name, 'utf8').digest();
  hash.writeUInt8((hash.readUInt8(6) & 0x0f) | 0x50, 6); // version 5
  hash.writeUInt8((hash.readUInt8(8) & 0x3f) | 0x80, 8); // RFC 4122 variant
  const hex = hash.subarray(0, 16).toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

/** Namespaced helper so `seed('child:elif')` reads better than a bare string at call sites. */
export const seedId = (name: string): string => uuidv5(`seed:${name}`);

/** sha256 hex — used for `document_sha256`, `text_sha256`, `prompt_sha256`, cache keys. */
export const sha256 = (value: string): string =>
  createHash('sha256').update(value, 'utf8').digest('hex');
