/**
 * NightCover — oynatıcının üst görsel alanı.
 *
 * Sayfa görseli yüklenebilirse tam ekran gösterilir. Yüklenemezse (mock CDN
 * 404, imzalı URL süresi doldu, sayfa resmi henüz üretimde) tasarımdaki gece
 * kapağı devreye girer: koyu mor degrade, yıldızlar ve camsı emoji karosu —
 * Figma `AudioPlayer.tsx` kapak dili. Kırık görsel ya da monogram YOK; ekran
 * yatma saatinde her koşulda sakin ve masalsı kalır.
 */

import { LinearGradient } from 'expo-linear-gradient';
import { Image, StyleSheet, Text as RNText, View } from 'react-native';
import { useState, type ReactElement } from 'react';

import { palette } from '@kendihikayem/ui';

import { coverVisual } from '../library/cover';

/** Deterministik yıldız alanı — her render aynı gökyüzü. */
const STARS = Array.from({ length: 20 }, (_, i) => ({
  size: i % 4 === 0 ? 3 : 2,
  opacity: 0.15 + (i % 5) * 0.08,
  top: `${(i * 41 + 5) % 100}%` as const,
  left: `${(i * 67 + 9) % 100}%` as const,
}));

export interface NightCoverProps {
  /** Emoji seçimi için hikaye kimliği. */
  seed: string;
  /** Sayfanın imzalı görsel adresi. */
  uri?: string;
  /** Cihaza indirilen kopya — önceliklidir. */
  localUri?: string;
  /** Erişilebilirlik etiketi (ör. "3. sayfa görseli"). */
  altTr?: string;
}

export function NightCover({ seed, uri, localUri, altTr }: NightCoverProps): ReactElement {
  const [failedUris, setFailedUris] = useState<ReadonlySet<string>>(new Set());
  const [loadedUris, setLoadedUris] = useState<ReadonlySet<string>>(new Set());

  const candidates = [localUri, uri].filter(
    (value): value is string => value !== undefined && value.length > 0,
  );
  const source = candidates.find((candidate) => !failedUris.has(candidate));
  const imageVisible = source !== undefined && loadedUris.has(source);

  const { emoji } = coverVisual(seed);

  return (
    <View
      style={styles.fill}
      accessibilityRole="image"
      accessibilityLabel={altTr}
    >
      {/* Gece kapağı — görsel gelene kadar (ya da hiç gelmezse) zemin. */}
      <LinearGradient
        colors={[palette.royalPurple, palette.purple600]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={[StyleSheet.absoluteFill, styles.center]}
      >
        {STARS.map((star, i) => (
          <View
            key={i}
            style={[
              styles.star,
              {
                width: star.size,
                height: star.size,
                opacity: star.opacity,
                top: star.top,
                left: star.left,
              },
            ]}
          />
        ))}
        <View style={styles.tile}>
          <RNText style={styles.emoji}>{emoji}</RNText>
        </View>
      </LinearGradient>

      {source !== undefined ? (
        <Image
          source={{ uri: source }}
          resizeMode="cover"
          style={[StyleSheet.absoluteFill, !imageVisible && styles.hidden]}
          onLoad={() => {
            setLoadedUris((previous) => new Set(previous).add(source));
          }}
          onError={() => {
            setFailedUris((previous) => new Set(previous).add(source));
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, overflow: 'hidden' },
  center: { alignItems: 'center', justifyContent: 'center' },
  star: { position: 'absolute', borderRadius: 2, backgroundColor: '#FFFFFF' },
  tile: {
    width: 150,
    height: 150,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(176,156,224,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#7C5CBF',
    shadowOpacity: 0.5,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  emoji: { fontSize: 64, lineHeight: 80 },
  hidden: { opacity: 0 },
});
