/**
 * StorybookLogo — açık kitap + yıldızlar; marka logosu (Figma Splash).
 *
 * Gece zemin (splash, onboarding kapağı) üzerinde tasarlandı: sol yaprak ay
 * ışığı altını, sağ yaprak lavantayı taşır. Renkler sabittir — logo her yerde
 * aynı görünür; boyut `size` ile ölçeklenir.
 */

import Svg, { Circle, Line, Path } from 'react-native-svg';
import type { ReactElement } from 'react';

export function StorybookLogo({ size = 52 }: { size?: number }): ReactElement {
  return (
    <Svg width={size} height={size} viewBox="0 0 52 52" fill="none">
      <Path
        d="M26 10C22 6 14 5 6 8v28c8-3 16-2 20 2V10z"
        fill="rgba(255,220,150,0.6)"
        stroke="rgba(255,220,150,0.9)"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <Path
        d="M26 10C30 6 38 5 46 8v28c-8-3-16-2-20 2V10z"
        fill="rgba(176,156,224,0.5)"
        stroke="rgba(176,156,224,0.9)"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <Line x1={26} y1={10} x2={26} y2={40} stroke="rgba(255,255,255,0.5)" strokeWidth={1.5} />
      <Circle cx={14} cy={22} r={2} fill="rgba(255,220,150,0.9)" />
      <Circle cx={38} cy={18} r={1.5} fill="rgba(176,156,224,1)" />
      <Circle cx={38} cy={26} r={1} fill="rgba(255,255,255,0.7)" />
    </Svg>
  );
}
