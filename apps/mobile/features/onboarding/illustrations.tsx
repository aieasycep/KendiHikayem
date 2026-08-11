/**
 * Onboarding illüstrasyonları — Figma `Onboarding.tsx` slaytlarından
 * react-native-svg'ye elle taşındı. Dış görsel yok; her şey kod içinde çizilir
 * (tasarım README: "39 SVG kod içinde; eksik varlık sorunu yoktur").
 *
 * packages/ui'ye TERFİ ADAYI: ReadingIllustration (başka ekran isterse).
 */

import type { ReactNode } from 'react';
import Svg, { Circle, Ellipse, Line, Path, Rect } from 'react-native-svg';

/** Koltukta çocuğuna kitap okuyan ebeveyn (değer önerisi ekranı). */
export function ReadingIllustration({ width = 220 }: { width?: number }): ReactNode {
  const height = Math.round((width / 220) * 180);
  return (
    <Svg width={width} height={height} viewBox="0 0 220 180" fill="none">
      <Ellipse cx={110} cy={160} rx={80} ry={12} fill="rgba(176,156,224,0.15)" />
      {/* Koltuk */}
      <Rect x={50} y={100} width={120} height={60} rx={20} fill="#EDE8F8" />
      <Rect x={36} y={90} width={28} height={70} rx={14} fill="#D4C8F0" />
      <Rect x={156} y={90} width={28} height={70} rx={14} fill="#D4C8F0" />
      {/* Ebeveyn */}
      <Circle cx={95} cy={80} r={20} fill="#F5C4A8" />
      <Rect x={70} y={98} width={50} height={48} rx={16} fill="#7C5CBF" />
      {/* Çocuk */}
      <Circle cx={138} cy={90} r={16} fill="#F5C4A8" />
      <Rect x={118} y={104} width={40} height={38} rx={12} fill="#F08B6E" />
      {/* Kitap */}
      <Rect
        x={78}
        y={112}
        width={44}
        height={32}
        rx={6}
        fill="#FAF8F4"
        stroke="#B09CE0"
        strokeWidth={1.5}
      />
      <Line x1={100} y1={112} x2={100} y2={144} stroke="#B09CE0" strokeWidth={1} />
      {/* Yıldızlar */}
      <Circle cx={170} cy={40} r={3} fill="#FFD97D" />
      <Circle cx={55} cy={55} r={2} fill="#B09CE0" />
      <Circle cx={185} cy={75} r={2} fill="#F08B6E" />
      <Path d="M158 25l2 5 5 1-4 4 1 5-4-3-4 3 1-5-4-4 5-1z" fill="#FFD97D" />
    </Svg>
  );
}
