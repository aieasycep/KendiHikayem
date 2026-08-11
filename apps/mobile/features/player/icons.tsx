/**
 * features/player/icons.tsx — oynatıcı ikonları.
 *
 * `packages/ui/src/icons/` paralel ajana ait olduğundan burada tanımlandılar;
 * aynı 24×24 viewBox + tema rengi sözleşmesine uyarlar. TERFİ ADAYI:
 * PauseIcon genel kullanımlıdır, `packages/ui`'ye taşınmalıdır.
 */

import Svg, { Path, Rect } from 'react-native-svg';
import type { ReactElement } from 'react';

import { useTheme, type IconProps } from '@kendihikayem/ui';

/** Duraklat — oynatıcının büyük düğmesi. */
export function PauseIcon({ size = 24, color }: IconProps): ReactElement {
  const { colors } = useTheme();
  const fill = color ?? colors.ink;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={6} y={4} width={4} height={16} rx={1.5} fill={fill} />
      <Rect x={14} y={4} width={4} height={16} rx={1.5} fill={fill} />
    </Svg>
  );
}

/** Önceki sayfa oku (sol şerit düğmesi). */
export function ChevronLeftIcon({ size = 24, color }: IconProps): ReactElement {
  const { colors } = useTheme();
  const stroke = color ?? colors.ink;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M15 18l-6-6 6-6"
        stroke={stroke}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Sonraki sayfa (sağ şerit düğmesi). */
export function ChevronRightThinIcon({ size = 24, color }: IconProps): ReactElement {
  const { colors } = useTheme();
  const stroke = color ?? colors.ink;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9 6l6 6-6 6"
        stroke={stroke}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
