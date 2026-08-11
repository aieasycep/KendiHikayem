/**
 * Text — tipografi tabanlı metin bileşeni.
 *
 * Ekran kodu `fontSize` yazmaz; varyant seçer. Böylece 18 pt erişilebilirlik
 * tabanı tek yerden korunur. `allowFontScaling` AÇIK bırakılır: sistemin büyük
 * yazı ayarına saygı erişilebilirlik gereğidir (SPEC §11.0).
 */

import { Text as RNText, type StyleProp, type TextProps, type TextStyle } from 'react-native';
import type { ReactElement } from 'react';

import { useTheme } from '../theme';
import type { TypeVariant } from '../tokens/typography';

export type TextTone = 'default' | 'muted' | 'onPrimary' | 'accent' | 'danger' | 'success';

export interface UiTextProps extends TextProps {
  variant?: TypeVariant;
  tone?: TextTone;
  /** Ortalamak için kısayol. */
  center?: boolean;
  style?: StyleProp<TextStyle>;
}

export function Text({
  variant = 'body',
  tone = 'default',
  center = false,
  style,
  children,
  ...rest
}: UiTextProps): ReactElement {
  const { colors, type } = useTheme();
  const color =
    tone === 'muted'
      ? colors.inkMuted
      : tone === 'onPrimary'
        ? colors.inkOnPrimary
        : tone === 'accent'
          ? colors.accent
          : tone === 'danger'
            ? colors.danger
            : tone === 'success'
              ? colors.success
              : colors.ink;

  return (
    <RNText
      {...rest}
      style={[type[variant], { color }, center && { textAlign: 'center' }, style]}
    >
      {children}
    </RNText>
  );
}
