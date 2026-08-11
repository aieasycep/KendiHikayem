/**
 * Badge — küçük durum rozeti ("İndirildi", "Hazırlanıyor", "Anne sesi").
 * Renk tek başına anlam taşımaz; metin her zaman vardır (erişilebilirlik).
 */

import { View } from 'react-native';
import type { ReactElement } from 'react';

import { useTheme } from '../theme';
import { Text } from './Text';

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'accent';

export interface BadgeProps {
  labelTr: string;
  tone?: BadgeTone;
  icon?: string;
}

export function Badge({ labelTr, tone = 'neutral', icon }: BadgeProps): ReactElement {
  const { colors, radius } = useTheme();
  const color =
    tone === 'success'
      ? colors.success
      : tone === 'warning'
        ? colors.warning
        : tone === 'danger'
          ? colors.danger
          : tone === 'accent'
            ? colors.accent
            : colors.inkMuted;

  return (
    <View
      style={{
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: color,
        backgroundColor: colors.surface,
        paddingHorizontal: 10,
        paddingVertical: 3,
      }}
    >
      <Text variant="caption" style={{ color, fontWeight: '700' }}>
        {icon !== undefined ? `${icon} ${labelTr}` : labelTr}
      </Text>
    </View>
  );
}
