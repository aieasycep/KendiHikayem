import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { useQueryClient } from '@tanstack/react-query';

import type { AudioRenditionSummary } from '@kendihikayem/contract';
import {
  Badge,
  Button,
  Card,
  Chip,
  ErrorState,
  JobProgressCard,
  NoticeBox,
  Row,
  Screen,
  Skeleton,
  Text,
} from '@kendihikayem/ui';

import {
  useCreateRendition,
  useRemoveRendition,
  useRenditions,
  useSetDefaultRendition,
} from '../../../../features/player/hooks';
import { useSystemVoices, useVoiceProfiles } from '../../../../features/settings/hooks';
import { useApproveStory, useStory } from '../../../../features/library/hooks';
import { isJobTerminal, useJob } from '../../../../lib/useJob';
import { DEMO_AUDIO_NOTE_TR, DEMO_MEDIA_ACTIVE } from '../../../../lib/demoMedia';

function renditionSubtitle(rendition: AudioRenditionSummary): string {
  const duration =
    rendition.durationMs !== undefined
      ? `${Math.round(rendition.durationMs / 60_000)} dk`
      : 'süre bilinmiyor';
  if (rendition.status === 'stale') return `${duration} · metin değişti, ses eski`;
  if (rendition.status === 'failed') return 'üretilemedi';
  if (rendition.status === 'queued' || rendition.status === 'running') return 'hazırlanıyor';
  return duration;
}

