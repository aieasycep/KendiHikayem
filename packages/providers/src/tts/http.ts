/**
 * tts/http.ts — the seam between "our code" and "the vendor's network".
 *
 * The voice vendors are unreachable from this environment and no key exists, so the real
 * adapters are written against this interface rather than against `fetch` directly. That
 * single indirection is what lets `elevenlabs.test.ts` replay RECORDED responses — status
 * codes, headers, JSON bodies, the alignment payload — and assert that request building,
 * response parsing, retry classification, error mapping and cost metering are all correct
 * before anyone has a key.
 *
 * On the day the key arrives, `fetchTransport` is the only implementation used and nothing
 * else changes.
 */

/** A vendor request, fully built and ready to send. Bodies are bytes or JSON, never both. */
export interface HttpRequest {
  method: 'GET' | 'POST' | 'DELETE' | 'PATCH';
  url: string;
  headers: Record<string, string>;
  /** JSON body; serialised by the transport so tests can assert on the object. */
  json?: unknown;
  /** Multipart body — voice cloning uploads audio files. */
  form?: FormPart[];
  timeoutMs: number;
  signal?: AbortSignal;
}

export type FormPart =
  | { kind: 'field'; name: string; value: string }
  | { kind: 'file'; name: string; filename: string; contentType: string; bytes: Uint8Array };

export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  bytes: Uint8Array;
}

export type HttpTransport = (request: HttpRequest) => Promise<HttpResponse>;

export class HttpTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`request timed out after ${timeoutMs}ms`);
    this.name = 'HttpTimeoutError';
  }
}

export class HttpNetworkError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'HttpNetworkError';
  }
}

/**
 * The production transport. Two behaviours worth naming:
 *
 *  · The timeout is OURS, not the vendor's. A hung TLS connection with no client deadline
 *    parks a BullMQ worker slot forever, and the queue silently loses a quarter of its
 *    throughput per stuck job.
 *  · Network failures are wrapped, never leaked. The router classifies `ProviderError`s;
 *    a raw `TypeError: fetch failed` would fall through as non-retryable.
 */
export const fetchTransport: HttpTransport = async (request) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), request.timeoutMs);
  const abortUpstream = () => controller.abort();
  request.signal?.addEventListener('abort', abortUpstream);

  try {
    const init: RequestInit = {
      method: request.method,
      headers: { ...request.headers },
      signal: controller.signal,
    };

    if (request.form) {
      init.body = buildFormData(request.form);
      // Explicitly NOT setting Content-Type: fetch must append the multipart boundary.
    } else if (request.json !== undefined) {
      init.body = JSON.stringify(request.json);
      init.headers = { ...request.headers, 'content-type': 'application/json' };
    }

    const response = await fetch(request.url, init);
    const buffer = await response.arrayBuffer();
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    return { status: response.status, headers, bytes: new Uint8Array(buffer) };
  } catch (error) {
    if (controller.signal.aborted && request.signal?.aborted !== true) {
      throw new HttpTimeoutError(request.timeoutMs);
    }
    throw new HttpNetworkError(error instanceof Error ? error.message : String(error), {
      cause: error,
    });
  } finally {
    clearTimeout(timer);
    request.signal?.removeEventListener('abort', abortUpstream);
  }
};

function buildFormData(parts: readonly FormPart[]): FormData {
  const form = new FormData();
  for (const part of parts) {
    if (part.kind === 'field') {
      form.append(part.name, part.value);
    } else {
      form.append(part.name, new Blob([part.bytes], { type: part.contentType }), part.filename);
    }
  }
  return form;
}

/* ── Response helpers ──────────────────────────────────────────────────────── */

export function decodeText(response: HttpResponse): string {
  return new TextDecoder().decode(response.bytes);
}

/** Parses a JSON body, returning undefined rather than throwing on malformed vendor output. */
export function decodeJson<T>(response: HttpResponse): T | undefined {
  const text = decodeText(response).trim();
  if (text.length === 0) return undefined;
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
}

/**
 * `Retry-After` in ms. Accepts both spellings the RFC allows — a delay in seconds and an
 * HTTP date — because vendors use both and treating "Wed, 21 Oct 2026 07:28:00 GMT" as the
 * number 0 turns a polite backoff into a hot retry loop.
 */
export function retryAfterMs(headers: Record<string, string>): number | undefined {
  const raw = headers['retry-after'];
  if (raw === undefined) return undefined;

  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.max(0, Math.round(seconds * 1000));

  const date = Date.parse(raw);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return undefined;
}
