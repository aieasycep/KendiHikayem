/** ChevronRightIcon — liste satırı yön oku (Figma Home öneri kartları). */

import Svg, { Path } from 'react-native-svg';
import type { ReactElement } from 'react';

import { useTheme } from '../theme';
import type { IconProps } from './types';

export function ChevronRightIcon({ size = 16, color, strokeWidth = 2 }: IconProps): ReactElement {
  const { colors } = useTheme();
  const stroke = color ?? colors.inkMuted;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9 18l6-6-6-6"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
