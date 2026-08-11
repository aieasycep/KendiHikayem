// Alt-yol importları BİLEREK: paket kökü TÜM kesimleri require eder ve APK'ya
// 30+ gereksiz TTF gömülür; alt yol yalnızca kullanılan kesimi paketler.
import { Fraunces_600SemiBold } from '@expo-google-fonts/fraunces/600SemiBold';
import { Nunito_400Regular } from '@expo-google-fonts/nunito/400Regular';
import { Nunito_500Medium } from '@expo-google-fonts/nunito/500Medium';
import { Nunito_600SemiBold } from '@expo-google-fonts/nunito/600SemiBold';
import { Nunito_700Bold } from '@expo-google-fonts/nunito/700Bold';
import { Nunito_800ExtraBold } from '@expo-google-fonts/nunito/800ExtraBold';
import { Stack } from 'expo-router';
import type { ErrorBoundaryProps } from 'expo-router';
import { useFonts } from 'expo-font';
import { LinearGradient } from 'expo-linear-gradient';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';

import {
  BRAND_NAME,
  BRAND_TAGLINE,
  StorybookLogo,
  ThemeProvider,
  fontFamilies,
  light,
  palette,
} from '@kendihikayem/ui';

import { WizardDraftProvider } from '../features/onboarding/draft';
import {
  Tanitim,
  tanitimGorulduIsaretle,
  tanitimGorulduMu,
} from '../features/onboarding/Tanitim';
import { ensureMockServer } from '../lib/mock';
import { queryClient } from '../lib/queryClient';
import { ensureGuestSession } from '../lib/session';

/**
 * Root navigator + app bootstrap.
 *
 * Rendering is gated on `ensureMockServer()`: in mock mode msw/native must be
 * listening BEFORE the first query fires, otherwise the request escapes to the
 * real network and the offline APK breaks. The guest session is opened in the
 * same gate so every screen can assume a token exists.
 *
 * FONTS (Fraunces + Nunito, bundled via @expo-google-fonts): loaded here and fed
 * to ThemeProvider as `fontsReady`. The app NEVER waits for fonts — screens
 * render with the system font and snap to the brand font the moment loading
 * finishes. Only the bootstrap gate (mock server + guest session) blocks, and
 * while it does the branded night-sky splash below is shown instead of a spinner.
 */

/**
 * Hides the native splash screen, tolerating "already hidden".
 *
 * Nothing else in the app hides it, so anything that stops the first screen from
 * rendering leaves the splash on screen forever — the app looks frozen and says
 * nothing. Every entry point below calls this, so the worst case is our own boot
 * screen (or the error boundary), never an unexplained splash.
 */
function dismissSplash(): void {
  void SplashScreen.hideAsync().catch(() => undefined);
}

/** Deterministic star field — same layout every launch, no Math.random in render. */
const STARS = Array.from({ length: 28 }, (_, i) => ({
  size: i % 3 === 0 ? 3 : 2,
  opacity: 0.4 + (i % 5) * 0.1,
  top: `${(i * 37 + 7) % 100}%` as const,
  left: `${(i * 53 + 11) % 100}%` as const,
}));

/**
 * Branded splash — Figma `Splash.tsx` birebir: gece gökyüzü degradesi,
 * yıldızlar, ay, degrade zeminli açık kitap logosu, marka adı ve altta
 * "Başlamak için dokun" ipucu. Native splash aynı gece rengiyle açıldığı için
 * geçiş kesintisiz görünür. Tasarımdaki gibi ekranın tamamı dokunulabilirdir;
 * dokunuş bootstrap bitmeden gelirse kaydedilir ve hazır olunca akış ilerler.
 */
