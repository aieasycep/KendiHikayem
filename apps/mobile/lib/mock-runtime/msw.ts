/**
 * MSW's stand-in on React Native — the mock carrier, nothing more.
 *
 * WHY THIS FILE EXISTS
 * `@kendihikayem/mock` is written against MSW, and MSW is the right tool on
 * Node (apps/api, vitest) and in the browser. On React Native it is not:
 * `expo export:embed` had to drag ~500 extra modules into the Hermes bundle to
 * satisfy `import ... from 'msw'` — the whole of `graphql`, `tough-cookie`,
 * `@mswjs/interceptors` in BOTH its browser and its Node build — none of which
 * has any business running on a phone. Metro also warned on every build that
 * `msw/native` and the three `@mswjs/interceptors/*` sub-packages declare
 * invalid `exports` (targets containing "..") and had to fall back to
 * file-based resolution, i.e. Metro was guessing which build to hand Hermes.
 *
 * Guessing is not a foundation for the one thing that must work: the app
 * opening. So on React Native — and ONLY on React Native — Metro resolves the
 * `msw` and `msw/native` specifiers to this file instead
 * (see apps/mobile/metro.config.js).
 *
 * WHAT IT DELIBERATELY IS NOT
 * This is not an MSW reimplementation. It is the exact slice of MSW's surface
 * that `packages/mock` touches, and no more:
 *
 *   delay(ms)                       — sleep
 *   http.{get,post,put,patch,delete,all}(path, resolver)
 *   HttpResponse.json(body, init)
 *   setupServer(...handlers).listen()
 *
 * Everything that makes the mock *the mock* — the 82 endpoint resolvers, the
 * Turkish fixtures, the scenario engine, the job simulation, and the shared
 * policy layer (latency, header checks, idempotent replay) — stays in
 * `packages/mock` and runs here byte for byte unchanged. Only the carrier is
 * swapped. Node and browser consumers keep using real MSW.
 *
 * If `packages/mock` ever starts using an MSW API that is not below, the app
 * will fail loudly at startup with a TypeError naming it — which is the point.
 */

/* ── Types (structural mirrors of MSW's, only what is used) ─────────────── */

export type DefaultBodyType = Record<string, unknown> | string | number | boolean | null;

export type PathParams = Record<string, string | readonly string[]>;

export interface ResolverInfo {
  request: Request;
  params: PathParams;
}

export type HttpResponseResolver<
  _Params = PathParams,
  _RequestBody = DefaultBodyType,
  _ResponseBody = DefaultBodyType,
> = (info: ResolverInfo) => Response | undefined | Promise<Response | undefined>;

export interface RequestHandler {
  /** Uppercase HTTP verb, or 'ALL' for `http.all`. */
  readonly method: string;
  /** The MSW-style pattern this handler was registered with. */
  readonly pattern: string;
  run(request: Request, pathname: string): Promise<Response | undefined>;
}

/* ── delay ──────────────────────────────────────────────────────────────── */

/** MSW's `delay`. `packages/mock` always passes an explicit millisecond count. */
export function delay(ms = 0): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, ms));
  });
}

/* ── HttpResponse ───────────────────────────────────────────────────────── */

/**
 * Only `.json()` is used. Built with `new Response(string)` rather than the
 * static `Response.json()` because React Native's fetch polyfill does not ship
 * that static on every version, and a missing static here would crash the app
 * on the very first request.
 */
export const HttpResponse = {
  json(body: unknown, init?: ResponseInit): Response {
    const headers = new Headers(init?.headers);
    if (!headers.has('content-type')) {
      headers.set('content-type', 'application/json');
    }
    return new Response(JSON.stringify(body), { ...init, headers });
  },
};

/* ── Path matching ──────────────────────────────────────────────────────── */

/**
 * `packages/mock` registers every path as a `*` wildcard followed by the
 * contract path, e.g. `<star>/v1/jobs/:jobId`. In MSW that leading wildcard
 * means "any origin". We reproduce it by matching the pattern against the TAIL
 * of the request pathname, so a base URL carrying a path prefix keeps working.
 *
 * Segment counts must match exactly, which is what keeps `/v1/me` from
 * swallowing `/v1/me/reading-preferences`.
 */
