/**
 * cover.tsx — kapak görselleri için ortak dil (kitaplık + hikaye detayı).
 *
 * Kapak her zaman dekoratif bir pastel zemin + emoji ile TEMSİL edilir (Figma
 * `cover: "#D4C8F0"` + `emoji: "⭐"` yaklaşımı); gerçek görsel yüklenebilirse
 * pastelin ÜZERİNE oturur. Böylece kapak yüklenemediğinde (imzalı URL'in süresi
 * doldu, cihaz çevrimdışı, `medya_404` senaryosu) ekran kırık görsel değil,
 * zaten oradaki pasteli gösterir.
 *
 * Demo derlemesinde kapak adresi APK'ya gömülü bir dosyaya çözülür
 * (lib/demoMedia.ts) — o durumda ağ hiç denenmez.
 *
 * Renk/emoji seçimi hikaye kimliğinden türetilir (küçük karma): aynı masal,
 * filtre değişince ya da listede yer değiştirince kapağını DEĞİŞTİRMEZ.
 */

import {
  Image,
  StyleSheet,
  Text as RNText,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useState, type ReactElement } from 'react';

import { palette } from '@kendihikayem/ui';

import { demoImageModule } from '../../lib/demoMedia';

/** Ana sayfayla aynı pastel seti (base ajanın kalıbı). */
const COVER_TINTS = [
  palette.lavenderPale,
  palette.babyBlue,
  palette.mintGreen,
  palette.peach,
] as const;
const COVER_EMOJIS = ['⭐', '🚀', '🌿', '🐻', '🌙', '✨'] as const;

export interface CoverVisual {
  tint: string;
  emoji: string;
}

/** Deterministik küçük karma — aynı id her zaman aynı kapağı üretir. */
function hashSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function coverVisual(seed: string): CoverVisual {
  const hash = hashSeed(seed);
  return {
    tint: COVER_TINTS[hash % COVER_TINTS.length] ?? palette.lavenderPale,
    emoji: COVER_EMOJIS[hash % COVER_EMOJIS.length] ?? '⭐',
  };
}

export interface CoverArtProps {
  /** Kapağın kimliği — pastel/emoji bundan türetilir (hikaye id'si). */
  seed: string;
  /** İmzalı uzak kapak URL'i (varsa denenir). */
  uri?: string;
  /** Cihaza indirilen kopya — her zaman önceliklidir. */
  localUri?: string;
  /** Emoji'yi elle sabitlemek için (ör. devam kartında ⭐). */
  emoji?: string;
  emojiSize?: number;
  borderRadius?: number;
  /** Erişilebilirlik etiketi. Dekoratifse boş bırakılır. */
  altTr?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Pastel + emoji kapak. Gerçek görsel yüklenirse üstünü kaplar; yüklenemezse
 * (404, çevrimdışı) dekoratif kapak zaten ekrandadır — kırık görsel yok,
 * yükleme titremesi yok.
 */
export function CoverArt({
  seed,
  uri,
  localUri,
  emoji,
  emojiSize = 32,
  borderRadius,
  altTr,
  style,
}: CoverArtProps): ReactElement {
  const visual = coverVisual(seed);
  const [failedUris, setFailedUris] = useState<ReadonlySet<string>>(new Set());
  const [loadedUris, setLoadedUris] = useState<ReadonlySet<string>>(new Set());

  /* Gömülü demo kapağı varsa ağ hiç denenmez (indirilmiş kopya yine öncelikli). */
  const bundled = localUri === undefined ? demoImageModule(uri) : undefined;

  const candidates = [localUri, uri].filter(
    (value): value is string => value !== undefined && value.length > 0,
  );
  const source = candidates.find((candidate) => !failedUris.has(candidate));
  const imageVisible = source !== undefined && loadedUris.has(source);

  const emojiStyle: TextStyle = { fontSize: emojiSize, lineHeight: Math.round(emojiSize * 1.25) };

  return (
    <View
      accessibilityRole={altTr !== undefined ? 'image' : 'none'}
      accessibilityLabel={altTr}
      accessibilityElementsHidden={altTr === undefined}
      style={[
        styles.base,
        { backgroundColor: visual.tint, borderRadius: borderRadius ?? 12 },
        style,
      ]}
    >
      <RNText style={emojiStyle}>{emoji ?? visual.emoji}</RNText>
      {bundled !== undefined ? (
        <Image source={bundled} resizeMode="cover" style={StyleSheet.absoluteFill} />
      ) : source !== undefined ? (
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

/* ── Tarih yardımcıları ──────────────────────────────────────── */

/** "Dün", "3 gün önce", "2 hafta önce" — tasarımdaki tarih satırı. */
export function relativeDateTr(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const dayMs = 24 * 60 * 60 * 1000;
  const days = Math.floor((now.getTime() - then.getTime()) / dayMs);
  if (days <= 0) return 'Bugün';
  if (days === 1) return 'Dün';
  if (days < 7) return `${days} gün önce`;
  if (days < 30) return `${Math.floor(days / 7)} hafta önce`;
  if (days < 365) return `${Math.floor(days / 30)} ay önce`;
  return then.toLocaleDateString('tr-TR');
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  hidden: { opacity: 0 },
});
