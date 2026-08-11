/**
 * Shared flow components for the wizard + voice screens (F1 scope).
 *
 * Onaylanan Figma dilinde yeniden çizildi: seçim kartları 2 px kenarlık +
 * seçilince lavanta zemin + sağ üstte mor onay dairesi; adım göstergesi
 * "1/5" yerine bölmeli ilerleme çubuğu; güven şeridi yumuşak kart. Hepsi
 * `useTheme()` tüketir — gece kapsamında (ThemeScope dark) kendiliğinden
 * koyu palete döner.
 *
 * packages/ui'ye TERFİ ADAYLARI (raporda listelenir): AsyncGate, ErrorBanner,
 * SelectCard, SwatchChip, StepBar, TrustStrip.
 */

import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import type { ApiError } from '@kendihikayem/contract';
import { Button, Text, useTheme } from '@kendihikayem/ui';

/* ── Seçim onayı: sağ üst köşedeki mor daire (Figma seçim kartları) ── */

export function SelectedCheck({ size = 22 }: { size?: number }): ReactNode {
  const { colors } = useTheme();
  return (
    <View
      accessibilityElementsHidden
      style={[
        styles.checkCircle,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.primary },
      ]}
    >
      <Svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none">
        <Path
          d="M20 6L9 17l-5-5"
          stroke={colors.inkOnPrimary}
          strokeWidth={3.4}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

/* ── Geri oku (Figma başlık çubuğu — daire içinde sola ok) ──── */

export function BackCircle({ onPress }: { onPress: () => void }): ReactNode {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Geri dön"
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [
        styles.backCircle,
        {
          backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
          borderColor: colors.border,
        },
      ]}
    >
      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
        <Path
          d="M15 18l-6-6 6-6"
          stroke={colors.ink}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </Pressable>
  );
}

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
  const { colors, spacing } = useTheme();
  if (isLoading) {
    return (
      <View style={[styles.centerBox, { gap: spacing.sm, paddingVertical: spacing.xl }]}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text variant="body" tone="muted" center>
          {loadingTr}
        </Text>
      </View>
    );
  }
  if (error != null) return <ErrorBanner error={error} onRetry={onRetry} />;
  if (data === undefined) return null;
  if (Array.isArray(data) && data.length === 0 && emptyTr !== undefined) {
    return (
      <View style={[styles.centerBox, { gap: spacing.sm, paddingVertical: spacing.xl }]}>
        <Text variant="body" tone="muted" center>
          {emptyTr}
        </Text>
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
  const { colors, radius, spacing } = useTheme();
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
        gap: spacing.xs,
      }}
    >
      <Text variant="bodyStrong" tone="danger">
        Bir sorun çıktı
      </Text>
      <Text variant="body">{error.messageTr}</Text>
      {onRetry !== undefined && (
        <Button
          label="Tekrar dene"
          variant="secondary"
          compact
          onPress={onRetry}
          style={styles.retryButton}
        />
      )}
    </View>
  );
}

/* ── SelectCard: theme / art style / voice / child cards ─────── */

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
  const { colors, radius, spacing } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.selectCard,
        {
          borderRadius: radius.lg,
          padding: spacing.md,
          gap: spacing.xs,
          backgroundColor: selected
            ? colors.surfaceRaised
            : pressed
              ? colors.surfaceMuted
              : colors.surface,
          borderColor: selected ? colors.primary : colors.border,
        },
      ]}
    >
      {selected && (
        <View style={styles.selectCheckWrap}>
          <SelectedCheck />
        </View>
      )}
      {icon !== undefined && (
        <Text style={styles.selectCardIcon} accessibilityElementsHidden>
          {icon}
        </Text>
      )}
      <Text
        variant="heading"
        style={[styles.selectCardTitle, selected && { color: colors.primary }]}
      >
        {titleTr}
      </Text>
      {subtitleTr !== undefined && (
        <Text variant="caption" tone="muted">
          {subtitleTr}
        </Text>
      )}
      {footerTr !== undefined && (
        <Text variant="caption" tone="accent" style={styles.selectCardFooter}>
          {`“${footerTr}”`}
        </Text>
      )}
    </Pressable>
  );
}

