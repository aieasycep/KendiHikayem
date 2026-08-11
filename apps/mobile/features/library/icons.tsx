/**
 * features/library/icons.tsx — kitaplık + hikaye detayı ekranlarının ikonları.
 *
 * `packages/ui/src/icons/` paralel ajana ait olduğu için burada tanımlandılar;
 * aynı 24×24 viewBox + tema rengi sözleşmesine uyarlar. TERFİ ADAYI: bu set
 * genel kullanımlıdır, `packages/ui`'ye taşınmalıdır (rapora not düşüldü).
 */

import Svg, { Circle, Line, Path } from 'react-native-svg';
import type { ReactElement } from 'react';

import { useTheme, type IconProps } from '@kendihikayem/ui';

/** Arama büyüteci — kitaplık arama kutusu. */
export function SearchIcon({ size = 24, color }: IconProps): ReactElement {
  const { colors } = useTheme();
  const stroke = color ?? colors.inkMuted;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={11} cy={11} r={7} stroke={stroke} strokeWidth={2} />
      <Line
        x1={20.4}
        y1={20.4}
        x2={16.1}
        y2={16.1}
        stroke={stroke}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** Paylaş (üç düğümlü ağ) — hikaye sonucu ekranı. */
export function ShareIcon({ size = 24, color }: IconProps): ReactElement {
  const { colors } = useTheme();
  const stroke = color ?? colors.ink;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={18} cy={5} r={3} stroke={stroke} strokeWidth={2} />
      <Circle cx={6} cy={12} r={3} stroke={stroke} strokeWidth={2} />
      <Circle cx={18} cy={19} r={3} stroke={stroke} strokeWidth={2} />
      <Line x1={8.6} y1={13.5} x2={15.4} y2={17.5} stroke={stroke} strokeWidth={2} />
      <Line x1={15.4} y1={6.5} x2={8.6} y2={10.5} stroke={stroke} strokeWidth={2} />
    </Svg>
  );
}

/** Sola ok — hero üstündeki geri düğmesi. */
export function ArrowLeftIcon({ size = 24, color }: IconProps): ReactElement {
  const { colors } = useTheme();
  const stroke = color ?? colors.ink;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M19 12H5M12 19l-7-7 7-7"
        stroke={stroke}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
