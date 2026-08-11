/**
 * Live dB meter (V04 mic test + V05/V06 recording screens).
 *
 * Maps −60…0 dBFS onto a horizontal bar with the contract's real thresholds
 * painted on it: the green zone is exactly peak −18…−3 dBFS
 * (VOICE_QUALITY_THRESHOLDS), so "the needle in green" and "the server accepts"
 * are the same statement. Below: rolling history bars + a one-line verdict.
 *
 * Tema duyarlı: gece kayıt ekranında (ThemeScope dark) yüzey/çizgi renkleri
 * kendiliğinden koyulaşır; eşikler ve ölçüm mantığı değişmez.
 */

import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { VOICE_QUALITY_THRESHOLDS } from '@kendihikayem/contract';
import { Text, palette, useTheme } from '@kendihikayem/ui';

import { SILENCE_DB, type MeterStats, type MeterVerdict } from './meter';

const MIN_DB = -60;

function toRatio(db: number): number {
  return Math.max(0, Math.min(1, (db - MIN_DB) / (0 - MIN_DB)));
}

/** 0..1 → RN percent DimensionValue. */
function pct(ratio: number): `${number}%` {
  return `${Math.round(ratio * 100)}%` as `${number}%`;
}

export function DbMeter({
  stats,
  verdict,
  recentDb,
  compact = false,
}: {
  stats: MeterStats;
  verdict: MeterVerdict;
  recentDb: number[];
  compact?: boolean;
}): ReactNode {
  const { colors, radius, spacing } = useTheme();
  const levelRatio = toRatio(stats.currentDb);
  const greenStart = toRatio(VOICE_QUALITY_THRESHOLDS.peakDbfsMin);
  const greenEnd = toRatio(VOICE_QUALITY_THRESHOLDS.peakDbfsMax);
  const verdictColor =
    verdict.level === 'iyi'
      ? colors.success
      : verdict.level === 'uyari'
        ? colors.warning
        : colors.danger;

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: radius.md,
        padding: spacing.md,
        gap: spacing.sm,
      }}
    >
      {/* Ana seviye çubuğu + yeşil bölge işaretleri */}
      <View style={[styles.track, { backgroundColor: colors.surfaceMuted }]}>
        <View
          style={[
            styles.greenZone,
            { left: pct(greenStart), width: pct(greenEnd - greenStart) },
          ]}
        />
        <View style={[styles.fill, { flex: Math.max(levelRatio, 0.01) }]} />
        <View style={{ flex: Math.max(1 - levelRatio, 0.01) }} />
      </View>
      <View style={styles.scaleRow}>
        <Text variant="caption" tone="muted" style={styles.scaleText}>
          sessiz
        </Text>
        <Text variant="caption" tone="muted" style={styles.scaleText}>
          ideal aralık
        </Text>
        <Text variant="caption" tone="muted" style={styles.scaleText}>
          çok yüksek
        </Text>
      </View>

      {!compact && (
        <View style={styles.historyRow} accessibilityLabel="Ses seviyesi geçmişi">
          {Array.from({ length: 40 }, (_, index) => {
            const db = recentDb[recentDb.length - 40 + index] ?? SILENCE_DB;
            const h = 4 + toRatio(db) * 26;
            return <View key={index} style={[styles.historyBar, { height: h }]} />;
          })}
        </View>
      )}

      <View style={[styles.verdictRow, { gap: spacing.sm }]}>
        <View style={[styles.verdictDot, { backgroundColor: verdictColor }]} />
        <View style={styles.verdictBody}>
          <Text variant="label" style={{ color: verdictColor }}>
            {verdict.titleTr}
          </Text>
          {verdict.messageTr !== undefined && (
            <Text variant="caption" style={styles.verdictText}>
              {verdict.messageTr}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 14,
    borderRadius: 7,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  greenZone: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(141, 184, 154, 0.35)',
  },
  fill: { backgroundColor: palette.nightPurple, borderRadius: 7 },
  scaleRow: { flexDirection: 'row', justifyContent: 'space-between' },
  scaleText: { fontSize: 11, lineHeight: 15 },

  historyRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    height: 32,
  },
  historyBar: {
    flex: 1,
    backgroundColor: palette.lavender,
    borderRadius: 2,
    opacity: 0.75,
  },

  verdictRow: { flexDirection: 'row', alignItems: 'flex-start' },
  verdictDot: { width: 12, height: 12, borderRadius: 6, marginTop: 4 },
  verdictBody: { flex: 1, gap: 2 },
  verdictText: { fontSize: 13, lineHeight: 18 },
});
