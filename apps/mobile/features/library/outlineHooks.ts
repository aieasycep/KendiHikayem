/**
 * outlineHooks.ts — ⏸ KAPI 1 (iskelet onayı / reddi) kancaları.
 *
 * Onay pahalı aşamayı başlatır (kredi burada düşer); red YENİ iskelet ister ve
 * pahalı üretim hiç çalışmaz. Ana S09 ekranı F1'in sihirbazındadır; buradaki
 * kancalar kitaplıktan açılan `outline_ready` hikayeler için aynı kapıyı sunar.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { ApiError } from '@kendihikayem/contract';

import { api, asApiError, newIdempotencyKey, toApiError } from '../../lib/api';

export function useApproveOutline() {
  const queryClient = useQueryClient();
  return useMutation<{ jobId: string }, ApiError, { storyId: string }>({
    mutationFn: async ({ storyId }) => {
      try {
        const res = await api().stories.approveOutline({
          params: { storyId },
          headers: { 'idempotency-key': newIdempotencyKey('kapi1') },
          body: { costAcknowledged: true },
        });
        if (res.status !== 202) throw asApiError(res.body);
        return { jobId: res.body.job.jobId as string };
      } catch (error) {
        throw toApiError(error);
      }
    },
    onSuccess: (_data, { storyId }) => {
      void queryClient.invalidateQueries({ queryKey: ['story', storyId] });
    },
  });
}

export function useRejectOutline() {
  const queryClient = useQueryClient();
  return useMutation<{ jobId: string | undefined }, ApiError, { storyId: string }>({
    mutationFn: async ({ storyId }) => {
      try {
        const res = await api().stories.rejectOutline({
          params: { storyId },
          headers: { 'idempotency-key': newIdempotencyKey('kapi1red') },
          body: { regenerate: true },
        });
        if (res.status !== 202) throw asApiError(res.body);
        return { jobId: res.body.job?.jobId as string | undefined };
      } catch (error) {
        throw toApiError(error);
      }
    },
    onSuccess: (_data, { storyId }) => {
      void queryClient.invalidateQueries({ queryKey: ['story', storyId] });
    },
  });
}
