/**
 * Throwaway presentational primitives for the navigation skeleton.
 * The real component library is packages/ui (owner: F2). Do not grow this file.
 */

import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radius, spacing, typography } from '../constants/theme';

export function Screen({ children }: { children: ReactNode }): ReactNode {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function Title({ children }: { children: ReactNode }): ReactNode {
  return <Text style={styles.title}>{children}</Text>;
}

export function Heading({ children }: { children: ReactNode }): ReactNode {
  return <Text style={styles.heading}>{children}</Text>;
}

export function Body({ children }: { children: ReactNode }): ReactNode {
  return <Text style={styles.body}>{children}</Text>;
}

export function Caption({ children }: { children: ReactNode }): ReactNode {
  return <Text style={styles.caption}>{children}</Text>;
}

export function Card({
  children,
  onPress,
}: {
  children: ReactNode;
  onPress?: () => void;
}): ReactNode {
  if (onPress === undefined) return <View style={styles.card}>{children}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      {children}
    </Pressable>
  );
}

export function DemoBadge(): ReactNode {
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>DEMO</Text>
    </View>
  );
}

/** Single primary action per screen — design constitution, SPEC §11.0. */
export function PrimaryButton({
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
        styles.button,
        pressed && styles.buttonPressed,
        disabled === true && styles.buttonDisabled,
      ]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

/**
 * Marks a screen that exists for navigation only. Every one of these is a real screen from
 * SPEC §11.1 that another agent will fill in; the Turkish note tells a tester exactly that.
 */
export function ScreenStub({ screenCodes, note }: { screenCodes: string; note: string }): ReactNode {
  return (
    <View style={styles.stub}>
      <Text style={styles.stubCode}>{screenCodes}</Text>
      <Text style={styles.stubNote}>{note}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.md },
  title: { ...typography.title, color: colors.ink },
  heading: { ...typography.heading, color: colors.ink },
  body: { ...typography.body, color: colors.ink },
  caption: { ...typography.caption, color: colors.inkMuted },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardPressed: { backgroundColor: colors.surfaceMuted },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.demoBadge,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  badgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: 16,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  buttonPressed: { opacity: 0.85 },
  buttonDisabled: { backgroundColor: colors.inkMuted, opacity: 0.5 },
  buttonText: { ...typography.body, color: colors.primaryInk, fontWeight: '700' },
  stub: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  stubCode: { ...typography.label, color: colors.accent },
  stubNote: { ...typography.caption, color: colors.inkMuted },
});
