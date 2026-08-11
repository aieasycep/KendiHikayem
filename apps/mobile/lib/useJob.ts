/**
 * useJob — THE single long-job tracker for the whole app.
 *
 * ⚠️ React Native fetch cannot stream response bodies, so SSE is impossible on
 * this platform. The contract explicitly blesses the fallback: poll
 * `GET /v1/jobs/:id` (SPEC-API: "SSE İSTEĞE BAĞLIDIR"). Every waiting screen —
 * S08 outline, S10 fill, V07 voice clone — uses this hook; nobody rolls their own.
 *
 * Polling cadence: 1.5 s for the first ~15 s (short jobs feel live), then 3 s.
 * Terminal states stop the timer entirely:
 *   succeeded · failed · cancelled · waiting_approval (⏸ KAPI 1 — a human's turn now)
 */

import { useQuery } from '@tanstack/react-query';

import type { ApiError, Job, JobStatus } from '@kendihikayem/contract';

import { api, asApiError, toApiError } from './api';

const TERMINAL: ReadonlySet<JobStatus> = new Set([
  'succeeded',
  'failed',
  'cancelled',
  'waiting_approval',
]);

export function isJobTerminal(job: Job | undefined): boolean {
  return job !== undefined && TERMINAL.has(job.status);
}

export interface UseJobResult {
  job: Job | undefined;
  /** Contract-shaped error (network failures included). */
  error: ApiError | undefined;
  /** True while the poller is live (job exists and is not terminal). */
  isPolling: boolean;
  isLoading: boolean;
}

export function useJob(jobId: string | undefined): UseJobResult {
  const query = useQuery<Job, ApiError>({
    queryKey: ['job', jobId],
    enabled: jobId !== undefined,
    queryFn: async () => {
      try {
        const res = await api().jobs.get({ params: { jobId: jobId ?? '' } });
        if (res.status !== 200) throw asApiError(res.body);
        return res.body;
      } catch (error) {
        throw toApiError(error);
      }
    },
    refetchInterval: (query) => {
      const job = query.state.data;
      if (job !== undefined && TERMINAL.has(job.status)) return false;
      return query.state.dataUpdateCount < 10 ? 1_500 : 3_000;
    },
    refetchIntervalInBackground: false,
    // A finished job never changes again; an active one is refreshed by the interval.
    staleTime: Infinity,
    gcTime: 5 * 60_000,
  });

  return {
    job: query.data,
    error: query.error ?? undefined,
    isPolling: query.data !== undefined && !TERMINAL.has(query.data.status),
    isLoading: query.isLoading,
  };
}
