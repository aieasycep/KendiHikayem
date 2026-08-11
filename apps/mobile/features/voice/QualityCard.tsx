/**
 * Instant quality card, rendered right after every take (SPEC §7 adım 7).
 *
 *   · three measured axes (gürültü / seviye / hız) checked against
 *     VOICE_QUALITY_THRESHOLDS — the same numbers the server used
 *   · every issue as ONE concrete Turkish instruction (contract messageTr)
 *   · total progress: "72 / 110 saniye"
 *
 * Tema duyarlı: gece kayıt ekranında koyu yüzeyle çalışır; kabul/ret renkleri
 * temanın success/danger rollerinden gelir.
 */

import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  ERROR_CATALOG,
  VOICE_QUALITY_THRESHOLDS,
  type SubmitTakeRes,
} from '@kendihikayem/contract';
import { Text, useTheme } from '@kendihikayem/ui';

const T = VOICE_QUALITY_THRESHOLDS;

const OK_TINT = 'rgba(141, 184, 154, 0.2)';
const BAD_TINT = 'rgba(214, 108, 96, 0.16)';

function AxisBadge({
  ok,
  labelTr,
  valueTr,
}: {
  ok: boolean;
  labelTr: string;
  valueTr: string;
}): ReactNode {
  const { radius, spacing } = useTheme();
  return (
    <View
      style={[
        styles.axis,
        {
          borderRadius: radius.sm,
          padding: spacing.sm,
          backgroundColor: ok ? OK_TINT : BAD_TINT,
        },
      ]}
    >
      <Text variant="label" tone={ok ? 'success' : 'danger'}>
        {ok ? '✓' : '✗'}
      </Text>
      <Text variant="caption" tone="muted" style={styles.axisLabel}>
        {labelTr}
      </Text>
      <Text variant="label" style={styles.axisValue}>
        {valueTr}
      </Text>
    </View>
  );
}

export function QualityCard({ result }: { result: SubmitTakeRes }): ReactNode {
  const { colors, radius, spacing } = useTheme();
  const q = result.quality;
  const snrOk = q.snrDb >= T.snrDbMin;
  const levelOk =
    q.peakDbfs >= T.peakDbfsMin && q.peakDbfs <= T.peakDbfsMax && q.clippingPct <= T.clippingPctMax;
  const paceOk = q.wordsPerMinute >= T.wordsPerMinuteMin && q.wordsPerMinute <= T.wordsPerMinuteMax;

  const captured = Math.round(result.progress.capturedSec);
  const target = Math.round(result.progress.targetSec);
  const ratio = target > 0 ? Math.min(1, captured / target) : 0;

  const edge = result.accepted ? colors.success : colors.danger;

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderLeftColor: edge,
        borderWidth: 1,
        borderLeftWidth: 6,
        borderRadius: radius.md,
        padding: spacing.md,
        gap: spacing.sm,
      }}
    >
      <Text variant="heading" style={[styles.headline, { color: edge }]}>
        {result.accepted ? 'Kayıt kabul edildi' : 'Bu kaydı yenilemek gerekiyor'}
      </Text>

      <View style={[styles.axisRow, { gap: spacing.sm }]}>
        <AxisBadge ok={snrOk} labelTr="Gürültü" valueTr={`${q.snrDb.toFixed(0)} dB`} />
        <AxisBadge ok={levelOk} labelTr="Seviye" valueTr={`${q.peakDbfs.toFixed(0)} dBFS`} />
        <AxisBadge ok={paceOk} labelTr="Hız" valueTr={`${q.wordsPerMinute.toFixed(0)} k/dk`} />
      </View>

      {/* Tek cümlelik somut talimat */}
      <Text variant="bodyStrong">{result.guidanceTr}</Text>

      {result.issues.length > 0 && (
        <View style={styles.issueList}>
          {result.issues.map((issue) => (
            <View key={issue} style={styles.issueRow}>
              <Text variant="caption" tone="muted">
                •
              </Text>
              <Text variant="caption" style={styles.issueText}>
                {ERROR_CATALOG[issue].messageTr}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Toplam ilerleme */}
      <View style={styles.progressBox}>
        <View style={[styles.progressTrack, { backgroundColor: colors.surfaceMuted }]}>
          <View
            style={[
              styles.progressFill,
              { flex: Math.max(ratio, 0.02), backgroundColor: colors.primary },
            ]}
          />
          <View style={{ flex: Math.max(1 - ratio, 0.02) }} />
        </View>
        <Text variant="caption" tone="muted">
          {`${String(captured)} / ${String(target)} saniye kaydedildi`}
        </Text>
      </View>

      {!result.accepted && (
        <Text variant="caption" tone="muted">
          {result.canRetry
            ? `Kalan deneme hakkı: ${String(result.attemptsLeft)}`
            : 'Deneme hakkınız doldu; 24 saat sonra tekrar deneyebilirsiniz.'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  headline: { fontSize: 19, lineHeight: 25 },

  axisRow: { flexDirection: 'row' },
  axis: { flex: 1, alignItems: 'center', gap: 2 },
  axisLabel: { fontSize: 12, lineHeight: 16 },
  axisValue: { fontSize: 14, lineHeight: 18 },

  issueList: { gap: 4 },
  issueRow: { flexDirection: 'row', gap: 6 },
  issueText: { fontSize: 13, lineHeight: 18, flex: 1 },

  progressBox: { gap: 4 },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  progressFill: { borderRadius: 4 },
});
