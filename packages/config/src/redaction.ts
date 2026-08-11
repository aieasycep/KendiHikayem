/**
 * Log-safe rendering of the environment.
 *
 * Anything whose name looks like a credential is masked. Startup logs, Sentry breadcrumbs
 * and the ops "config" panel all go through here — a leaked provider key in a log line is
 * an incident, and voice/child data providers are exactly the keys we cannot rotate quietly.
 */

const SECRET_NAME_PATTERN = /(SECRET|PASSWORD|API_KEY|_KEY$|PRIVATE|TOKEN|DSN|DATABASE_URL|REDIS_URL)/i;

/** Keys that contain a secret inside a URL and must be masked wholesale. */
const ALWAYS_MASK = new Set(['DATABASE_URL', 'DATABASE_MIGRATION_URL', 'REDIS_URL', 'SENTRY_DSN']);

/** Names that match the pattern but carry no secret — model ids, key *identifiers*, etc. */
const NEVER_MASK = new Set([
  'S3_KMS_KEY_ID',
  'S3_VOICE_KMS_KEY_ID',
  'VAPID_PUBLIC_KEY',
  'AUTH_BASE_URL',
]);

export function isSecretKey(name: string): boolean {
  if (NEVER_MASK.has(name)) return false;
  if (ALWAYS_MASK.has(name)) return true;
  return SECRET_NAME_PATTERN.test(name);
}

/** Keeps the first 4 characters so operators can tell two keys apart without exposing either. */
export function maskSecret(value: string): string {
  if (value.length <= 4) return '****';
  return `${value.slice(0, 4)}${'*'.repeat(Math.min(value.length - 4, 12))}`;
}

export function redactEnv(env: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) continue;
    out[key] = isSecretKey(key) && typeof value === 'string' ? maskSecret(value) : value;
  }
  return out;
}
