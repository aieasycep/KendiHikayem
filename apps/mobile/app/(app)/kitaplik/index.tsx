import { useRouter } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextStyle } from 'react-native';

import type { StorySummary } from '@kendihikayem/contract';
import { possessive } from '@kendihikayem/shared';
import {
  Badge,
  Button,
  Chip,
  EmptyState,
  ErrorState,
  PlayIcon,
  Row,
  Screen,
  Skeleton,
  Text,
  useTheme,
} from '@kendihikayem/ui';

import { useChildren, useStories } from '../../../features/library/hooks';
import { useOfflineIndex } from '../../../features/library/offline';
import { CoverArt, relativeDateTr } from '../../../features/library/cover';
import { SearchIcon } from '../../../features/library/icons';

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

/** Dinlenebilir/okunabilir durumlar — kart üstünde oynat düğmesi çıkar. */
function isPlayable(status: StorySummary['status']): boolean {
  return status === 'approved' || status === 'ready';
}

/**
 * L01 Kitaplık — Figma `Library.tsx` taşıması: büyük serif başlık + "n hikâye ·
 * m çocuk" alt satırı, arama kutusu, filtre çipleri ve yatay hikaye kartları
 * (pastel kapak + rozetler + tarih + oynat düğmesi). L02 çocuk filtresi ve L03
 * boş durumlar korunur.
 *
 * ÇEVRİMDIŞI: liste isteği düşerse indirilen masallar diskten listelenir —
 * uçak modunda kitaplık asla bomboş bir hata ekranı olmaz.
 */
