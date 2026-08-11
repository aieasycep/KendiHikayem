/**
 * Shared flow components for the wizard + voice screens (F1 scope).
 *
 * ⚠️ packages/ui (owner: F2) is not populated yet. Everything here is written so
 * it can MOVE to packages/ui verbatim once F2 lands tokens/primitives:
 *   AsyncGate, ErrorBanner, SelectCard, Chip, StepBar, TrustStrip → candidates.
 * Report lists them explicitly.
 */

import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { ApiError } from '@kendihikayem/contract';

import { colors, radius, spacing, typography } from '../../constants/theme';

/* ── AsyncGate: query → loading / error / empty / content ───── */

export function AsyncGate<T>({
  isLoading,
  error,
  data,
  emptyTr,
  onRetry,
  children,
  loadingTr = 'Yükleniyor…',
}: {
  isLoading: boolean;
  error: ApiError | null | undefined;
  data: T | undefined;
  /** Shown when data is an empty array. */
  emptyTr?: string;
  onRetry?: () => void;
  loadingTr?: string;
  children: (data: T) => ReactNode;
}): ReactNode {
  if (isLoading) {
    return (
      <View style={styles.centerBox}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.mutedText}>{loadingTr}</Text>
      </View>
    );
  }
  if (error != null) return <ErrorBanner error={error} onRetry={onRetry} />;
  if (data === undefined) return null;
  if (Array.isArray(data) && data.length === 0 && emptyTr !== undefined) {
    return (
      <View style={styles.centerBox}>
        <Text style={styles.mutedText}>{emptyTr}</Text>
      </View>
    );
  }
  return <>{children(data)}</>;
}

/* ── ErrorBanner: ApiError.messageTr is user-ready by contract ─ */

export function ErrorBanner({
  error,
  onRetry,
}: {
  error: ApiError;
  onRetry?: () => void;
}): ReactNode {
  return (
    <View style={styles.errorBox} accessibilityRole="alert">
      <Text style={styles.errorTitle}>Bir sorun çıktı</Text>
      <Text style={styles.errorText}>{error.messageTr}</Text>
      {onRetry !== undefined && (
        <Pressable accessibilityRole="button" onPress={onRetry} style={styles.retryButton}>
          <Text style={styles.retryText}>Tekrar dene</Text>
        </Pressable>
      )}
    </View>
  );
}

/* ── SelectCard: theme / art style / variant cards ───────────── */

export function SelectCard({
  titleTr,
  subtitleTr,
  icon,
  selected,
  onPress,
  footerTr,
}: {
  titleTr: string;
  subtitleTr?: string;
  icon?: string;
  selected: boolean;
  onPress: () => void;
  footerTr?: string;
}): ReactNode {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.selectCard, selected && styles.selectCardSelected]}
    >
      {icon !== undefined && <Text style={styles.selectCardIcon}>{icon}</Text>}
      <Text style={[styles.selectCardTitle, selected && styles.selectCardTitleSelected]}>
        {titleTr}
      </Text>
      {subtitleTr !== undefined && <Text style={styles.selectCardSubtitle}>{subtitleTr}</Text>}
      {footerTr !== undefined && <Text style={styles.selectCardFooter}>“{footerTr}”</Text>}
    </Pressable>
  );
}

/* ── Chip ────────────────────────────────────────────────────── */

