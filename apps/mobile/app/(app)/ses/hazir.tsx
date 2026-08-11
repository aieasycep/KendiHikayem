import { useAudioPlayer } from 'expo-audio';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { possessive } from '@kendihikayem/shared';
import { Button, PlayIcon, Text, palette } from '@kendihikayem/ui';

import { useVoiceProfiles } from '../../../features/onboarding/catalogHooks';
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
 * V09 — Hazır (Figma `VoiceStudio` success görünümü BİREBİR): konfeti, 🎉
 * dairesi, "{Ad}'in sesi hazır!", örnek dinleme satırı, "Bu Sesi Kullan" +
 * "Yeniden Oluştur".
 */
export default function Hazir(): ReactNode {
  const router = useRouter();
  const flow = useVoiceFlow();
  const profiles = useVoiceProfiles();

  const name = flow.state.displayName;
  const profile = profiles.data?.items.find(
    (item) => (item.id as string) === flow.state.profileId,
  );
  const previewUrl = profile?.preview?.url;

  const source = useMemo(() => (previewUrl !== undefined ? { uri: previewUrl } : null), [previewUrl]);
  const player = useAudioPlayer(source);

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
          {name === '' ? 'Sesin hazır!' : `${possessive(name)} sesi hazır!`}
        </Text>
        <Text variant="body" center style={styles.lead}>
          Sesin hazır. Artık masalları sen anlatabilirsin.
        </Text>
      </View>

      {/* ── Figma örnek dinleme satırı ──────────────────────── */}
      <View style={styles.sampleRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ses örneği dinle"
          disabled={previewUrl === undefined}
          onPress={() => {
            try {
              player.seekTo(0).catch(() => undefined);
              player.play();
            } catch {
              /* örnek dosya bu ortamda paketli olmayabilir; sessizce geç */
            }
          }}
          style={({ pressed }) => [
            styles.samplePlay,
            { opacity: previewUrl === undefined ? 0.4 : pressed ? 0.8 : 1 },
          ]}
        >
          <PlayIcon size={16} color="#FFFFFF" />
        </Pressable>
        <View style={styles.sampleBody}>
          <Text style={styles.sampleLabel}>Ses örneği dinle</Text>
          <View style={styles.sampleTrack}>
            <View style={styles.sampleFill} />
          </View>
        </View>
      </View>

      <View style={styles.buttons}>
        <Button
          label="Bu Sesi Kullan"
          onPress={() => {
            flow.reset();
            router.replace('/(app)/kitaplik');
          }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Yeniden oluştur"
          onPress={() => {
            flow.reset();
            router.replace('/(app)/ses');
          }}
          style={({ pressed }) => [styles.ghostButton, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.ghostLabel}>Yeniden Oluştur</Text>
        </Pressable>
      </View>
    </NightScreen>
  );
}

const styles = StyleSheet.create({
  confetti: { position: 'absolute', width: 10, height: 10, borderRadius: 5, opacity: 0.85 },

  hero: { alignItems: 'center', gap: 16, paddingTop: 40 },
  /* Figma: 100'lük adaçayı dairesi, 2 px kenarlık. */
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
  /* Figma: Fraunces 28/700 beyaz. */
  title: { color: '#FFFFFF', fontSize: 28, lineHeight: 36 },
  lead: { color: 'rgba(176,156,224,0.8)', fontSize: 15, lineHeight: 24 },

  /* Figma: 16/20 dolgu · 16 yarıçap · rgba beyaz .08 zemin · 1 px rgba .12. */
  sampleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  samplePlay: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#7C5CBF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sampleBody: { flex: 1, gap: 6 },
  sampleLabel: { color: '#FFFFFF', fontSize: 13, lineHeight: 17, fontWeight: '600' },
  sampleTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
  },
  sampleFill: {
    width: '35%',
    height: '100%',
    borderRadius: 2,
    backgroundColor: palette.lavender,
  },

  buttons: { gap: 10, marginTop: 8 },
  /* Figma "Yeniden Oluştur": rgba beyaz .08 · 1 px rgba .15 · 20 yarıçap. */
  ghostButton: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 20,
    padding: 16,
    alignItems: 'center',
  },
  ghostLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 15, lineHeight: 20, fontWeight: '700' },
});
