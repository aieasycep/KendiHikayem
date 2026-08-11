/**
 * Chip — filtre ve seçim düğmesi (L01 filtre çipleri, sihirbaz etiketleri).
 * Seçili durumda dolgu + kalın metin; renk tek başına bilgi taşımaz (AA).
 */

import { Pressable, StyleSheet } from 'react-native';
import type { ReactElement } from 'react';

import { useTheme } from '../theme';
import { Text } from './Text';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  /** Başına küçük simge/emoji (ör. indirme rozeti). */
  icon?: string;
  disabled?: boolean;
  testID?: string;
}

export function Chip({
  label,
  selected = false,
  onPress,
  icon,
  disabled = false,
  testID,
}: ChipProps): ReactElement {
  const { colors, radius, touchTarget } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      hitSlop={touchTarget.hitSlop}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        {
          borderRadius: radius.pill,
          backgroundColor: selected
            ? colors.primary
            : pressed
              ? colors.surfaceMuted
              : colors.surface,
          borderColor: selected ? colors.primary : colors.border,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      <Text
        variant="label"
        tone={selected ? 'onPrimary' : 'muted'}
        style={selected ? styles.selectedText : undefined}
      >
        {icon !== undefined ? `${icon} ${label}` : label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedText: { fontWeight: '700' },
});
