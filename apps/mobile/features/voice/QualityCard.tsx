/**
 * Instant quality card, rendered right after every take (SPEC §7 adım 7).
 *
 *   · three measured axes (gürültü / seviye / hız) checked against
 *     VOICE_QUALITY_THRESHOLDS — the same numbers the server used
 *   · every issue as ONE concrete Turkish instruction (contract messageTr)
 *   · total progress: "72 / 110 saniye"
 */

import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  ERROR_CATALOG,
  VOICE_QUALITY_THRESHOLDS,
  type SubmitTakeRes,
} from '@kendihikayem/contract';

import { colors, radius, spacing, typography } from '../../constants/theme';

const T = VOICE_QUALITY_THRESHOLDS;

function AxisBadge({ ok, labelTr, valueTr }: { ok: boolean; labelTr: string; valueTr: string }): ReactNode {
  return (
    <View style={[styles.axis, ok ? styles.axisOk : styles.axisBad]}>
      <Text style={styles.axisIcon}>{ok ? '✓' : '✗'}</Text>
      <Text style={styles.axisLabel}>{labelTr}</Text>
      <Text style={styles.axisValue}>{valueTr}</Text>
    </View>
  );
}

export function QualityCard({ result }: { result: SubmitTakeRes }): ReactNode {
  const q = result.quality;
  const snrOk = q.snrDb >= T.snrDbMin;
  const levelOk =
    q.peakDbfs >= T.peakDbfsMin && q.peakDbfs <= T.peakDbfsMax && q.clippingPct <= T.clippingPctMax;
  const paceOk = q.wordsPerMinute >= T.wordsPerMinuteMin && q.wordsPerMinute <= T.wordsPerMinuteMax;

  const captured = Math.round(result.progress.capturedSec);
  const target = Math.round(result.progress.targetSec);
  const ratio = target > 0 ? Math.min(1, captured / target) : 0;

  return (
    <View style={[styles.card, result.accepted ? styles.cardOk : styles.cardBad]}>
      <Text style={[styles.headline, result.accepted ? styles.headlineOk : styles.headlineBad]}>
        {result.accepted ? 'Kayıt kabul edildi' : 'Bu kaydı yenilemek gerekiyor'}
      </Text>

      <View style={styles.axisRow}>
        <AxisBadge ok={snrOk} labelTr="Gürültü" valueTr={`${q.snrDb.toFixed(0)} dB`} />
        <AxisBadge ok={levelOk} labelTr="Seviye" valueTr={`${q.peakDbfs.toFixed(0)} dBFS`} />
        <AxisBadge ok={paceOk} labelTr="Hız" valueTr={`${q.wordsPerMinute.toFixed(0)} k/dk`} />
      </View>

      {/* Tek cümlelik somut talimat */}
      <Text style={styles.guidance}>{result.guidanceTr}</Text>

      {result.issues.length > 0 && (
        <View style={styles.issueList}>
          {result.issues.map((issue) => (
            <View key={issue} style={styles.issueRow}>
              <Text style={styles.issueBullet}>•</Text>
              <Text style={styles.issueText}>{ERROR_CATALOG[issue].messageTr}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Toplam ilerleme */}
      <View style={styles.progressBox}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { flex: Math.max(ratio, 0.02) }]} />
          <View style={{ flex: Math.max(1 - ratio, 0.02) }} />
        </View>
        <Text style={styles.progressText}>{`${String(captured)} / ${String(target)} saniye kaydedildi`}</Text>
      </View>

      {!result.accepted && (
        <Text style={styles.attempts}>
          {result.canRetry
            ? `Kalan deneme hakkı: ${String(result.attemptsLeft)}`
            : 'Deneme hakkınız doldu; 24 saat sonra tekrar deneyebilirsiniz.'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardOk: { backgroundColor: '#EFF8F1', borderColor: '#9BC9A8' },
  cardBad: { backgroundColor: '#FDF3F2', borderColor: '#E7B8B1' },
  headline: { ...typography.heading, fontSize: 19 },
  headlineOk: { color: '#1F7A3D' },
  headlineBad: { color: '#B42318' },

  axisRow: { flexDirection: 'row', gap: spacing.sm },
  axis: {
    flex: 1,
    borderRadius: radius.sm,
    padding: spacing.sm,
    alignItems: 'center',
    gap: 2,
  },
  axisOk: { backgroundColor: '#DDEFE2' },
  axisBad: { backgroundColor: '#F6DBD7' },
  axisIcon: { ...typography.label, color: colors.ink },
  axisLabel: { ...typography.caption, fontSize: 12, color: colors.inkMuted },
  axisValue: { ...typography.label, fontSize: 14, color: colors.ink },

  guidance: { ...typography.body, color: colors.ink, fontWeight: '600' },

  issueList: { gap: 4 },
  issueRow: { flexDirection: 'row', gap: 6 },
  issueBullet: { ...typography.caption, color: colors.inkMuted },
  issueText: { ...typography.caption, fontSize: 13, lineHeight: 18, color: colors.ink, flex: 1 },

  progressBox: { gap: 4 },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E4DACE',
    overflow: 'hidden',
    flexDirection: 'row',
  },
  progressFill: { backgroundColor: colors.accent, borderRadius: 4 },
  progressText: { ...typography.caption, color: colors.inkMuted },

  attempts: { ...typography.caption, color: colors.inkMuted },
});
