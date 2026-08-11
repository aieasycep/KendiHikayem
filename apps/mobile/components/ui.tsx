/**
 * Köprü primitives — iskelet dönemindeki ekranların import ettiği eski arayüz.
 *
 * TEK GERÇEK KAYNAK `packages/ui`dır: buradaki her bileşen artık oradaki
 * karşılığına DELEGE eder. Böylece bu arayüzü tüketen bütün ekranlar
 * (onboarding, sihirbaz, ses akışı) tek noktadan marka tipografisine
 * (Fraunces + Nunito — `useTheme().type`) ve onaylanan Figma paletine geçti.
 *
 * YENİ KOD BU DOSYAYI KULLANMAZ — doğrudan `@kendihikayem/ui` tüketir.
 * Ekranlar tek tek yeniden yazıldıkça bu köprü küçülür ve en sonunda silinir.
 */

import type { ReactNode } from 'react';
import { View } from 'react-native';

import {
  Badge,
  Button,
  Card as UiCard,
  Screen as UiScreen,
  Text,
  useTheme,
} from '@kendihikayem/ui';

export function Screen({ children }: { children: ReactNode }): ReactNode {
  return <UiScreen>{children}</UiScreen>;
}

export function Title({ children }: { children: ReactNode }): ReactNode {
  return (
    <Text variant="title" accessibilityRole="header">
      {children}
    </Text>
  );
}

export function Heading({ children }: { children: ReactNode }): ReactNode {
  return (
    <Text variant="heading" accessibilityRole="header">
      {children}
    </Text>
  );
}

export function Body({ children }: { children: ReactNode }): ReactNode {
  return <Text variant="body">{children}</Text>;
}

export function Caption({ children }: { children: ReactNode }): ReactNode {
  return (
    <Text variant="caption" tone="muted">
      {children}
    </Text>
  );
}

export function Card({
  children,
  onPress,
}: {
  children: ReactNode;
  onPress?: () => void;
}): ReactNode {
  return <UiCard onPress={onPress}>{children}</UiCard>;
}

export function DemoBadge(): ReactNode {
  return <Badge labelTr="DEMO" tone="accent" />;
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
  return <Button label={label} onPress={onPress} disabled={disabled === true} />;
}

/**
 * Marks a screen that exists for navigation only. Every one of these is a real screen from
 * SPEC §11.1 that another agent will fill in; the Turkish note tells a tester exactly that.
 */
export function ScreenStub({ screenCodes, note }: { screenCodes: string; note: string }): ReactNode {
  const { colors, radius, spacing } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.surfaceMuted,
        borderRadius: radius.md,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: colors.border,
        padding: spacing.md,
        gap: spacing.xs,
      }}
    >
      <Text variant="label" tone="accent">
        {screenCodes}
      </Text>
      <Text variant="caption" tone="muted">
        {note}
      </Text>
    </View>
  );
}
