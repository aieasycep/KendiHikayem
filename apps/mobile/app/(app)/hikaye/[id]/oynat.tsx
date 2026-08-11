import { useLocalSearchParams } from 'expo-router';
import { useMemo, type ReactNode } from 'react';
import { View } from 'react-native';

import { useQuery } from '@tanstack/react-query';

import type { PlayerManifest } from '@kendihikayem/contract';
import { ErrorState, Screen, Skeleton, ThemeScope } from '@kendihikayem/ui';

import { PlayerScreen } from '../../../../features/player/PlayerScreen';
import { usePlayerManifest, useReadingPreferences } from '../../../../features/player/hooks';
import { buildSilentManifest } from '../../../../features/player/localManifest';
import { useStory } from '../../../../features/library/hooks';
import {
  loadOfflineManifest,
  useOfflineIndex,
} from '../../../../features/library/offline';

/**
 * P01 rotası — manifest çözümleme zinciri:
 *   1. Sunucu manifesti (tek çağrı, tam senkron veri)
 *   2. Çevrimdışı indirilen manifest (uçak modu)
 *   3. Hikaye metninden SESSİZ manifest (hiç seslendirme yoksa bile okunur)
 * Hiçbiri yoksa hata durumu — ama iş oraya nadiren düşer.
 */
export default function OynatRoute(): ReactNode {
  const { id, renditionId } = useLocalSearchParams<{ id: string; renditionId?: string }>();

  const manifestQuery = usePlayerManifest(id, renditionId);
  const storyQuery = useStory(id);
  const prefsQuery = useReadingPreferences();
  const offlineIndex = useOfflineIndex();

  const offlineMeta = id !== undefined ? offlineIndex.data?.[id] : undefined;

  const offlineManifestQuery = useQuery<PlayerManifest | undefined>({
    queryKey: ['offline-manifest', id],
    enabled: manifestQuery.isError && offlineMeta !== undefined,
    queryFn: () => loadOfflineManifest(id ?? ''),
  });

  const resolved = useMemo((): {
    manifest: PlayerManifest | undefined;
    silent: boolean;
  } => {
    if (manifestQuery.data !== undefined) return { manifest: manifestQuery.data, silent: false };
    if (offlineManifestQuery.data !== undefined) {
      return { manifest: offlineManifestQuery.data, silent: false };
    }
    if (manifestQuery.isError && storyQuery.data !== undefined) {
      return { manifest: buildSilentManifest(storyQuery.data), silent: true };
    }
    return { manifest: undefined, silent: false };
  }, [manifestQuery.data, manifestQuery.isError, offlineManifestQuery.data, storyQuery.data]);

  /* Tercihler manifest'in tipografisini geçersiz kılar (A06 kullanıcı seçimi). */
  const themedManifest = useMemo((): PlayerManifest | undefined => {
    if (resolved.manifest === undefined) return undefined;
    const prefs = prefsQuery.data;
    if (prefs === undefined) return resolved.manifest;
    return { ...resolved.manifest, typography: prefs.typography };
  }, [resolved.manifest, prefsQuery.data]);

  const stillLoading =
    manifestQuery.isLoading ||
    (manifestQuery.isError && offlineMeta !== undefined && offlineManifestQuery.isLoading) ||
    (manifestQuery.isError && storyQuery.isLoading);

  if (id === undefined) {
    return (
      <Screen>
        <ErrorState messageTr="Masal bulunamadı. Kitaplığa dönüp tekrar deneyin." />
      </Screen>
    );
  }

  if (themedManifest === undefined) {
    if (stillLoading) {
      return (
        <ThemeScope mode="dark">
          <Screen scroll={false} includeBottom>
            <View style={{ flex: 1, gap: 16, justifyContent: 'flex-end' }}>
              <Skeleton aspectRatio={1} rounded />
              <Skeleton height={24} width="80%" />
              <Skeleton height={24} width="60%" />
              <Skeleton height={76} width={76} rounded style={{ alignSelf: 'center' }} />
            </View>
          </Screen>
        </ThemeScope>
      );
    }
    return (
      <ThemeScope mode="dark">
        <Screen includeBottom>
          <ErrorState
            messageTr={manifestQuery.error?.messageTr}
            onRetry={() => {
              void manifestQuery.refetch();
              void storyQuery.refetch();
            }}
          />
        </Screen>
      </ThemeScope>
    );
  }

  const prefs = prefsQuery.data;
  return (
    <PlayerScreen
      storyId={id}
      manifest={themedManifest}
      offlineMeta={offlineMeta}
      silentFallback={resolved.silent}
      highlightDefault={prefs?.wordHighlight}
      autoPageTurnDefault={prefs?.autoPageTurn}
      bedtimeEnabledDefault={prefs?.bedtimeMode.enabled}
    />
  );
}
