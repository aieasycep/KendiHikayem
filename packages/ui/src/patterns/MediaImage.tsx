/**
 * MediaImage — ağdan/diskteki görseli GÜVENLE gösteren bileşen.
 *
 * ⚠️ Mock fixture görselleri KASITLI olarak 404 döner (packages/mock/media.ts):
 * ekran, görsel yokken de güzel kalmak ZORUNDADIR. Gerçek üretimde de bir
 * sayfanın görseli `manual_review` kuyruğuna düşebilir ya da imzalı URL süresi
 * dolabilir.
 *
 * Davranış:
 *   1. `localUri` verilmişse önce o denenir (çevrimdışı öncelik).
 *   2. Yüklenene kadar yumuşak nabızlı yer tutucu.
 *   3. Hata olursa sıcak renkli, harf monogramlı yer tutucu + isteğe bağlı not.
 *      Kırık görsel simgesi ASLA gösterilmez.
 */

import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useEffect, useState, type ReactElement } from 'react';

import { useTheme } from '../theme';
import { Skeleton } from '../primitives/Skeleton';
import { Text } from '../primitives/Text';

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

type Phase = 'loading' | 'ready' | 'failed';

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
  const [phase, setPhase] = useState<Phase>('loading');
  const [source, setSource] = useState<string | undefined>(localUri ?? uri);

  useEffect(() => {
    setSource(localUri ?? uri);
    setPhase(localUri !== undefined || uri !== undefined ? 'loading' : 'failed');
  }, [uri, localUri]);

  const finalRadius = borderRadius ?? radius.cover;
  const monogram = (placeholderLabelTr ?? '·').trim().charAt(0).toLocaleUpperCase('tr-TR');

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={altTr ?? placeholderLabelTr}
      style={[{ aspectRatio, borderRadius: finalRadius, overflow: 'hidden' }, style]}
    >
      {source !== undefined && phase !== 'failed' ? (
        <Image
          source={{ uri: source }}
          resizeMode="cover"
          style={StyleSheet.absoluteFill}
          onLoad={() => {
            setPhase('ready');
          }}
          onError={() => {
            // Yerel kopya bozuksa uzak URL'e düş; o da düşerse yer tutucu.
            if (source === localUri && uri !== undefined && uri !== localUri) {
              setSource(uri);
              setPhase('loading');
            } else {
              setPhase('failed');
            }
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
