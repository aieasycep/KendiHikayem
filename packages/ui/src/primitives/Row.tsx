/**
 * Row — yatay dizilim yardımcısı (chip şeritleri, kart alt eylemleri).
 */

import { View, type StyleProp, type ViewStyle } from 'react-native';
import type { ReactElement, ReactNode } from 'react';

import { useTheme } from '../theme';

export interface RowProps {
  children: ReactNode;
  gap?: 'xs' | 'sm' | 'md' | 'lg';
  wrap?: boolean;
  align?: 'center' | 'flex-start' | 'flex-end';
  justify?: 'flex-start' | 'space-between' | 'center' | 'flex-end';
  style?: StyleProp<ViewStyle>;
}

export function Row({
  children,
  gap = 'sm',
  wrap = false,
  align = 'center',
  justify = 'flex-start',
  style,
}: RowProps): ReactElement {
  const { spacing } = useTheme();
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          gap: spacing[gap],
          flexWrap: wrap ? 'wrap' : 'nowrap',
          alignItems: align,
          justifyContent: justify,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
