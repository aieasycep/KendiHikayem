/**
 * llm/http.ts — the one place an LLM vendor is actually spoken to over the wire.
 *
 * No SDK. Three reasons, in order of weight:
 *
 *   1. `eslint.config.mjs` allows vendor SDKs only inside this package, but an SDK we
 *      cannot install (this environment has no egress to the registry mirrors that carry
 *      them) is an adapter we cannot compile. `fetch` is in the platform.
 *   2. Every SDK hides retry, timeout and idempotency behaviour that `ProviderRouter`
 *      already owns. Two retry loops stacked on top of each other is how a rate limit
 *      becomes an outage.
 *   3. A `fetch` seam is trivially replaceable in tests, which is the only way this code
 *      gets exercised at all before a key exists (see llm/*.test.ts, which replay recorded
 *      vendor responses).
 *
 * Everything here throws `ProviderError` — the router and the circuit breaker never see a
 * `TypeError: fetch failed`.
 */

import { ProviderError, type ProviderErrorKind } from '../core/errors';
import type { ProviderName, ProviderOperation } from '../core/types';

/** The subset of `fetch` this package uses. Tests pass a function, not a server. */
export type FetchLike = (
  input: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal?: AbortSignal;
  },
) => Promise<HttpResponseLike>;

export interface HttpResponseLike {
  readonly status: number;
  readonly ok: boolean;
  readonly headers: { get(name: string): string | null };
  text(): Promise<string>;
}

export interface JsonRequest {
  url: string;
  headers: Record<string, string>;
  body: unknown;
  provider: ProviderName;
  operation: ProviderOperation;
  timeoutMs: number;
  /** Caller's cancellation (job cancelled, worker shutting down). */
  signal?: AbortSignal;
  fetchImpl: FetchLike;
}

export interface JsonResponse {
  status: number;
  /** Parsed JSON body. Callers validate it with zod; nothing here trusts the shape. */
  body: unknown;
  /** Vendor request id when present — the only thing a support ticket can be opened with. */
  requestId: string | undefined;
  latencyMs: number;
}

/**
 * POSTs JSON and returns the parsed body, or throws a mapped `ProviderError`.
 *
 * The timeout is OURS, not the vendor's: a socket that never closes is indistinguishable
 * from a model that is thinking, and a stage-2 job that hangs forever holds a cost
 * reservation open until the reconcile scheduler cleans it up 30 minutes later.
 */
export async function postJson(request: JsonRequest): Promise<JsonResponse> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new TimeoutAbort()), request.timeoutMs);
  const onCallerAbort = () => controller.abort(request.signal?.reason);
  request.signal?.addEventListener('abort', onCallerAbort, { once: true });

  let response: HttpResponseLike;
  try {
    response = await request.fetchImpl(request.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...request.headers },
      body: JSON.stringify(request.body),
      signal: controller.signal,
    });
  } catch (error) {
    throw transportError(error, request);
  } finally {
    clearTimeout(timer);
    request.signal?.removeEventListener('abort', onCallerAbort);
  }

  const latencyMs = Date.now() - startedAt;
  const raw = await response.text();
  const body = parseJsonBody(raw);

  if (!response.ok) {
    throw httpError({ request, status: response.status, body, raw, response });
  }

  return {
    status: response.status,
    body,
    requestId: response.headers.get('request-id') ?? response.headers.get('x-request-id') ?? undefined,
    latencyMs,
  };
}

class TimeoutAbort extends Error {
  constructor() {
    super('kendihikayem: request timeout');
    this.name = 'TimeoutAbort';
  }
}

function parseJsonBody(raw: string): unknown {
  if (raw.trim() === '') return {};
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    // A vendor 502 from an edge proxy is HTML, not JSON. Keep the text for the log.
    return { __unparsed: raw.slice(0, 500) };
  }
}

function transportError(error: unknown, request: JsonRequest): ProviderError {
  const isTimeout =
    error instanceof TimeoutAbort ||
    (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError'));

  return new ProviderError({
    kind: isTimeout ? 'timeout' : 'unavailable',
    provider: request.provider,
    operation: request.operation,
    detail:
      isTimeout
        ? `no response within ${request.timeoutMs}ms`
        : error instanceof Error
          ? error.message
          : String(error),
    cause: error,
  });
}

/**
 * HTTP status → `ProviderErrorKind`.
 *
 * The mapping is what decides retry vs failover vs give up, so it is deliberate rather
 * than "anything 4xx is fatal":
 *   401/403 → auth        never retried here, but WORTH failing over (a second vendor has
 *                         its own key, and a rotated key is exactly this failure)
 *   429     → rate_limited honour `retry-after`; the router backs off on the same provider
 *   400/422 → invalid_request  the same body fails identically everywhere → stop the route
 *   529/503 → unavailable overload; retry then fail over
 */
export function httpErrorKind(status: number, vendorType: string | undefined): ProviderErrorKind {
  if (status === 401 || status === 403) return 'auth';
  if (status === 404) return 'not_found';
  if (status === 429) {
    // Anthropic and OpenAI both use 429 for "you are out of credit"; that is not a
    // throttle and retrying it burns latency for a guaranteed no.
    return vendorType === 'insufficient_quota' || vendorType === 'billing_hard_limit_reached'
      ? 'quota_exhausted'
      : 'rate_limited';
  }
  if (status === 400 || status === 413 || status === 422) return 'invalid_request';
  if (status >= 500) return 'unavailable';
  return 'unknown';
}

interface HttpErrorInput {
  request: JsonRequest;
  status: number;
  body: unknown;
  raw: string;
  response: HttpResponseLike;
}

function httpError(input: HttpErrorInput): ProviderError {
  const vendor = readVendorError(input.body);
  const kind = httpErrorKind(input.status, vendor.type);

  return new ProviderError({
    kind,
    provider: input.request.provider,
    operation: input.request.operation,
    httpStatus: input.status,
    detail: vendor.message ?? input.raw.slice(0, 300),
    ...(vendor.type ? { providerCode: vendor.type } : {}),
    ...(retryAfterMs(input.response) !== undefined
      ? { retryAfterMs: retryAfterMs(input.response) }
      : {}),
  });
}

/** `{ error: { type, message } }` on Anthropic and OpenAI alike. */
function readVendorError(body: unknown): { type?: string; message?: string } {
  if (typeof body !== 'object' || body === null) return {};
  const error = (body as { error?: unknown }).error;
  if (typeof error !== 'object' || error === null) return {};
  const record = error as { type?: unknown; message?: unknown; code?: unknown };
  return {
    ...(typeof record.type === 'string'
      ? { type: record.type }
      : typeof record.code === 'string'
        ? { type: record.code }
        : {}),
    ...(typeof record.message === 'string' ? { message: record.message } : {}),
  };
}

/** `retry-after` is seconds (both vendors). Missing header ⇒ let the router pick a backoff. */
export function retryAfterMs(response: HttpResponseLike): number | undefined {
  const header = response.headers.get('retry-after');
  if (header === null) return undefined;
  const seconds = Number.parseFloat(header);
  if (Number.isFinite(seconds)) return Math.max(0, Math.round(seconds * 1000));
  const date = Date.parse(header);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

/** `globalThis.fetch`, narrowed to `FetchLike`. Present on Node 22. */
export function defaultFetch(): FetchLike {
  const impl = globalThis.fetch;
  if (typeof impl !== 'function') {
    throw new Error('global fetch is unavailable; pass fetchImpl explicitly');
  }
  return impl as unknown as FetchLike;
}
