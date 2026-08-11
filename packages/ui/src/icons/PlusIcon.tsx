/** PlusIcon — "Oluştur" eylemi (Figma BottomNav ortadaki daire). */

import Svg, { Line } from 'react-native-svg';
import type { ReactElement } from 'react';

import { useTheme } from '../theme';
import type { IconProps } from './types';

export function PlusIcon({ size = 24, color, strokeWidth = 2 }: IconProps): ReactElement {
  const { colors } = useTheme();
  const stroke = color ?? colors.ink;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Line
        x1={12}
        y1={5}
        x2={12}
        y2={19}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <Line
        x1={5}
        y1={12}
        x2={19}
        y2={12}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </Svg>
  );
}
