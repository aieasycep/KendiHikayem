import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Body, Caption, Card, PrimaryButton, Screen, Title } from '../../components/ui';
import { colors, radius, spacing, typography } from '../../constants/theme';
import { SecondaryButton, TrustStrip } from '../../features/onboarding/components';

/**
 * S01 — Landing. One promise, one CTA, zero sign-up friction (SPEC §11.2, 0:00).
 *
 * The "demo" block is textual on purpose: mock media URLs are intentionally dead
 * (packages/mock ships no binaries), so instead of a broken player the parent
 * reads the first page of a real sample story — which is the actual product.
 */
export default function Landing(): ReactNode {
  const router = useRouter();

  return (
    <Screen>
      <View style={styles.hero}>
        <Text style={styles.heroEmoji}>🌙📖</Text>
        <Title>Çocuğunuza özel bir masal, sizin sesinizle</Title>
        <Body>
          Adını, kahramanını ve temasını siz seçin; biz yazalım, resimleyelim ve isterseniz
          kendi sesinizle seslendirelim. Basılı kitap olarak kapınıza da gelsin.
        </Body>
      </View>

      <Card>
        <Caption>ÖRNEK — 6 yaşındaki Elif için üretildi</Caption>
        <Text style={styles.sampleTitle}>Elif ve Tavan Arasındaki Işık</Text>
        <Text style={styles.sampleText}>
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
  hero: { gap: spacing.sm, paddingTop: spacing.md },
  heroEmoji: { fontSize: 40 },
  sampleTitle: { ...typography.heading, color: colors.primary },
  sampleText: {
    ...typography.body,
    color: colors.ink,
    fontStyle: 'italic',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
});
