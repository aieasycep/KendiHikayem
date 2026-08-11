/**
 * A03 Sesim — ses profillerini dinle, sil, kötüye kullanımı bildir.
 *
 * Silme sonuçları kullanıcıya İŞLEMDEN ÖNCE gösterilir (kaç hikaye etkilenecek,
 * hikayelerin silinmeyeceği, sistem sesine dönüleceği). İşlem sonrası sunucunun
 * döndürdüğü `sideEffectsTr` teyit olarak basılır.
 */

import { useRouter } from 'expo-router';
import { useAudioPlayer } from 'expo-audio';
import { useMemo, useState, type ReactElement } from 'react';
import { View } from 'react-native';

import type { ReportReason, VoiceProfile } from '@kendihikayem/contract';
import {
  Badge,
  Button,
  Card,
  CheckRow,
  Chip,
  EmptyState,
  ErrorState,
  Input,
  NoticeBox,
  Row,
  Sheet,
  Skeleton,
  Text,
} from '@kendihikayem/ui';

import { useDeleteVoiceProfile, useSupportReport, useVoiceProfiles } from './hooks';

const STATUS_TR: Record<VoiceProfile['status'], string> = {
  draft: 'Taslak',
  recording: 'Kayıt sürüyor',
  processing: 'İşleniyor',
  preview_ready: 'Önizleme hazır',
  ready: 'Hazır',
  failed: 'Başarısız',
  revoked: 'Geri alındı',
};

const BADGE_TR: Record<NonNullable<VoiceProfile['qualityBadge']>, string> = {
  mukemmel: 'Mükemmel kalite',
  iyi: 'İyi kalite',
  kabul_edilebilir: 'Kabul edilebilir kalite',
};

const RELATION_TR: Record<VoiceProfile['relation'], string> = {
  anne: 'Anne',
  baba: 'Baba',
  diger: 'Diğer',
};

const REPORT_REASONS: Array<{ code: ReportReason; labelTr: string }> = [
  { code: 'izinsiz_ses_kullanimi', labelTr: 'Sesim izinsiz kullanılıyor' },
  { code: 'kisisel_veri', labelTr: 'Kişisel veri ihlali' },
  { code: 'teknik_hata', labelTr: 'Teknik hata' },
  { code: 'diger', labelTr: 'Diğer' },
];

function PreviewButton({ profile }: { profile: VoiceProfile }): ReactElement | null {
  const source = useMemo(
    () => (profile.preview !== undefined ? { uri: profile.preview.url } : null),
    [profile.preview],
  );
  const player = useAudioPlayer(source);
  if (profile.preview === undefined) return null;
  return (
    <Button
      label="Örneği dinle"
      variant="secondary"
      compact
      onPress={() => {
        try {
          player.seekTo(0).catch(() => undefined);
          player.play();
        } catch {
          /* örnek dosya bu ortamda olmayabilir; sessizce geç */
        }
      }}
    />
  );
}

