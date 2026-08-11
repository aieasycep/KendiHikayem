import { useRouter } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { StorySummary } from '@kendihikayem/contract';
import { possessive } from '@kendihikayem/shared';
import {
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  MediaImage,
  Row,
  Screen,
  Skeleton,
  Text,
} from '@kendihikayem/ui';

import { useChildren, useStories } from '../../../features/library/hooks';
import { useOfflineIndex } from '../../../features/library/offline';

type Filter =
  | { kind: 'all' }
  | { kind: 'favorites' }
  | { kind: 'downloaded' }
  | { kind: 'child'; childId: string; nameTr: string };

const IN_PROGRESS_TR: Partial<Record<StorySummary['status'], string>> = {
  outline_generating: 'İskelet hazırlanıyor',
  outline_ready: 'Onay bekliyor',
  content_generating: 'Yazılıyor',
  content_ready: 'Resim bekliyor',
  images_generating: 'Resimler çiziliyor',
  ready: 'Onay bekliyor',
  failed: 'Sorun oluştu',
};

/**
 * L01 Kitaplık — kapak ızgarası, filtre çipleri, "3. sayfada kaldınız" devam
 * kartı; L02 çocuk profili filtresi; L03 boş durum.
 *
 * ÇEVRİMDIŞI: liste isteği düşerse indirilen masallar diskten listelenir —
 * uçak modunda kitaplık asla bomboş bir hata ekranı olmaz.
 */
