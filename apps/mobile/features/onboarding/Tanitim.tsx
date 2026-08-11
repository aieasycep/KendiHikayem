/**
 * Tanıtım karuseli — Figma `Onboarding.tsx` BİREBİR taşıması.
 *
 * 4 slayt: (1) her gece ona özel hikâye, (2) onun adı onun hikâyesi,
 * (3) sesin okusun, (4) gerçek kitaba dönüştür. Her slaytta illüstrasyon,
 * başlık + alt metin, nokta göstergesi ve "Devam" (son slaytta "Başlayalım")
 * düğmesi; son slayt dışında sağ üstte "Geç". Noktalara dokunarak slayta
 * atlanabilir — tasarımdaki onClick davranışı.
 *
 * Akış: Splash → Tanıtım → Ana Sayfa (tasarımdaki App.tsx sırası). Karusel ilk
 * açılışta gösterilir; "Başlayalım" ya da "Geç" sonrasında bir daha çıkmaz
 * (SecureStore bayrağı). Tasarım statik prototip olduğundan kalıcılık kararı
 * üründe böyle somutlanır.
 */

import * as SecureStore from 'expo-secure-store';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

import { Button, Text, fontFamilies, useTheme } from '@kendihikayem/ui';

import {
  BookIllustration,
  ReadingIllustration,
  StoryCardIllustration,
  VoiceIllustration,
} from './illustrations';

/* ── İlk açılış bayrağı ──────────────────────────────────────── */

const KEY_TANITIM = 'kh.tanitimGoruldu';

export async function tanitimGorulduMu(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(KEY_TANITIM)) === '1';
  } catch {
    return false;
  }
}

export async function tanitimGorulduIsaretle(): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEY_TANITIM, '1');
  } catch {
    /* SecureStore yoksa (test) bellek içi akış yeterlidir. */
  }
}

/* ── Slayt içeriği — Figma metinleriyle birebir ──────────────── */

interface Slide {
  headline: string;
  sub: string;
  illustration: (width: number) => ReactNode;
  cta: string;
}

const SLIDES: Slide[] = [
  {
    headline: 'Her gece ona özel\nbir hikâye.',
    sub: 'Yapay zekâ ile çocuğuna özel hikâyeler oluştur, kendi sesinle anlat.',
    illustration: (width) => <ReadingIllustration width={width} />,
    cta: 'Devam',
  },
  {
    headline: 'Onun adı,\nonun hikâyesi.',
    sub: 'Çocuğunun adı hikâyenin kahramanı olur. Her gece tamamen ona özel.',
    illustration: (width) => <StoryCardIllustration width={width} />,
    cta: 'Devam',
  },
  {
    headline: 'Sen okumasan da\nsesin okusun.',
    sub: 'Anne ya da babanın sesini bir kere kaydet — her masalda sesin onunla olsun.',
    illustration: (width) => <VoiceIllustration width={width} />,
    cta: 'Devam',
  },
  {
    headline: 'Masalı gerçek bir\nkitaba dönüştür.',
    sub: 'AI illüstrasyonlarla oluşturduğun hikâyeyi fiziksel bir çocuk kitabına dönüştür.',
    illustration: (width) => <BookIllustration width={width} />,
    cta: 'Başlayalım',
  },
];

/* ── Nokta göstergesi (aktif 24px, diğerleri 8px; 0.3s geçiş) ── */

function Dot({ active, onPress }: { active: boolean; onPress: () => void }): ReactNode {
  const { colors } = useTheme();
  const anim = useRef(new Animated.Value(active ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: active ? 1 : 0,
      duration: 300,
      useNativeDriver: false, // genişlik + renk animasyonu
    }).start();
  }, [active, anim]);

  return (
    <Pressable accessibilityRole="button" hitSlop={8} onPress={onPress}>
      <Animated.View
        style={[
          styles.dot,
          {
            width: anim.interpolate({ inputRange: [0, 1], outputRange: [8, 24] }),
            backgroundColor: anim.interpolate({
              inputRange: [0, 1],
              outputRange: [colors.border, colors.primary],
            }),
          },
        ]}
      />
    </Pressable>
  );
}

/* ── Karusel ─────────────────────────────────────────────────── */