export function SesimSection(): ReactElement {
  const router = useRouter();
  const profilesQuery = useVoiceProfiles();
  const deleteProfile = useDeleteVoiceProfile();
  const report = useSupportReport();

  const [deleteTarget, setDeleteTarget] = useState<VoiceProfile | undefined>(undefined);
  const [deleteAck, setDeleteAck] = useState(false);
  const [resultTr, setResultTr] = useState<string[] | undefined>(undefined);

  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<ReportReason>('izinsiz_ses_kullanimi');
  const [reportDetail, setReportDetail] = useState('');
  const [reportDoneTr, setReportDoneTr] = useState<string | undefined>(undefined);

  if (profilesQuery.isLoading) {
    return (
      <View style={{ gap: 12 }}>
        <Skeleton height={120} rounded />
        <Skeleton height={120} rounded />
      </View>
    );
  }

  if (profilesQuery.isError) {
    return (
      <ErrorState
        messageTr={profilesQuery.error.messageTr}
        onRetry={() => {
          void profilesQuery.refetch();
        }}
      />
    );
  }

  const profiles = profilesQuery.data?.items ?? [];
  const limit = profilesQuery.data?.limit ?? 2;

  return (
    <View style={{ gap: 12 }}>
      {profiles.length === 0 ? (
        <EmptyState
          icon="🎙"
          titleTr="Henüz kayıtlı sesiniz yok"
          bodyTr="Sesinizi ~3 dakikada kaydedin; her masal sizin sesinizle okunsun. İstediğiniz an tek dokunuşla silersiniz."
          actionLabelTr="Sesimi kaydet"
          onAction={() => {
            router.push('/(app)/ses');
          }}
        />
      ) : (
        <>
          {profiles.map((profile) => (
            <Card key={profile.id as string}>
              <Row justify="space-between">
                <Text variant="bodyStrong">{profile.displayName}</Text>
                <Badge
                  labelTr={STATUS_TR[profile.status]}
                  tone={
                    profile.status === 'ready'
                      ? 'success'
                      : profile.status === 'failed'
                        ? 'danger'
                        : 'neutral'
                  }
                />
              </Row>
              <Text variant="caption" tone="muted">
                {`${RELATION_TR[profile.relation]}${
                  profile.qualityBadge !== undefined ? ` · ${BADGE_TR[profile.qualityBadge]}` : ''
                } · ${profile.storiesUsingCount} hikayede kullanılıyor`}
              </Text>
              {profile.failureReasonTr !== undefined ? (
                <Text variant="caption" tone="danger">
                  {profile.failureReasonTr}
                </Text>
              ) : null}
              <Row gap="sm" wrap>
                <PreviewButton profile={profile} />
                <Button
                  label="Sesi sil"
                  variant="danger"
                  compact
                  onPress={() => {
                    setDeleteAck(false);
                    deleteProfile.reset();
                    setDeleteTarget(profile);
                  }}
                />
              </Row>
            </Card>
          ))}
          <Text variant="caption" tone="muted">
            {`${profiles.length} / ${limit} ses hakkı kullanıldı.`}
          </Text>
          {profiles.length < limit ? (
            <Button
              label="Yeni ses ekle"
              variant="secondary"
              onPress={() => {
                router.push('/(app)/ses');
              }}
            />
          ) : null}
        </>
      )}

      {resultTr !== undefined ? (
        <NoticeBox tone="info" titleTr="Ses silme başlatıldı" itemsTr={resultTr} />
      ) : null}

      <Card
        onPress={() => {
          setReportDoneTr(undefined);
          report.reset();
          setReportOpen(true);
        }}
      >
        <Text variant="bodyStrong">Kötüye kullanım bildir</Text>
        <Text variant="caption" tone="muted">
          Sesinizin izinsiz kullanıldığını düşünüyorsanız 72 saat içinde inceleriz.
        </Text>
      </Card>

      {/* ── Silme onayı ────────────────────────────────────── */}
      <Sheet
        open={deleteTarget !== undefined}
        onClose={() => {
          setDeleteTarget(undefined);
        }}
        titleTr={deleteTarget !== undefined ? `${deleteTarget.displayName} sesini sil` : ''}
      >
        {deleteTarget !== undefined ? (
          <>
            <NoticeBox
              tone="danger"
              titleTr="Silerseniz ne olur?"
              itemsTr={[
                `${deleteTarget.displayName} ses profiliniz ve ${deleteTarget.storiesUsingCount} hikayenin seslendirmesi silinecek.`,
                'Hikayeleriniz KALACAK; seslendirmeleri sistem sesine dönecek.',
                'Ham kayıtlarınız ses sağlayıcısından da silinecek.',
                'Bu işlem geri alınamaz; sesinizi yeniden kaydetmeniz gerekir.',
              ]}
            />
            <CheckRow labelTr="Sonuçları okudum ve anladım." checked={deleteAck} onChange={setDeleteAck} />
            <Button
              label="Sesi kalıcı olarak sil"
              variant="danger"
              disabled={!deleteAck}
              busy={deleteProfile.isPending}
              onPress={() => {
                deleteProfile.mutate(
                  { voiceProfileId: deleteTarget.id as string },
                  {
                    onSuccess: ({ sideEffectsTr }) => {
                      setResultTr(sideEffectsTr);
                      setDeleteTarget(undefined);
                    },
                  },
                );
              }}
            />
            {deleteProfile.error !== null ? (
              <Text variant="caption" tone="danger">
                {deleteProfile.error.messageTr}
              </Text>
            ) : null}
            <Button
              label="Vazgeç"
              variant="secondary"
              onPress={() => {
                setDeleteTarget(undefined);
              }}
            />
          </>
        ) : null}
      </Sheet>

      {/* ── İhbar ──────────────────────────────────────────── */}
      <Sheet
        open={reportOpen}
        onClose={() => {
          setReportOpen(false);
        }}
        titleTr="Kötüye kullanım bildir"
      >
        {reportDoneTr !== undefined ? (
          <NoticeBox tone="info" titleTr="İhbarınız alındı" bodyTr={reportDoneTr} />
        ) : (
          <>
            <Row gap="sm" wrap>
              {REPORT_REASONS.map((reason) => (
                <Chip
                  key={reason.code}
                  label={reason.labelTr}
                  selected={reportReason === reason.code}
                  onPress={() => {
                    setReportReason(reason.code);
                  }}
                />
              ))}
            </Row>
            <Input
              label="Ne oldu?"
              multiline
              value={reportDetail}
              onChangeText={setReportDetail}
              placeholder="Durumu kısaca anlatın; bağlantı veya hesap bilgisi ekleyebilirsiniz."
            />
            <Button
              label="Gönder"
              disabled={reportDetail.trim().length === 0}
              busy={report.isPending}
              onPress={() => {
                report.mutate(
                  {
                    targetType: 'voice_profile',
                    reason: reportReason,
                    detailTr: reportDetail.trim(),
                  },
                  {
                    onSuccess: ({ messageTr }) => {
                      setReportDoneTr(messageTr);
                      setReportDetail('');
                    },
                  },
                );
              }}
            />
            {report.error !== null ? (
              <Text variant="caption" tone="danger">
                {report.error.messageTr}
              </Text>
            ) : null}
          </>
        )}
      </Sheet>
    </View>
  );
}
