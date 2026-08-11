import {
  Fraunces_600SemiBold,
} from '@expo-google-fonts/fraunces';
import {
  Nunito_400Regular,
  Nunito_500Medium,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
} from '@expo-google-fonts/nunito';
import { Stack } from 'expo-router';
import type { ErrorBoundaryProps } from 'expo-router';
import { useFonts } from 'expo-font';
import { LinearGradient } from 'expo-linear-gradient';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
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
 * Branded splash (Figma Splash ekranı): gece gökyüzü degradesi, yıldızlar, ay,
 * açık kitap logosu ve marka adı. Native splash aynı gece rengiyle açıldığı için
 * geçiş kesintisiz görünür. Bu ekran yalnızca bootstrap sürerken durur ve
 * kendiliğinden kapanır — dokunma beklemez, fontlara takılmaz.
 */
function BrandSplash({ fontsReady }: { fontsReady: boolean }): ReactNode {
  const float = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const floatLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(float, { toValue: -6, duration: 1500, useNativeDriver: true }),
        Animated.timing(float, { toValue: 0, duration: 1500, useNativeDriver: true }),
      ]),
    );
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.7, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.35, duration: 1000, useNativeDriver: true }),
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

      <Animated.View style={[styles.logoBox, { transform: [{ translateY: float }] }]}>
        <StorybookLogo size={52} />
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
        Masallar hazırlanıyor…
      </Animated.Text>
    </LinearGradient>
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
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const showApp = ready && minSplashDone;

  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider fontsReady={fontsReady}>
            <WizardDraftProvider>
              <StatusBar style={showApp ? 'dark' : 'light'} />
              {bootWarning === undefined ? null : (
                <View style={styles.warning}>
                  <Text style={styles.warningText}>
                    Demo verisi yüklenemedi: {bootWarning}
                  </Text>
                </View>
              )}
              {showApp ? (
                <Stack
                  screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: light.background },
                  }}
                >
                  <Stack.Screen name="(onboarding)" />
                  <Stack.Screen name="(app)" />
                </Stack>
              ) : (
                <BrandSplash fontsReady={fontsReady} />
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
    backgroundColor: 'rgba(176, 156, 224, 0.24)',
    borderWidth: 1,
    borderColor: 'rgba(176, 156, 224, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  brandName: {
    fontSize: 44,
    lineHeight: 50,
    fontWeight: '600',
    letterSpacing: -0.8,
    color: '#FFFFFF',
  },
  brandTagline: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 19,
    letterSpacing: 1.2,
    color: 'rgba(176, 156, 224, 0.9)',
  },
  splashHint: {
    position: 'absolute',
    bottom: 60,
    fontSize: 13,
    letterSpacing: 0.5,
    color: 'rgba(255, 255, 255, 0.6)',
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
