/** MoonIcon — uyku/gece göstergesi (kategori kartı, uyku sayacı). */

import Svg, { Path } from 'react-native-svg';
import type { ReactElement } from 'react';

import { useTheme } from '../theme';
import type { IconProps } from './types';

export function MoonIcon({ size = 24, color, strokeWidth = 1.8 }: IconProps): ReactElement {
  const { colors } = useTheme();
  const stroke = color ?? colors.ink;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
