/** LibraryIcon — kapalı kitap; alt gezinme "Hikâyelerim" (Figma BottomNav birebir). */

import Svg, { Path } from 'react-native-svg';
import type { ReactElement } from 'react';

import { useTheme } from '../theme';
import type { FillableIconProps } from './types';

export function LibraryIcon({
  size = 24,
  color,
  strokeWidth = 1.8,
  filled = false,
}: FillableIconProps): ReactElement {
  const { colors } = useTheme();
  const stroke = color ?? colors.ink;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Figma çizim sırası: önce sırt eğrisi, sonra gövde. */}
      <Path
        d="M4 19.5A2.5 2.5 0 016.5 17H20"
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"
        fill={filled ? stroke : 'none'}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
