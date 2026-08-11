import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

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
  Row,
  Screen,
  Sheet,
  Skeleton,
  Text,
  useTheme,
} from '@kendihikayem/ui';

import { PageEditSheet } from '../../../../features/library/PageEditSheet';
import { OfflineCard } from '../../../../features/library/OfflineCard';
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

/** Hikaye detayı — P01'e giriş, P02/P03 düzenleme, Kapı 1 + Kapı 2, çevrimdışı. */
export default function HikayeDetay(): ReactNode {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
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
        <Row gap="md">
          <Skeleton width={96} height={96} rounded />
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton height={26} width="90%" />
            <Skeleton height={18} width="60%" />
            <Skeleton height={18} width="40%" />
          </View>
        </Row>
        <Skeleton height={52} rounded />
        <Skeleton aspectRatio={1.8} rounded />
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

  return (
    <Screen>
      {/* ── Başlık ─────────────────────────────────────────── */}
      <Row gap="md" align="flex-start">
        <MediaImage
          uri={story.cover?.url}
          placeholderLabelTr={story.title ?? story.heroName}
          aspectRatio={1}
          altTr="Kapak görseli"
          style={styles.cover}
        />
        <View style={styles.headerTexts}>
          <Text variant="title">{story.title ?? `${possessive(story.heroName)} masalı`}</Text>
          <Text variant="caption" tone="muted">
            {`${possessive(story.heroName)} masalı · ${story.ageBand} yaş · ${story.pageCount} sayfa`}
          </Text>
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
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={story.isFavorite ? 'Favorilerden çıkar' : 'Favorilere ekle'}
          onPress={() => {
            toggleFavorite.mutate({ storyId: story.id as string, isFavorite: !story.isFavorite });
          }}
          style={styles.favorite}
        >
          <Text variant="title" style={story.isFavorite ? { color: colors.danger } : undefined}>
            {story.isFavorite ? '♥' : '♡'}
          </Text>
        </Pressable>
      </Row>

      {/* ── Üretim durumu (aşamalı teslim) ─────────────────── */}
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

      {/* ── ⏸ KAPI 1 — iskelet onayı ───────────────────────── */}
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

      {/* ── ⏸ KAPI 2 — hikaye onayı ────────────────────────── */}
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

      {/* ── Ana eylemler ───────────────────────────────────── */}
      {canListen && !awaitingGate2 ? (
        <Button
          label={story.audio.length > 0 ? 'Dinle' : 'Oku (sessiz)'}
          onPress={() => {
            router.push({ pathname: '/(app)/hikaye/[id]/oynat', params: { id: story.id as string } });
          }}
        />
      ) : null}
      {canListen && awaitingGate2 ? (
        <Button
          label="Önizle ve dinle"
          variant="secondary"
          onPress={() => {
            router.push({ pathname: '/(app)/hikaye/[id]/oynat', params: { id: story.id as string } });
          }}
        />
      ) : null}
      {canListen ? (
        <Row gap="sm">
          <View style={styles.flex1}>
            <Button
              label="Sesler"
              variant="secondary"
              compact
              onPress={() => {
                router.push({
                  pathname: '/(app)/hikaye/[id]/sesler',
                  params: { id: story.id as string },
                });
              }}
            />
          </View>
          <View style={styles.flex1}>
            <Button
              label="Paylaş"
              variant="secondary"
              compact
              onPress={() => {
                router.push({
                  pathname: '/(app)/hikaye/[id]/paylas',
                  params: { id: story.id as string },
                });
              }}
            />
          </View>
          <View style={styles.flex1}>
            <Button
              label="Bastır"
              variant="secondary"
              compact
              onPress={() => {
                router.push({ pathname: '/(app)/bastir/[id]', params: { id: story.id as string } });
              }}
            />
          </View>
        </Row>
      ) : null}

      {/* ── Çevrimdışı ─────────────────────────────────────── */}
      {canListen ? <OfflineCard story={story} /> : null}

      {/* ── Sayfalar ───────────────────────────────────────── */}
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

      {/* ── Tehlikeli bölge ────────────────────────────────── */}
      <Button
        label="Hikayeyi sil"
        variant="danger"
        onPress={() => {
          setDeleteOpen(true);
        }}
      />

      {/* ── Sheet'ler ──────────────────────────────────────── */}
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
  cover: { width: 96 },
  headerTexts: { flex: 1, gap: 4 },
  favorite: { padding: 4 },
  flex1: { flex: 1 },
  pageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  pageCell: { width: '47%', gap: 6 },
});
