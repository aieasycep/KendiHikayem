import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type TextStyle } from 'react-native';

import { useQueryClient } from '@tanstack/react-query';

import type { Story, StoryPage } from '@kendihikayem/contract';
import { possessive } from '@kendihikayem/shared';
import {
  Badge,
  Button,
  Card,
  ErrorState,
  JobProgressCard,
  MediaImage,
  NoticeBox,
  PlayIcon,
  Row,
  Screen,
  Sheet,
  Skeleton,
  Text,
  palette,
  useTheme,
} from '@kendihikayem/ui';

import { PageEditSheet } from '../../../../features/library/PageEditSheet';
import { OfflineCard } from '../../../../features/library/OfflineCard';
import { coverVisual } from '../../../../features/library/cover';
import { ArrowLeftIcon } from '../../../../features/library/icons';
import {
  isStoryInProgress,
  useApproveStory,
  useDeleteStory,
  useStory,
  useToggleFavorite,
} from '../../../../features/library/hooks';
import { useOfflineIndex } from '../../../../features/library/offline';
import { useApproveOutline, useRejectOutline } from '../../../../features/library/outlineHooks';
import { isJobTerminal, useJob } from '../../../../lib/useJob';

const STATUS_TR: Record<Story['status'], string> = {
  draft: 'Taslak',
  outline_generating: 'İskelet hazırlanıyor',
  outline_ready: 'Onayınızı bekliyor',
  outline_rejected: 'İskelet reddedildi',
  content_generating: 'Masal yazılıyor',
  content_ready: 'Resimler bekleniyor',
  images_generating: 'Resimler çiziliyor',
  ready: 'Hazır — onayınızı bekliyor',
  approved: 'Hazır',
  failed: 'Üretim başarısız',
};

/** Hero yıldız alanı — her açılışta aynı yerleşim (render'da Math.random yok). */
const HERO_STARS = Array.from({ length: 16 }, (_, i) => ({
  size: i % 3 === 0 ? 4 : 2,
  opacity: 0.3 + (i % 4) * 0.1,
  top: `${(i * 53 + 7) % 100}%` as const,
  left: `${(i * 71 + 11) % 100}%` as const,
}));

/**
 * Hikaye detayı — Figma `StoryResult.tsx` taşıması: sinematik gece degradeli
 * kapak, "«çocuk» için hazırlandı" rozeti, büyük serif başlık, meta satırı,
 * degrade "Dinlemeye Başla" CTA'sı, ikincil eylem ızgarası ve "Hikâyeden bir
 * kesit" kartı.
 *
 * İŞLEV KORUNDU: P02/P03 sayfa düzenleme, Kapı 1 + Kapı 2 onayları, iş takibi,
 * favori, çevrimdışı indirme, silme onayı.
 */
