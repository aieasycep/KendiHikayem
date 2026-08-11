/**
 * Catalog + profile queries used by the wizard screens (S03–S05, W01–W06).
 * All server-driven: themes, art styles and the Karakter Kurucu form come from
 * the catalog so free-text style/character input is impossible (SPEC §8.1 ②).
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import type {
  AgeBand,
  ApiError,
  ArtStyle,
  CharacterOptions,
  Child,
  CostPreview,
  Entitlements,
  EstimateOperation,
  StoryTheme,
  SystemVoice,
  VoiceProfile,
} from '@kendihikayem/contract';

import { api, asApiError, newIdempotencyKey, toApiError } from '../../lib/api';

async function run<T>(fn: () => Promise<{ status: number; body: unknown }>): Promise<T> {
  try {
    const res = await fn();
    if (res.status >= 200 && res.status < 300) return res.body as T;
    throw asApiError(res.body);
  } catch (error) {
    throw toApiError(error);
  }
}

export function useThemes(ageBand?: AgeBand): UseQueryResult<StoryTheme[], ApiError> {
  return useQuery<StoryTheme[], ApiError>({
    queryKey: ['catalog', 'themes', ageBand ?? 'hepsi'],
    queryFn: async () => {
      const body = await run<{ items: StoryTheme[] }>(() =>
        api().catalog.themes({
          query: { ...(ageBand !== undefined ? { ageBand } : {}), includeReligious: true },
        }),
      );
      return body.items;
    },
  });
}

export function useArtStyles(): UseQueryResult<ArtStyle[], ApiError> {
  return useQuery<ArtStyle[], ApiError>({
    queryKey: ['catalog', 'artStyles'],
    queryFn: async () => {
      const body = await run<{ items: ArtStyle[] }>(() => api().catalog.artStyles({}));
      return body.items;
    },
  });
}

export function useCharacterOptions(ageBand?: AgeBand): UseQueryResult<CharacterOptions, ApiError> {
  return useQuery<CharacterOptions, ApiError>({
    queryKey: ['catalog', 'characterOptions', ageBand ?? 'hepsi'],
    queryFn: () =>
      run<CharacterOptions>(() =>
        api().catalog.characterOptions({
          query: ageBand !== undefined ? { ageBand } : {},
        }),
      ),
  });
}

export function useSystemVoices(): UseQueryResult<SystemVoice[], ApiError> {
  return useQuery<SystemVoice[], ApiError>({
    queryKey: ['catalog', 'systemVoices'],
    queryFn: async () => {
      const body = await run<{ items: SystemVoice[] }>(() => api().catalog.systemVoices({}));
      return body.items;
    },
  });
}

export function useChildren(enabled = true): UseQueryResult<Child[], ApiError> {
  return useQuery<Child[], ApiError>({
    queryKey: ['children'],
    enabled,
    queryFn: async () => {
      const body = await run<{ items: Child[] }>(() => api().children.list({ query: {} }));
      return body.items;
    },
  });
}

export function useVoiceProfiles(): UseQueryResult<
  { items: VoiceProfile[]; limit: number },
  ApiError
> {
  return useQuery<{ items: VoiceProfile[]; limit: number }, ApiError>({
    queryKey: ['voiceProfiles'],
    queryFn: () =>
      run<{ items: VoiceProfile[]; limit: number }>(() => api().voice.listProfiles({})),
  });
}

export function useEntitlements(enabled = true): UseQueryResult<Entitlements, ApiError> {
  return useQuery<Entitlements, ApiError>({
    queryKey: ['entitlements'],
    enabled,
    queryFn: () => run<Entitlements>(() => api().billing.entitlements({})),
  });
}

/** Cost preview for the summary screens (S06 / W07). Idempotency key per estimate. */
export function useEstimate(
  operation: EstimateOperation,
  enabled = true,
): UseQueryResult<CostPreview, ApiError> {
  return useQuery<CostPreview, ApiError>({
    queryKey: ['estimate', operation],
    enabled,
    queryFn: () =>
      run<CostPreview>(() =>
        api().billing.estimate({
          body: { operation, params: {} },
          headers: { 'idempotency-key': newIdempotencyKey('tahmin') },
        }),
      ),
  });
}
