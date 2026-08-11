import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Body, Caption, PrimaryButton, Screen, Title } from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../constants/theme';
import { SecondaryButton } from '../../../features/onboarding/components';
import { useVoiceFlow } from '../../../features/voice/flow';

/**
 * V09 — Hazır. Celebration + the upsell hook the SPEC names:
 * "Bu sesle yeniden seslendirelim mi?" → the library, where narration lives
 * (audio render itself is behind KAPI 2 and belongs to the player flow / F2).
 */
export default function Hazir(): ReactNode {
  const router = useRouter();
  const flow = useVoiceFlow();
  const name = flow.state.displayName === '' ? 'Sesiniz' : `${flow.state.displayName} sesi`;

  return (
    <Screen>
      <View style={styles.hero}>
        <Text style={styles.heroEmoji}>🎉</Text>
        <Title>{`${name} hazır!`}</Title>
        <Body>
          Bundan sonra her masalı kendi sesinizle seslendirebilirsiniz. Çocuğunuz sayfaları
          sizin sesinizden dinleyecek — siz yanında olmasanız bile.
        </Body>
      </View>

      <View style={styles.suggestBox}>
        <Text style={styles.suggestTitle}>Bu sesle yeniden seslendirelim mi?</Text>
        <Text style={styles.suggestText}>
          Kitaplığınızdaki hikayeleri açın, “Sesler” bölümünden kendi sesinizi seçin. Hazır
          sesle üretilmiş sayfalar yeniden seslendirilir.
        </Text>
      </View>

      <PrimaryButton
        label="Kitaplığa git"
        onPress={() => {
          flow.reset();
          router.replace('/(app)/kitaplik');
        }}
      />
      <SecondaryButton
        label="Sesler ekranına dön"
        onPress={() => {
          flow.reset();
          router.replace('/(app)/ses');
        }}
      />
      <Caption>
        Sesinizi silmek isterseniz: Ayarlar → Sesim → Sil. Sağlayıcıdaki kopya da dahil her şey
        silinir; hikayeleriniz sistem sesine döner.
      </Caption>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'flex-start', gap: spacing.sm, paddingTop: spacing.md },
  heroEmoji: { fontSize: 44 },
  suggestBox: {
    backgroundColor: '#FFF7E8',
    borderColor: '#F2C879',
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 4,
  },
  suggestTitle: { ...typography.heading, fontSize: 19, color: colors.ink },
  suggestText: { ...typography.caption, fontSize: 14, lineHeight: 20, color: colors.ink },
});