export default function HikayeDetay(): ReactNode {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors, radius, type } = useTheme();
  const { id, sayfa } = useLocalSearchParams<{ id: string; sayfa?: string }>();

  const storyQuery = useStory(id);
  const story = storyQuery.data;

  const offlineIndex = useOfflineIndex();
  const offlineMeta = id !== undefined ? offlineIndex.data?.[id] : undefined;

  const toggleFavorite = useToggleFavorite();
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

  if (storyQuery.isLoading) {
    return (
      <Screen>
        <Skeleton height={260} rounded />
        <Skeleton height={30} width="70%" />
        <Skeleton height={18} width="50%" />
        <Skeleton height={56} rounded />
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
  const approved = story.status === 'approved';
  const awaitingGate2 = story.status === 'ready';
  const awaitingGate1 = story.status === 'outline_ready';

  const visual = coverVisual(story.id as string);
  const defaultRendition =
    story.audio.find((r) => r.isDefault && r.status === 'succeeded') ??
    story.audio.find((r) => r.status === 'succeeded' || r.status === 'stale');

  /** Meta satırı — tasarımdaki "6 dakika · Anne'nin sesi · Uzay" dizisi. */
  const metaItems: { icon: string; textTr: string }[] = [
    { icon: '📖', textTr: `${story.pageCount} sayfa` },
    { icon: '🧒', textTr: `${story.ageBand} yaş` },
    ...(defaultRendition?.durationMs !== undefined
      ? [
          {
            icon: '⏱',
            textTr: `${Math.max(1, Math.round(defaultRendition.durationMs / 60_000))} dk`,
          },
        ]
      : []),
    ...(defaultRendition !== undefined
      ? [{ icon: '🎙', textTr: defaultRendition.voiceLabel }]
      : []),
  ];

  /** İkincil eylem ızgarası — tasarımdaki emoji kartları, gerçek rotalara bağlı. */
  const gridActions: { emoji: string; labelTr: string; onPress: () => void }[] = [
    {
      emoji: '🎙',
      labelTr: 'Sesler',
      onPress: () => {
        router.push({ pathname: '/(app)/hikaye/[id]/sesler', params: { id: story.id as string } });
      },
    },
    {
      emoji: '🔗',
      labelTr: 'Paylaş',
      onPress: () => {
        router.push({ pathname: '/(app)/hikaye/[id]/paylas', params: { id: story.id as string } });
      },
    },
    {
      emoji: '📚',
      labelTr: 'Bastır',
      onPress: () => {
        router.push({ pathname: '/(app)/bastir/[id]', params: { id: story.id as string } });
      },
    },
  ];

  const serifExcerpt: TextStyle = { ...type.heading, fontSize: 15, lineHeight: 24 };

  return (
    <Screen flush>
      {/* ── Sinematik kapak ────────────────────────────────── */}
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
          accessibilityLabel={story.isFavorite ? 'Favorilerden çıkar' : 'Favorilere ekle'}
          onPress={() => {
            toggleFavorite.mutate({ storyId: story.id as string, isFavorite: !story.isFavorite });
          }}
          style={[styles.heroButton, styles.heroFavorite]}
        >
          <Text variant="heading" style={styles.heroHeart}>
            {story.isFavorite ? '♥' : '♡'}
          </Text>
        </Pressable>

        <View style={styles.heroTile}>
          <Text style={styles.heroEmoji} accessibilityElementsHidden>
            {visual.emoji}
          </Text>
        </View>
      </LinearGradient>

      <View style={styles.content}>
        {/* ── Bilgi bloğu ──────────────────────────────────── */}
        <View
          style={[styles.pill, { backgroundColor: colors.surfaceRaised, borderRadius: radius.pill }]}
        >
          <Text variant="caption" style={[styles.pillText, { color: colors.primary }]}>
            {story.childId !== undefined
              ? `${story.heroName} için hazırlandı`.toLocaleUpperCase('tr-TR')
              : `${possessive(story.heroName)} masalı`.toLocaleUpperCase('tr-TR')}
          </Text>
        </View>

        <Text variant="title" accessibilityRole="header">
          {story.title ?? `${possessive(story.heroName)} masalı`}
        </Text>

        <Row gap="md" wrap>
          {metaItems.map((item) => (
            <Row key={`${item.icon}-${item.textTr}`} gap="xs">
              <Text variant="caption" accessibilityElementsHidden>
                {item.icon}
              </Text>
              <Text variant="caption" tone="muted">
                {item.textTr}
              </Text>
            </Row>
          ))}
        </Row>

        <Row gap="xs" wrap>
          <Badge
            labelTr={STATUS_TR[story.status]}
            tone={approved ? 'success' : inProgress ? 'accent' : 'neutral'}
          />
          {story.audio
            .filter((rendition) => rendition.status === 'succeeded' || rendition.status === 'stale')
            .map((rendition) => (
              <Badge
                key={rendition.id as string}
                labelTr={rendition.voiceLabel}
                tone={rendition.status === 'stale' ? 'warning' : 'accent'}
                icon="🔊"
              />
            ))}
        </Row>

        {/* ── Üretim durumu (aşamalı teslim) ───────────────── */}
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

        {/* ── ⏸ KAPI 1 — iskelet onayı ─────────────────────── */}
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

        {/* ── ⏸ KAPI 2 — hikaye onayı ──────────────────────── */}
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
            {approveStory.error !== null ? (
              <Text variant="caption" tone="danger">
                {approveStory.error.messageTr}
              </Text>
            ) : null}
          </NoticeBox>
        ) : null}

        {/* ── Ana eylem: dinle ─────────────────────────────── */}
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
              style={[styles.listenCta, { borderRadius: radius.lg }]}
            >
              <PlayIcon size={20} color="#FFFFFF" />
              <Text variant="bodyStrong" style={styles.listenLabel}>
                {story.audio.length > 0 ? 'Dinlemeye Başla' : 'Okumaya Başla'}
              </Text>
            </LinearGradient>
          </Pressable>
        ) : null}
        {canListen && awaitingGate2 ? (
          <Button
            label="Önizle ve dinle"
            variant="secondary"
            onPress={() => {
              router.push({
                pathname: '/(app)/hikaye/[id]/oynat',
                params: { id: story.id as string },
              });
            }}
          />
        ) : null}

        {/* ── İkincil eylem ızgarası ───────────────────────── */}
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
                    borderRadius: radius.sm,
                  },
                ]}
              >
                <Text style={styles.actionEmoji} accessibilityElementsHidden>
                  {action.emoji}
                </Text>
                <Text variant="caption" style={styles.actionLabel} tone="muted">
                  {action.labelTr}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {/* ── Hikâyeden bir kesit ──────────────────────────── */}
        {readyPages[0]?.textTr !== undefined ? (
          <Card>
            <Text variant="caption" style={[styles.pillText, { color: colors.primary }]}>
              {'Hikâyeden bir kesit'.toLocaleUpperCase('tr-TR')}
            </Text>
            <Text style={serifExcerpt} numberOfLines={5}>
              {`“${readyPages[0].textTr}”`}
            </Text>
          </Card>
        ) : null}

        {/* ── Çevrimdışı ───────────────────────────────────── */}
        {canListen ? <OfflineCard story={story} /> : null}

        {/* ── Sayfalar ─────────────────────────────────────── */}
        {readyPages.length > 0 ? (
          <>
            <Text variant="heading">Sayfalar</Text>
            <View style={styles.pageGrid}>
              {story.pages.map((page) => {
                const pageReady = page.textTr !== undefined;
                return (
                  <Pressable
                    key={page.id as string}
                    accessibilityRole="button"
                    accessibilityLabel={`${page.pageNo}. sayfa${pageReady ? '' : ' — hazırlanıyor'}`}
                    disabled={!pageReady}
                    onPress={() => {
                      setEditPageNo(page.pageNo);
                    }}
                    style={styles.pageCell}
                  >
                    <MediaImage
                      uri={page.image?.url}
                      localUri={offlineMeta?.files[`page-${page.pageNo}`]}
                      placeholderLabelTr={`${page.pageNo}`}
                      placeholderNoteTr={
                        page.imageStatus === 'manual_review'
                          ? 'Resim kontrol ediliyor'
                          : pageReady
                            ? 'Resim hazırlanıyor'
                            : 'Sırada'
                      }
                      aspectRatio={1}
                      altTr={`${page.pageNo}. sayfa`}
                    />
                    <Row justify="space-between">
                      <Text variant="caption" tone="muted">{`Sayfa ${page.pageNo}`}</Text>
                      {page.editedByUser ? <Badge labelTr="Düzenlendi" tone="accent" /> : null}
                    </Row>
                    {pageReady ? (
                      <Text variant="caption" tone="muted" numberOfLines={2}>
                        {page.textTr}
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : null}

        {/* ── Tehlikeli bölge ──────────────────────────────── */}
        <Button
          label="Hikayeyi sil"
          variant="danger"
          onPress={() => {
            setDeleteOpen(true);
          }}
        />
      </View>

      {/* ── Sheet'ler ────────────────────────────────────────── */}
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
  pressedDim: { opacity: 0.85 },

  /* Hero */
  hero: {
    height: 280,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  star: { position: 'absolute', borderRadius: 2, backgroundColor: '#FFFFFF' },
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
  heroBack: { left: 16 },
  heroFavorite: { right: 16 },
  heroHeart: { color: '#FFFFFF', fontSize: 20, lineHeight: 24 },
  heroTile: {
    width: 150,
    height: 150,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroEmoji: { fontSize: 64, lineHeight: 80 },

  /* İçerik */
  content: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 48, gap: 16 },
  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  pillText: { fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 0.7 },

  /* Dinle CTA */
  listenCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 18,
    shadowColor: '#7C5CBF',
    shadowOpacity: 0.4,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  listenLabel: { color: '#FFFFFF' },

  /* Eylem ızgarası */
  actionGrid: { flexDirection: 'row', gap: 8 },
  actionCell: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderWidth: 1,
  },
  actionEmoji: { fontSize: 20, lineHeight: 26 },
  actionLabel: { fontSize: 12, lineHeight: 16, fontWeight: '700' },

  /* Sayfalar */
  pageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  pageCell: { width: '47%', gap: 6 },
});
