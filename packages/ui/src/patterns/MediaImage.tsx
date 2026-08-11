/**
 * MediaImage — ağdan/diskteki görseli GÜVENLE gösteren bileşen.
 *
 * Ekran, görsel yokken de güzel kalmak ZORUNDADIR: üretimde bir sayfanın
 * görseli `manual_review` kuyruğuna düşebilir, imzalı URL'in süresi dolabilir,
 * cihaz çevrimdışı olabilir. Mock'ta bu yol `medya_404` senaryosuyla prova
 * edilir (packages/mock/src/fixtures/media.ts).
 *
 * Davranış:
 *   0. Adres uygulamanın GÖMÜLÜ varlıklarından birine karşılık geliyorsa
 *      (bkz. mediaResolver.ts) doğrudan o basılır — ağ yok, hata yolu yok.
 *   1. `localUri` verilmişse önce o denenir (çevrimdışı öncelik), hata verirse
 *      uzak URL'e düşülür.
 *   2. Yüklenene kadar yumuşak nabızlı yer tutucu.
 *   3. Hata olursa sıcak renkli, harf monogramlı yer tutucu + isteğe bağlı not.
 *      Kırık görsel simgesi ASLA gösterilmez.
 *
 * Durum, prop'lardan TÜRETİLİR (effect yok): hangi adreslerin battığı/yüklendiği
 * kümelerde tutulur, kaynak listesi her render'da bu kümelere göre çözülür.
 */

import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useState, type ReactElement } from 'react';

import { useTheme } from '../theme';
import { Skeleton } from '../primitives/Skeleton';
import { Text } from '../primitives/Text';
import { resolveLocalMedia } from './mediaResolver';

export interface MediaImageProps {
  /** İmzalı uzak URL. */
  uri?: string;
  /** Cihaza indirilen kopya — varsa her zaman önceliklidir. */
  localUri?: string;
  /** Yer tutucu monogramı için başlık ("Elif ve Tavan Arasındaki Işık" → "E"). */
  placeholderLabelTr?: string;
  /** Yer tutucu alt notu ("Bu sayfanın resmi hazırlanıyor"). */
  placeholderNoteTr?: string;
  aspectRatio?: number;
  borderRadius?: number;
  /** Erişilebilirlik açıklaması. */
  altTr?: string;
  style?: StyleProp<ViewStyle>;
}

export function MediaImage({
  uri,
  localUri,
  placeholderLabelTr,
  placeholderNoteTr,
  aspectRatio = 1,
  borderRadius,
  altTr,
  style,
}: MediaImageProps): ReactElement {
  const { colors, radius } = useTheme();
  const [failedUris, setFailedUris] = useState<ReadonlySet<string>>(new Set());
  const [loadedUris, setLoadedUris] = useState<ReadonlySet<string>>(new Set());

  const bundled = localUri === undefined ? resolveLocalMedia(uri) : undefined;

  const candidates = [localUri, uri].filter(
    (value): value is string => value !== undefined && value.length > 0,
  );
  const source = candidates.find((candidate) => !failedUris.has(candidate));
  const phase: 'loading' | 'ready' | 'failed' =
    source === undefined ? 'failed' : loadedUris.has(source) ? 'ready' : 'loading';

  const finalRadius = borderRadius ?? radius.cover;
  const monogram = (placeholderLabelTr ?? '·').trim().charAt(0).toLocaleUpperCase('tr-TR');

  /* Gömülü varlık: ağ yok, yükleme titremesi yok, hata yolu yok. */
  if (bundled !== undefined) {
    return (
      <View
        accessibilityRole="image"
        accessibilityLabel={altTr ?? placeholderLabelTr}
        style={[{ aspectRatio, borderRadius: finalRadius, overflow: 'hidden' }, style]}
      >
        <Image source={bundled} resizeMode="cover" style={StyleSheet.absoluteFill} />
      </View>
    );
  }

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={altTr ?? placeholderLabelTr}
      style={[{ aspectRatio, borderRadius: finalRadius, overflow: 'hidden' }, style]}
    >
      {source !== undefined ? (
        <Image
          source={{ uri: source }}
          resizeMode="cover"
          style={StyleSheet.absoluteFill}
          onLoad={() => {
            setLoadedUris((previous) => new Set(previous).add(source));
          }}
          onError={() => {
            setFailedUris((previous) => new Set(previous).add(source));
          }}
        />
      ) : null}

      {phase === 'loading' ? (
        <View style={StyleSheet.absoluteFill}>
          <Skeleton width="100%" aspectRatio={aspectRatio} rounded style={{ borderRadius: 0 }} />
        </View>
      ) : null}

      {phase === 'failed' ? (
        <View
          style={[
            StyleSheet.absoluteFill,
            styles.fallback,
            { backgroundColor: colors.surfaceMuted },
          ]}
        >
          <View
            style={[
              styles.monogramCircle,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Text variant="display" tone="muted">
              {monogram}
            </Text>
          </View>
          {placeholderNoteTr !== undefined ? (
            <Text variant="caption" tone="muted" center style={styles.note}>
              {placeholderNoteTr}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12 },
  monogramCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: { maxWidth: 180 },
});
