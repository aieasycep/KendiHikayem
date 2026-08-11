/**
 * The single place the mobile app talks to the outside world.
 *
 * No screen may call `fetch` directly — everything goes through the typed ts-rest
 * client from `@kendihikayem/contract`. Flipping `EXPO_PUBLIC_API_MODE` between
 * `mock` and `live` swaps the entire data source at once:
 *
 *   mock → `@kendihikayem/mock`'s msw/native server intercepts every request in
 *          process; the APK works with no backend and no internet.
 *   live → requests go to `EXPO_PUBLIC_API_BASE_URL`.
 *
 * The client is rebuilt whenever the access token changes (guest → OTP-verified),
 * see `setAccessToken`. Screens obtain the current client with `api()` — never
 * cache the returned object across auth changes.
 */

import Constants from 'expo-constants';

import {
  API_BASE_URL_PROD,
  apiErrorFrom,
  apiErrorSchema,
  createApiClient,
  newIdempotencyKey,
  type ApiError,
} from '@kendihikayem/contract';

export type ApiMode = 'mock' | 'live';

interface ExtraConfig {
  apiMode?: string;
  apiBaseUrl?: string;
}

const extra = (Constants.expoConfig?.extra ?? {}) as ExtraConfig;

/** Build-time value from app.config.ts; falls back to mock so the app never hard-fails. */
export const API_MODE: ApiMode = extra.apiMode === 'live' ? 'live' : 'mock';
export const API_BASE_URL: string = extra.apiBaseUrl ?? 'http://10.0.2.2:3001';

export const isMockMode = (): boolean => API_MODE === 'mock';

/** Turkish label for the mode chip shown in Ayarlar — helps testers report bugs precisely. */
export const apiModeLabelTr = (): string =>
  API_MODE === 'mock' ? 'Demo veri (mock)' : `Canlı API — ${API_BASE_URL}`;

/**
 * In mock mode requests must still carry an absolute URL (React Native fetch
 * rejects relative ones); msw matches paths with a `*` prefix so any host works.
 * We use the production host so request logs read realistically.
 */
const CLIENT_VERSION = Constants.expoConfig?.version ?? '0.0.0';

function resolveBaseUrl(): string {
  return isMockMode() ? API_BASE_URL_PROD : API_BASE_URL;
}

export type Api = ReturnType<typeof createApiClient>;

let accessToken: string | undefined;
let client: Api = createApiClient({ baseUrl: resolveBaseUrl(), clientVersion: CLIENT_VERSION });

/** The current typed client. Do NOT store the result — the token may rotate. */
export function api(): Api {
  return client;
}

/** Called by lib/session.ts whenever the session token changes. */
export function setAccessToken(token: string | undefined): void {
  accessToken = token;
  client = createApiClient({
    baseUrl: resolveBaseUrl(),
    clientVersion: CLIENT_VERSION,
    ...(token !== undefined ? { accessToken: token } : {}),
  });
}

export function currentAccessToken(): string | undefined {
  return accessToken;
}

/** Re-export so screens import everything API-ish from one module. */
export { newIdempotencyKey };

/* ── Error helpers ──────────────────────────────────────────────────────────
 * Contract rule: every 4xx/5xx body is exactly `ApiError` and `messageTr` may be
 * shown to the user verbatim. These helpers normalise the two remaining cases —
 * a malformed body and a thrown network error — onto the same shape so screens
 * always have a Turkish sentence to show.
 * ─────────────────────────────────────────────────────────────────────────── */

/** Best-effort parse of an error response body into `ApiError`. */
export function asApiError(body: unknown): ApiError {
  const parsed = apiErrorSchema.safeParse(body);
  if (parsed.success) return parsed.data;
  return apiErrorFrom('INTERNAL');
}

/** For `catch` blocks: network failure, timeout, JSON parse crash… */
export function toApiError(error: unknown): ApiError {
  if (typeof error === 'object' && error !== null) {
    const parsed = apiErrorSchema.safeParse(error);
    if (parsed.success) return parsed.data;
  }
  return apiErrorFrom('PROVIDER_UNAVAILABLE', {
    messageTr:
      'Sunucuya ulaşılamadı. Bağlantınızı kontrol edin; işiniz kaybolmaz, tekrar deneyebilirsiniz.',
  });
}

/* Legacy DemoStory shims were removed once every screen moved to the contract
 * client (mock data now comes from @kendihikayem/mock through msw). */
