/**
 * TakeRecorder — the shared record → stop → upload → instant-verdict cycle
 * used by V05 (sesli rıza) and V06 (4 pasaj).
 *
 * States: hazir → kaydediyor → gonderiliyor → sonuç (kabul ▸ onNext | ret ▸ tekrar)
 * While recording: live dB meter with the contract thresholds + elapsed vs target.
 * After submit: the QualityCard with the server's measured numbers.
 */

import { useState } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { ApiError, SubmitTakeRes, VoiceStep } from '@kendihikayem/contract';

import { PrimaryButton } from '../../components/ui';
import { colors, radius, spacing, typography } from '../../constants/theme';
import { ErrorBanner, SecondaryButton } from '../onboarding/components';
import { DbMeter } from './DbMeter';
import { liveRecordingVerdict } from './meter';
import { QualityCard } from './QualityCard';
import { useVoiceRecorder } from './recorder';
import { uploadAndSubmitTake } from './takes';

export function TakeRecorder({
  profileId,
  scriptId,
  step,
  targetSec,
  maxSec = 45,
  onResult,
  onAccepted,
  acceptedLabelTr,
}: {
  profileId: string;
  scriptId: string;
  step: VoiceStep;
  targetSec: number;
  maxSec?: number;
  /** Called with EVERY server verdict (accepted or not) so the flow stores progress. */
  onResult: (result: SubmitTakeRes) => void;
  onAccepted: () => void;
  acceptedLabelTr: string;
}): ReactNode {
  const recorder = useVoiceRecorder(maxSec * 1000);
  const [phase, setPhase] = useState<'hazir' | 'kaydediyor' | 'gonderiliyor' | 'sonuc'>('hazir');
  const [result, setResult] = useState<SubmitTakeRes | undefined>(undefined);
  const [error, setError] = useState<ApiError | undefined>(undefined);

  const begin = async (): Promise<void> => {
    setError(undefined);
    setResult(undefined);
    const ok = await recorder.start();
    if (ok) setPhase('kaydediyor');
  };

  const finish = async (): Promise<void> => {
    setPhase('gonderiliyor');
    const finished = await recorder.stop();
    if (finished === undefined || finished.uri === null || finished.durationMs <= 0) {
      setError({
        code: 'COK_KISA',
        messageTr: 'Kayıt alınamadı. Kaydı başlatıp metnin tamamını okuduktan sonra bitirin.',
        retryable: true,
        traceId: 'yerel-kayit',
      });
      setPhase('hazir');
      return;
    }
    try {
      const verdict = await uploadAndSubmitTake({
        profileId,
        scriptId,
        step,
        uri: finished.uri,
        durationMs: finished.durationMs,
      });
      setResult(verdict);
      onResult(verdict);
      setPhase('sonuc');
    } catch (err) {
      setError(err as ApiError);
      setPhase('hazir');
    }
  };

  const elapsedSec = Math.floor(recorder.durationMs / 1000);

  if (recorder.permission === 'denied') {
    return (
      <View style={styles.permissionBox}>
        <Text style={styles.permissionText}>
          Mikrofon izni verilmedi. Ayarlar → Uygulamalar → KendiHikayem → İzinler yolundan
          mikrofonu açıp bu ekrana geri dönün.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.box}>
      {phase === 'kaydediyor' && (
        <>
          <View style={styles.timerRow}>
            <View style={styles.recDot} />
            <Text style={styles.timerText}>
              {`${String(elapsedSec)} sn / hedef ~${String(targetSec)} sn`}
            </Text>
          </View>
          <DbMeter
            stats={recorder.stats}
            verdict={liveRecordingVerdict(recorder.stats)}
            recentDb={recorder.recentDb}
          />
          <PrimaryButton
            label="Kaydı bitir"
            onPress={() => {
              void finish();
            }}
          />
          <Text style={styles.hint}>
            Yanlış okursanız durmayın — metni bitirin, gerekirse yeniden kaydedersiniz.
          </Text>
        </>
      )}

      {phase === 'gonderiliyor' && (
        <View style={styles.sendingBox}>
          <Text style={styles.sendingText}>Kaydınız ölçülüyor…</Text>
          <Text style={styles.hint}>Gürültü, seviye, hız ve metin eşleşmesi denetleniyor.</Text>
        </View>
      )}

      {phase === 'sonuc' && result !== undefined && (
        <>
          <QualityCard result={result} />
          {result.accepted ? (
            <PrimaryButton label={acceptedLabelTr} onPress={onAccepted} />
          ) : result.canRetry ? (
            <PrimaryButton
              label="Yeniden kaydet"
              onPress={() => {
                void begin();
              }}
            />
          ) : (
            <Text style={styles.hint}>
              Şimdilik bu kadar — 24 saat sonra kaldığınız yerden devam edebilirsiniz. Kayıtlarınız
              saklandı.
            </Text>
          )}
          {result.accepted && (
            <SecondaryButton
              label="Bu kaydı beğenmedim, yeniden okuyayım"
              onPress={() => {
                void begin();
              }}
            />
          )}
        </>
      )}

      {phase === 'hazir' && (
        <>
          {error !== undefined && <ErrorBanner error={error} />}
          <PrimaryButton
            label="Kaydı başlat"
            onPress={() => {
              void begin();
            }}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: spacing.sm },
  timerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  recDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#B42318' },
  timerText: { ...typography.label, color: colors.ink },
  hint: { ...typography.caption, color: colors.inkMuted },
  sendingBox: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 4,
    alignItems: 'center',
  },
  sendingText: { ...typography.heading, fontSize: 18, color: colors.ink },
  permissionBox: {
    backgroundColor: '#FDF3F2',
    borderColor: '#E7B8B1',
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  permissionText: { ...typography.caption, fontSize: 14, lineHeight: 20, color: '#8C2B1D' },
});
