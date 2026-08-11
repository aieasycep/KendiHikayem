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

/** Nabız gibi atan kayıt noktası — Figma: mercan (#F08B6E). */
function RecPulse(): ReactNode {
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
      style={[styles.recDot, { backgroundColor: palette.coral, opacity: pulse }]}
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

  /** Figma "Baştan Al": kaydı at, sayacı sıfırla, başa dön. */
  const restart = async (): Promise<void> => {
    await recorder.stop().catch(() => undefined);
    setResult(undefined);
    setError(undefined);
    setPhase('hazir');
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
            <View
              style={[styles.timerRow, { gap: 6 }]}
              accessibilityLabel={`Kaydediliyor, hedef yaklaşık ${String(targetSec)} saniye`}
            >
              <RecPulse />
              <Text variant="caption" style={styles.recLabel} accessibilityElementsHidden>
                Kaydediliyor
              </Text>
            </View>
          </View>
          <DbMeter
            stats={recorder.stats}
            verdict={liveRecordingVerdict(recorder.stats)}
            recentDb={recorder.recentDb}
          />
          {/* Figma: "Kaydı Bitir" (beyaz) + "Baştan Al" (saydam) yan yana. */}
          <View style={[styles.stopRow, { gap: spacing.md }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Kaydı bitir"
              onPress={() => {
                void finish();
              }}
              style={({ pressed }) => [styles.finishButton, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.finishLabel}>Kaydı Bitir</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Baştan al"
              onPress={() => {
                void restart();
              }}
              style={({ pressed }) => [styles.restartButton, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.restartLabel}>Baştan Al</Text>
            </Pressable>
          </View>
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
              <MicGlyph size={32} />
            </View>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  /* Figma: Fraunces 48, -0.02em; altında mercan nokta + "Kaydediliyor". */
  timerBox: { alignItems: 'center', gap: 4 },
  timerText: { fontSize: 48, lineHeight: 58, letterSpacing: -1 },
  timerRow: { flexDirection: 'row', alignItems: 'center' },
  recDot: { width: 8, height: 8, borderRadius: 4 },
  recLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 13, lineHeight: 17, fontWeight: '600' },

  sendingBox: { gap: 4, alignItems: 'center' },
  sendingText: { fontSize: 18, lineHeight: 24 },

  permissionText: { fontSize: 14, lineHeight: 20 },

  recordButtonWrap: { alignItems: 'center', paddingVertical: 8 },
  /* Figma: 80'lik mercan daire, 4 px yarı saydam mercan kenarlık, gölge. */
  recordButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: palette.coral,
    borderWidth: 4,
    borderColor: 'rgba(240, 139, 110, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: palette.coral,
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },

  stopRow: { flexDirection: 'row', justifyContent: 'center' },
  /* Figma "Kaydı Bitir": beyaz zemin · 16 yarıçap · 16/28 dolgu · mor 15/800. */
  finishButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 28,
    shadowColor: '#000000',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  finishLabel: { color: '#7C5CBF', fontSize: 15, lineHeight: 20, fontWeight: '800' },
  /* Figma "Baştan Al": rgba beyaz .1 zemin · 1 px rgba .2 kenarlık · 15/700. */
  restartButton: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  restartLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 15, lineHeight: 20, fontWeight: '700' },
});
