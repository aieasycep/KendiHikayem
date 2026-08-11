/**
 * NightCover — oynatıcının kapak karosu (Figma `AudioPlayer.tsx` "Cover art").
 *
 * Tasarım: 220×220, köşe 32, 160° koyu mor degrade (#2D1B69 → #7C5CBF), ortada
 * 88 punto emoji, mor parlak gölge. Sayfa görseli yüklenebilirse degradenin
 * üzerine oturur; yüklenemezse (mock CDN 404, imzalı URL süresi doldu) karo
 * zaten ekrandadır — kırık görsel ya da monogram YOK.
 */

import { LinearGradient } from 'expo-linear-gradient';
import { Image, StyleSheet, Text as RNText, View } from 'react-native';
import { useState, type ReactElement } from 'react';

import { palette } from '@kendihikayem/ui';

import { coverVisual } from '../library/cover';

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
    <View style={styles.tile} accessibilityRole="image" accessibilityLabel={altTr}>
      <LinearGradient
        colors={[palette.royalPurple, palette.purple600]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={[StyleSheet.absoluteFill, styles.center]}
      >
        <RNText style={styles.emoji}>{emoji}</RNText>
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
  /* Figma: width/height 220, radius 32, boxShadow 0 24 64 rgba(124,92,191,0.5)
   * + 1px rgba(176,156,224,0.15) halka. */
  tile: {
    width: 220,
    height: 220,
    borderRadius: 32,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(176,156,224,0.15)',
    shadowColor: '#7C5CBF',
    shadowOpacity: 0.5,
    shadowRadius: 64,
    shadowOffset: { width: 0, height: 24 },
    elevation: 12,
  },
  center: { alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 88, lineHeight: 104 },
  hidden: { opacity: 0 },
});
