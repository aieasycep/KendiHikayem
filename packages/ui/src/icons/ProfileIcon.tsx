/** ProfileIcon — alt gezinme "Profil" (Figma BottomNav). */

import Svg, { Circle, Path } from 'react-native-svg';
import type { ReactElement } from 'react';

import { useTheme } from '../theme';
import type { FillableIconProps } from './types';

export function ProfileIcon({
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
        d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"
        fill={filled ? stroke : 'none'}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle
        cx={12}
        cy={7}
        r={4}
        fill={filled ? stroke : 'none'}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
    </Svg>
  );
}
