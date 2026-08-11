/** SparkleIcon — dört uçlu yıldız parıltısı (hero kart, üretim ekranları). */

import Svg, { Path } from 'react-native-svg';
import type { ReactElement } from 'react';

import { useTheme } from '../theme';
import type { IconProps } from './types';

export function SparkleIcon({ size = 24, color }: IconProps): ReactElement {
  const { colors } = useTheme();
  const fill = color ?? colors.primary;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 2c.4 4.9 2.3 7.6 10 10-7.7 2.4-9.6 5.1-10 10-.4-4.9-2.3-7.6-10-10 7.7-2.4 9.6-5.1 10-10z"
        fill={fill}
      />
    </Svg>
  );
}
