/**
 * google/quota.ts — telling a sixty-second throttle apart from a spent daily allowance.
 *
 * Both arrive as `429 RESOURCE_EXHAUSTED` with almost the same sentence, and on the FREE
 * TIER they arrive constantly. Getting the distinction wrong is expensive in both
 * directions:
 *
 *   · a per-minute throttle classified as `quota_exhausted` is non-retryable, so the router
 *     abandons a story that would have succeeded 40 seconds later;
 *   · a spent daily allowance classified as `rate_limited` is retried three times with
 *     backoff, then failed over, then retried again by the job queue — a guaranteed no,
 *     bought at several minutes of a parent's evening.
 *
 * The message text alone cannot decide it. Google's free tier answers a per-MINUTE limit
 * with the same "You exceeded your current quota, please check your plan and billing
 * details" sentence it uses for the daily one; the difference lives in the structured
 * `QuotaFailure` detail, whose `quotaId` spells out the period
 * (`GenerateRequestsPerMinutePerProjectPerModel-FreeTier` vs `…PerDay…`). So the structured
 * detail is read FIRST and the prose is only a fallback.
 *
 * ⚠️ NOT VERIFIED AGAINST A LIVE 429. The envelopes below are written to Google's published
 * `google.rpc` error-details shapes and exercised against recorded fixtures. The first real
 * quota error is where this classification gets its first true test.
 */

/** `google.rpc.Status` as it appears in a Generative Language API error body. */
export interface GoogleErrorEnvelope {
  error?: {
    code?: number;
    message?: string;
    /** Canonical code name: `RESOURCE_EXHAUSTED`, `UNAUTHENTICATED`, … */
    status?: string;
    details?: Array<Record<string, unknown>>;
  };
}

/**
 * Which limit fired.
 *
 *   throttle — a short window (per minute / per second). Wait it out, same provider.
 *   daily    — the day's allowance is gone. Nothing to wait for until midnight Pacific.
 *   billing  — the account itself is out of credit or has no plan.
 *   unknown  — a 429 we could not attribute; treated as a throttle, which is the safer
 *              default (one wasted retry beats abandoning a paid-for story).
 */
export type QuotaPeriod = 'throttle' | 'daily' | 'billing' | 'unknown';

/** Longest `RetryInfo` delay we still read as "a throttle". Beyond this it is a reset. */
const THROTTLE_RETRY_CEILING_MS = 5 * 60_000;

const DAILY_TOKENS = ['perday', 'per_day', 'per day', 'daily', 'requestsperday'];
const THROTTLE_TOKENS = [
  'perminute',
  'per_minute',
  'per minute',
  'persecond',
  'per_second',
  'inputtokensperminute',
  'requestsperminute',
];
/** Phrases that mean "the account has no money", not "you are going too fast". */
const BILLING_TOKENS = [
  'billing',
  'check your plan',
  'no longer has access',
  'billing_not_active',
  'free tier is not available',
  'not available in your country',
];

/** Reads every `QuotaFailure` violation's quota id + metric, lower-cased and squashed. */
export function quotaViolationTokens(envelope: GoogleErrorEnvelope | undefined): string[] {
  const tokens: string[] = [];
  for (const detail of envelope?.error?.details ?? []) {
    if (!String(detail['@type'] ?? '').endsWith('QuotaFailure')) continue;
    const violations = detail['violations'];
    if (!Array.isArray(violations)) continue;
    for (const violation of violations) {
      if (typeof violation !== 'object' || violation === null) continue;
      const record = violation as Record<string, unknown>;
      for (const key of ['quotaId', 'quotaMetric', 'subject', 'description']) {
        const value = record[key];
        if (typeof value === 'string') tokens.push(value.toLowerCase());
      }
    }
  }
  return tokens;
}

/**
 * Classifies a `RESOURCE_EXHAUSTED` response.
 *
 * Order of evidence, strongest first:
 *   1. `QuotaFailure.quotaId` / `quotaMetric` — the vendor naming its own limit.
 *   2. `RetryInfo.retryDelay` — a delay the vendor is willing to quote is a delay worth
 *      waiting; nobody quotes "come back in 14 hours".
 *   3. The message prose — last, because the free tier reuses the billing sentence for a
 *      per-minute limit.
 */
export function classifyQuota(input: {
  envelope?: GoogleErrorEnvelope | undefined;
  message?: string | undefined;
  retryAfterMs?: number | undefined;
}): QuotaPeriod {
  const tokens = quotaViolationTokens(input.envelope);
  if (tokens.some((token) => DAILY_TOKENS.some((needle) => token.includes(needle)))) return 'daily';
  if (tokens.some((token) => THROTTLE_TOKENS.some((needle) => token.includes(needle)))) {
    return 'throttle';
  }

  if (input.retryAfterMs !== undefined && input.retryAfterMs > 0) {
    return input.retryAfterMs <= THROTTLE_RETRY_CEILING_MS ? 'throttle' : 'daily';
  }

  const message = (input.message ?? '').toLowerCase();
  if (BILLING_TOKENS.some((needle) => message.includes(needle))) return 'billing';
  if (DAILY_TOKENS.some((needle) => message.includes(needle))) return 'daily';
  if (THROTTLE_TOKENS.some((needle) => message.includes(needle))) return 'throttle';

  return 'unknown';
}

/**
 * `RetryInfo.retryDelay` out of the error details. Google writes `"23s"` / `"1.5s"`.
 * Absent ⇒ the router picks its own exponential backoff.
 */
export function retryAfterMsFromEnvelope(envelope: GoogleErrorEnvelope): number | undefined {
  for (const detail of envelope.error?.details ?? []) {
    if (!String(detail['@type'] ?? '').endsWith('RetryInfo')) continue;
    const delay = detail['retryDelay'];
    if (typeof delay === 'string') {
      const seconds = Number.parseFloat(delay.replace(/s$/u, ''));
      if (Number.isFinite(seconds)) return Math.round(seconds * 1000);
    }
  }
  return undefined;
}

/** Header form of the same thing, for proxies that surface it there instead. */
export function retryAfterMsFromHeader(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const seconds = Number.parseFloat(value);
  if (Number.isFinite(seconds)) return Math.round(seconds * 1000);
  const date = Date.parse(value);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return undefined;
}
