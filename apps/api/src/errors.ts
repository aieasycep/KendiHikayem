/**
 * errors.ts — one error shape, produced in one place.
 *
 * CONTRACT RULE 1 (packages/contract/src/primitives.ts): every 4xx/5xx response is EXACTLY
 * `ApiError`. There is no second error body anywhere in this service. `messageTr` is the
 * Turkish text shown to the parent verbatim and always comes from `ERROR_CATALOG` — a
 * handler that writes its own user-facing string has invented an eleventh error message
 * nobody translated or reviewed.
 */

import {
  type ApiError,
  type ErrorCode,
  ERROR_CATALOG,
  apiErrorFrom,
  httpStatusFor,
} from '@kendihikayem/contract';

export interface ErrorOptions {
  /** English, technical. Logged and returned in `detail`; never rendered in the UI. */
  detail?: string;
  field?: string;
  retryAfterSec?: number;
  retryable?: boolean;
}

/** Builds the body. `traceId` ties a support ticket to the provider call that failed. */
export function buildApiError(
  code: ErrorCode,
  traceId: string,
  options: ErrorOptions = {},
): ApiError {
  return apiErrorFrom(code, {
    traceId,
    ...(options.detail !== undefined ? { detail: options.detail } : {}),
    ...(options.field !== undefined ? { field: options.field } : {}),
    ...(options.retryAfterSec !== undefined ? { retryAfterSec: options.retryAfterSec } : {}),
    ...(options.retryable !== undefined ? { retryable: options.retryable } : {}),
  });
}

/**
 * Thrown anywhere in a handler; the Fastify error handler turns it into the single error
 * shape. Handlers that can return a typed error response should prefer doing so — this is
 * for the paths where throwing is the honest control flow (middleware, guards).
 */
export class HttpError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly options: ErrorOptions;

  constructor(code: ErrorCode, options: ErrorOptions = {}) {
    super(options.detail ?? ERROR_CATALOG[code].messageTr);
    this.name = 'HttpError';
    this.code = code;
    this.status = httpStatusFor(code);
    this.options = options;
  }

  toBody(traceId: string): ApiError {
    return buildApiError(this.code, traceId, this.options);
  }
}

export const unauthenticated = (detail?: string) =>
  new HttpError('UNAUTHENTICATED', detail !== undefined ? { detail } : {});
export const forbidden = (detail?: string) =>
  new HttpError('FORBIDDEN', detail !== undefined ? { detail } : {});
export const notFound = (detail?: string) =>
  new HttpError('NOT_FOUND', detail !== undefined ? { detail } : {});
