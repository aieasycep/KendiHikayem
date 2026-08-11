import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { VoiceStep } from '@kendihikayem/contract';

import { Caption, Screen, Title } from '../../../../components/ui';
import { colors, radius, spacing, typography } from '../../../../constants/theme';
import { useVoiceFlow } from '../../../../features/voice/flow';
import { TakeRecorder } from '../../../../features/voice/TakeRecorder';

/**
 * V06 — 4 pasaj kaydı (SPEC §7 adım 6). One screen per passage.
 *
 * ⭐ Every passage is recorded AND re-recorded SEPARATELY: a mistake in passage 4
 * never sends the user back to passage 1 — this is the exact failure that sinks
 * the competitor's flow. The header shows the server-reported total progress
 * ("72 / 110 saniye"), so the parent always knows how much is left.
 */
export default function Pasaj(): ReactNode {
  const router = useRouter();
  const { no } = useLocalSearchParams<{ no: string }>();
  const flow = useVoiceFlow();

  const passageNo = Math.min(4, Math.max(1, Number.parseInt(no ?? '1', 10) || 1));
  const step = `passage_${String(passageNo)}` as VoiceStep;
  const script = flow.state.script;
  const passage = script?.passages.find((item) => item.step === step);
  const profileId = flow.state.profileId;

  // The script lives only in flow state; a cold deep-link must re-fetch it at V05.
  useEffect(() => {
    if (profileId === undefined || script === undefined) router.replace('/(app)/ses/sesli-riza');
  }, [profileId, script, router]);

  if (profileId === undefined || script === undefined || passage === undefined) return null;

  const progress = flow.state.progress;
  const capturedSec = Math.round(progress?.capturedSec ?? 0);
  const targetTotal = Math.round(progress?.targetSec ?? script.totalTargetSec);

  return (
    <Screen>
      <View style={styles.headerRow}>
        <Title>{`Pasaj ${String(passageNo)} / 4`}</Title>
        <View style={styles.progressPill}>
          <Text style={styles.progressPillText}>{`${String(capturedSec)} / ${String(targetTotal)} sn`}</Text>
        </View>
      </View>

      <View style={styles.toneBox}>
        <Text style={styles.toneTitle}>{passage.titleTr}</Text>
        <Text style={styles.toneHint}>{passage.toneHintTr}</Text>
      </View>

      <View style={styles.scriptBox}>
        <Text style={styles.scriptText}>{passage.bodyTr}</Text>
        <Caption>{`Hedef süre: ${String(passage.targetSec)} saniye · Masal anlatır gibi okuyun`}</Caption>
      </View>

      <TakeRecorder
        profileId={profileId}
        scriptId={script.scriptId as string}
        step={step}
        targetSec={passage.targetSec}
        maxSec={45}
        onResult={(result) => {
          flow.recordTake(step, result);
        }}
        onAccepted={() => {
          if (passageNo < 4) {
            router.push(`/(app)/ses/pasaj/${String(passageNo + 1)}`);
          } else {
            router.push('/(app)/ses/isleniyor');
          }
        }}
        acceptedLabelTr={passageNo < 4 ? `Pasaj ${String(passageNo + 1)}'e geç` : 'Sesimi oluştur'}
      />

      <Caption>
        Her pasaj ayrı kaydedilir; bu pasajı istediğiniz kadar yineleyebilirsiniz, diğerleri
        etkilenmez.
      </Caption>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  progressPill: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  progressPillText: { ...typography.label, color: colors.accent },

  toneBox: {
    backgroundColor: '#FFF1E6',
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 2,
  },
  toneTitle: { ...typography.label, fontSize: 16, color: colors.primary },
  toneHint: { ...typography.caption, fontSize: 13, lineHeight: 18, color: colors.ink },

  scriptBox: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  scriptText: { ...typography.body, fontSize: 19, lineHeight: 30, color: colors.ink },
});
