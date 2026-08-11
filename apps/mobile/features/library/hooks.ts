/**
 * features/library/hooks.ts — kitaplık ve hikaye verisi (F2).
 *
 * Tüm çağrılar F1'in kurduğu tipli istemciden (`lib/api.ts`) geçer; her hata
 * sözleşmedeki `ApiError` şekline indirgenir ve `messageTr` ekranda birebir
 * gösterilir. Uzun işler `lib/useJob.ts` ile izlenir (SSE yok — polling).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { ApiError, Story, StoryStatus, StorySummary } from '@kendihikayem/contract';

import { api, asApiError, newIdempotencyKey, toApiError } from '../../lib/api';

/** Hikaye hâlâ üretimde mi — kitaplık rozetleri ve detay polling kararı. */
export function isStoryInProgress(status: StoryStatus): boolean {
  return (
    status === 'outline_generating' ||
    status === 'content_generating' ||
    status === 'images_generating'
  );
}

export interface StoryFilters {
  childId?: string;
  onlyFavorites?: boolean;
}

export function useStories(filters: StoryFilters = {}) {
  return useQuery<StorySummary[], ApiError>({
    queryKey: ['stories', filters],
    queryFn: async () => {
      try {
        const res = await api().stories.list({
          query: {
            ...(filters.childId !== undefined ? { childId: filters.childId } : {}),
            ...(filters.onlyFavorites === true ? { onlyFavorites: true } : {}),
          },
        });
        if (res.status !== 200) throw asApiError(res.body);
        return res.body.items;
      } catch (error) {
        throw toApiError(error);
      }
    },
  });
}

export function useStory(storyId: string | undefined) {
  return useQuery<Story, ApiError>({
    queryKey: ['story', storyId],
    enabled: storyId !== undefined,
    queryFn: async () => {
      try {
        const res = await api().stories.get({ params: { storyId: storyId ?? '' } });
        if (res.status !== 200) throw asApiError(res.body);
        return res.body;
      } catch (error) {
        throw toApiError(error);
      }
    },
    // Aşamalı teslim: üretim sürerken sayfalar tek tek belirir.
    refetchInterval: (query) => {
      const story = query.state.data;
      if (story === undefined) return false;
      if (isStoryInProgress(story.status) || story.activeJobs.length > 0) return 2_500;
      return false;
    },
  });
}

export function useChildren() {
  return useQuery({
    queryKey: ['children'],
    queryFn: async () => {
      try {
        const res = await api().children.list({ query: {} });
        if (res.status !== 200) throw asApiError(res.body);
        return res.body.items;
      } catch (error) {
        throw toApiError(error);
      }
    },
    staleTime: 5 * 60_000,
  });
}

export function useToggleFavorite() {
  const queryClient = useQueryClient();
  return useMutation<{ isFavorite: boolean }, ApiError, { storyId: string; isFavorite: boolean }>({
    mutationFn: async ({ storyId, isFavorite }) => {
      try {
        const res = await api().stories.favorite({
          params: { storyId },
          headers: { 'idempotency-key': newIdempotencyKey('fav') },
          body: { isFavorite },
        });
        if (res.status !== 200) throw asApiError(res.body);
        return { isFavorite: res.body.isFavorite };
      } catch (error) {
        throw toApiError(error);
      }
    },
    onSuccess: (_data, { storyId }) => {
      void queryClient.invalidateQueries({ queryKey: ['story', storyId] });
      void queryClient.invalidateQueries({ queryKey: ['stories'] });
    },
  });
}

export function useDeleteStory() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, { storyId: string }>({
    mutationFn: async ({ storyId }) => {
      try {
        const res = await api().stories.remove({
          params: { storyId },
          headers: { 'idempotency-key': newIdempotencyKey('sil') },
          body: { confirm: true },
        });
        if (res.status !== 200) throw asApiError(res.body);
      } catch (error) {
        throw toApiError(error);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['stories'] });
    },
  });
}

/** ⏸ KAPI 2 — onay olmadan seslendirme ve baskı 409 döner. */
export function useApproveStory() {
  const queryClient = useQueryClient();
  return useMutation<Story, ApiError, { storyId: string }>({
    mutationFn: async ({ storyId }) => {
      try {
        const res = await api().stories.approve({
          params: { storyId },
          headers: { 'idempotency-key': newIdempotencyKey('onay') },
          body: {},
        });
        if (res.status !== 200) throw asApiError(res.body);
        return res.body;
      } catch (error) {
        throw toApiError(error);
      }
    },
    onSuccess: (story) => {
      queryClient.setQueryData(['story', story.id], story);
      void queryClient.invalidateQueries({ queryKey: ['stories'] });
    },
  });
}

/** P02 — sayfa metnini düzenle. Moderasyondan geçer; sesleri stale yapar. */
export function useUpdatePageText() {
  const queryClient = useQueryClient();
  return useMutation<unknown, ApiError, { storyId: string; pageNo: number; textTr: string }>({
    mutationFn: async ({ storyId, pageNo, textTr }) => {
      try {
        const res = await api().stories.updatePage({
          params: { storyId, pageNo },
          headers: { 'idempotency-key': newIdempotencyKey('metin') },
          body: { textTr },
        });
        if (res.status !== 200) throw asApiError(res.body);
        return res.body;
      } catch (error) {
        throw toApiError(error);
      }
    },
    onSuccess: (_data, { storyId }) => {
      void queryClient.invalidateQueries({ queryKey: ['story', storyId] });
      void queryClient.invalidateQueries({ queryKey: ['audio-list', storyId] });
    },
  });
}

/** P03 — görseli talimatla yenile. 202 + job döner. */
export function useReillustratePage() {
  return useMutation<
    { jobId: string },
    ApiError,
    { storyId: string; pageNo: number; instructionTr?: string }
  >({
    mutationFn: async ({ storyId, pageNo, instructionTr }) => {
      try {
        const res = await api().stories.reillustratePage({
          params: { storyId, pageNo },
          headers: { 'idempotency-key': newIdempotencyKey('gorsel') },
          body: { ...(instructionTr !== undefined && instructionTr.length > 0 ? { instructionTr } : {}) },
        });
        if (res.status !== 202) throw asApiError(res.body);
        return { jobId: res.body.job.jobId as string };
      } catch (error) {
        throw toApiError(error);
      }
    },
  });
}

/** P02 varyantı — sayfayı LLM'e yeniden yazdır. */
export function useRewritePage() {
  return useMutation<
    { jobId: string },
    ApiError,
    { storyId: string; pageNo: number; instructionTr?: string }
  >({
    mutationFn: async ({ storyId, pageNo, instructionTr }) => {
      try {
        const res = await api().stories.rewritePage({
          params: { storyId, pageNo },
          headers: { 'idempotency-key': newIdempotencyKey('yenidenyaz') },
          body: { ...(instructionTr !== undefined && instructionTr.length > 0 ? { instructionTr } : {}) },
        });
        if (res.status !== 202) throw asApiError(res.body);
        return { jobId: res.body.job.jobId as string };
      } catch (error) {
        throw toApiError(error);
      }
    },
  });
}