export function Chip({
  label,
  selected,
  onPress,
  swatchHex,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  swatchHex?: string;
}): ReactNode {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      {swatchHex !== undefined && (
        <View style={[styles.swatch, { backgroundColor: swatchHex }]} />
      )}
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

export function ChipRow({ children }: { children: ReactNode }): ReactNode {
  return <View style={styles.chipRow}>{children}</View>;
}

/* ── StepBar: "Adım 3 / 5" + dots ────────────────────────────── */

export function StepBar({ step, total, labelTr }: { step: number; total: number; labelTr: string }): ReactNode {
  return (
    <View style={styles.stepBar}>
      <View style={styles.dotRow}>
        {Array.from({ length: total }, (_, index) => (
          <View
            key={index}
            style={[styles.dot, index < step ? styles.dotDone : undefined, index === step - 1 ? styles.dotActive : undefined]}
          />
        ))}
      </View>
      <Text style={styles.stepLabel}>{labelTr}</Text>
    </View>
  );
}

/* ── TrustStrip: the "no photo / voice safety" reassurance ───── */

export function TrustStrip({ items }: { items: string[] }): ReactNode {
  return (
    <View style={styles.trustBox}>
      {items.map((item) => (
        <View key={item} style={styles.trustRow}>
          <Text style={styles.trustBullet}>✓</Text>
          <Text style={styles.trustText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

/** Big single-line reassurance, used on S04: "Çocuğunuzun fotoğrafını istemiyoruz." */
export function PrivacyPromise({ textTr }: { textTr: string }): ReactNode {
  return (
    <View style={styles.promiseBox}>
      <Text style={styles.promiseIcon}>🛡️</Text>
      <Text style={styles.promiseText}>{textTr}</Text>
    </View>
  );
}

/* ── Secondary button (primary lives in components/ui) ───────── */

export function SecondaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
}): ReactNode {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled === true }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.secondaryButton,
        pressed && styles.secondaryPressed,
        disabled === true && styles.secondaryDisabled,
      ]}
    >
      <Text style={styles.secondaryText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  centerBox: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  mutedText: { ...typography.body, color: colors.inkMuted, textAlign: 'center' },

  errorBox: {
    backgroundColor: '#FDECEA',
    borderColor: '#F5C6BE',
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  errorTitle: { ...typography.label, color: '#8C2B1D' },
  errorText: { ...typography.body, color: '#8C2B1D' },
  retryButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#8C2B1D',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginTop: spacing.xs,
  },
  retryText: { ...typography.label, color: '#FFFFFF' },

  selectCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 2,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
    flexGrow: 1,
    flexBasis: '45%',
  },
  selectCardSelected: { borderColor: colors.primary, backgroundColor: '#FFF1E6' },
  selectCardIcon: { fontSize: 30 },
  selectCardTitle: { ...typography.heading, fontSize: 19, lineHeight: 24, color: colors.ink },
  selectCardTitleSelected: { color: colors.primary },
  selectCardSubtitle: { ...typography.caption, color: colors.inkMuted },
  selectCardFooter: { ...typography.caption, color: colors.accent, fontStyle: 'italic' },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...typography.label, color: colors.ink },
  chipTextSelected: { color: colors.primaryInk },
  swatch: { width: 14, height: 14, borderRadius: 7, borderWidth: 1, borderColor: colors.border },

  stepBar: { gap: spacing.xs },
  dotRow: { flexDirection: 'row', gap: 6 },
  dot: { width: 22, height: 6, borderRadius: 3, backgroundColor: colors.border },
  dotDone: { backgroundColor: colors.accent },
  dotActive: { backgroundColor: colors.primary },
  stepLabel: { ...typography.caption, color: colors.inkMuted },

  trustBox: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  trustRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  trustBullet: { ...typography.label, color: colors.accent },
  trustText: { ...typography.caption, fontSize: 14, lineHeight: 20, color: colors.ink, flex: 1 },

  promiseBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#E8F4F2',
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  promiseIcon: { fontSize: 22 },
  promiseText: { ...typography.body, fontWeight: '600', color: colors.accent, flex: 1 },

  secondaryButton: {
    borderColor: colors.primary,
    borderWidth: 2,
    borderRadius: radius.lg,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  secondaryPressed: { backgroundColor: colors.surfaceMuted },
  secondaryDisabled: { opacity: 0.4 },
  secondaryText: { ...typography.body, color: colors.primary, fontWeight: '700' },
});
