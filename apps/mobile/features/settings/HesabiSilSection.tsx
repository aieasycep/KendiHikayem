/**
 * A05 Hesabı Sil (Apple 5.1.1(v) — uygulama içinden tam silme).
 *
 * Sözleşme `confirmText: 'SIL'` literal'ı ister: kullanıcı büyük harflerle SIL
 * yazmadan istek atılamaz. Yanıt, nelerin silineceğini `sideEffectsTr` ile
 * söyler ve silme zinciri (sağlayıcılar dahil) bir iş olarak izlenir.
 */

import { useEffect, useState, type ReactElement } from 'react';
import { View } from 'react-native';

import {
  Button,
  Input,
  JobProgressCard,
  NoticeBox,
  Text,
} from '@kendihikayem/ui';

import { isJobTerminal, useJob } from '../../lib/useJob';
import { useDeleteAccount } from './hooks';

export function HesabiSilSection(): ReactElement {
  const [confirmText, setConfirmText] = useState('');
  const [reason, setReason] = useState('');
  const [sideEffectsTr, setSideEffectsTr] = useState<string[] | undefined>(undefined);
  const [jobId, setJobId] = useState<string | undefined>(undefined);

  const deleteAccount = useDeleteAccount();
  const { job } = useJob(jobId);

  useEffect(() => {
    if (isJobTerminal(job)) setJobId(undefined);
  }, [job]);

  if (sideEffectsTr !== undefined) {
    return (
      <View style={{ gap: 12 }}>
        <NoticeBox tone="danger" titleTr="Silme başlatıldı" itemsTr={sideEffectsTr} />
        {job !== undefined && !isJobTerminal(job) ? (
          <JobProgressCard
            labelTr={job.progress.labelTr}
            current={job.progress.current}
            total={job.progress.total}
          />
        ) : (
          <Text variant="body" tone="muted">
            Silme zinciri arka planda sürüyor. 30 gün içinde tüm verileriniz, ses
            sağlayıcılarındaki kopyalar dahil, kalıcı olarak silinir.
          </Text>
        )}
      </View>
    );
  }

  return (
    <View style={{ gap: 12 }}>
      <NoticeBox
        tone="danger"
        titleTr="Hesabınızı silerseniz"
        itemsTr={[
          'Tüm hikayeleriniz ve seslendirmeleri kalıcı olarak silinir.',
          'Ses profilleriniz sağlayıcılardan da silinir.',
          'Kalan kredileriniz yanar; geri ödeme yapılmaz.',
          'Basılı sipariş kayıtları vergi mevzuatı gereği yasal süre boyunca saklanır.',
          'Bu işlem 30 gün içinde tamamlanır ve geri alınamaz.',
        ]}
      />
      <Input
        label="Onay için büyük harflerle SIL yazın"
        value={confirmText}
        onChangeText={setConfirmText}
        autoCapitalize="characters"
        errorTr={
          confirmText.length > 0 && confirmText !== 'SIL'
            ? 'Devam etmek için tam olarak SIL yazmalısınız.'
            : undefined
        }
      />
      <Input
        label="Ayrılma sebebiniz (isteğe bağlı)"
        multiline
        value={reason}
        onChangeText={setReason}
        maxLength={500}
      />
      <Button
        label="Hesabımı kalıcı olarak sil"
        variant="danger"
        disabled={confirmText !== 'SIL'}
        busy={deleteAccount.isPending}
        onPress={() => {
          deleteAccount.mutate(
            {
              confirmText,
              ...(reason.trim().length > 0 ? { reasonTr: reason.trim() } : {}),
            },
            {
              onSuccess: ({ jobId: newJobId, sideEffectsTr: effects }) => {
                setSideEffectsTr(effects);
                setJobId(newJobId);
              },
            },
          );
        }}
      />
      {deleteAccount.error !== null ? (
        <NoticeBox tone="danger" titleTr="Silme başlatılamadı" bodyTr={deleteAccount.error.messageTr} />
      ) : null}
    </View>
  );
}
