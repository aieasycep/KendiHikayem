/**
 * image/gemini/errors.ts — vendor failure → `ProviderError`.
 *
 * The router decides retry / failover / open-circuit purely from `ProviderError.kind`, so
 * this mapping IS the retry policy. Two mistakes to avoid, both expensive:
 *
 *   · calling an auth failure retryable — three attempts × thirteen pages of "401" is
 *     forty seconds of latency and a book that fails anyway;
 *   · calling a 429 fatal — the vendor is telling us exactly when to come back, and
 *     `RetryInfo.retryDelay` is a better backoff than any exponential we invent.
 */

import { ProviderError, type ProviderErrorKind } from '../../core/errors';
import type { ProviderName, ProviderOperation } from '../../core/types';
import { retryAfterMsFromEnvelope, retryAfterMsFromHeader, type GeminiErrorEnvelope } from './protocol';

/**
 * Google's canonical `status` strings are more precise than the HTTP code — a 429 is
 * RESOURCE_EXHAUSTED whether it is a per-minute throttle (retry) or a spent billing quota
 * (do not hammer), and only the message distinguishes them.
 */
const KIND_BY_STATUS: Record<string, ProviderErrorKind> = {
  INVALID_ARGUMENT: 'invalid_request',
  FAILED_PRECONDITION: 'invalid_request',
  OUT_OF_RANGE: 'invalid_request',
  UNAUTHENTICATED: 'auth',
  PERMISSION_DENIED: 'auth',
  NOT_FOUND: 'not_found',
  RESOURCE_EXHAUSTED: 'rate_limited',
  ABORTED: 'unavailable',
  INTERNAL: 'unavailable',
  UNAVAILABLE: 'unavailable',
  DEADLINE_EXCEEDED: 'timeout',
  CANCELLED: 'timeout',
  UNKNOWN: 'unknown',
};

const KIND_BY_HTTP_STATUS = (status: number): ProviderErrorKind => {
  if (status === 400) return 'invalid_request';
  if (status === 401 || status === 403) return 'auth';
  if (status === 404) return 'not_found';
  if (status === 408) return 'timeout';
  if (status === 429) return 'rate_limited';
  if (status === 499) return 'timeout';
  if (status === 503) return 'unavailable';
  if (status === 504) return 'timeout';
  if (status >= 500) return 'unavailable';
  return 'unknown';
};

/**
 * A spent billing quota looks exactly like a rate limit at the HTTP layer, and the
 * difference decides whether retrying is polite or pointless. The vendor only says so in
 * the message text, so that is where we look.
 */
const QUOTA_EXHAUSTED_HINTS: readonly string[] = [
  'billing',
  'quota exceeded for quota metric',
  'exceeded your current quota',
  'free tier',
  'daily limit',
  'per day',
];

export interface MapImageErrorInput {
  provider: ProviderName;
  operation: ProviderOperation;
  httpStatus: number;
  /** Parsed JSON body, when the response had one. */
  envelope?: GeminiErrorEnvelope;
  /** Raw body text, for the cases where the vendor returned HTML from a proxy. */
  rawBody?: string;
  retryAfterHeader?: string | null;
}

export function mapGeminiHttpError(input: MapImageErrorInput): ProviderError {
  const status = input.envelope?.error?.status;
  const message = input.envelope?.error?.message ?? input.rawBody ?? '';

  let kind: ProviderErrorKind =
    (status ? KIND_BY_STATUS[status] : undefined) ?? KIND_BY_HTTP_STATUS(input.httpStatus);

  if (kind === 'rate_limited') {
    const lowered = message.toLowerCase();
    if (QUOTA_EXHAUSTED_HINTS.some((hint) => lowered.includes(hint))) {
      // Not retryable on this provider: the router should fail over instead of waiting
      // out a limit that resets tomorrow.
      kind = 'quota_exhausted';
    }
  }

  const retryAfterMs =
    (input.envelope ? retryAfterMsFromEnvelope(input.envelope) : undefined) ??
    retryAfterMsFromHeader(input.retryAfterHeader ?? null);

  return new ProviderError({
    kind,
    provider: input.provider,
    operation: input.operation,
    detail: truncate(message || `HTTP ${input.httpStatus}`, 400),
    httpStatus: input.httpStatus,
    ...(status ? { providerCode: status } : {}),
    ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
  });
}

/** Transport-level failure: DNS, TLS, connection reset, or our own abort. */
export function mapGeminiTransportError(
  error: unknown,
  context: { provider: ProviderName; operation: ProviderOperation; timedOut: boolean },
): ProviderError {
  if (context.timedOut) {
    return new ProviderError({
      kind: 'timeout',
      provider: context.provider,
      operation: context.operation,
      detail: 'image request exceeded IMAGE_REQUEST_TIMEOUT_MS',
      cause: error,
    });
  }
  return ProviderError.from(error, {
    provider: context.provider,
    operation: context.operation,
    kind: 'unavailable',
  });
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max)}…`;
}
