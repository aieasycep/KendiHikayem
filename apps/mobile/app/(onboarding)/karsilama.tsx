import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text, useTheme } from '@kendihikayem/ui';

import { Caption, Card, PrimaryButton, Screen } from '../../components/ui';
import { SecondaryButton, TrustStrip } from '../../features/onboarding/components';
import { ReadingIllustration } from '../../features/onboarding/illustrations';

/**
 * S01 — Landing (Figma Onboarding değer önerisi ekranı). One promise, one CTA,
 * zero sign-up friction (SPEC §11.2, 0:00).
 *
 * The "demo" block is textual on purpose: mock media URLs are intentionally dead
 * (packages/mock ships no binaries), so instead of a broken player the parent
 * reads the first page of a real sample story — which is the actual product.
 */
export default function Landing(): ReactNode {
  const router = useRouter();
  const { colors, radius, spacing } = useTheme();

  return (
    <Screen>
      {/* Lavanta ışık halkası (Figma üst köşe vurgusu) */}
      <View pointerEvents="none" style={styles.accent} />

      <View style={styles.hero}>
        <View style={styles.illustration}>
          <ReadingIllustration width={210} />
        </View>
        <Text variant="display" accessibilityRole="header" style={styles.headline}>
          Her gece ona özel{'\n'}bir hikâye.
        </Text>
        <Text variant="body" tone="muted">
          Adını, kahramanını ve temasını siz seçin; biz yazalım, resimleyelim ve isterseniz
          kendi sesinizle seslendirelim. Basılı kitap olarak kapınıza da gelsin.
        </Text>
      </View>

      <Card>
        <Caption>ÖRNEK — 6 yaşındaki Elif için üretildi</Caption>
        <Text variant="heading" style={{ color: colors.primary }}>
          Elif ve Tavan Arasındaki Işık
        </Text>
        <Text
          variant="body"
          style={[
            styles.sampleText,
            { backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, padding: spacing.md },
          ]}
        >
          “Elif o akşam yatağına uzandığında, tavandan gelen tıkırtıyı yine duydu. Bu sefer
          korkmadı. Küçük el fenerini aldı ve merdivene doğru yürüdü…”
        </Text>
        <Caption>12 sayfa · suluboya çizim · Anne sesiyle seslendirilmiş</Caption>
      </Card>

      <PrimaryButton
        label="Ücretsiz hikaye oluştur"
        onPress={() => {
          router.push('/(onboarding)/kim-icin');
        }}
      />
      <SecondaryButton
        label="Zaten hesabım var"
        onPress={() => {
          router.push({ pathname: '/(onboarding)/giris', params: { donus: 'kitaplik' } });
        }}
      />

      <TrustStrip
        items={[
          'Kayıt olmadan başlarsınız; telefon numarası yalnızca hikaye oluştururken sorulur.',
          'Çocuğunuzun fotoğrafını hiçbir zaman istemiyoruz.',
          'İlk taslağı görmeden hiçbir ücret alınmaz.',
        ]}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  accent: {
    position: 'absolute',
    top: -90,
    right: -70,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: 'rgba(176,156,224,0.14)',
  },
  hero: { gap: 12, paddingTop: 8 },
  illustration: { alignItems: 'center' },
  headline: { letterSpacing: -0.4 },
  sampleText: { fontStyle: 'italic' },
});
