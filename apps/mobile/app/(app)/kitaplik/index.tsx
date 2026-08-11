import { useRouter } from 'expo-router';
import { useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import type { StorySummary } from '@kendihikayem/contract';
import {
  ErrorState,
  PlayIcon,
  Screen,
  Skeleton,
  Text,
  fontFamilies,
  palette,
  useTheme,
} from '@kendihikayem/ui';

import { useChildren, useStories } from '../../../features/library/hooks';
import { useOfflineIndex } from '../../../features/library/offline';
import { CoverArt, relativeDateTr } from '../../../features/library/cover';
import { SearchIcon } from '../../../features/library/icons';

/** Figma `Library.tsx` sekmeleri — birebir. */
const TABS = ['Tümü', 'Sesli', 'Kitaplar', 'Favoriler'] as const;
type Tab = (typeof TABS)[number];

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

/** Tasarımdaki kart rozeti: ses rozeti mercan, diğerleri mor (Figma birebir). */
function CardBadge({ labelTr, voice = false }: { labelTr: string; voice?: boolean }): ReactElement {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: voice ? 'rgba(240,139,110,0.12)' : palette.lavenderMist },
      ]}
    >
      <Text style={[styles.badgeText, { color: voice ? palette.coral : colors.primary }]}>
        {labelTr}
      </Text>
    </View>
  );
}

/**
 * L01 Kitaplık — Figma `Library.tsx` birebir taşıması: büyük serif başlık +
 * "n hikâye · m çocuk" alt satırı, arama kutusu, "Tümü / Sesli / Kitaplar /
 * Favoriler" sekmeleri ve yatay hikaye kartları (72×90 pastel kapak, tek satır
 * başlık, meta satırı, rozetler, tarih + oynat dairesi).
 *
 * ÇEVRİMDIŞI (işlev): liste isteği düşerse indirilen masallar diskten
 * listelenir — uçak modunda kitaplık asla bomboş bir hata ekranı olmaz.
 */
