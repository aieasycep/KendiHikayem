import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Text, palette } from '@kendihikayem/ui';

import { SecondaryButton } from '../../../features/onboarding/components';
import { useVoiceFlow } from '../../../features/voice/flow';
import { NightScreen } from '../../../features/wizard/NightFlow';

/** Kutlama noktaları — deterministik konumlar (Figma success ekranı konfetisi). */
const CONFETTI = [
  { color: palette.moonGold, top: '18%', left: '14%' },
  { color: palette.coral, top: '26%', left: '78%' },
  { color: palette.sage, top: '38%', left: '8%' },
  { color: palette.lavender, top: '14%', left: '52%' },
  { color: palette.peach, top: '32%', left: '88%' },
] as const;

/**
 * V09 — Hazır. Gece kutlama ekranı (Figma `VoiceStudio` success) + the upsell
 * hook the SPEC names: "Bu sesle yeniden seslendirelim mi?" → the library,
 * where narration lives (audio render itself is behind KAPI 2 / F2).
 */
export default function Hazir(): ReactNode {
  const router = useRouter();
  const flow = useVoiceFlow();
  const name = flow.state.displayName === '' ? 'Sesiniz' : `${flow.state.displayName} sesi`;

  return (
    <NightScreen scroll testID="ses-hazir">
      {CONFETTI.map((dot, i) => (
        <View
          key={i}
          accessibilityElementsHidden
          style={[styles.confetti, { backgroundColor: dot.color, top: dot.top, left: dot.left }]}
        />
      ))}

      <View style={styles.hero}>
        <View style={styles.celebrationCircle}>
          <Text style={styles.celebrationEmoji} accessibilityElementsHidden>
            🎉
          </Text>
        </View>
        <Text variant="title" center style={styles.title} accessibilityRole="header">
          {`${name} hazır!`}
        </Text>
        <Text variant="body" center style={styles.lead}>
          Bundan sonra her masalı kendi sesinizle seslendirebilirsiniz. Çocuğunuz sayfaları
          sizin sesinizden dinleyecek — siz yanında olmasanız bile.
        </Text>
      </View>

      <View style={styles.suggestBox}>
        <Text variant="heading" style={styles.suggestTitle}>
          Bu sesle yeniden seslendirelim mi?
        </Text>
        <Text variant="caption" style={styles.suggestText}>
          Kitaplığınızdaki hikayeleri açın, “Sesler” bölümünden kendi sesinizi seçin. Hazır
          sesle üretilmiş sayfalar yeniden seslendirilir.
        </Text>
      </View>

      <Button
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
      <Text variant="caption" center style={styles.footnote}>
        Sesinizi silmek isterseniz: Ayarlar → Sesim → Sil. Sağlayıcıdaki kopya da dahil her şey
        silinir; hikayeleriniz sistem sesine döner.
      </Text>
    </NightScreen>
  );
}

const styles = StyleSheet.create({
  confetti: { position: 'absolute', width: 10, height: 10, borderRadius: 5, opacity: 0.85 },

  hero: { alignItems: 'center', gap: 16, paddingTop: 40 },
  celebrationCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(141,184,154,0.2)',
    borderWidth: 2,
    borderColor: 'rgba(141,184,154,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  celebrationEmoji: { fontSize: 44 },
  title: { color: '#FFFFFF' },
  lead: { color: 'rgba(232,224,212,0.9)' },

  suggestBox: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderRadius: 20,
    padding: 20,
    gap: 6,
    marginTop: 8,
  },
  suggestTitle: { color: '#FFFFFF', fontSize: 19, lineHeight: 25 },
  suggestText: { color: 'rgba(232,224,212,0.85)', fontSize: 14, lineHeight: 20 },

  footnote: { color: 'rgba(255,255,255,0.45)' },
});
