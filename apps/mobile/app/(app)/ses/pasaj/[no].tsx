import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import type { VoiceStep } from '@kendihikayem/contract';
import { Text } from '@kendihikayem/ui';

import { useVoiceFlow } from '../../../../features/voice/flow';
import { TakeRecorder } from '../../../../features/voice/TakeRecorder';
import { NightHeader, NightScreen } from '../../../../features/wizard/NightFlow';

/**
 * V06 — 4 pasaj kaydı (SPEC §7 adım 6). One screen per passage. Gece kayıt
 * stüdyosu görünümü (Figma `VoiceStudio` kayıt ekranı).
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
    <NightScreen scroll testID={`pasaj-${String(passageNo)}`}>
      <View style={styles.headerRow}>
        <NightHeader
          kickerTr="Ses Kaydı"
          titleTr={`Pasaj ${String(passageNo)} / 4`}
          onBack={() => {
            router.back();
          }}
        />
        <View style={styles.progressPill}>
          <Text variant="label" style={styles.progressPillText}>
            {`${String(capturedSec)} / ${String(targetTotal)} sn`}
          </Text>
        </View>
      </View>

      {/* Dört bölmeli pasaj göstergesi */}
      <View style={styles.segmentRow} accessibilityElementsHidden>
        {[1, 2, 3, 4].map((n) => (
          <View
            key={n}
            style={[styles.segment, n <= passageNo ? styles.segmentDone : styles.segmentTodo]}
          />
        ))}
      </View>

      <View style={styles.toneBox}>
        <Text variant="label" style={styles.toneTitle}>
          {passage.titleTr}
        </Text>
        <Text variant="caption" style={styles.toneHint}>
          {passage.toneHintTr}
        </Text>
      </View>

      <View style={styles.scriptBox}>
        <Text variant="caption" style={styles.scriptKicker}>
          OKUMANIZ İÇİN METİN
        </Text>
        <Text variant="body" style={styles.scriptText}>
          {passage.bodyTr}
        </Text>
        <Text variant="caption" style={styles.scriptMeta}>
          {`Hedef süre: ${String(passage.targetSec)} saniye · Masal anlatır gibi okuyun`}
        </Text>
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

      <Text variant="caption" style={styles.footnote}>
        Her pasaj ayrı kaydedilir; bu pasajı istediğiniz kadar yineleyebilirsiniz, diğerleri
        etkilenmez.
      </Text>
    </NightScreen>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  progressPill: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  progressPillText: { color: 'rgba(255, 220, 150, 0.95)', fontSize: 13, lineHeight: 17 },

  segmentRow: { flexDirection: 'row', gap: 4 },
  segment: { flex: 1, height: 4, borderRadius: 2 },
  segmentDone: { backgroundColor: 'rgba(155,127,212,0.95)' },
  segmentTodo: { backgroundColor: 'rgba(255,255,255,0.15)' },

  toneBox: {
    backgroundColor: 'rgba(240,139,110,0.14)',
    borderColor: 'rgba(240,139,110,0.3)',
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 2,
  },
  toneTitle: { color: 'rgba(255,205,185,1)', fontSize: 16, lineHeight: 22 },
  toneHint: { color: 'rgba(232,224,212,0.85)', fontSize: 13, lineHeight: 18 },

  scriptBox: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderRadius: 20,
    padding: 20,
    gap: 10,
  },
  scriptKicker: {
    color: 'rgba(176,156,224,0.8)',
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 0.8,
    fontWeight: '600',
  },
  scriptText: { color: 'rgba(255,255,255,0.92)', fontSize: 19, lineHeight: 31 },
  scriptMeta: { color: 'rgba(176,156,224,0.8)' },

  footnote: { color: 'rgba(255,255,255,0.45)' },
});
