/**
 * features/player/hooks.ts — oynatıcı ve ses (P01/P04/P05) veri kancaları.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  ApiError,
  AudioRenditionSummary,
  PlayerManifest,
  ReadingPreferences,
  StoryExport,
} from '@kendihikayem/contract';

import { api, asApiError, newIdempotencyKey, toApiError } from '../../lib/api';

/**
 * ⭐ Okuyucunun TEK çağrısı. Hikayenin sesi yoksa sözleşme gereği 404 döner —
 * ekran bunu sessiz okuma manifestiyle (localManifest.ts) karşılar.
 */
export function usePlayerManifest(storyId: string | undefined, renditionId?: string) {
  return useQuery<PlayerManifest, ApiError>({
    queryKey: ['player', storyId, renditionId],
    enabled: storyId !== undefined,
    retry: false,
    queryFn: async () => {
      try {
        const res = await api().audio.player({
          params: { storyId: storyId ?? '' },
          query: { ...(renditionId !== undefined ? { renditionId } : {}) },
        });
        if (res.status !== 200) throw asApiError(res.body);
        return res.body;
      } catch (error) {
        throw toApiError(error);
      }
    },
  });
}

export function useRenditions(storyId: string | undefined) {
  return useQuery<AudioRenditionSummary[], ApiError>({
    queryKey: ['audio-list', storyId],
    enabled: storyId !== undefined,
    queryFn: async () => {
      try {
        const res = await api().audio.list({ params: { storyId: storyId ?? '' } });
        if (res.status !== 200) throw asApiError(res.body);
        return res.body.items;
      } catch (error) {
        throw toApiError(error);
      }
    },
  });
}

/** P04 — seslendirme başlat (klonlu ya da sistem sesi). 409 STORY_NOT_APPROVED gelebilir. */
export function useCreateRendition() {
  const queryClient = useQueryClient();
  return useMutation<
    { jobId: string; cached: boolean },
    ApiError,
    {
      storyId: string;
      voiceKind: 'cloned' | 'system';
      voiceProfileId?: string;
      systemVoiceCode?: string;
    }
  >({
    mutationFn: async ({ storyId, voiceKind, voiceProfileId, systemVoiceCode }) => {
      try {
        const res = await api().audio.create({
          params: { storyId },
          headers: { 'idempotency-key': newIdempotencyKey('ses') },
          body: {
            voiceKind,
            ...(voiceProfileId !== undefined ? { voiceProfileId } : {}),
            ...(systemVoiceCode !== undefined ? { systemVoiceCode } : {}),
            tier: 'quality',
            makeDefault: true,
          },
        });
        if (res.status !== 202) throw asApiError(res.body);
        return { jobId: res.body.job.jobId as string, cached: res.body.cached };
      } catch (error) {
        throw toApiError(error);
      }
    },
    onSuccess: (_data, { storyId }) => {
      void queryClient.invalidateQueries({ queryKey: ['audio-list', storyId] });
    },
  });
}

export function useSetDefaultRendition() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, { storyId: string; renditionId: string }>({
    mutationFn: async ({ storyId, renditionId }) => {
      try {
        const res = await api().audio.setDefault({
          params: { storyId, renditionId },
          headers: { 'idempotency-key': newIdempotencyKey('varsayilan') },
          body: {},
        });
        if (res.status !== 200) throw asApiError(res.body);
      } catch (error) {
        throw toApiError(error);
      }
    },
    onSuccess: (_data, { storyId }) => {
      void queryClient.invalidateQueries({ queryKey: ['audio-list', storyId] });
      void queryClient.invalidateQueries({ queryKey: ['player', storyId] });
    },
  });
}

export function useRemoveRendition() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, { storyId: string; renditionId: string }>({
    mutationFn: async ({ renditionId }) => {
      try {
        const res = await api().audio.removeRendition({
          params: { renditionId },
          headers: { 'idempotency-key': newIdempotencyKey('sessil') },
          body: { confirm: true },
        });
        if (res.status !== 200) throw asApiError(res.body);
      } catch (error) {
        throw toApiError(error);
      }
    },
    onSuccess: (_data, { storyId }) => {
      void queryClient.invalidateQueries({ queryKey: ['audio-list', storyId] });
    },
  });
}

/** "3. sayfada kaldınız" — konum kaydı. Sessizce başarısız olabilir (çevrimdışı). */
export function useSaveProgress() {
  const queryClient = useQueryClient();
  return useMutation<
    void,
    ApiError,
    {
      storyId: string;
      pageNo: number;
      positionMs: number;
      renditionId?: string;
      completed?: boolean;
    }
  >({
    retry: false,
    mutationFn: async ({ storyId, pageNo, positionMs, renditionId, completed }) => {
      try {
        const res = await api().audio.progress({
          params: { storyId },
          headers: { 'idempotency-key': newIdempotencyKey('konum') },
          body: {
            pageNo,
            positionMs,
            ...(renditionId !== undefined ? { renditionId } : {}),
            completed: completed ?? false,
          },
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

/** A06 + P01 — okuma tercihleri sunucuda tutulur, cihazlar arası taşınır. */
export function useReadingPreferences() {
  return useQuery<ReadingPreferences, ApiError>({
    queryKey: ['reading-prefs'],
    queryFn: async () => {
      try {
        const res = await api().audio.readingPreferences();
        if (res.status !== 200) throw asApiError(res.body);
        return res.body;
      } catch (error) {
        throw toApiError(error);
      }
    },
    staleTime: 60_000,
  });
}

export function useUpdateReadingPreferences() {
  const queryClient = useQueryClient();
  return useMutation<ReadingPreferences, ApiError, Partial<ReadingPreferences>>({
    mutationFn: async (patch) => {
      try {
        const res = await api().audio.updateReadingPreferences({
          headers: { 'idempotency-key': newIdempotencyKey('tercih') },
          body: patch,
        });
        if (res.status !== 200) throw asApiError(res.body);
        return res.body;
      } catch (error) {
        throw toApiError(error);
      }
    },
    onSuccess: (prefs) => {
      queryClient.setQueryData(['reading-prefs'], prefs);
    },
  });
}

/* ── P05 — dışa aktarma ─────────────────────────────────────── */

export function useExports(storyId: string | undefined) {
  return useQuery<StoryExport[], ApiError>({
    queryKey: ['exports', storyId],
    enabled: storyId !== undefined,
    queryFn: async () => {
      try {
        const res = await api().print.listExports({ params: { storyId: storyId ?? '' } });
        if (res.status !== 200) throw asApiError(res.body);
        return res.body.items;
      } catch (error) {
        throw toApiError(error);
      }
    },
  });
}

export function useCreateExport() {
  return useMutation<
    { jobId: string },
    ApiError,
    { storyId: string; kind: 'pdf' | 'mp4'; renditionId?: string }
  >({
    mutationFn: async ({ storyId, kind, renditionId }) => {
      try {
        const res = await api().print.createExport({
          params: { storyId },
          headers: { 'idempotency-key': newIdempotencyKey('aktar') },
          body: { kind, ...(renditionId !== undefined ? { renditionId } : {}) },
        });
        if (res.status !== 202) throw asApiError(res.body);
        return { jobId: res.body.job.jobId as string };
      } catch (error) {
        throw toApiError(error);
      }
    },
  });
}
