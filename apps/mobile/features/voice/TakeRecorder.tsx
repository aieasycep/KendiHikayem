/**
 * TakeRecorder — the shared record → stop → upload → instant-verdict cycle
 * used by V05 (sesli rıza) and V06 (4 pasaj).
 *
 * States: hazir → kaydediyor → gonderiliyor → sonuç (kabul ▸ onNext | ret ▸ tekrar)
 * While recording: live dB meter with the contract thresholds + elapsed vs target.
 * After submit: the QualityCard with the server's measured numbers.
 *
 * Tasarım dili (Figma Ses Kaydı ekranı): büyük mercan kayıt düğmesi, kayıt
 * sırasında büyük zamanlayıcı + nabız noktası. Gece temasında çalışacak şekilde
 * `useTheme()` tüketir; ölçüm/eşik mantığına dokunulmadı.
 */

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';

import type { ApiError, SubmitTakeRes, VoiceStep } from '@kendihikayem/contract';
import { Button, Text, palette, useTheme } from '@kendihikayem/ui';

import { ErrorBanner, SecondaryButton } from '../onboarding/components';
import { DbMeter } from './DbMeter';
import { liveRecordingVerdict } from './meter';
import { QualityCard } from './QualityCard';
import { useVoiceRecorder } from './recorder';
import { uploadAndSubmitTake } from './takes';

function MicGlyph({ size = 30 }: { size?: number }): ReactNode {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" fill="#FFFFFF" />
      <Path
        d="M19 10v2a7 7 0 0 1-14 0v-2"
        stroke="#FFFFFF"
        strokeWidth={2}
        strokeLinecap="round"
      />
      <Line x1={12} y1={19} x2={12} y2={23} stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" />
      <Line x1={8} y1={23} x2={16} y2={23} stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

/** Nabız gibi atan kayıt noktası. */
function RecPulse(): ReactNode {
  const { colors } = useTheme();
  const [pulse] = useState(() => new Animated.Value(1));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.35, duration: 500, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [pulse]);
  return (
    <Animated.View
      style={[styles.recDot, { backgroundColor: colors.danger, opacity: pulse }]}
      accessibilityElementsHidden
    />
  );
}

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
  const { colors, radius, spacing } = useTheme();
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
      <View
        accessibilityRole="alert"
        style={{
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderLeftColor: colors.danger,
          borderWidth: 1,
          borderLeftWidth: 6,
          borderRadius: radius.md,
          padding: spacing.md,
        }}
      >
        <Text variant="caption" style={styles.permissionText}>
          Mikrofon izni verilmedi. Ayarlar → Uygulamalar → KendiHikayem → İzinler yolundan
          mikrofonu açıp bu ekrana geri dönün.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ gap: spacing.sm }}>
      {phase === 'kaydediyor' && (
        <>
          <View style={styles.timerBox}>
            <Text variant="display" style={styles.timerText}>
              {`${String(Math.floor(elapsedSec / 60))}:${String(elapsedSec % 60).padStart(2, '0')}`}
            </Text>
            <View style={[styles.timerRow, { gap: spacing.sm }]}>
              <RecPulse />
              <Text variant="caption" tone="muted">
                {`Kaydediliyor · hedef ~${String(targetSec)} sn`}
              </Text>
            </View>
          </View>
          <DbMeter
            stats={recorder.stats}
            verdict={liveRecordingVerdict(recorder.stats)}
            recentDb={recorder.recentDb}
          />
          <Button
            label="Kaydı bitir"
            onPress={() => {
              void finish();
            }}
          />
          <Text variant="caption" tone="muted" center>
            Yanlış okursanız durmayın — metni bitirin, gerekirse yeniden kaydedersiniz.
          </Text>
        </>
      )}

      {phase === 'gonderiliyor' && (
        <View
          style={[
            styles.sendingBox,
            { backgroundColor: colors.surfaceMuted, borderRadius: radius.md, padding: spacing.md },
          ]}
        >
          <Text variant="heading" style={styles.sendingText}>
            Kaydınız ölçülüyor…
          </Text>
          <Text variant="caption" tone="muted">
            Gürültü, seviye, hız ve metin eşleşmesi denetleniyor.
          </Text>
        </View>
      )}

      {phase === 'sonuc' && result !== undefined && (
        <>
          <QualityCard result={result} />
          {result.accepted ? (
            <Button label={acceptedLabelTr} onPress={onAccepted} />
          ) : result.canRetry ? (
            <Button
              label="Yeniden kaydet"
              onPress={() => {
                void begin();
              }}
            />
          ) : (
            <Text variant="caption" tone="muted">
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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Kaydı başlat"
            onPress={() => {
              void begin();
            }}
            style={({ pressed }) => [styles.recordButtonWrap, pressed && { opacity: 0.85 }]}
          >
            <View style={styles.recordButton}>
              <MicGlyph />
            </View>
            <Text variant="caption" tone="muted">
              Kaydı başlat
            </Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  timerBox: { alignItems: 'center', gap: 4 },
  timerText: { fontSize: 44, lineHeight: 54, letterSpacing: -0.8 },
  timerRow: { flexDirection: 'row', alignItems: 'center' },
  recDot: { width: 10, height: 10, borderRadius: 5 },

  sendingBox: { gap: 4, alignItems: 'center' },
  sendingText: { fontSize: 18, lineHeight: 24 },

  permissionText: { fontSize: 14, lineHeight: 20 },

  recordButtonWrap: { alignItems: 'center', gap: 8, paddingVertical: 8 },
  recordButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: palette.coral,
    borderWidth: 4,
    borderColor: 'rgba(240, 139, 110, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: palette.coral,
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
});
