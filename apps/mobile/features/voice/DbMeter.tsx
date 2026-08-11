/**
 * Live dB meter (V04 mic test + V05/V06 recording screens).
 *
 * Maps −60…0 dBFS onto a horizontal bar with the contract's real thresholds
 * painted on it: the green zone is exactly peak −18…−3 dBFS
 * (VOICE_QUALITY_THRESHOLDS), so "the needle in green" and "the server accepts"
 * are the same statement. Below: rolling history bars + a one-line verdict.
 */

import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { VOICE_QUALITY_THRESHOLDS } from '@kendihikayem/contract';

import { colors, radius, spacing, typography } from '../../constants/theme';
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
  const levelRatio = toRatio(stats.currentDb);
  const greenStart = toRatio(VOICE_QUALITY_THRESHOLDS.peakDbfsMin);
  const greenEnd = toRatio(VOICE_QUALITY_THRESHOLDS.peakDbfsMax);
  const verdictColor =
    verdict.level === 'iyi' ? colors.accent : verdict.level === 'uyari' ? '#B7791F' : '#B42318';

  return (
    <View style={styles.box}>
      {/* Ana seviye çubuğu + yeşil bölge işaretleri */}
      <View style={styles.track}>
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
        <Text style={styles.scaleText}>sessiz</Text>
        <Text style={styles.scaleText}>ideal aralık</Text>
        <Text style={styles.scaleText}>çok yüksek</Text>
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

      <View style={styles.verdictRow}>
        <View style={[styles.verdictDot, { backgroundColor: verdictColor }]} />
        <View style={styles.verdictBody}>
          <Text style={[styles.verdictTitle, { color: verdictColor }]}>{verdict.titleTr}</Text>
          {verdict.messageTr !== undefined && (
            <Text style={styles.verdictText}>{verdict.messageTr}</Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  track: {
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  greenZone: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: '#D3EBDD',
  },
  fill: { backgroundColor: colors.primary, borderRadius: 7 },
  scaleRow: { flexDirection: 'row', justifyContent: 'space-between' },
  scaleText: { ...typography.caption, fontSize: 11, color: colors.inkMuted },

  historyRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    height: 32,
  },
  historyBar: {
    flex: 1,
    backgroundColor: colors.accent,
    borderRadius: 2,
    opacity: 0.7,
  },

  verdictRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  verdictDot: { width: 12, height: 12, borderRadius: 6, marginTop: 4 },
  verdictBody: { flex: 1, gap: 2 },
  verdictTitle: { ...typography.label },
  verdictText: { ...typography.caption, fontSize: 13, lineHeight: 18, color: colors.ink },
});
