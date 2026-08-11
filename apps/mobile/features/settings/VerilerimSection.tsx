/**
 * A04 Verilerim — veri haritası (kim işliyor, nerede, ne kadar), KVKK m.11
 * başvuruları ve "verilerimi indir" (uzun iş).
 */

import { useEffect, useState, type ReactElement } from 'react';
import { Pressable, View } from 'react-native';

import type { PrivacyRequest, PrivacyRequestKind } from '@kendihikayem/contract';
import {
  Badge,
  Button,
  Card,
  CheckRow,
  Chip,
  ErrorState,
  Input,
  JobProgressCard,
  NoticeBox,
  Row,
  Sheet,
  Skeleton,
  Text,
} from '@kendihikayem/ui';

import { isJobTerminal, useJob } from '../../lib/useJob';
import {
  useCreatePrivacyRequest,
  useDataMap,
  usePrivacyExport,
  usePrivacyRequests,
} from './hooks';

const REQUEST_KINDS: Array<{ code: PrivacyRequestKind; labelTr: string }> = [
  { code: 'bilgi_talebi', labelTr: 'Bilgi talebi' },
  { code: 'erisim', labelTr: 'Verilerime erişim' },
  { code: 'duzeltme', labelTr: 'Düzeltme' },
  { code: 'silme', labelTr: 'Silme' },
  { code: 'aktarim_bilgisi', labelTr: 'Aktarım bilgisi' },
  { code: 'itiraz', labelTr: 'İtiraz' },
];

const REQUEST_STATUS_TR: Record<PrivacyRequest['status'], string> = {
  alindi: 'Alındı',
  inceleniyor: 'İnceleniyor',
  tamamlandi: 'Tamamlandı',
  reddedildi: 'Reddedildi',
};

