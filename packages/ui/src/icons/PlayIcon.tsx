/** PlayIcon — ses önizleme / oynatıcı tetikleyicisi (ses kartları, devam kartı). */

import Svg, { Path } from 'react-native-svg';
import type { ReactElement } from 'react';

import { useTheme } from '../theme';
import type { IconProps } from './types';

export function PlayIcon({ size = 24, color }: IconProps): ReactElement {
  const { colors } = useTheme();
  const fill = color ?? colors.ink;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M8 5.5v13a1 1 0 001.53.85l10.2-6.5a1 1 0 000-1.7L9.53 4.65A1 1 0 008 5.5z" fill={fill} />
    </Svg>
  );
}
