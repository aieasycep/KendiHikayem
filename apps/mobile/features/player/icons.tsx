/**
 * features/player/icons.tsx — oynatıcı ikonları (Figma `AudioPlayer.tsx` seti).
 *
 * `packages/ui/src/icons/` paralel ajana ait olduğundan burada tanımlandılar;
 * aynı 24×24 viewBox + tema rengi sözleşmesine uyarlar. Çizimler tasarımdaki
 * SVG'lerden birebir alınmıştır (15 sn atlama okları, üç nokta, saat, belge).
 * TERFİ ADAYI: bu set genel kullanımlıdır, `packages/ui`'ye taşınmalıdır.
 */

import Svg, { Circle, Line, Path, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import type { ReactElement } from 'react';

import { useTheme, type IconProps } from '@kendihikayem/ui';

/** Duraklat — oynatıcının büyük düğmesi. */
export function PauseIcon({ size = 24, color }: IconProps): ReactElement {
  const { colors } = useTheme();
  const fill = color ?? colors.ink;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={6} y={4} width={4} height={16} rx={1} fill={fill} />
      <Rect x={14} y={4} width={4} height={16} rx={1} fill={fill} />
    </Svg>
  );
}

/** 15 sn geri — tasarımdaki dairesel ok + "15" yazısı. */
export function Skip15BackIcon({ size = 24, color }: IconProps): ReactElement {
  const { colors } = useTheme();
  const stroke = color ?? colors.ink;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Polyline
        points="1 4 1 10 7 10"
        stroke={stroke}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M3.51 15a9 9 0 1 0 .49-3.35"
        stroke={stroke}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <SvgText x={8} y={16} fontSize={6} fill={stroke} fontWeight="700">
        15
      </SvgText>
    </Svg>
  );
}

/** 15 sn ileri — tasarımdaki dairesel ok + "15" yazısı. */
export function Skip15ForwardIcon({ size = 24, color }: IconProps): ReactElement {
  const { colors } = useTheme();
  const stroke = color ?? colors.ink;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Polyline
        points="23 4 23 10 17 10"
        stroke={stroke}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M20.49 15a9 9 0 1 1-.49-3.35"
        stroke={stroke}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <SvgText x={8} y={16} fontSize={6} fill={stroke} fontWeight="700">
        15
      </SvgText>
    </Svg>
  );
}

/** Üç nokta (dikey) — oynatıcı sağ üst menü düğmesi. */
export function MoreVerticalIcon({ size = 24, color }: IconProps): ReactElement {
  const { colors } = useTheme();
  const stroke = color ?? colors.ink;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={1} stroke={stroke} strokeWidth={2} />
      <Circle cx={12} cy={5} r={1} stroke={stroke} strokeWidth={2} />
      <Circle cx={12} cy={19} r={1} stroke={stroke} strokeWidth={2} />
    </Svg>
  );
}

/** Saat — "Zamanlayıcı" çipi. */
export function ClockIcon({ size = 24, color }: IconProps): ReactElement {
  const { colors } = useTheme();
  const stroke = color ?? colors.ink;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={10} stroke={stroke} strokeWidth={2} />
      <Polyline
        points="12 6 12 12 16 14"
        stroke={stroke}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Belge — "Metni göster" düğmesi. */
export function FileTextIcon({ size = 24, color }: IconProps): ReactElement {
  const { colors } = useTheme();
  const stroke = color ?? colors.ink;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
        stroke={stroke}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Polyline
        points="14 2 14 8 20 8"
        stroke={stroke}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Line x1={16} y1={13} x2={8} y2={13} stroke={stroke} strokeWidth={2} strokeLinecap="round" />
      <Line x1={16} y1={17} x2={8} y2={17} stroke={stroke} strokeWidth={2} strokeLinecap="round" />
      <Polyline
        points="10 9 9 9 8 9"
        stroke={stroke}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