export function Tanitim({ onDone }: { onDone: () => void }): ReactNode {
  const { colors, fontsReady } = useTheme();
  const [current, setCurrent] = useState(0);
  const slide = SLIDES[current] ?? SLIDES[0]!;
  const isLast = current === SLIDES.length - 1;

  // Tasarımdaki fadeIn (illüstrasyon, 0.4s) + fadeUp (metin, 0.5s) — slayt
  // değişince yeniden oynar.
  const illusOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textShift = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    illusOpacity.setValue(0);
    textOpacity.setValue(0);
    textShift.setValue(16);
    Animated.parallel([
      Animated.timing(illusOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(textOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(textShift, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
  }, [current, illusOpacity, textOpacity, textShift]);

  const next = (): void => {
    if (current < SLIDES.length - 1) setCurrent(current + 1);
    else onDone();
  };

  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={[styles.screen, { backgroundColor: colors.background }]}
      testID="tanitim"
    >
      {/* Üst köşe ışık halkası — radial-gradient(rgba(176,156,224,0.2) → şeffaf %70) */}
      <View pointerEvents="none" style={styles.accent}>
        <Svg width={240} height={240}>
          <Defs>
            <RadialGradient id="tanitimAccent" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="rgb(176,156,224)" stopOpacity={0.2} />
              <Stop offset="0.7" stopColor="rgb(176,156,224)" stopOpacity={0} />
              <Stop offset="1" stopColor="rgb(176,156,224)" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={120} cy={120} r={120} fill="url(#tanitimAccent)" />
        </Svg>
      </View>

      {/* Geç — son slaytta gizlenir, satır yüksekliği korunur */}
      <View style={styles.skipRow}>
        {!isLast && (
          <Pressable accessibilityRole="button" hitSlop={8} onPress={onDone}>
            <Text
              variant="caption"
              tone="muted"
              style={[
                styles.skipText,
                fontsReady
                  ? { fontFamily: fontFamilies.bodySemiBold }
                  : styles.skipTextFallback,
              ]}
            >
              Geç
            </Text>
          </Pressable>
        )}
      </View>

      {/* İllüstrasyon */}
      <Animated.View style={[styles.illustration, { opacity: illusOpacity }]}>
        {slide.illustration(220)}
      </Animated.View>

      {/* Metin */}
      <Animated.View
        style={[
          styles.content,
          { opacity: textOpacity, transform: [{ translateY: textShift }] },
        ]}
      >
        <Text variant="display" accessibilityRole="header" style={styles.headline}>
          {slide.headline}
        </Text>
        <Text
          variant="body"
          tone="muted"
          style={[
            styles.sub,
            fontsReady ? { fontFamily: fontFamilies.bodyMedium } : styles.subFallback,
          ]}
        >
          {slide.sub}
        </Text>
      </Animated.View>

      {/* Alt blok: noktalar + CTA */}
      <View style={styles.bottom}>
        <View style={styles.dotRow}>
          {SLIDES.map((_, i) => (
            <Dot
              key={i}
              active={i === current}
              onPress={() => {
                setCurrent(i);
              }}
            />
          ))}
        </View>
        <Button label={slide.cta} onPress={next} testID="tanitim-devam" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, overflow: 'hidden' },
  accent: { position: 'absolute', top: -80, right: -60, width: 240, height: 240 },

  /* Figma: padding "56px 24px 0" — 56'nın durum çubuğu kısmını SafeArea verir. */
  skipRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingTop: 12,
    paddingHorizontal: 24,
    minHeight: 47, // 12 + buton (8+19+8) — "Geç" gizlenince zıplama olmaz
  },
  skipText: { fontSize: 14, lineHeight: 19, paddingVertical: 8 },
  skipTextFallback: { fontWeight: '600' },

  illustration: { alignItems: 'center', marginTop: 24 },

  content: { paddingTop: 32, paddingHorizontal: 32 },
  /* Figma: Fraunces 600 · 34 · lineHeight 1.2 · letterSpacing -0.01em */
  headline: { fontSize: 34, lineHeight: 41, letterSpacing: -0.34, marginBottom: 16 },
  /* Figma: Nunito 500 · 16 · lineHeight 1.6 */
  sub: { fontSize: 16, lineHeight: 26 },
  subFallback: { fontWeight: '500' },

  bottom: {
    position: 'absolute',
    bottom: 48,
    left: 0,
    right: 0,
    paddingHorizontal: 32,
    alignItems: 'center',
    gap: 20,
  },
  dotRow: { flexDirection: 'row', gap: 8 },
  dot: { height: 8, borderRadius: 4 },
});