/** P04 — bu hikayenin sesleri: dinlenecek sesi seç, yenisini üret. */
export default function Sesler(): ReactNode {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const storyQuery = useStory(id);
  const renditions = useRenditions(id);
  const systemVoices = useSystemVoices();
  const voiceProfiles = useVoiceProfiles();

  const createRendition = useCreateRendition();
  const setDefault = useSetDefaultRendition();
  const removeRendition = useRemoveRendition();
  const approveStory = useApproveStory();

  const [jobId, setJobId] = useState<string | undefined>(undefined);
  const { job } = useJob(jobId);

  useEffect(() => {
    if (isJobTerminal(job)) {
      setJobId(undefined);
      void queryClient.invalidateQueries({ queryKey: ['audio-list', id] });
      void queryClient.invalidateQueries({ queryKey: ['player', id] });
    }
  }, [job, queryClient, id]);

  const story = storyQuery.data;
  const notApproved = story !== undefined && story.status !== 'approved';
  const readyProfiles = (voiceProfiles.data?.items ?? []).filter(
    (profile) => profile.status === 'ready',
  );

  return (
    <Screen>
      <Text variant="title">Sesler</Text>
      <Text variant="body" tone="muted">
        Masalı kimin sesiyle dinleyeceğinizi burada seçersiniz. Sistem sesleri her zaman
        hazırdır; kendi sesiniz bir kez klonlanır, sonra tüm masallarda kullanılır.
      </Text>

      {DEMO_MEDIA_ACTIVE ? (
        /* DÜRÜSTLÜK: demo derlemesinde bütün seslendirmeler aynı ninniyi çalar. */
        <NoticeBox tone="info" titleTr="Bu derlemede sesler demo" bodyTr={DEMO_AUDIO_NOTE_TR} />
      ) : null}

      {notApproved ? (
        <NoticeBox
          tone="info"
          titleTr="Önce hikayeyi onaylayın"
          bodyTr="Seslendirme, hikaye onaylandıktan sonra başlatılabilir — böylece yanlışlıkla eski bir metni seslendirmezsiniz."
        >
          <Button
            label="Hikayeyi onayla"
            busy={approveStory.isPending}
            onPress={() => {
              approveStory.mutate({ storyId: id ?? '' });
            }}
          />
        </NoticeBox>
      ) : null}

      {job !== undefined && !isJobTerminal(job) ? (
        <JobProgressCard labelTr={job.progress.labelTr} current={job.progress.current} total={job.progress.total} />
      ) : null}
      {job?.status === 'failed' ? (
        <NoticeBox tone="danger" titleTr="Seslendirme başarısız" bodyTr={job.error?.messageTr ?? 'Tekrar deneyebilirsiniz; krediniz iade edildi.'} />
      ) : null}

      {/* ── Mevcut sesler ──────────────────────────────────── */}
      <Text variant="heading">Bu masalın sesleri</Text>
      {renditions.isLoading ? (
        <>
          <Skeleton height={84} rounded />
          <Skeleton height={84} rounded />
        </>
      ) : renditions.isError ? (
        <ErrorState
          compact
          messageTr={renditions.error.messageTr}
          onRetry={() => {
            void renditions.refetch();
          }}
        />
      ) : (renditions.data ?? []).length === 0 ? (
        <Card>
          <Text variant="body" tone="muted">
            Henüz seslendirme yok. Aşağıdan bir ses seçin — masal yine de sessiz okunabilir.
          </Text>
        </Card>
      ) : (
        (renditions.data ?? []).map((rendition) => (
          <Card key={rendition.id as string}>
            <Row justify="space-between">
              <Text variant="bodyStrong">{rendition.voiceLabel}</Text>
              <Row gap="xs">
                {rendition.isDefault ? <Badge labelTr="Varsayılan" tone="accent" /> : null}
                {rendition.status === 'stale' ? <Badge labelTr="Güncellenecek" tone="warning" /> : null}
              </Row>
            </Row>
            <Text variant="caption" tone="muted">
              {renditionSubtitle(rendition)}
            </Text>
            <Row gap="sm" wrap>
              <Button
                label="Bu sesle dinle"
                compact
                variant="secondary"
                onPress={() => {
                  router.push({
                    pathname: '/(app)/hikaye/[id]/oynat',
                    params: { id: id ?? '', renditionId: rendition.id as string },
                  });
                }}
              />
              {!rendition.isDefault ? (
                <Button
                  label="Varsayılan yap"
                  compact
                  variant="ghost"
                  busy={setDefault.isPending}
                  onPress={() => {
                    setDefault.mutate({ storyId: id ?? '', renditionId: rendition.id as string });
                  }}
                />
              ) : null}
              <Button
                label="Sil"
                compact
                variant="danger"
                busy={removeRendition.isPending}
                onPress={() => {
                  removeRendition.mutate({ storyId: id ?? '', renditionId: rendition.id as string });
                }}
              />
            </Row>
          </Card>
        ))
      )}

      {/* ── Yeni seslendirme ───────────────────────────────── */}
      <Text variant="heading">Yeni seslendirme</Text>

      {readyProfiles.length > 0 ? (
        <Card>
          <Text variant="bodyStrong">Kendi sesleriniz</Text>
          <Row gap="sm" wrap>
            {readyProfiles.map((profile) => (
              <Chip
                key={profile.id as string}
                label={profile.displayName}
                icon="🎙"
                disabled={notApproved || createRendition.isPending}
                onPress={() => {
                  createRendition.mutate(
                    {
                      storyId: id ?? '',
                      voiceKind: 'cloned',
                      voiceProfileId: profile.id as string,
                    },
                    { onSuccess: ({ jobId: newJobId }) => setJobId(newJobId) },
                  );
                }}
              />
            ))}
          </Row>
        </Card>
      ) : (
        <Card
          onPress={() => {
            router.push('/(app)/ses');
          }}
        >
          <Text variant="bodyStrong">Kendi sesinizle okuyun</Text>
          <Text variant="body" tone="muted">
            Sesinizi bir kez kaydedin; Elif her masalı sizin sesinizle dinlesin. Kurulum ~3
            dakika sürer, istediğiniz an silebilirsiniz.
          </Text>
          <Text variant="label" tone="accent">
            Ses kurulumuna git ›
          </Text>
        </Card>
      )}

      <Card>
        <Text variant="bodyStrong">Sistem sesleri</Text>
        {systemVoices.isLoading ? (
          <Skeleton height={40} rounded />
        ) : systemVoices.isError ? (
          <Text variant="caption" tone="danger">
            {systemVoices.error.messageTr}
          </Text>
        ) : (
          <View style={{ gap: 8 }}>
            {(systemVoices.data ?? []).map((voice) => (
              <Row key={voice.code} justify="space-between">
                <View style={{ flex: 1 }}>
                  <Text variant="body">{voice.displayName}</Text>
                  <Text variant="caption" tone="muted">
                    {voice.descriptionTr}
                  </Text>
                </View>
                <Button
                  label="Seslendir"
                  compact
                  variant="secondary"
                  disabled={notApproved || createRendition.isPending}
                  busy={createRendition.isPending}
                  onPress={() => {
                    createRendition.mutate(
                      { storyId: id ?? '', voiceKind: 'system', systemVoiceCode: voice.code },
                      { onSuccess: ({ jobId: newJobId }) => setJobId(newJobId) },
                    );
                  }}
                />
              </Row>
            ))}
          </View>
        )}
      </Card>

      {createRendition.error !== null ? (
        <NoticeBox
          tone="danger"
          titleTr="Seslendirme başlatılamadı"
          bodyTr={createRendition.error.messageTr}
        >
          {createRendition.error.code === 'CONSENT_REQUIRED' ? (
            <Button
              label="Ses izinlerine git"
              variant="secondary"
              onPress={() => {
                router.push('/(app)/ses');
              }}
            />
          ) : null}
        </NoticeBox>
      ) : null}
    </Screen>
  );
}
