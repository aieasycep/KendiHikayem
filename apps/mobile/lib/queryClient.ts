/**
 * Single React Query client for the app.
 *
 * Retry policy follows the contract's error taxonomy: an `ApiError` with
 * `retryable: false` (validation, consent, quota…) is NEVER retried — retrying a
 * 403 CONSENT_REQUIRED just burns time. Network-level failures retry twice.
 */

import { QueryClient } from '@tanstack/react-query';

import { apiErrorSchema } from '@kendihikayem/contract';

function isRetryable(error: unknown): boolean {
  const parsed = apiErrorSchema.safeParse(error);
  if (parsed.success) return parsed.data.retryable;
  return true;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error) => failureCount < 2 && isRetryable(error),
    },
    mutations: {
      retry: false,
    },
  },
});
