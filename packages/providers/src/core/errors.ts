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

/**
 * Kind → the Turkish sentence a parent may be shown.
 *
 * `apiErrorCode` already resolves to an `ERROR_CATALOG` message, but that catalog is frozen
 * and speaks in transport terms ("üretim servisimize ulaşılamıyor"). A free-tier quota is a
 * different situation with a different instruction ("yarın tekrar deneyin"), and a parent
 * who is told the servers are down when the truth is "today's free allowance is spent" will
 * retry uselessly for an hour. These are the DEFAULTS; an adapter that knows more — which
 * limit fired, when it resets — passes a better sentence as `userMessageTr`.
 *
 * Rules for anything added here: no vendor names, no English, no numbers the parent cannot
 * act on, and always an instruction ("biraz sonra deneyin", not "kota aşıldı").
 */
const USER_MESSAGE_TR_BY_KIND: Record<ProviderErrorKind, string> = {
  rate_limited:
    'Şu anda çok yoğunuz. Birkaç saniye içinde kendiliğinden yeniden deneyeceğiz, ekranı kapatmanıza gerek yok.',
  timeout:
    'Üretim beklediğimizden uzun sürdü. İşiniz kuyrukta duruyor, tekrar deniyoruz.',
  unavailable:
    'Üretim servisimize şu an ulaşılamıyor. İşiniz kuyrukta duruyor, hazır olunca bildirim göndereceğiz.',
  auth: 'Servis ayarlarımızda bir sorun var ve ekibimize bildirildi. Krediniz harcanmadı.',
  invalid_request:
    'Beklenmedik bir sorun oldu ve ekibimize bildirildi. Birkaç dakika sonra tekrar deneyin.',
  content_blocked:
    'Bu içerik güvenlik süzgecimize takıldı. Konuyu biraz değiştirip tekrar deneyebilirsiniz.',
  quota_exhausted:
    'Üretim kotamız şimdilik doldu. Krediniz harcanmadı; biraz sonra tekrar deneyin.',
  slot_exhausted:
    'Ses profilleri için ayrılan yer doldu. Otomatik olarak yer açıp tekrar deneyeceğiz.',
  not_found: 'Aradığınız içerik bulunamadı. Kitaplığınıza dönüp tekrar deneyin.',
  unknown: 'Beklenmedik bir sorun oldu ve ekibimize bildirildi. Birkaç dakika sonra tekrar deneyin.',
};

export interface ProviderErrorInit {
  kind: ProviderErrorKind;
  provider: ProviderName;
  operation: ProviderOperation;
  /** Technical, English, never shown to a parent. */
  detail?: string;
  /**
   * Turkish, parent-facing, shown VERBATIM (`JobError.userMessageTr` in packages/db).
   * Omitted ⇒ the per-kind default above. Never put a vendor name or a raw API string here.
   */
  userMessageTr?: string;
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
  /** Always populated: a parent must never be shown an English vendor string. */
  readonly userMessageTr: string;

  constructor(init: ProviderErrorInit) {
    super(init.detail ?? `${init.provider}:${init.operation} failed (${init.kind})`);
    this.name = 'ProviderError';
    this.userMessageTr = init.userMessageTr ?? USER_MESSAGE_TR_BY_KIND[init.kind];
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

  /**
   * Structured form for `jobs.error` / `job_steps.error` (JobError in schema/types.ts).
   *
   * `userMessageTr` is part of the row on purpose: `JobError.userMessageTr` is documented as
   * "shown verbatim", and it is the only channel through which a failure that never reaches
   * an HTTP handler — a background render that dies four minutes after the parent closed the
   * app — can still explain itself in Turkish instead of as `PROVIDER_UNAVAILABLE`.
   */
  toJobError(): {
    code: string;
    provider: string;
    retryable: boolean;
    kind: ProviderErrorKind;
    userMessageTr: string;
    detail?: string;
  } {
    return {
      code: this.apiErrorCode,
      provider: this.provider,
      retryable: this.retryable,
      kind: this.kind,
      userMessageTr: this.userMessageTr,
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
