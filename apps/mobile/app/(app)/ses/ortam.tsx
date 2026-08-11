import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text, useTheme } from '@kendihikayem/ui';

import { Body, Card, Caption, Heading, PrimaryButton, Screen, Title } from '../../../components/ui';
import { SecondaryButton, StepBar } from '../../../features/onboarding/components';
import { DbMeter } from '../../../features/voice/DbMeter';
import { useVoiceFlow } from '../../../features/voice/flow';
import { ambientVerdict, type MeterStats, type MeterVerdict } from '../../../features/voice/meter';
import { useVoiceRecorder } from '../../../features/voice/recorder';

const CHECKLIST = [
  ['🚪', 'Sessiz bir oda seçin; televizyonu ve klimayı kapatın.'],
  ['📏', 'Telefonu ağzınızdan yaklaşık 20 cm uzakta tutun.'],
  ['🎧', 'Kulaklık takmayın; telefonun kendi mikrofonu daha iyi sonuç verir.'],
  ['🛏️', 'Halı, perde, yatak gibi yumuşak yüzeyli bir oda yankıyı azaltır.'],
] as const;

const TEST_MS = 5_000;

/**
 * V04 — Ortam hazırlığı + mikrofon testi (SPEC §7 adım 4).
 *
 * 5-second LIVE test: the user stays silent, the dB meter measures the room's
 * noise floor and gives instant, concrete feedback ("TV veya klima varsa
 * kapatın"). This screen determines the quality of the next four recordings.
 */
export default function Ortam(): ReactNode {
  const router = useRouter();
  const { colors, radius, spacing } = useTheme();
  const flow = useVoiceFlow();
  const recorder = useVoiceRecorder(TEST_MS + 500);

  const [testState, setTestState] = useState<'bekliyor' | 'olculuyor' | 'bitti'>('bekliyor');
  const [result, setResult] = useState<{ stats: MeterStats; verdict: MeterVerdict } | undefined>(
    undefined,
  );
  const stopTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    return () => {
      if (stopTimer.current !== undefined) clearTimeout(stopTimer.current);
    };
  }, []);

  // Guard: reaching V04 without a profile means consents were skipped.
  useEffect(() => {
    if (flow.state.profileId === undefined) router.replace('/(app)/ses/deger');
  }, [flow.state.profileId, router]);

  const runTest = async (): Promise<void> => {
    setResult(undefined);
    const ok = await recorder.start();
    if (!ok) return; // permission denied — recorder.permission drives the UI below
    setTestState('olculuyor');
    stopTimer.current = setTimeout(() => {
      void (async () => {
        const finished = await recorder.stop();
        if (finished === undefined) {
          setTestState('bekliyor');
          return;
        }
        setResult({ stats: finished.stats, verdict: ambientVerdict(finished.stats) });
        setTestState('bitti');
      })();
    }, TEST_MS);
  };

  const secondsLeft =
    testState === 'olculuyor'
      ? Math.max(0, Math.ceil((TEST_MS - recorder.durationMs) / 1000))
      : undefined;

  return (
    <Screen>
      <StepBar step={4} total={4} labelTr="Sesinizi tanıtın · Ortam" />
      <Title>Kayıt ortamını hazırlayalım</Title>
      <Body>Dört kısa kayıt yapacağız. Önce ortamınızın kayda uygun olduğundan emin olalım.</Body>

      <Card>
        {CHECKLIST.map(([icon, text]) => (
          <View key={text} style={[styles.checkRow, { gap: spacing.sm }]}>
            <Text style={styles.checkIcon} accessibilityElementsHidden>
              {icon}
            </Text>
            <Text variant="caption" style={styles.checkText}>
              {text}
            </Text>
          </View>
        ))}
      </Card>

      <Card>
        <Heading>5 saniyelik sessizlik testi</Heading>
        <Caption>
          Testi başlatın ve HİÇ konuşmadan bekleyin — mikrofon yalnızca odanızı dinleyecek.
        </Caption>

        {recorder.permission === 'denied' ? (
          <View
            accessibilityRole="alert"
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderLeftColor: colors.danger,
              borderWidth: 1,
              borderLeftWidth: 6,
              borderRadius: radius.sm,
              padding: spacing.md,
            }}
          >
            <Text variant="caption" style={styles.permissionText}>
              Mikrofon izni verilmedi. Ses kaydı için Ayarlar → Uygulamalar → KendiHikayem →
              İzinler yolundan mikrofonu açın, sonra buraya dönün.
            </Text>
          </View>
        ) : testState === 'olculuyor' ? (
          <DbMeter
            stats={recorder.stats}
            verdict={{ level: 'iyi', titleTr: `Dinleniyor… ${String(secondsLeft ?? 0)} sn` }}
            recentDb={recorder.recentDb}
          />
        ) : result !== undefined ? (
          <>
            <DbMeter stats={result.stats} verdict={result.verdict} recentDb={recorder.recentDb} />
            <SecondaryButton
              label="Testi yinele"
              onPress={() => {
                void runTest();
              }}
            />
          </>
        ) : (
          /* Tek birincil eylem kuralı: ekranın birincili "Kayda geç"tir. */
          <SecondaryButton
            label="Testi başlat"
            onPress={() => {
              void runTest();
            }}
          />
        )}
      </Card>

      <PrimaryButton
        label="Kayda geç"
        disabled={testState !== 'bitti'}
        onPress={() => {
          router.push('/(app)/ses/sesli-riza');
        }}
      />
      {result !== undefined && result.verdict.level === 'kotu' && (
        <Caption>
          Yine de devam edebilirsiniz; ancak gürültülü ortamda kayıtlar büyük olasılıkla kalite
          kontrolünden geri döner.
        </Caption>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  checkRow: { flexDirection: 'row', alignItems: 'flex-start' },
  checkIcon: { fontSize: 20 },
  checkText: { fontSize: 14, lineHeight: 21, flex: 1 },
  permissionText: { fontSize: 14, lineHeight: 20 },
});
