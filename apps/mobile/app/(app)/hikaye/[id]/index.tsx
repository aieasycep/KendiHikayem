import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';

import { useQueryClient } from '@tanstack/react-query';

import type { StoryPage } from '@kendihikayem/contract';
import { possessive } from '@kendihikayem/shared';
import {
  Button,
  Card,
  ErrorState,
  JobProgressCard,
  NoticeBox,
  PlayIcon,
  Screen,
  Sheet,
  Skeleton,
  Text,
  fontFamilies,
  palette,
  useTheme,
} from '@kendihikayem/ui';

import { PageEditSheet } from '../../../../features/library/PageEditSheet';
import { PagesSheet } from '../../../../features/library/PagesSheet';
import { OfflineCard } from '../../../../features/library/OfflineCard';
import { coverVisual } from '../../../../features/library/cover';
import { ArrowLeftIcon, ShareIcon } from '../../../../features/library/icons';
import {
  isStoryInProgress,
  useApproveStory,
  useDeleteStory,
  useStory,
  useStoryTheme,
} from '../../../../features/library/hooks';
import { useOfflineIndex } from '../../../../features/library/offline';
import { useApproveOutline, useRejectOutline } from '../../../../features/library/outlineHooks';
import { isJobTerminal, useJob } from '../../../../lib/useJob';

/** Hero yıldız alanı — her açılışta aynı yerleşim (render'da Math.random yok). */
const HERO_STARS = Array.from({ length: 16 }, (_, i) => ({
  size: i % 3 === 0 ? 4 : 2,
  opacity: 0.3 + (i % 4) * 0.1,
  top: `${(i * 53 + 7) % 100}%` as const,
  left: `${(i * 71 + 11) % 100}%` as const,
}));

/** Tasarımdaki konfeti noktaları — renk ve konum formülü Figma'dan birebir. */
const CONFETTI = ['#FFD97D', '#F08B6E', '#8DB89A', '#B09CE0'].map((color, i) => ({
  color,
  top: `${30 + i * 15}%` as const,
  left: `${i % 2 === 0 ? 15 + i * 10 : 70 - i * 8}%` as const,
}));

/**
 * Hikaye detayı — Figma `StoryResult.tsx` birebir taşıması: 360'lık gece
 * degradeli kapak (geri + paylaş düğmeleri, yüzen emoji karosu, konfeti),
 * "EGE İÇİN HAZIRLANDI" hapı, Fraunces 30 başlık, "⏱ · 🎙 · tema" meta satırı,
 * degrade "Dinlemeye Başla" CTA'sı, tasarımdaki BEŞ eylem kartı
 * (Oku / Düzenle / Görselleştir / Kitap Yap / Paylaş) ve "Hikâyeden bir kesit".
 *
 * İŞLEV KORUNDU: P02/P03 sayfa düzenleme "Düzenle"/"Görselleştir" kartlarından
 * açılan Sayfalar alt sayfasında; Kapı 1 + Kapı 2 onayları, iş takibi,
 * çevrimdışı indirme ve silme akışları durum bazlı bloklar olarak durur.
 */