export default function Kitaplik(): ReactNode {
  const router = useRouter();
  const { colors } = useTheme();
  const [activeTab, setActiveTab] = useState<Tab>('Tümü');
  const [search, setSearch] = useState('');

  const storiesQuery = useStories();
  const childrenQuery = useChildren();
  const offlineIndex = useOfflineIndex();

  const offline = useMemo(() => offlineIndex.data ?? {}, [offlineIndex.data]);
  const stories = useMemo(() => storiesQuery.data ?? [], [storiesQuery.data]);

  /* Tasarımdaki filtre davranışı: arama + sekme, istemci tarafında. */
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('tr-TR');
    return stories.filter((story) => {
      if (query.length > 0 && !story.title.toLocaleLowerCase('tr-TR').includes(query)) {
        return false;
      }
      if (activeTab === 'Sesli') return story.hasAudio;
      if (activeTab === 'Kitaplar') return story.printedCount > 0;
      if (activeTab === 'Favoriler') return story.isFavorite;
      return true;
    });
  }, [stories, search, activeTab]);

  const openStory = (storyId: string): void => {
    router.push({ pathname: '/(app)/hikaye/[id]', params: { id: storyId } });
  };
  const playStory = (storyId: string): void => {
    router.push({ pathname: '/(app)/hikaye/[id]/oynat', params: { id: storyId } });
  };

  const childCount = childrenQuery.data?.length ?? 0;
  const subtitleTr =
    childCount > 0
      ? `${stories.length} hikâye · ${childCount} çocuk`
      : `${stories.length} hikâye`;

  /* ── Çevrimdışı geri düşüş: ağ yok ama indirilenler var (işlev) ── */
  if (storiesQuery.isError && Object.keys(offline).length > 0) {
    return (
      <Screen flush style={styles.screen}>
        <View style={styles.headerBlock}>
          <Text accessibilityRole="header" style={[styles.h1, { color: colors.ink }]}>
            Hikâyelerim
          </Text>
        </View>
        <View style={styles.section}>
          <ErrorState
            compact
            offline
            messageTr="Şu an sunucuya ulaşılamıyor. İndirdiğiniz masallar aşağıda — hepsi internetsiz açılır."
            onRetry={() => {
              void storiesQuery.refetch();
            }}
          />
        </View>
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
                styles.card,
                {
                  backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
                  borderColor: colors.border,
                },
              ]}
            >
              <CoverArt seed={meta.storyId} localUri={meta.files['cover']} style={styles.cover} />
              <View style={styles.cardBody}>
                <Text numberOfLines={1} style={[styles.cardTitle, { color: colors.ink }]}>
                  {meta.titleTr}
                </Text>
                <View style={styles.badgeRow}>
                  <CardBadge labelTr="İndirildi" />
                </View>
              </View>
            </Pressable>
          ))}
        </View>
      </Screen>
    );
  }

  return (
    <Screen flush style={styles.screen}>
      {/* ── Başlık — Figma: Fraunces 30 + "n hikâye · m çocuk" ── */}
      <View style={styles.headerBlock}>
        <Text accessibilityRole="header" style={[styles.h1, { color: colors.ink }]}>
          Hikâyelerim
        </Text>
        {storiesQuery.isSuccess ? (
          <Text style={[styles.subtitle, { color: colors.inkMuted }]}>{subtitleTr}</Text>
        ) : null}
      </View>

      {/* ── Arama — Figma: 2px kenarlık, 16 yarıçap, sol büyüteç ── */}
      <View style={styles.section}>
        <View
          style={[
            styles.searchBox,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <View style={styles.searchIcon} pointerEvents="none">
            <SearchIcon size={16} color={colors.inkMuted} />
          </View>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Hikâye ara…"
            placeholderTextColor={colors.inkMuted}
            accessibilityLabel="Hikâye ara"
            returnKeyType="search"
            style={[styles.searchInput, { color: colors.ink }]}
          />
        </View>
      </View>

      {/* ── Sekmeler — Figma: Tümü / Sesli / Kitaplar / Favoriler ── */}
      <View style={styles.tabRow}>
        {TABS.map((tab) => {
          const active = activeTab === tab;
          return (
            <Pressable
              key={tab}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => {
                setActiveTab(tab);
              }}
              style={[
                styles.tab,
                active
                  ? [styles.tabActive, { backgroundColor: colors.primary }]
                  : { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.tabText, { color: active ? '#FFFFFF' : colors.inkMuted }]}>
                {tab}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* ── Liste / durumlar ── */}
      {storiesQuery.isLoading ? (
        <View style={styles.list}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={118} rounded />
          ))}
        </View>
      ) : storiesQuery.isError ? (
        <View style={styles.section}>
          <ErrorState
            messageTr={storiesQuery.error.messageTr}
            offline={storiesQuery.error.code === 'PROVIDER_UNAVAILABLE'}
            onRetry={() => {
              void storiesQuery.refetch();
            }}
          />
        </View>
      ) : filtered.length === 0 ? (
        /* Figma boş durumu — birebir metinler. */
        <View style={styles.empty}>
          <Text style={styles.emptyIcon} accessibilityElementsHidden>
            📚
          </Text>
          <Text accessibilityRole="header" center style={[styles.emptyTitle, { color: colors.ink }]}>
            İlk masalın burada yaşayacak.
          </Text>
          <Text center style={[styles.emptyBody, { color: colors.inkMuted }]}>
            Henüz bu kategoride hikâye yok.
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {filtered.map((story) => {
            const storyId = story.id as string;
            const downloaded = offline[storyId] !== undefined;
            const progressTr = IN_PROGRESS_TR[story.status];
            const voiceLabel = story.hasAudio ? story.voiceLabels[0] : undefined;
            /* Figma meta satırı: "çocuk · süre · anlatıcı" — sözleşmede süre
             * alanı yok; eldeki alanlar aynı sırayla basılır. */
            const metaLine = [story.childName, voiceLabel]
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
                  styles.card,
                  {
                    backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                {/* Kapak — Figma: 72×90, yarıçap 12, pastel + emoji */}
                <CoverArt seed={storyId} uri={story.cover?.url} localUri={offline[storyId]?.files['cover']} style={styles.cover} />

                {/* Bilgi */}
                <View style={styles.cardBody}>
                  <Text numberOfLines={1} style={[styles.cardTitle, { color: colors.ink }]}>
                    {story.title}
                  </Text>
                  {metaLine.length > 0 ? (
                    <Text numberOfLines={1} style={[styles.cardMeta, { color: colors.inkMuted }]}>
                      {metaLine}
                    </Text>
                  ) : null}

                  {/* Rozetler — Figma: ses mercan, diğerleri mor */}
                  {voiceLabel !== undefined ||
                  story.printedCount > 0 ||
                  progressTr !== undefined ||
                  downloaded ? (
                    <View style={styles.badgeRow}>
                      {voiceLabel !== undefined ? <CardBadge labelTr={voiceLabel} voice /> : null}
                      {story.printedCount > 0 ? <CardBadge labelTr="Kitap hazır" /> : null}
                      {progressTr !== undefined ? <CardBadge labelTr={progressTr} /> : null}
                      {downloaded ? <CardBadge labelTr="İndirildi" /> : null}
                    </View>
                  ) : null}
                </View>

                {/* Tarih + oynat — Figma sağ sütun */}
                <View style={styles.cardSide}>
                  <Text style={[styles.dateText, { color: colors.inkMuted }]}>
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
                      style={[styles.playCircle, { backgroundColor: palette.lavenderMist }]}
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  /* Dikey ritim tasarımdaki dolgularla kurulur; Screen'in varsayılan gap'i kapalı. */
  screen: { gap: 0 },

  /* Başlık — Figma: padding 52 24 20 (üst boşluğu güvenli alan verir). */
  headerBlock: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 20, gap: 4 },
  h1: {
    fontFamily: fontFamilies.display,
    fontSize: 30,
    lineHeight: 37,
    letterSpacing: -0.3,
  },
  subtitle: { fontFamily: fontFamilies.bodyMedium, fontSize: 14, lineHeight: 19 },

  section: { paddingHorizontal: 24, paddingBottom: 16 },

  /* Arama — Figma: 2px kenarlık, yarıçap 16, 40px sol boşluk. */
  searchBox: { borderWidth: 2, borderRadius: 16, justifyContent: 'center' },
  searchIcon: { position: 'absolute', left: 14, zIndex: 1 },
  searchInput: {
    fontFamily: fontFamilies.body,
    fontSize: 15,
    paddingVertical: 14,
    paddingLeft: 40,
    paddingRight: 14,
  },

  /* Sekmeler — Figma: 8/18 dolgu, yarıçap 12, 13/700 punto. */
  tabRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 24, paddingBottom: 20 },
  tab: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 12 },
  tabActive: {
    shadowColor: '#7C5CBF',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  tabText: { fontFamily: fontFamilies.bodyBold, fontSize: 13, lineHeight: 18 },

  /* Liste + kart — Figma: yarıçap 20, 14 dolgu, yumuşak gölge. */
  list: { paddingHorizontal: 24, gap: 12, paddingBottom: 24 },
  card: {
    flexDirection: 'row',
    gap: 14,
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cover: { width: 72, height: 90 },
  cardBody: { flex: 1, minWidth: 0, justifyContent: 'center', gap: 4 },
  cardTitle: { fontFamily: fontFamilies.display, fontSize: 16, lineHeight: 21 },
  cardMeta: { fontFamily: fontFamilies.bodyMedium, fontSize: 12, lineHeight: 16 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontFamily: fontFamilies.bodyBold, fontSize: 10, lineHeight: 14 },
  cardSide: { alignItems: 'flex-end', justifyContent: 'space-between' },
  dateText: { fontFamily: fontFamilies.bodyMedium, fontSize: 11, lineHeight: 15 },
  playCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Boş durum — Figma: 60/32 dolgu, 48 emoji, Fraunces 22 başlık. */
  empty: { paddingVertical: 60, paddingHorizontal: 32, alignItems: 'center' },
  emptyIcon: { fontSize: 48, lineHeight: 58, marginBottom: 16 },
  emptyTitle: { fontFamily: fontFamilies.display, fontSize: 22, lineHeight: 28, marginBottom: 8 },
  emptyBody: { fontFamily: fontFamilies.body, fontSize: 14, lineHeight: 21 },
});