export default function Kitaplik(): ReactNode {
  const router = useRouter();
  const { colors, radius, type } = useTheme();
  const [filter, setFilter] = useState<Filter>({ kind: 'all' });
  const [search, setSearch] = useState('');

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
    const query = search.trim().toLocaleLowerCase('tr-TR');
    return stories.filter((story) => {
      if (filter.kind === 'downloaded' && offline[story.id as string] === undefined) return false;
      if (query.length > 0 && !story.title.toLocaleLowerCase('tr-TR').includes(query)) {
        return false;
      }
      return true;
    });
  }, [stories, filter, offline, search]);

  /** "3. sayfada kaldınız" — en güncel yarım kalan masal. */
  const continueStory = useMemo(
    () =>
      stories.find(
        (story) =>
          story.lastReadPageNo !== undefined &&
          story.lastReadPageNo > 1 &&
          isPlayable(story.status),
      ),
    [stories],
  );

  const openStory = (storyId: string): void => {
    router.push({ pathname: '/(app)/hikaye/[id]', params: { id: storyId } });
  };
  const playStory = (storyId: string): void => {
    router.push({ pathname: '/(app)/hikaye/[id]/oynat', params: { id: storyId } });
  };

  /** Kart başlığı — Fraunces, liste ölçüsünde. */
  const serifCard: TextStyle = { ...type.heading, fontSize: 16, lineHeight: 21 };

  const childCount = childrenQuery.data?.length ?? 0;
  const subtitleTr =
    childCount > 0
      ? `${stories.length} hikâye · ${childCount} çocuk`
      : `${stories.length} hikâye`;

  /* ── Çevrimdışı geri düşüş: ağ yok ama indirilenler var ── */
  if (storiesQuery.isError && Object.keys(offline).length > 0) {
    return (
      <Screen>
        <Text variant="title" accessibilityRole="header">
          Hikâyelerim
        </Text>
        <ErrorState
          compact
          offline
          messageTr="Şu an sunucuya ulaşılamıyor. İndirdiğiniz masallar aşağıda — hepsi internetsiz açılır."
          onRetry={() => {
            void storiesQuery.refetch();
          }}
        />
        <View style={styles.list}>
          {Object.values(offline).map((meta) => (
            <Pressable
              key={meta.storyId}
              accessibilityRole="button"
              accessibilityLabel={meta.titleTr}
              onPress={() => {
                playStory(meta.storyId);
              }}
              style={({ pressed }) => [
                styles.storyCard,
                {
                  backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
                  borderColor: colors.border,
                  borderRadius: radius.lg,
                },
              ]}
            >
              <CoverArt
                seed={meta.storyId}
                localUri={meta.files['cover']}
                style={styles.cover}
              />
              <View style={styles.cardBody}>
                <Text style={serifCard} numberOfLines={2}>
                  {meta.titleTr}
                </Text>
                <Badge labelTr="İndirildi" tone="success" icon="✓" />
              </View>
            </Pressable>
          ))}
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      {/* ── Başlık ─────────────────────────────────────────── */}
      <View style={styles.header}>
        <Text variant="title" accessibilityRole="header">
          Hikâyelerim
        </Text>
        {storiesQuery.isSuccess ? (
          <Text variant="caption" tone="muted">
            {subtitleTr}
          </Text>
        ) : null}
      </View>

      {/* ── Arama ──────────────────────────────────────────── */}
      <View
        style={[
          styles.searchBox,
          { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md },
        ]}
      >
        <SearchIcon size={16} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Hikâye ara…"
          placeholderTextColor={colors.textDim}
          accessibilityLabel="Hikâye ara"
          returnKeyType="search"
          style={[styles.searchInput, { ...type.caption, fontSize: 15, color: colors.ink }]}
        />
      </View>

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
      {continueStory !== undefined && filter.kind === 'all' && search.trim().length === 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${continueStory.title} — ${continueStory.lastReadPageNo}. sayfada kaldınız, devam et`}
          onPress={() => {
            playStory(continueStory.id as string);
          }}
          style={({ pressed }) => [
            styles.storyCard,
            {
              backgroundColor: pressed ? colors.surfaceMuted : colors.surfaceRaised,
              borderColor: colors.primary,
              borderRadius: radius.lg,
            },
          ]}
        >
          <CoverArt
            seed={continueStory.id as string}
            uri={continueStory.cover?.url}
            localUri={offline[continueStory.id as string]?.files['cover']}
            style={styles.cover}
          />
          <View style={styles.cardBody}>
            <Text variant="caption" tone="accent">
              {`${continueStory.lastReadPageNo}. sayfada kaldınız`}
            </Text>
            <Text style={serifCard} numberOfLines={2}>
              {continueStory.title}
            </Text>
            <Text variant="caption" tone="muted">
              Kaldığınız yerden dinlemek için dokunun
            </Text>
          </View>
          <View
            style={[styles.playCircle, { backgroundColor: colors.primary }]}
            accessibilityElementsHidden
          >
            <PlayIcon size={16} color={colors.inkOnPrimary} />
          </View>
        </Pressable>
      ) : null}

      {/* ── Liste / durumlar ───────────────────────────────── */}
      {storiesQuery.isLoading ? (
        <View style={styles.list}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={110} rounded />
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
        search.trim().length > 0 ? (
          <EmptyState
            icon="🔍"
            titleTr="Bu adla bir masal yok"
            bodyTr="Farklı bir kelimeyle arayın ya da filtreyi değiştirin."
          />
        ) : filter.kind === 'all' ? (
          <EmptyState
            icon="📖"
            titleTr="İlk masalın burada yaşayacak"
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
        <View style={styles.list}>
          {visibleStories.map((story) => {
            const storyId = story.id as string;
            const meta = offline[storyId];
            const progressTr = IN_PROGRESS_TR[story.status];
            const metaLine = [
              story.childName,
              `${story.ageBand} yaş`,
              ...(story.hasAudio && story.voiceLabels.length > 0
                ? [story.voiceLabels[0] ?? '']
                : []),
            ]
              .filter((part): part is string => part !== undefined && part.length > 0)
              .join(' · ');
            return (
              <Pressable
                key={storyId}
                accessibilityRole="button"
                accessibilityLabel={`${story.title}${progressTr !== undefined ? `, ${progressTr}` : ''}`}
                onPress={() => {
                  openStory(storyId);
                }}
                style={({ pressed }) => [
                  styles.storyCard,
                  {
                    backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
                    borderColor: colors.border,
                    borderRadius: radius.lg,
                  },
                ]}
              >
                <CoverArt
                  seed={storyId}
                  uri={story.cover?.url}
                  localUri={meta?.files['cover']}
                  style={styles.cover}
                />

                <View style={styles.cardBody}>
                  <Text style={serifCard} numberOfLines={2}>
                    {story.title}
                  </Text>
                  <Text variant="caption" tone="muted" numberOfLines={1}>
                    {metaLine}
                  </Text>
                  <Row gap="xs" wrap>
                    {story.isFavorite ? <Badge labelTr="Favori" icon="♥" tone="danger" /> : null}
                    {progressTr !== undefined ? (
                      <Badge
                        labelTr={progressTr}
                        tone={story.status === 'failed' ? 'danger' : 'accent'}
                      />
                    ) : null}
                    {meta !== undefined ? (
                      <Badge labelTr="İndirildi" tone="success" icon="✓" />
                    ) : null}
                    {story.hasAudio && story.voiceLabels.length > 0 ? (
                      <Badge labelTr={story.voiceLabels[0] ?? ''} icon="🔊" tone="accent" />
                    ) : null}
                  </Row>
                </View>

                <View style={styles.cardSide}>
                  <Text variant="caption" tone="muted" style={styles.dateText}>
                    {relativeDateTr(story.createdAt)}
                  </Text>
                  {isPlayable(story.status) ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${story.title} masalını dinle`}
                      hitSlop={8}
                      onPress={() => {
                        playStory(storyId);
                      }}
                      style={({ pressed }) => [
                        styles.playCircle,
                        { backgroundColor: pressed ? colors.primary : colors.surfaceRaised },
                      ]}
                    >
                      <PlayIcon size={14} color={colors.primary} />
                    </Pressable>
                  ) : null}
                </View>
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
  header: { gap: 2 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    minHeight: 48,
  },
  searchInput: { flex: 1, paddingVertical: 12 },

  list: { gap: 12 },
  storyCard: {
    flexDirection: 'row',
    gap: 14,
    padding: 14,
    borderWidth: 1,
  },
  cover: { width: 72, height: 90 },
  cardBody: { flex: 1, gap: 4, justifyContent: 'center' },
  cardSide: { alignItems: 'flex-end', justifyContent: 'space-between', minWidth: 56 },
  dateText: { fontSize: 11, lineHeight: 15 },
  playCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
