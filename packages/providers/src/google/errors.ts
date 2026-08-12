/**
 * google/errors.ts — one vendor failure → one `ProviderError`, for all three Google adapters.
 *
 * Text, illustration and narration now come from the same API family and fail in the same
 * shapes, so the mapping lives in one place: a fix to the free-tier 429 classification must
 * not have to be remembered three times.
 *
 * The mapping IS the retry policy — `ProviderRouter` decides retry / failover / open-circuit
 * from `kind` alone — and on a free tier the 429 branch is the one that matters. See
 * `quota.ts` for why a throttle and a spent daily allowance must not share a kind.
 */

import { ProviderError, type ProviderErrorKind } from '../core/errors';
import type { ProviderName, ProviderOperation } from '../core/types';
import {
  classifyQuota,
  retryAfterMsFromEnvelope,
  retryAfterMsFromHeader,
  type GoogleErrorEnvelope,
} from './quota';

export type { GoogleErrorEnvelope };

/**
 * Google's canonical `status` string is more precise than the HTTP code and is preferred
 * when present — except for `RESOURCE_EXHAUSTED`, which needs the quota classifier.
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

function kindByHttpStatus(status: number): ProviderErrorKind {
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
}

/**
 * The Turkish sentences a free-tier quota produces.
 *
 * A throttle and a daily allowance need DIFFERENT instructions — "birkaç saniye" versus
 * "yarın" — and a parent told the wrong one either gives up on something that was about to
 * work, or refreshes for an hour against a wall. Neither says "Google", "kota" as a raw
 * number, or anything the parent cannot act on.
 */
export const FREE_TIER_MESSAGE_TR = {
  throttle:
    'Şu anda çok fazla istek var. Birkaç saniye içinde kendiliğinden yeniden deneyeceğiz, ' +
    'ekranı kapatmanıza gerek yok.',
  daily:
    'Bugünkü ücretsiz üretim hakkımız doldu. Krediniz harcanmadı — yarın tekrar deneyin, ' +
    'hazır olduğunda bildirim göndereceğiz.',
  billing:
    'Üretim servisimizin hesabında bir sorun var ve ekibimize bildirildi. Krediniz ' +
    'harcanmadı; birazdan tekrar deneyin.',
} as const;

export interface MapGoogleErrorInput {
  provider: ProviderName;
  operation: ProviderOperation;
  httpStatus: number;
  /** Parsed JSON body, when the response had one. */
  envelope?: GoogleErrorEnvelope | undefined;
  /** Raw body text, for the cases where an edge proxy returned HTML. */
  rawBody?: string | undefined;
  retryAfterHeader?: string | null | undefined;
}

export function mapGoogleHttpError(input: MapGoogleErrorInput): ProviderError {
  const status = input.envelope?.error?.status;
  const message = input.envelope?.error?.message ?? input.rawBody ?? '';

  let kind: ProviderErrorKind =
    (status ? KIND_BY_STATUS[status] : undefined) ?? kindByHttpStatus(input.httpStatus);

  const retryAfterMs =
    (input.envelope ? retryAfterMsFromEnvelope(input.envelope) : undefined) ??
    retryAfterMsFromHeader(input.retryAfterHeader);

  let userMessageTr: string | undefined;

  if (kind === 'rate_limited') {
    const period = classifyQuota({ envelope: input.envelope, message, retryAfterMs });
    if (period === 'daily') {
      // Non-retryable on this provider: the router fails over (or stops) instead of
      // waiting out a limit that resets at midnight Pacific.
      kind = 'quota_exhausted';
      userMessageTr = FREE_TIER_MESSAGE_TR.daily;
    } else if (period === 'billing') {
      kind = 'quota_exhausted';
      userMessageTr = FREE_TIER_MESSAGE_TR.billing;
    } else {
      // 'throttle' and 'unknown' alike: waiting is cheap, giving up is not.
      userMessageTr = FREE_TIER_MESSAGE_TR.throttle;
    }
  }

  return new ProviderError({
    kind,
    provider: input.provider,
    operation: input.operation,
    detail: truncate(message || `HTTP ${input.httpStatus}`, 400),
    httpStatus: input.httpStatus,
    ...(userMessageTr ? { userMessageTr } : {}),
    ...(status ? { providerCode: status } : {}),
    ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
  });
}

/** Transport-level failure: DNS, TLS, connection reset, or our own abort. */
export function mapGoogleTransportError(
  error: unknown,
  context: {
    provider: ProviderName;
    operation: ProviderOperation;
    timedOut: boolean;
    /** Names the env var in the technical detail, so an operator knows which knob to turn. */
    timeoutVar?: string;
  },
): ProviderError {
  if (context.timedOut) {
    return new ProviderError({
      kind: 'timeout',
      provider: context.provider,
      operation: context.operation,
      detail: `request exceeded ${context.timeoutVar ?? 'the configured timeout'}`,
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