function splitSegments(value: string): string[] {
  return value.split('/').filter((segment) => segment.length > 0);
}

function matchPath(
  patternSegments: readonly string[],
  pathname: string,
): PathParams | undefined {
  const actual = splitSegments(pathname);
  if (actual.length < patternSegments.length) return undefined;

  // Align on the tail — the pattern's `*` prefix absorbs anything before it.
  const offset = actual.length - patternSegments.length;
  const params: Record<string, string> = {};

  for (let i = 0; i < patternSegments.length; i += 1) {
    const expected = patternSegments[i] as string;
    const received = actual[offset + i] as string;
    if (expected.startsWith(':')) {
      params[expected.slice(1)] = decodeURIComponent(received);
      continue;
    }
    if (expected !== received) return undefined;
  }

  return params;
}

function createHandler(
  method: string,
  pattern: string,
  resolver: HttpResponseResolver,
): RequestHandler {
  const patternSegments = splitSegments(pattern.startsWith('*') ? pattern.slice(1) : pattern);

  return {
    method,
    pattern,
    async run(request, pathname) {
      if (method !== 'ALL' && request.method.toUpperCase() !== method) return undefined;
      const params = matchPath(patternSegments, pathname);
      if (params === undefined) return undefined;
      return (await resolver({ request, params })) ?? undefined;
    },
  };
}

type HandlerFactory = (pattern: string, resolver: HttpResponseResolver) => RequestHandler;

const method =
  (verb: string): HandlerFactory =>
  (pattern, resolver) =>
    createHandler(verb, pattern, resolver);

export const http = {
  get: method('GET'),
  post: method('POST'),
  put: method('PUT'),
  patch: method('PATCH'),
  delete: method('DELETE'),
  all: method('ALL'),
};

/* ── setupServer — the fetch interceptor ────────────────────────────────── */

export interface SetupServerApi {
  listen(options?: { onUnhandledRequest?: 'bypass' | 'warn' | 'error' }): void;
  close(): void;
  resetHandlers(...next: RequestHandler[]): void;
  use(...extra: RequestHandler[]): void;
}

type FetchFn = typeof fetch;

/**
 * Turns whatever `fetch` was called with into a Request we can read twice.
 *
 * Resolvers and the policy layer both call `request.clone()`, never the
 * original, so the body survives being inspected before it is used.
 */
function toRequest(input: RequestInfo | URL, init?: RequestInit): Request {
  if (typeof input === 'object' && input !== null && 'url' in input && 'method' in input) {
    return input as Request;
  }
  return new Request(String(input), init);
}

/**
 * MSW's `setupServer`, reduced to what the app needs: patch the global `fetch`,
 * try every handler in registration order, fall through to the real network on
 * a miss (`onUnhandledRequest: 'bypass'`).
 *
 * Only `fetch` is patched. The typed contract client (`@ts-rest/core`) speaks
 * `fetch` and nothing in the app may call `XMLHttpRequest` directly — see
 * apps/mobile/lib/api.ts — so patching XHR as MSW does would add a second way
 * to break startup and buy nothing.
 */
export function setupServer(...initialHandlers: RequestHandler[]): SetupServerApi {
  let handlers = [...initialHandlers];
  let originalFetch: FetchFn | undefined;

  return {
    listen() {
      if (originalFetch !== undefined) return;
      const previous = globalThis.fetch;
      originalFetch = previous;

      globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = toRequest(input, init);

        let pathname: string;
        try {
          pathname = new URL(request.url).pathname;
        } catch {
          // A relative or malformed URL is not ours to answer.
          return previous(input, init);
        }

        for (const handler of handlers) {
          const response = await handler.run(request, pathname);
          if (response !== undefined) return response;
        }

        return previous(input, init);
      };
    },

    close() {
      if (originalFetch === undefined) return;
      globalThis.fetch = originalFetch;
      originalFetch = undefined;
    },

    resetHandlers(...next: RequestHandler[]) {
      handlers = next.length > 0 ? [...next] : [...initialHandlers];
    },

    use(...extra: RequestHandler[]) {
      handlers = [...extra, ...handlers];
    },
  };
}
