/**
 * Button — tek birincil eylem kuralının taşıyıcısı.
 *
 * `variant="primary"` bir ekranda EN FAZLA BİR KEZ görünmelidir (SPEC §11.0
 * "tek ana eylem"). İkincil işler `secondary`/`ghost`, yıkıcı işler `danger`.
 *
 * `busy` durumu buton içinde küçük bir dönence gösterir; bu yalnızca 1-2 saniyelik
 * istek onayı içindir. 20 saniyeyi aşabilecek işler butonda DEĞİL,
 * `JobProgressCard` ile beklenir (spinner yok, bildirim var).
 */

import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import type { ReactElement } from 'react';

import { useTheme } from '../theme';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  /** Kısa süreli istek beklemesi. Uzun işler için JobProgressCard kullanın. */
  busy?: boolean;
  /** Satır içine sıkışan küçük buton (kart eylemleri). */
  compact?: boolean;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  busy = false,
  compact = false,
  accessibilityHint,
  style,
  testID,
}: ButtonProps): ReactElement {
  const { colors, radius, touchTarget, motion: _motion } = useTheme();
  const blocked = disabled || busy;

  const backgroundFor = (pressed: boolean): string => {
    if (variant === 'primary') return pressed ? colors.primaryPressed : colors.primary;
    if (variant === 'danger') return pressed ? colors.surfaceMuted : 'transparent';
    if (variant === 'secondary') return pressed ? colors.surfaceMuted : colors.surface;
    return pressed ? colors.surfaceMuted : 'transparent';
  };

  const borderColor =
    variant === 'secondary' ? colors.border : variant === 'danger' ? colors.danger : 'transparent';

  const textTone =
    variant === 'primary' ? 'onPrimary' : variant === 'danger' ? 'danger' : 'default';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: blocked, busy }}
      accessibilityHint={accessibilityHint}
      hitSlop={compact ? touchTarget.hitSlop : undefined}
      disabled={blocked}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        {
          // Tasarım dili: butonlar hap değil, yumuşak köşeli dikdörtgen (Figma 14-16).
          borderRadius: compact ? radius.sm : radius.md,
          minHeight: compact ? 40 : touchTarget.minHeight + 4,
          paddingHorizontal: compact ? 16 : 24,
          backgroundColor: backgroundFor(pressed),
          borderWidth: variant === 'secondary' || variant === 'danger' ? 1 : 0,
          borderColor,
          opacity: blocked ? 0.55 : 1,
        },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' ? colors.inkOnPrimary : colors.ink}
        />
      ) : (
        <Text variant={compact ? 'label' : 'bodyStrong'} tone={textTone} numberOfLines={1}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    alignSelf: 'stretch',
  },
});
