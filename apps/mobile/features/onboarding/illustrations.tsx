/**
 * Onboarding illüstrasyonları — Figma `Onboarding.tsx` 4 slaytından
 * react-native-svg'ye satır satır taşındı. Dış görsel yok; her şey kod içinde
 * çizilir (tasarım README: "39 SVG kod içinde; eksik varlık sorunu yoktur").
 *
 * packages/ui'ye TERFİ ADAYI: ReadingIllustration (başka ekran isterse).
 */

import type { ReactNode } from 'react';
import Svg, { Circle, Ellipse, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

/** Slayt 1 — koltukta çocuğuna kitap okuyan ebeveyn. */
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

/** Slayt 2 — isim rozetli hikâye kartı ("Onun adı, onun hikâyesi"). */
export function StoryCardIllustration({ width = 220 }: { width?: number }): ReactNode {
  const height = Math.round((width / 220) * 180);
  return (
    <Svg width={width} height={height} viewBox="0 0 220 180" fill="none">
      {/* Hikâye kartı */}
      <Rect x={30} y={20} width={160} height={140} rx={20} fill="white" stroke="#EDE8F8" strokeWidth={1.5} />
      <Rect x={30} y={20} width={160} height={72} rx={20} fill="#EDE8F8" />
      <Rect x={30} y={72} width={160} height={20} fill="#EDE8F8" />
      {/* İllüstrasyon alanı */}
      <Circle cx={110} cy={55} r={25} fill="#D4C8F0" />
      <Circle cx={110} cy={45} r={12} fill="#F5C4A8" />
      <Path d="M90 68c0-11 9-18 20-18s20 7 20 18" fill="#7C5CBF" />
      {/* Metin satırları */}
      <Rect x={50} y={108} width={120} height={8} rx={4} fill="#EDE8F8" />
      <Rect x={50} y={122} width={80} height={6} rx={3} fill="#F2EDE6" />
      {/* İsim rozeti */}
      <Rect x={55} y={136} width={60} height={16} rx={8} fill="#7C5CBF" />
      <SvgText x={85} y={148} textAnchor="middle" fill="white" fontSize={9} fontWeight="700">
        Ege&apos;nin Masalı
      </SvgText>
      {/* Yıldızlar */}
      <Circle cx={48} cy={30} r={3} fill="#FFD97D" />
      <Circle cx={178} cy={150} r={2} fill="#F08B6E" />
      <Path d="M175 28l2 4 4 1-3 3 1 4-4-2-4 2 1-4-3-3 4-1z" fill="#FFD97D" opacity={0.7} />
    </Svg>
  );
}

/** Slayt 3 — ses dalgaları, mikrofon ve kalp ("Sen okumasan da sesin okusun"). */
export function VoiceIllustration({ width = 220 }: { width?: number }): ReactNode {
  const height = Math.round((width / 220) * 180);
  return (
    <Svg width={width} height={height} viewBox="0 0 220 180" fill="none">
      {/* Kitaptan yayılan ses dalgaları */}
      <Rect x={70} y={70} width={80} height={80} rx={16} fill="white" stroke="#EDE8F8" strokeWidth={1.5} />
      <Path
        d="M90 90C95 85 105 85 110 90C115 95 125 95 130 90"
        stroke="#7C5CBF"
        strokeWidth={2.5}
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d="M82 100C90 90 110 90 118 100C126 110 146 110 154 100"
        stroke="#B09CE0"
        strokeWidth={2}
        strokeLinecap="round"
        fill="none"
        opacity={0.6}
      />
      {/* Mikrofon */}
      <Rect x={100} y={108} width={20} height={28} rx={10} fill="#F08B6E" />
      <Path
        d="M92 124c0 10 8 16 18 16s18-6 18-16"
        stroke="#F08B6E"
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
      />
      <Line x1={110} y1={140} x2={110} y2={148} stroke="#F08B6E" strokeWidth={2} strokeLinecap="round" />
      {/* Dalga çubukları */}
      <Rect x={45} y={95} width={6} height={20} rx={3} fill="#B09CE0" opacity={0.4} />
      <Rect x={36} y={100} width={6} height={10} rx={3} fill="#B09CE0" opacity={0.3} />
      <Rect x={163} y={95} width={6} height={20} rx={3} fill="#B09CE0" opacity={0.4} />
      <Rect x={172} y={100} width={6} height={10} rx={3} fill="#B09CE0" opacity={0.3} />
      {/* Kalp */}
      <Path
        d="M108 78c0 0-8-6-8-12 0-4 3-6 6-6 1.5 0 3 0.8 4 2 1-1.2 2.5-2 4-2 3 0 6 2 6 6 0 6-12 12-12 12z"
        fill="#F08B6E"
      />
    </Svg>
  );
}

/** Slayt 4 — fiziksel çocuk kitabı ("Masalı gerçek bir kitaba dönüştür"). */
export function BookIllustration({ width = 220 }: { width?: number }): ReactNode {
  const height = Math.round((width / 220) * 180);
  return (
    <Svg width={width} height={height} viewBox="0 0 220 180" fill="none">
      {/* Fiziksel kitap */}
      <Rect x={55} y={30} width={100} height={130} rx={8} fill="#7C5CBF" />
      <Rect x={65} y={25} width={100} height={130} rx={8} fill="white" stroke="#EDE8F8" strokeWidth={1.5} />
      <Rect x={65} y={25} width={100} height={72} rx={8} fill="#EDE8F8" />
      <Rect x={65} y={81} width={100} height={16} fill="#EDE8F8" />
      {/* Kapak illüstrasyonu */}
      <Circle cx={115} cy={56} r={20} fill="#D4C8F0" />
      <Circle cx={115} cy={47} r={10} fill="#F5C4A8" />
      <Path d="M98 68c0-9 8-15 17-15s17 6 17 15" fill="#7C5CBF" />
      {/* Gökteki yıldızlar */}
      <Circle cx={102} cy={38} r={2} fill="#FFD97D" />
      <Circle cx={128} cy={35} r={1.5} fill="#FFD97D" />
      {/* Kitap başlığı */}
      <Rect x={78} y={104} width={74} height={8} rx={4} fill="#EDE8F8" />
      <Rect x={84} y={118} width={62} height={6} rx={3} fill="#F2EDE6" />
      {/* 3B etkisi */}
      <Rect x={55} y={30} width={10} height={130} rx={4} fill="#5A4190" />
      {/* Parlama */}
      <Rect x={150} y={30} width={15} height={130} rx={8} fill="rgba(255,255,255,0.15)" />
    </Svg>
  );
}
