/**
 * core/errors.ts — the typed provider failure.
 *
 * Every adapter throws `ProviderError`, never a raw SDK error. Two consumers depend on it:
 *
 *   · `ProviderRouter` / `CircuitBreaker` read `retryable` and `kind` to decide between
 *     retry, failover and open-circuit.
 *   · `apps/api` maps it to a contract `ErrorCode` so the parent sees one of the Turkish
 *     messages from `ERROR_CATALOG` — never a vendor string.
 */

import type { ErrorCode } from '@kendihikayem/contract';

import type { ProviderName, ProviderOperation } from './types';

export type ProviderErrorKind =
  /** 429 / provider-side throttle. Retry after `retryAfterMs`, same provider. */
  | 'rate_limited'
  /** Wall-clock timeout on our side. */
  | 'timeout'
  /** 5xx, connection reset, DNS. Failover candidate. */
  | 'unavailable'
  /** Bad or missing credentials. NOT retryable — retrying burns latency for nothing. */
  | 'auth'
  /** We sent something the provider rejected. A retry with the same input cannot help. */
  | 'invalid_request'
  /** Provider safety filter fired. Feeds SPEC §10.4 layer 5 (`provider_block`). */
  | 'content_blocked'
  /** Account-level quota/credit exhausted at the vendor. */
  | 'quota_exhausted'
  /** ElevenLabs voice slot ceiling (SPEC §7 step 8) — triggers LRU eviction, then retry. */
  | 'slot_exhausted'
  | 'not_found'
  | 'unknown';

const RETRYABLE_KINDS: ReadonlySet<ProviderErrorKind> = new Set<ProviderErrorKind>([
  'rate_limited',
  'timeout',
  'unavailable',
  'slot_exhausted',
]);

/**
 * Kind → contract error code. The API layer never invents a code; a new provider failure
 * mode must be mapped here or it surfaces as `PROVIDER_UNAVAILABLE`, which is the honest
 * default ("we could not produce it, your job is still queued").
 */
const CODE_BY_KIND: Record<ProviderErrorKind, ErrorCode> = {
  rate_limited: 'RATE_LIMITED',
  timeout: 'PROVIDER_UNAVAILABLE',
  unavailable: 'PROVIDER_UNAVAILABLE',
  auth: 'INTERNAL',
  invalid_request: 'INTERNAL',
  content_blocked: 'MODERATION_BLOCKED',
  quota_exhausted: 'PROVIDER_UNAVAILABLE',
  slot_exhausted: 'VOICE_SLOT_EXHAUSTED',
  not_found: 'NOT_FOUND',
  unknown: 'PROVIDER_UNAVAILABLE',
};

export interface ProviderErrorInit {
  kind: ProviderErrorKind;
  provider: ProviderName;
  operation: ProviderOperation;
  /** Technical, English, never shown to a parent. */
  detail?: string;
  /** Raw vendor code, kept for support tickets. */
  providerCode?: string;
  httpStatus?: number;
  retryAfterMs?: number;
  /** Overrides the default derived from `kind`. */
  retryable?: boolean;
  cause?: unknown;
}

export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;
  readonly provider: ProviderName;
  readonly operation: ProviderOperation;
  readonly retryable: boolean;
  readonly retryAfterMs: number | undefined;
  readonly httpStatus: number | undefined;
  readonly providerCode: string | undefined;
  readonly detail: string | undefined;

  constructor(init: ProviderErrorInit) {
    super(init.detail ?? `${init.provider}:${init.operation} failed (${init.kind})`);
    this.name = 'ProviderError';
    this.kind = init.kind;
    this.provider = init.provider;
    this.operation = init.operation;
    this.retryable = init.retryable ?? RETRYABLE_KINDS.has(init.kind);
    this.retryAfterMs = init.retryAfterMs;
    this.httpStatus = init.httpStatus;
    this.providerCode = init.providerCode;
    this.detail = init.detail;
    if (init.cause !== undefined) this.cause = init.cause;
  }

  /** The contract code the API returns for this failure. */
  get apiErrorCode(): ErrorCode {
    return CODE_BY_KIND[this.kind];
  }

  /** Structured form for `jobs.error` / `job_steps.error` (JobError in schema/types.ts). */
  toJobError(): {
    code: string;
    provider: string;
    retryable: boolean;
    kind: ProviderErrorKind;
    detail?: string;
  } {
    return {
      code: this.apiErrorCode,
      provider: this.provider,
      retryable: this.retryable,
      kind: this.kind,
      ...(this.detail ? { detail: this.detail } : {}),
    };
  }

  static is(value: unknown): value is ProviderError {
    return value instanceof ProviderError;
  }

  /** Wraps anything thrown by an SDK so the router never sees a foreign error shape. */
  static from(
    error: unknown,
    fallback: Omit<ProviderErrorInit, 'kind' | 'detail'> & { kind?: ProviderErrorKind },
  ): ProviderError {
    if (ProviderError.is(error)) return error;
    const detail = error instanceof Error ? error.message : String(error);
    return new ProviderError({
      kind: fallback.kind ?? 'unknown',
      provider: fallback.provider,
      operation: fallback.operation,
      detail,
      cause: error,
      ...(fallback.httpStatus !== undefined ? { httpStatus: fallback.httpStatus } : {}),
      ...(fallback.retryable !== undefined ? { retryable: fallback.retryable } : {}),
    });
  }
}

/** Thrown when every provider in a route has been exhausted. */
export class AllProvidersFailedError extends Error {
  readonly attempts: readonly ProviderError[];

  constructor(operation: ProviderOperation, attempts: readonly ProviderError[]) {
    super(
      `all providers failed for ${operation}: ` +
        attempts.map((a) => `${a.provider}(${a.kind})`).join(' → '),
    );
    this.name = 'AllProvidersFailedError';
    this.attempts = attempts;
  }

  /** The failure the caller should report: the last one, which is the fallback's. */
  get last(): ProviderError | undefined {
    return this.attempts[this.attempts.length - 1];
  }
}
