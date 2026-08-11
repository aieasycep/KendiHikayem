/**
 * Card — yüzey birimi. Basılabilirse `onPress` verilir ve erişilebilirlik
 * rolü otomatik `button` olur.
 */

import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import type { ReactElement, ReactNode } from 'react';

import { useTheme } from '../theme';
import { elevation } from '../tokens/layout';

export interface CardProps {
  children: ReactNode;
  onPress?: () => void;
  /** Seçili durum (ör. format kartı, tema kartı). */
  selected?: boolean;
  /** Kart içi boşluğu kapat (kapak görseli kenara dayansın). */
  flush?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Card({
  children,
  onPress,
  selected = false,
  flush = false,
  accessibilityLabel,
  style,
  testID,
}: CardProps): ReactElement {
  const { colors, radius, spacing } = useTheme();

  const baseStyle: ViewStyle = {
    // Tasarımdaki "kalkık kâğıt" hissi: yumuşak gölge + ince kenarlık.
    ...elevation.card,
    backgroundColor: selected ? colors.surfaceRaised : colors.surface,
    borderRadius: radius.md,
    borderWidth: selected ? 2 : 1,
    borderColor: selected ? colors.primary : colors.border,
    padding: flush ? 0 : spacing.md,
    gap: flush ? 0 : spacing.sm,
    overflow: 'hidden',
  };

  if (onPress === undefined) {
    return (
      <View accessibilityLabel={accessibilityLabel} style={[baseStyle, style]} testID={testID}>
        {children}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        baseStyle,
        pressed && { backgroundColor: colors.surfaceMuted },
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}