function BrandSplash({
  fontsReady,
  onPress,
}: {
  fontsReady: boolean;
  onPress: () => void;
}): ReactNode {
  const [float] = useState(() => new Animated.Value(0));
  const [pulse] = useState(() => new Animated.Value(1));

  useEffect(() => {
    const floatLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(float, { toValue: -6, duration: 1500, useNativeDriver: true }),
        Animated.timing(float, { toValue: 0, duration: 1500, useNativeDriver: true }),
      ]),
    );
    // Figma pulse-soft: 2s içinde opaklık 1 ↔ 0.6
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.6, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ]),
    );
    floatLoop.start();
    pulseLoop.start();
    return () => {
      floatLoop.stop();
      pulseLoop.stop();
    };
  }, [float, pulse]);

  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Başlamak için dokun" onPress={onPress} style={styles.flex}>
      <LinearGradient
        colors={[palette.deepPlum, palette.royalPurple, palette.night950]}
        locations={[0, 0.4, 1]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={styles.splash}
      >
        {STARS.map((star, i) => (
          <View
            key={i}
            style={[
              styles.star,
              {
                width: star.size,
                height: star.size,
                opacity: star.opacity,
                top: star.top,
                left: star.left,
              },
            ]}
          />
        ))}

        {/* Ay */}
        <View style={styles.moon}>
          <View style={styles.moonInner} />
        </View>

        <Animated.View style={{ transform: [{ translateY: float }] }}>
          {/* Figma: linear-gradient(135deg, rgba(176,156,224,0.3), rgba(124,92,191,0.4)) */}
          <LinearGradient
            colors={['rgba(176, 156, 224, 0.3)', 'rgba(124, 92, 191, 0.4)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.logoBox}
          >
            <StorybookLogo size={52} />
          </LinearGradient>
        </Animated.View>

        <Text
          style={[styles.brandName, fontsReady && { fontFamily: fontFamilies.display }]}
          accessibilityRole="header"
        >
          {BRAND_NAME}
        </Text>
        <Text style={[styles.brandTagline, fontsReady && { fontFamily: fontFamilies.bodyMedium }]}>
          {BRAND_TAGLINE.toLocaleUpperCase('tr-TR')}
        </Text>

        <Animated.Text style={[styles.splashHint, { opacity: pulse }]}>
          Başlamak için dokun
        </Animated.Text>
      </LinearGradient>
    </Pressable>
  );
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps): ReactNode {
  useEffect(dismissSplash, []);
  return (
    <View style={styles.boot}>
      <Text style={styles.errorTitle}>Bir şeyler ters gitti</Text>
      <Text style={styles.bootText}>
        Uygulama açılırken beklenmeyen bir hata oluştu. Aşağıdaki mesaj sorunu bulmamıza yardım eder.
      </Text>
      <Text style={styles.errorDetail} selectable>
        {error.message}
      </Text>
      <Text style={styles.bootText} onPress={() => void retry()}>
        Tekrar dene
      </Text>
    </View>
  );
}

/** Marka splash'inin okunması için asgari gösterim süresi (font BEKLEMEZ). */
const MIN_SPLASH_MS = 900;

export default function RootLayout(): ReactNode {
  const [ready, setReady] = useState(false);
  const [minSplashDone, setMinSplashDone] = useState(false);
  const [bootWarning, setBootWarning] = useState<string | undefined>(undefined);
  // Tanıtım karuseli (Figma Onboarding) — ilk açılışta splash'ten sonra gösterilir.
  const [tanitimGerekli, setTanitimGerekli] = useState(false);
  const [tanitimBitti, setTanitimBitti] = useState(false);
  // Figma Splash dokunarak ilerler; erken dokunuş da kaydedilir.
  const [dokunuldu, setDokunuldu] = useState(false);

  // Fontlar paketten yüklenir (ağ yok). Yüklenene kadar ekranlar sistem
  // fontuyla akar; `fontsReady` temaya işlenince tüm metin markaya döner.
  const [fontsReady] = useFonts({
    [fontFamilies.display]: Fraunces_600SemiBold,
    [fontFamilies.body]: Nunito_400Regular,
    [fontFamilies.bodyMedium]: Nunito_500Medium,
    [fontFamilies.bodySemiBold]: Nunito_600SemiBold,
    [fontFamilies.bodyBold]: Nunito_700Bold,
    [fontFamilies.bodyExtraBold]: Nunito_800ExtraBold,
  });

  // Hide the splash as soon as this layout mounts, not when the bootstrap gate
  // opens. If the gate never opens we want the user to see the branded splash
  // and us to learn the gate is the problem — a frozen native splash tells
  // nobody anything.
  useEffect(dismissSplash, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setMinSplashDone(true);
    }, MIN_SPLASH_MS);
    return () => {
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Bootstrap must never be able to blank the app. If the mock server or the
      // guest session fails, the screens' own error states are a far better
      // outcome than a gate that never opens — so we surface the reason and
      // render anyway.
      try {
        await ensureMockServer();
        await ensureGuestSession();
      } catch (bootError) {
        if (!cancelled) {
          setBootWarning(bootError instanceof Error ? bootError.message : String(bootError));
        }
      }
      const goruldu = await tanitimGorulduMu();
      if (!cancelled) {
        setTanitimGerekli(!goruldu);
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Tasarım akışı (Figma App.tsx): Splash → Onboarding karuseli → Ana Sayfa.
  // İlk açılışta splash tasarımdaki gibi dokunuşla ilerler; karusel daha önce
  // görüldüyse splash bootstrap bitince kendiliğinden kapanır.
  const tanitimAcik = tanitimGerekli && !tanitimBitti;
  const splashAcik = !ready || !minSplashDone || (tanitimAcik && !dokunuldu);

  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider fontsReady={fontsReady}>
            <WizardDraftProvider>
              <StatusBar style={splashAcik ? 'light' : 'dark'} />
              {bootWarning === undefined ? null : (
                <View style={styles.warning}>
                  <Text style={styles.warningText}>
                    Demo verisi yüklenemedi: {bootWarning}
                  </Text>
                </View>
              )}
              {splashAcik ? (
                <BrandSplash
                  fontsReady={fontsReady}
                  onPress={() => {
                    setDokunuldu(true);
                  }}
                />
              ) : tanitimAcik ? (
                <Tanitim
                  onDone={() => {
                    void tanitimGorulduIsaretle();
                    setTanitimBitti(true);
                  }}
                />
              ) : (
                <Stack
                  screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: light.background },
                  }}
                >
                  <Stack.Screen name="(onboarding)" />
                  <Stack.Screen name="(app)" />
                </Stack>
              )}
            </WizardDraftProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },

  /* ── Marka splash ─────────────────────────────────────────── */
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  star: {
    position: 'absolute',
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
  },
  moon: {
    position: 'absolute',
    top: 80,
    right: 60,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255, 220, 150, 0.15)',
    borderWidth: 2,
    borderColor: 'rgba(255, 220, 150, 0.3)',
  },
  moonInner: {
    position: 'absolute',
    top: 8,
    left: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 220, 150, 0.25)',
  },
  logoBox: {
    width: 96,
    height: 96,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(176, 156, 224, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  /* Figma: Fraunces 600 · 48 · letterSpacing -0.02em · lineHeight 1 */
  brandName: {
    fontSize: 48,
    lineHeight: 52,
    fontWeight: '600',
    letterSpacing: -0.96,
    color: '#FFFFFF',
  },
  /* Figma: Nunito 500 · 14 · letterSpacing 0.08em · büyük harf */
  brandTagline: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 19,
    letterSpacing: 1.12,
    color: 'rgba(176, 156, 224, 0.9)',
  },
  /* Figma: 13 · letterSpacing 0.04em · rgba(255,255,255,0.35) · pulse-soft */
  splashHint: {
    position: 'absolute',
    bottom: 60,
    alignSelf: 'center',
    fontSize: 13,
    letterSpacing: 0.52,
    color: 'rgba(255, 255, 255, 0.35)',
  },

  /* ── Boot / hata ──────────────────────────────────────────── */
  boot: {
    flex: 1,
    backgroundColor: light.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 20,
  },
  bootText: { fontSize: 18, lineHeight: 27, color: light.inkMuted, textAlign: 'center' },
  errorTitle: { fontSize: 22, lineHeight: 28, fontWeight: '700', color: light.ink },
  errorDetail: {
    fontSize: 16,
    lineHeight: 22,
    color: light.ink,
    paddingHorizontal: 20,
    textAlign: 'center',
  },
  warning: {
    backgroundColor: light.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  warningText: { fontSize: 13, lineHeight: 18, color: light.inkOnPrimary },
});