/* ── Chip (yerel: renk örneği/swatch destekli) ───────────────── */

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
  const { colors, radius, touchTarget } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      hitSlop={touchTarget.hitSlop}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          borderRadius: radius.sm,
          backgroundColor: selected
            ? colors.primary
            : pressed
              ? colors.surfaceMuted
              : colors.surface,
          borderColor: selected ? colors.primary : colors.border,
        },
      ]}
    >
      {swatchHex !== undefined && (
        <View
          style={[
            styles.swatch,
            { backgroundColor: swatchHex, borderColor: selected ? colors.inkOnPrimary : colors.border },
          ]}
        />
      )}
      <Text
        variant="label"
        tone={selected ? 'onPrimary' : 'muted'}
        style={selected ? styles.chipTextSelected : undefined}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function ChipRow({ children }: { children: ReactNode }): ReactNode {
  const { spacing } = useTheme();
  return <View style={[styles.chipRow, { gap: spacing.sm }]}>{children}</View>;
}

/* ── StepBar: Figma sihirbaz başlığı — bölmeli ilerleme ──────── */

export function StepBar({
  step,
  total,
  labelTr,
  onBack,
}: {
  step: number;
  total: number;
  labelTr: string;
  onBack?: () => void;
}): ReactNode {
  const { colors, spacing } = useTheme();
  const router = useRouter();
  const back = onBack ?? (router.canGoBack() ? () => router.back() : undefined);
  return (
    <View style={[styles.stepBarRow, { gap: spacing.md }]}>
      {back !== undefined && <BackCircle onPress={back} />}
      <View style={styles.stepBarBody}>
        <Text variant="caption" tone="muted" style={styles.stepKicker}>
          {labelTr.toLocaleUpperCase('tr-TR')}
        </Text>
        <View
          style={styles.segmentRow}
          accessibilityRole="progressbar"
          accessibilityLabel={labelTr}
          accessibilityValue={{ min: 0, max: total, now: step }}
        >
          {Array.from({ length: total }, (_, index) => (
            <View
              key={index}
              style={[
                styles.segment,
                { backgroundColor: index < step ? colors.primary : colors.border },
              ]}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

/* ── TrustStrip: the "no photo / voice safety" reassurance ───── */

export function TrustStrip({ items }: { items: string[] }): ReactNode {
  const { colors, radius, spacing } = useTheme();
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
      {items.map((item) => (
        <View key={item} style={[styles.trustRow, { gap: spacing.sm }]}>
          <Text variant="label" tone="success" accessibilityElementsHidden>
            ✓
          </Text>
          <Text variant="caption" style={[styles.trustText, { color: colors.ink }]}>
            {item}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** Big single-line reassurance, used on S04: "Çocuğunuzun fotoğrafını istemiyoruz." */
export function PrivacyPromise({ textTr }: { textTr: string }): ReactNode {
  const { colors, radius, spacing } = useTheme();
  return (
    <View
      style={[
        styles.promiseBox,
        {
          gap: spacing.sm,
          backgroundColor: colors.surfaceRaised,
          borderColor: colors.primary,
          borderRadius: radius.md,
          padding: spacing.md,
        },
      ]}
    >
      <Text style={styles.promiseIcon} accessibilityElementsHidden>
        🛡️
      </Text>
      <Text variant="bodyStrong" style={[styles.promiseText, { color: colors.primary }]}>
        {textTr}
      </Text>
    </View>
  );
}

/* ── Secondary button (delegates to the design system) ───────── */

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
    <Button label={label} variant="secondary" onPress={onPress} disabled={disabled === true} />
  );
}

const styles = StyleSheet.create({
  centerBox: { alignItems: 'center' },

  retryButton: { alignSelf: 'flex-start', marginTop: 4 },

  checkCircle: { alignItems: 'center', justifyContent: 'center' },
  backCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  selectCard: { borderWidth: 2, flexGrow: 1, flexBasis: '45%' },
  selectCheckWrap: { position: 'absolute', top: 10, right: 10, zIndex: 1 },
  selectCardIcon: { fontSize: 28, lineHeight: 34 },
  selectCardTitle: { fontSize: 18, lineHeight: 24 },
  selectCardFooter: { fontStyle: 'italic' },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  chipTextSelected: { fontWeight: '700' },
  swatch: { width: 14, height: 14, borderRadius: 7, borderWidth: 1 },

  stepBarRow: { flexDirection: 'row', alignItems: 'center' },
  stepBarBody: { flex: 1, gap: 6 },
  stepKicker: { fontSize: 12, letterSpacing: 0.8, fontWeight: '600' },
  segmentRow: { flexDirection: 'row', gap: 4 },
  segment: { flex: 1, height: 4, borderRadius: 2 },

  trustRow: { flexDirection: 'row', alignItems: 'flex-start' },
  trustText: { flex: 1, fontSize: 14, lineHeight: 20 },

  promiseBox: { flexDirection: 'row', alignItems: 'center', borderWidth: 1 },
  promiseIcon: { fontSize: 22 },
  promiseText: { flex: 1, fontSize: 16, lineHeight: 22 },
});
