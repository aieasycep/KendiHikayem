import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';

import { useQueryClient } from '@tanstack/react-query';

import type { StoryExport } from '@kendihikayem/contract';
import {
  Badge,
  Button,
  Card,
  ErrorState,
  JobProgressCard,
  NoticeBox,
  Row,
  Screen,
  Skeleton,
  Text,
} from '@kendihikayem/ui';

import { useCreateExport, useExports, useRenditions } from '../../../../features/player/hooks';
import { useStory } from '../../../../features/library/hooks';
import { isJobTerminal, useJob } from '../../../../lib/useJob';

const KIND_TR: Record<StoryExport['kind'], string> = {
  pdf: 'PDF kitap',
  mp4: 'Sesli video (MP4)',
};

const STATUS_TR: Record<StoryExport['status'], string> = {
  queued: 'Sırada',
  running: 'Hazırlanıyor',
  ready: 'Hazır',
  failed: 'Başarısız',
};

function formatSize(bytes: number | undefined): string {
  if (bytes === undefined) return '';
  return ` · ${(bytes / 1_000_000).toFixed(1).replace('.', ',')} MB`;
}

/** P05 — paylaş: PDF / MP4 dışa aktarma + basılı kitaptaki QR'ın hikayesi. */
export default function Paylas(): ReactNode {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();

  const storyQuery = useStory(id);
  const exportsQuery = useExports(id);
  const renditions = useRenditions(id);
  const createExport = useCreateExport();

  const [jobId, setJobId] = useState<string | undefined>(undefined);
  const { job } = useJob(jobId);

  useEffect(() => {
    if (isJobTerminal(job)) {
      setJobId(undefined);
      void queryClient.invalidateQueries({ queryKey: ['exports', id] });
    }
  }, [job, queryClient, id]);

  const defaultRendition = (renditions.data ?? []).find((r) => r.isDefault) ?? renditions.data?.[0];
  const busy = createExport.isPending || (job !== undefined && !isJobTerminal(job));

  return (
    <Screen>
      <Text variant="title">Paylaş</Text>
      <Text variant="body" tone="muted">
        Masalı aile büyükleriyle paylaşın: PDF olarak gönderin, sesli video yapın ya da
        basılı kitaptaki QR ile sesinizi armağan edin.
      </Text>

      {job !== undefined && !isJobTerminal(job) ? (
        <JobProgressCard
          labelTr={job.progress.labelTr}
          current={job.progress.current}
          total={job.progress.total}
        />
      ) : null}
      {job?.status === 'failed' ? (
        <NoticeBox
          tone="danger"
          titleTr="Dışa aktarma başarısız"
          bodyTr={job.error?.messageTr ?? 'Birkaç dakika sonra tekrar deneyin.'}
        />
      ) : null}

      {/* ── Yeni dışa aktarma ──────────────────────────────── */}
      <Card>
        <Text variant="heading">Yeni dosya oluştur</Text>
        <Button
          label="PDF kitap oluştur"
          variant="secondary"
          busy={createExport.isPending}
          disabled={busy}
          onPress={() => {
            createExport.mutate(
              { storyId: id ?? '', kind: 'pdf' },
              { onSuccess: ({ jobId: newJobId }) => setJobId(newJobId) },
            );
          }}
        />
        <Button
          label={
            defaultRendition !== undefined
              ? `Sesli video oluştur (${defaultRendition.voiceLabel})`
              : 'Sesli video oluştur'
          }
          variant="secondary"
          busy={createExport.isPending}
          disabled={busy || defaultRendition === undefined}
          onPress={() => {
            createExport.mutate(
              {
                storyId: id ?? '',
                kind: 'mp4',
                ...(defaultRendition !== undefined
                  ? { renditionId: defaultRendition.id as string }
                  : {}),
              },
              { onSuccess: ({ jobId: newJobId }) => setJobId(newJobId) },
            );
          }}
        />
        {defaultRendition === undefined ? (
          <Text variant="caption" tone="muted">
            Sesli video için önce bir seslendirme oluşturun (Sesler ekranı).
          </Text>
        ) : null}
        {createExport.error !== null ? (
          <Text variant="caption" tone="danger">
            {createExport.error.messageTr}
          </Text>
        ) : null}
      </Card>

      {/* ── Hazır dosyalar ─────────────────────────────────── */}
      <Text variant="heading">Hazır dosyalar</Text>
      {exportsQuery.isLoading ? (
        <>
          <Skeleton height={72} rounded />
          <Skeleton height={72} rounded />
        </>
      ) : exportsQuery.isError ? (
        <ErrorState
          compact
          messageTr={exportsQuery.error.messageTr}
          onRetry={() => {
            void exportsQuery.refetch();
          }}
        />
      ) : (exportsQuery.data ?? []).length === 0 ? (
        <Card>
          <Text variant="body" tone="muted">
            Henüz dışa aktarılan dosya yok.
          </Text>
        </Card>
      ) : (
        (exportsQuery.data ?? []).map((item) => (
          <Card key={item.id as string}>
            <Row justify="space-between">
              <Text variant="bodyStrong">{KIND_TR[item.kind]}</Text>
              <Badge
                labelTr={STATUS_TR[item.status]}
                tone={item.status === 'ready' ? 'success' : item.status === 'failed' ? 'danger' : 'neutral'}
              />
            </Row>
            <Text variant="caption" tone="muted">
              {`Oluşturulma: ${new Date(item.createdAt).toLocaleDateString('tr-TR')}${formatSize(item.media?.sizeBytes)}`}
            </Text>
            {item.status === 'ready' && item.media !== undefined ? (
              <Text variant="caption" tone="muted" numberOfLines={1}>
                {`Bağlantı: ${item.media.url}`}
              </Text>
            ) : null}
          </Card>
        ))
      )}

      {/* ── QR hikayesi ────────────────────────────────────── */}
      <NoticeBox
        titleTr="Basılı kitapta QR ile sesiniz"
        bodyTr={
          storyQuery.data?.audio.some((r) => r.voiceKind === 'cloned')
            ? 'Kitabı bastırırken "her sayfaya QR" seçeneğini açarsanız, kitabı okuyan büyükanne o sayfayı telefonuyla okutup sizin sesinizden dinler — uygulama kurmasına gerek kalmaz.'
            : 'Kendi sesinizi kaydederseniz, basılı kitabın her sayfasına o sayfayı sizin sesinizle çalan bir QR eklenebilir. Kitabı okutan kişi uygulama kurmadan dinler.'
        }
      />
    </Screen>
  );
}
