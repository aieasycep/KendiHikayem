/** HomeIcon — alt gezinme "Ana Sayfa" (Figma BottomNav). */

import Svg, { Path } from 'react-native-svg';
import type { ReactElement } from 'react';

import { useTheme } from '../theme';
import type { FillableIconProps } from './types';

export function HomeIcon({
  size = 24,
  color,
  strokeWidth = 1.8,
  filled = false,
}: FillableIconProps): ReactElement {
  const { colors } = useTheme();
  const stroke = color ?? colors.ink;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"
        fill={filled ? stroke : 'none'}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Figma birebir: dolu durumda da çizgi rengi aynıdır (kapı oyulmaz). */}
      <Path
        d="M9 21V12h6v9"
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