export default function Kitaplik(): ReactNode {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>({ kind: 'all' });

  const storiesQuery = useStories(
    filter.kind === 'child'
      ? { childId: filter.childId }
      : filter.kind === 'favorites'
        ? { onlyFavorites: true }
        : {},
  );
  const childrenQuery = useChildren();
  const offlineIndex = useOfflineIndex();

  const offline = useMemo(() => offlineIndex.data ?? {}, [offlineIndex.data]);
  const stories = useMemo(() => storiesQuery.data ?? [], [storiesQuery.data]);

  const visibleStories = useMemo(() => {
    if (filter.kind === 'downloaded') {
      return stories.filter((story) => offline[story.id as string] !== undefined);
    }
    return stories;
  }, [stories, filter, offline]);

  /** "3. sayfada kaldınız" — en güncel yarım kalan masal. */
  const continueStory = useMemo(
    () =>
      stories.find(
        (story) =>
          story.lastReadPageNo !== undefined &&
          story.lastReadPageNo > 1 &&
          (story.status === 'approved' || story.status === 'ready'),
      ),
    [stories],
  );

  const openStory = (storyId: string): void => {
    router.push({ pathname: '/(app)/hikaye/[id]', params: { id: storyId } });
  };

  /* ── Çevrimdışı geri düşüş: ağ yok ama indirilenler var ── */
  if (storiesQuery.isError && Object.keys(offline).length > 0) {
    return (
      <Screen>
        <Text variant="title">Kitaplık</Text>
        <ErrorState
          compact
          offline
          messageTr="Şu an sunucuya ulaşılamıyor. İndirdiğiniz masallar aşağıda — hepsi internetsiz açılır."
          onRetry={() => {
            void storiesQuery.refetch();
          }}
        />
        <View style={styles.grid}>
          {Object.values(offline).map((meta) => (
            <Pressable
              key={meta.storyId}
              accessibilityRole="button"
              accessibilityLabel={meta.titleTr}
              onPress={() => {
                router.push({
                  pathname: '/(app)/hikaye/[id]/oynat',
                  params: { id: meta.storyId },
                });
              }}
              style={styles.cell}
            >
              <MediaImage
                localUri={meta.files['cover']}
                placeholderLabelTr={meta.titleTr}
                aspectRatio={1}
                altTr={meta.titleTr}
              />
              <Text variant="label" numberOfLines={2}>
                {meta.titleTr}
              </Text>
              <Badge labelTr="İndirildi" tone="success" icon="✓" />
            </Pressable>
          ))}
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Text variant="title">Kitaplık</Text>

      {/* ── Filtre çipleri (L02 çocuk seçici dahil) ────────── */}
      <Row gap="sm" wrap>
        <Chip
          label="Tümü"
          selected={filter.kind === 'all'}
          onPress={() => {
            setFilter({ kind: 'all' });
          }}
        />
        {(childrenQuery.data ?? []).map((child) => (
          <Chip
            key={child.id as string}
            label={child.givenName}
            selected={filter.kind === 'child' && filter.childId === (child.id as string)}
            onPress={() => {
              setFilter({ kind: 'child', childId: child.id as string, nameTr: child.givenName });
            }}
          />
        ))}
        <Chip
          label="Favoriler"
          icon="♥"
          selected={filter.kind === 'favorites'}
          onPress={() => {
            setFilter({ kind: 'favorites' });
          }}
        />
        <Chip
          label="İndirilenler"
          icon="⬇"
          selected={filter.kind === 'downloaded'}
          onPress={() => {
            setFilter({ kind: 'downloaded' });
          }}
        />
      </Row>

      {/* ── Devam kartı ────────────────────────────────────── */}
      {continueStory !== undefined && filter.kind === 'all' ? (
        <Card
          onPress={() => {
            router.push({
              pathname: '/(app)/hikaye/[id]/oynat',
              params: { id: continueStory.id as string },
            });
          }}
          accessibilityLabel={`${continueStory.title} — ${continueStory.lastReadPageNo}. sayfada kaldınız, devam et`}
        >
          <Row gap="md">
            <MediaImage
              uri={continueStory.cover?.url}
              localUri={offline[continueStory.id as string]?.files['cover']}
              placeholderLabelTr={continueStory.title}
              aspectRatio={1}
              altTr=""
              style={styles.continueCover}
            />
            <View style={styles.continueTexts}>
              <Text variant="caption" tone="accent">
                {`${continueStory.lastReadPageNo}. sayfada kaldınız`}
              </Text>
              <Text variant="bodyStrong" numberOfLines={2}>
                {continueStory.title}
              </Text>
              <Text variant="caption" tone="muted">
                Kaldığınız yerden dinlemek için dokunun
              </Text>
            </View>
            <Text variant="title" tone="muted" accessibilityElementsHidden>
              ▶
            </Text>
          </Row>
        </Card>
      ) : null}

      {/* ── Izgara / durumlar ──────────────────────────────── */}
      {storiesQuery.isLoading ? (
        <View style={styles.grid}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={styles.cell}>
              <Skeleton aspectRatio={1} rounded />
              <Skeleton height={18} width="80%" />
            </View>
          ))}
        </View>
      ) : storiesQuery.isError ? (
        <ErrorState
          messageTr={storiesQuery.error.messageTr}
          offline={storiesQuery.error.code === 'PROVIDER_UNAVAILABLE'}
          onRetry={() => {
            void storiesQuery.refetch();
          }}
        />
      ) : visibleStories.length === 0 ? (
        filter.kind === 'all' ? (
          <EmptyState
            icon="📖"
            titleTr="Henüz masalınız yok"
            bodyTr="Çocuğunuza özel ilk masalı üç dakikada oluşturun — kahraman o olsun."
            actionLabelTr="İlk masalı oluştur"
            onAction={() => {
              router.push('/(app)/sihirbaz');
            }}
          />
        ) : (
          <EmptyState
            icon={filter.kind === 'downloaded' ? '⬇' : filter.kind === 'favorites' ? '♥' : '🧒'}
            titleTr={
              filter.kind === 'downloaded'
                ? 'İndirilen masal yok'
                : filter.kind === 'favorites'
                  ? 'Favori masal yok'
                  : `${possessive(filter.kind === 'child' ? filter.nameTr : '')} masalı yok`
            }
            bodyTr={
              filter.kind === 'downloaded'
                ? 'Bir masalın sayfasındaki "Cihaza indir" ile internetsiz kullanıma hazırlayın.'
                : filter.kind === 'favorites'
                  ? 'Masal sayfasındaki kalp ile favorilere ekleyin.'
                  : 'Bu çocuk için yeni bir masal oluşturabilirsiniz.'
            }
          />
        )
      ) : (
        <View style={styles.grid}>
          {visibleStories.map((story) => {
            const storyId = story.id as string;
            const meta = offline[storyId];
            const progressTr = IN_PROGRESS_TR[story.status];
            return (
              <Pressable
                key={storyId}
                accessibilityRole="button"
                accessibilityLabel={`${story.title}${progressTr !== undefined ? `, ${progressTr}` : ''}`}
                onPress={() => {
                  openStory(storyId);
                }}
                style={styles.cell}
              >
                <MediaImage
                  uri={story.cover?.url}
                  localUri={meta?.files['cover']}
                  placeholderLabelTr={story.title}
                  placeholderNoteTr={progressTr}
                  aspectRatio={1}
                  altTr={`${story.title} kapağı`}
                />
                <Text variant="label" numberOfLines={2}>
                  {story.title}
                </Text>
                <Row gap="xs" wrap>
                  {story.isFavorite ? <Badge labelTr="Favori" icon="♥" tone="danger" /> : null}
                  {progressTr !== undefined ? (
                    <Badge
                      labelTr={progressTr}
                      tone={story.status === 'failed' ? 'danger' : 'accent'}
                    />
                  ) : null}
                  {meta !== undefined ? <Badge labelTr="İndirildi" tone="success" icon="✓" /> : null}
                  {story.hasAudio && story.voiceLabels.length > 0 ? (
                    <Badge labelTr={story.voiceLabels[0] ?? ''} icon="🔊" tone="neutral" />
                  ) : null}
                </Row>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* Tek birincil eylem: yeni masal (boş durumda zaten var). */}
      {visibleStories.length > 0 ? (
        <Button
          label="Yeni masal oluştur"
          onPress={() => {
            router.push('/(app)/sihirbaz');
          }}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  cell: { width: '47%', gap: 6 },
  continueCover: { width: 72 },
  continueTexts: { flex: 1, gap: 2 },
});