export function VerilerimSection(): ReactElement {
  const dataMapQuery = useDataMap();
  const requestsQuery = usePrivacyRequests();
  const createRequest = useCreatePrivacyRequest();
  const exportMutation = usePrivacyExport();

  const [expanded, setExpanded] = useState<string | undefined>(undefined);
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestKind, setRequestKind] = useState<PrivacyRequestKind>('bilgi_talebi');
  const [requestDetail, setRequestDetail] = useState('');
  const [includeVoiceRaw, setIncludeVoiceRaw] = useState(false);

  const [exportJobId, setExportJobId] = useState<string | undefined>(undefined);
  const { job: exportJob } = useJob(exportJobId);
  const [exportDone, setExportDone] = useState(false);

  useEffect(() => {
    if (isJobTerminal(exportJob)) {
      setExportJobId(undefined);
      if (exportJob?.status === 'succeeded') setExportDone(true);
    }
  }, [exportJob]);

  return (
    <View style={{ gap: 12 }}>
      {/* ── Verilerimi indir ───────────────────────────────── */}
      <Card>
        <Text variant="bodyStrong">Verilerimi indir</Text>
        <Text variant="caption" tone="muted">
          Hesabınızdaki tüm verilerin paketi hazırlanır; hazır olunca bildirim ve e-posta gelir.
        </Text>
        <CheckRow
          labelTr="Ham ses kayıtlarımı da pakete ekle (dosya büyür)"
          checked={includeVoiceRaw}
          onChange={setIncludeVoiceRaw}
        />
        {exportJob !== undefined && !isJobTerminal(exportJob) ? (
          <JobProgressCard
            labelTr={exportJob.progress.labelTr}
            current={exportJob.progress.current}
            total={exportJob.progress.total}
          />
        ) : (
          <Button
            label="Paketi hazırla"
            variant="secondary"
            busy={exportMutation.isPending}
            onPress={() => {
              setExportDone(false);
              exportMutation.mutate(
                { includeVoiceRaw },
                { onSuccess: ({ jobId }) => setExportJobId(jobId) },
              );
            }}
          />
        )}
        {exportDone ? (
          <Text variant="caption" tone="success">
            Paketiniz hazır — indirme bağlantısı e-postanıza gönderildi.
          </Text>
        ) : null}
        {exportMutation.error !== null ? (
          <Text variant="caption" tone="danger">
            {exportMutation.error.messageTr}
          </Text>
        ) : null}
      </Card>

      {/* ── Veri haritası ──────────────────────────────────── */}
      <Text variant="heading">Verileriniz nerede?</Text>
      {dataMapQuery.isLoading ? (
        <Skeleton height={200} rounded />
      ) : dataMapQuery.isError ? (
        <ErrorState
          compact
          messageTr={dataMapQuery.error.messageTr}
          onRetry={() => {
            void dataMapQuery.refetch();
          }}
        />
      ) : (
        (dataMapQuery.data ?? []).map((category) => {
          const open = expanded === category.code;
          return (
            <Card key={category.code}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
                onPress={() => {
                  setExpanded(open ? undefined : category.code);
                }}
              >
                <Row justify="space-between">
                  <Text variant="bodyStrong">{category.titleTr}</Text>
                  <Text variant="label" tone="muted">
                    {open ? '⌃' : '⌄'}
                  </Text>
                </Row>
                <Text variant="caption" tone="muted">
                  {category.descriptionTr}
                </Text>
              </Pressable>
              {open ? (
                <View style={{ gap: 8 }}>
                  <Text variant="caption" tone="muted">
                    {`Tutulanlar: ${category.itemsTr.join(', ')}`}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {`Saklama: ${category.retentionTr}`}
                  </Text>
                  {category.processors.map((processor) => (
                    <View key={processor.name}>
                      <Text variant="caption">
                        {`• ${processor.name} (${processor.countryTr}) — ${processor.purposeTr}`}
                      </Text>
                      <Text variant="caption" tone="muted">
                        {`  Güvence: ${processor.safeguardTr}`}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </Card>
          );
        })
      )}

      {/* ── KVKK başvuruları ───────────────────────────────── */}
      <Text variant="heading">KVKK başvurularım</Text>
      {requestsQuery.isLoading ? (
        <Skeleton height={80} rounded />
      ) : requestsQuery.isError ? (
        <ErrorState
          compact
          messageTr={requestsQuery.error.messageTr}
          onRetry={() => {
            void requestsQuery.refetch();
          }}
        />
      ) : (requestsQuery.data ?? []).length === 0 ? (
        <Text variant="caption" tone="muted">
          Henüz başvurunuz yok.
        </Text>
      ) : (
        (requestsQuery.data ?? []).map((request) => (
          <Card key={request.id as string}>
            <Row justify="space-between">
              <Text variant="bodyStrong">
                {REQUEST_KINDS.find((k) => k.code === request.kind)?.labelTr ?? request.kind}
              </Text>
              <Badge
                labelTr={REQUEST_STATUS_TR[request.status]}
                tone={
                  request.status === 'tamamlandi'
                    ? 'success'
                    : request.status === 'reddedildi'
                      ? 'danger'
                      : 'accent'
                }
              />
            </Row>
            <Text variant="caption" tone="muted">
              {`Başvuru: ${new Date(request.createdAt).toLocaleDateString('tr-TR')} · Yanıt süresi: en geç ${new Date(request.dueAt).toLocaleDateString('tr-TR')}`}
            </Text>
            {request.responseTr !== undefined ? (
              <Text variant="caption">{request.responseTr}</Text>
            ) : null}
          </Card>
        ))
      )}
      <Button
        label="Yeni KVKK başvurusu"
        variant="secondary"
        onPress={() => {
          createRequest.reset();
          setRequestOpen(true);
        }}
      />

      <Sheet
        open={requestOpen}
        onClose={() => {
          setRequestOpen(false);
        }}
        titleTr="KVKK başvurusu"
      >
        <Text variant="caption" tone="muted">
          Başvurunuz kayıt altına alınır ve KVKK m.13 gereği en geç 30 gün içinde yanıtlanır.
        </Text>
        <Row gap="sm" wrap>
          {REQUEST_KINDS.map((kind) => (
            <Chip
              key={kind.code}
              label={kind.labelTr}
              selected={requestKind === kind.code}
              onPress={() => {
                setRequestKind(kind.code);
              }}
            />
          ))}
        </Row>
        <Input
          label="Detay (isteğe bağlı)"
          multiline
          value={requestDetail}
          onChangeText={setRequestDetail}
        />
        <Button
          label="Başvuruyu gönder"
          busy={createRequest.isPending}
          onPress={() => {
            createRequest.mutate(
              {
                kind: requestKind,
                ...(requestDetail.trim().length > 0 ? { detailTr: requestDetail.trim() } : {}),
              },
              {
                onSuccess: () => {
                  setRequestOpen(false);
                  setRequestDetail('');
                },
              },
            );
          }}
        />
        {createRequest.error !== null ? (
          <NoticeBox tone="danger" titleTr="Başvuru gönderilemedi" bodyTr={createRequest.error.messageTr} />
        ) : null}
      </Sheet>
    </View>
  );
}