export default function HikayeDetay(): ReactNode {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const { id, sayfa } = useLocalSearchParams<{ id: string; sayfa?: string }>();

  const storyQuery = useStory(id);
  const story = storyQuery.data;
  const themeQuery = useStoryTheme(story?.themeCode);

  const offlineIndex = useOfflineIndex();
  const offlineMeta = id !== undefined ? offlineIndex.data?.[id] : undefined;

  const approveStory = useApproveStory();
  const deleteStory = useDeleteStory();
  const approveOutline = useApproveOutline();
  const rejectOutline = useRejectOutline();

  /* Aktif üretim işi: story.activeJobs[0] ya da sheet'ten başlatılan iş. */
  const [manualJobId, setManualJobId] = useState<string | undefined>(undefined);
  const activeJobId = manualJobId ?? (story?.activeJobs[0]?.jobId as string | undefined);
  const { job } = useJob(activeJobId);

  useEffect(() => {
    if (isJobTerminal(job)) {
      setManualJobId(undefined);
      void queryClient.invalidateQueries({ queryKey: ['story', id] });
      void queryClient.invalidateQueries({ queryKey: ['stories'] });
    }
  }, [job, queryClient, id]);

  /* B02'den "Bu sayfayı düzelt" → ?sayfa=N ile gelinir. */
  const [editPageNo, setEditPageNo] = useState<number | undefined>(undefined);
  const [pagesOpen, setPagesOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  useEffect(() => {
    if (sayfa !== undefined) {
      const parsed = Number.parseInt(sayfa, 10);
      if (Number.isFinite(parsed)) setEditPageNo(parsed);
    }
  }, [sayfa]);

  const editPage: StoryPage | undefined = useMemo(
    () => story?.pages.find((page) => page.pageNo === editPageNo),
    [story, editPageNo],
  );

  /* Kapak karosu "float" animasyonu — tasarımdaki yüzen yıldız. */
  const [floatAnim] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, { toValue: 1, duration: 2000, useNativeDriver: true }),
        Animated.timing(floatAnim, { toValue: 0, duration: 2000, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [floatAnim]);
  const floatY = floatAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -6] });

  if (storyQuery.isLoading) {
    return (
      <Screen>
        <Skeleton height={260} rounded />
        <Skeleton height={30} width="70%" />
        <Skeleton height={18} width="50%" />
        <Skeleton height={64} rounded />
        <Skeleton aspectRatio={1.8} rounded />
      </Screen>
    );
  }

  if (story === undefined) {
    return (
      <Screen>
        <ErrorState
          messageTr={storyQuery.error?.messageTr}
          onRetry={() => {
            void storyQuery.refetch();
          }}
          offline={storyQuery.error?.code === 'PROVIDER_UNAVAILABLE'}
          offlineActionLabelTr={offlineMeta !== undefined ? 'İndirilen kopyayı aç' : undefined}
          onOfflineAction={
            offlineMeta !== undefined
              ? () => {
                  router.push({ pathname: '/(app)/hikaye/[id]/oynat', params: { id: id ?? '' } });
                }
              : undefined
          }
        />
      </Screen>
    );
  }

  const inProgress = isStoryInProgress(story.status);
  const readyPages = story.pages.filter((page) => page.textTr !== undefined);
  const canListen = readyPages.length > 0;
  const awaitingGate2 = story.status === 'ready';
  const awaitingGate1 = story.status === 'outline_ready';

  const visual = coverVisual(story.id as string);
  const defaultRendition =
    story.audio.find((r) => r.isDefault && r.status === 'succeeded') ??
    story.audio.find((r) => r.status === 'succeeded' || r.status === 'stale');
  const theme = themeQuery.data;

  /** Meta satırı — tasarım: "⏱ 6 dakika · 🎙 Anne'nin sesi · 🚀 Uzay".
   * Süre ve ses seslendirme verisinden, tema katalogdan gelir; veri yoksa öge düşer. */
  const metaItems: { icon: string; textTr: string }[] = [
    ...(defaultRendition?.durationMs !== undefined
      ? [
          {
            icon: '⏱',
            textTr: `${Math.max(1, Math.round(defaultRendition.durationMs / 60_000))} dakika`,
          },
        ]
      : []),
    ...(defaultRendition !== undefined
      ? [{ icon: '🎙', textTr: defaultRendition.voiceLabel }]
      : []),
    ...(theme !== undefined ? [{ icon: theme.icon, textTr: theme.titleTr }] : []),
  ];

  /** Tasarımdaki BEŞ eylem — etiket ve emoji Figma'dan birebir. */
  const gridActions: { emoji: string; labelTr: string; onPress: () => void }[] = [
    {
      emoji: '📖',
      labelTr: 'Oku',
      onPress: () => {
        router.push({ pathname: '/(app)/hikaye/[id]/oynat', params: { id: story.id as string } });
      },
    },
    {
      emoji: '✏️',
      labelTr: 'Düzenle',
      onPress: () => {
        setPagesOpen(true);
      },
    },
    {
      emoji: '🎨',
      labelTr: 'Görselleştir',
      onPress: () => {
        setPagesOpen(true);
      },
    },
    {
      emoji: '📚',
      labelTr: 'Kitap Yap',
      onPress: () => {
        router.push({ pathname: '/(app)/bastir/[id]', params: { id: story.id as string } });
      },
    },
    {
      emoji: '🔗',
      labelTr: 'Paylaş',
      onPress: () => {
        router.push({ pathname: '/(app)/hikaye/[id]/paylas', params: { id: story.id as string } });
      },
    },
  ];

  return (
    <Screen flush style={styles.screen}>
      {/* ── Kapak — Figma: 360, üç duraklı gece degradesi ───── */}
      <LinearGradient
        colors={[palette.royalPurple, palette.purple600, palette.lavender]}
        locations={[0, 0.6, 1]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={styles.hero}
      >
        {HERO_STARS.map((star, i) => (
          <View
            key={i}
            style={[
              styles.star,
              {
                width: star.size,
                height: star.size,
                opacity: star.opacity,
                top: star.top,
                left: star.left,
              },
            ]}
          />
        ))}

        {CONFETTI.map((dot, i) => (
          <View
            key={i}
            style={[styles.confetti, { backgroundColor: dot.color, top: dot.top, left: dot.left }]}
          />
        ))}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Geri dön"
          onPress={() => {
            router.back();
          }}
          style={[styles.heroButton, styles.heroBack]}
        >
          <ArrowLeftIcon size={18} color="#FFFFFF" />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Paylaş"
          onPress={() => {
            router.push({
              pathname: '/(app)/hikaye/[id]/paylas',
              params: { id: story.id as string },
            });
          }}
          style={[styles.heroButton, styles.heroShare]}
        >
          <ShareIcon size={16} color="#FFFFFF" />
        </Pressable>

        <Animated.View style={[styles.heroTile, { transform: [{ translateY: floatY }] }]}>
          <Text style={styles.heroEmoji} accessibilityElementsHidden>
            {visual.emoji}
          </Text>
        </Animated.View>
      </LinearGradient>

      <View style={styles.content}>
        {/* ── "EGE İÇİN HAZIRLANDI" hapı ─────────────────────── */}
        <View style={styles.pill}>
          <Text style={[styles.pillText, { color: colors.primary }]}>
            {(story.childId !== undefined
              ? `${story.heroName} için hazırlandı`
              : `${possessive(story.heroName)} masalı`
            ).toLocaleUpperCase('tr-TR')}
          </Text>
        </View>

        <Text accessibilityRole="header" style={[styles.h1, { color: colors.ink }]}>
          {story.title ?? `${possessive(story.heroName)} masalı`}
        </Text>

        {/* ── Meta satırı ────────────────────────────────────── */}
        {metaItems.length > 0 ? (
          <View style={styles.metaRow}>
            {metaItems.map((item) => (
              <View key={`${item.icon}-${item.textTr}`} style={styles.metaItem}>
                <Text style={styles.metaIcon} accessibilityElementsHidden>
                  {item.icon}
                </Text>
                <Text style={[styles.metaText, { color: colors.inkMuted }]}>{item.textTr}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* ── Üretim durumu (aşamalı teslim — işlev) ─────────── */}
        {job !== undefined && !isJobTerminal(job) ? (
          <JobProgressCard
            labelTr={job.progress.labelTr}
            current={job.progress.current}
            total={job.progress.total}
            detailTr={
              inProgress && story.pageCount > 0
                ? `${readyPages.length} / ${story.pageCount} sayfa hazır`
                : undefined
            }
          />
        ) : null}
        {job?.status === 'failed' ? (
          <NoticeBox
            tone="danger"
            titleTr="Üretimde bir sorun oldu"
            bodyTr={job.error?.messageTr ?? 'Krediniz harcanmadıysa yeniden deneyebilirsiniz.'}
          />
        ) : null}

        {/* ── ⏸ KAPI 1 — iskelet onayı (işlev) ───────────────── */}
        {awaitingGate1 && story.outline !== undefined ? (
          <Card>
            <Text variant="heading">{story.outline.titleTr}</Text>
            <Text variant="body" tone="muted">
              {story.outline.lessonTr}
            </Text>
            {story.outline.scenes.slice(0, 12).map((scene) => (
              <Text key={scene.pageNo} variant="body">
                {`${scene.pageNo}. ${scene.summaryTr}`}
              </Text>
            ))}
            <NoticeBox
              tone="info"
              titleTr="Beğendiyseniz devam edelim"
              bodyTr="Onayladığınızda masal metni yazılır ve resimler çizilir; kredi bu adımda harcanır."
            />
            <Button
              label="Devam et — masalı üret"
              busy={approveOutline.isPending}
              onPress={() => {
                approveOutline.mutate(
                  { storyId: story.id as string },
                  {
                    onSuccess: ({ jobId }) => {
                      setManualJobId(jobId);
                    },
                  },
                );
              }}
            />
            <Button
              label="Başka bir iskelet iste"
              variant="secondary"
              busy={rejectOutline.isPending}
              onPress={() => {
                rejectOutline.mutate(
                  { storyId: story.id as string },
                  {
                    onSuccess: ({ jobId }) => {
                      setManualJobId(jobId);
                    },
                  },
                );
              }}
            />
            {approveOutline.error !== null || rejectOutline.error !== null ? (
              <Text variant="caption" tone="danger">
                {(approveOutline.error ?? rejectOutline.error)?.messageTr}
              </Text>
            ) : null}
          </Card>
        ) : null}

        {/* ── ⏸ KAPI 2 — hikaye onayı (işlev) ────────────────── */}
        {awaitingGate2 ? (
          <NoticeBox
            tone="info"
            titleTr="Masal hazır — son bir bakış"
            bodyTr="Sayfaları inceleyin, isterseniz düzeltin. Onayladıktan sonra seslendirme ve baskı açılır."
          >
            <Button
              label="Hikayeyi onayla"
              busy={approveStory.isPending}
              onPress={() => {
                approveStory.mutate({ storyId: story.id as string });
              }}
            />
            <Button
              label="Sayfaları incele"
              variant="secondary"
              onPress={() => {
                setPagesOpen(true);
              }}
            />
            {approveStory.error !== null ? (
              <Text variant="caption" tone="danger">
                {approveStory.error.messageTr}
              </Text>
            ) : null}
          </NoticeBox>
        ) : null}

        {/* ── "Dinlemeye Başla" CTA — Figma degrade düğme ────── */}
        {canListen && !awaitingGate2 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={story.audio.length > 0 ? 'Dinlemeye başla' : 'Okumaya başla (sessiz)'}
            onPress={() => {
              router.push({
                pathname: '/(app)/hikaye/[id]/oynat',
                params: { id: story.id as string },
              });
            }}
            style={({ pressed }) => [pressed && styles.pressedDim]}
          >
            <LinearGradient
              colors={[palette.nightPurple, palette.purple600]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.listenCta}
            >
              <PlayIcon size={20} color="#FFFFFF" />
              <Text style={styles.listenLabel}>
                {story.audio.length > 0 ? 'Dinlemeye Başla' : 'Okumaya Başla'}
              </Text>
            </LinearGradient>
          </Pressable>
        ) : null}

        {/* ── Beş eylem kartı — Figma birebir ────────────────── */}
        {canListen ? (
          <View style={styles.actionGrid}>
            {gridActions.map((action) => (
              <Pressable
                key={action.labelTr}
                accessibilityRole="button"
                accessibilityLabel={action.labelTr}
                onPress={action.onPress}
                style={({ pressed }) => [
                  styles.actionCell,
                  {
                    backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text style={styles.actionEmoji} accessibilityElementsHidden>
                  {action.emoji}
                </Text>
                <Text style={[styles.actionLabel, { color: colors.inkMuted }]}>
                  {action.labelTr}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {/* ── Hikâyeden bir kesit ────────────────────────────── */}
        {readyPages[0]?.textTr !== undefined ? (
          <View
            style={[
              styles.excerptCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.pillText, styles.excerptKicker, { color: colors.primary }]}>
              {'Hikâyeden bir kesit'.toLocaleUpperCase('tr-TR')}
            </Text>
            <Text style={[styles.excerptText, { color: colors.ink }]} numberOfLines={5}>
              {`"${readyPages[0].textTr}"`}
            </Text>
          </View>
        ) : null}

        {/* ── Çevrimdışı (işlev — ürünün indirme girişi) ─────── */}
        {canListen ? <OfflineCard story={story} /> : null}

        {/* ── Silme (işlev) ──────────────────────────────────── */}
        <Button
          label="Hikayeyi sil"
          variant="danger"
          onPress={() => {
            setDeleteOpen(true);
          }}
        />
      </View>

      {/* ── Sheet'ler ────────────────────────────────────────── */}
      <PagesSheet
        story={story}
        offlineMeta={offlineMeta}
        open={pagesOpen}
        onClose={() => {
          setPagesOpen(false);
        }}
        onSelectPage={(pageNo) => {
          setPagesOpen(false);
          setEditPageNo(pageNo);
        }}
      />

      <PageEditSheet
        storyId={story.id as string}
        page={editPage}
        open={editPage !== undefined}
        onClose={() => {
          setEditPageNo(undefined);
        }}
        onJobStarted={setManualJobId}
      />

      <Sheet
        open={deleteOpen}
        onClose={() => {
          setDeleteOpen(false);
        }}
        titleTr="Hikayeyi sil"
      >
        <Text variant="body">
          {`"${story.title ?? possessive(story.heroName) + ' masalı'}" kalıcı olarak silinecek. Basılmış kitaplarınız etkilenmez.`}
        </Text>
        <Button
          label="Evet, sil"
          variant="danger"
          busy={deleteStory.isPending}
          onPress={() => {
            deleteStory.mutate(
              { storyId: story.id as string },
              {
                onSuccess: () => {
                  setDeleteOpen(false);
                  router.back();
                },
              },
            );
          }}
        />
        <Button
          label="Vazgeç"
          variant="secondary"
          onPress={() => {
            setDeleteOpen(false);
          }}
        />
        {deleteStory.error !== null ? (
          <Text variant="caption" tone="danger">
            {deleteStory.error.messageTr}
          </Text>
        ) : null}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  /* Dikey ritim tasarımdaki kenar boşluklarıyla kurulur. */
  screen: { gap: 0 },
  pressedDim: { opacity: 0.85 },

  /* Kapak — Figma: 360, yıldızlar, konfeti, 160'lık camsı karo. */
  hero: {
    height: 360,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  star: { position: 'absolute', borderRadius: 2, backgroundColor: '#FFFFFF' },
  confetti: { position: 'absolute', width: 8, height: 8, borderRadius: 4 },
  heroButton: {
    position: 'absolute',
    top: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  heroBack: { left: 20 },
  heroShare: { right: 20 },
  heroTile: {
    width: 160,
    height: 160,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.3,
    shadowRadius: 60,
    shadowOffset: { width: 0, height: 20 },
    elevation: 10,
  },
  heroEmoji: { fontSize: 72, lineHeight: 88 },

  /* İçerik — Figma: padding 28 24 0. */
  content: { paddingHorizontal: 24, paddingTop: 28, paddingBottom: 40, gap: 16 },

  /* Hap — Figma: rgba(124,92,191,0.1), yarıçap 20, 6/14 dolgu. */
  pill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(124,92,191,0.1)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginBottom: -4,
  },
  pillText: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.72,
  },

  h1: {
    fontFamily: fontFamilies.display,
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -0.3,
  },

  /* Meta — Figma: gap 16, ikon 14, metin 13/600. */
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 12 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaIcon: { fontSize: 14, lineHeight: 18 },
  metaText: { fontFamily: fontFamilies.bodySemiBold, fontSize: 13, lineHeight: 18 },

  /* CTA — Figma: 20 dolgu, yarıçap 20, 18/800 metin, mor gölge. */
  listenCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 20,
    borderRadius: 20,
    shadowColor: '#7C5CBF',
    shadowOpacity: 0.4,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  listenLabel: {
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: 18,
    lineHeight: 24,
    color: '#FFFFFF',
  },

  /* Beş eylem — Figma: 5 sütun, yarıçap 14, 12/4 dolgu, 10/700 etiket. */
  actionGrid: { flexDirection: 'row', gap: 8 },
  actionCell: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: 14,
    borderWidth: 1,
  },
  actionEmoji: { fontSize: 20, lineHeight: 26 },
  actionLabel: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: 10,
    lineHeight: 14,
    textAlign: 'center',
  },

  /* Kesit kartı — Figma: yarıçap 20, 20 dolgu, Fraunces 15 italik. */
  excerptCard: { marginTop: 12, padding: 20, borderRadius: 20, borderWidth: 1 },
  excerptKicker: { marginBottom: 10 },
  excerptText: {
    fontFamily: fontFamilies.display,
    fontSize: 15,
    lineHeight: 26,
    fontStyle: 'italic',
  },
});
