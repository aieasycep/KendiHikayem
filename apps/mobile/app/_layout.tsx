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
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';

import { ThemeProvider, fontFamilies, light } from '@kendihikayem/ui';

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
 * AÇILIŞ: JS tarafında markalı splash YOKTUR (kullanıcı geri bildirimiyle
 * kaldırıldı). Native splash (app.config.ts, krem zemin) layout mount olur
 * olmaz kapatılır; bootstrap'in sürdüğü kısacık aralıkta sade bir yükleniyor
 * göstergesi görünür, ardından tanıtım karuseli ya da ana sayfa gelir.
 *
 * FONTS (Fraunces + Nunito, bundled via @expo-google-fonts): loaded here and fed
 * to ThemeProvider as `fontsReady`. The app NEVER waits for fonts — screens
 * render with the system font and snap to the brand font the moment loading
 * finishes. Only the bootstrap gate (mock server + guest session) blocks, and
 * even that gate cannot block forever: failures surface as a warning strip and
 * the app renders anyway.
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

export default function RootLayout(): ReactNode {
  const [ready, setReady] = useState(false);
  const [bootWarning, setBootWarning] = useState<string | undefined>(undefined);
  // Tanıtım karuseli (Figma Onboarding) — yalnızca ilk açılışta gösterilir.
  const [tanitimGerekli, setTanitimGerekli] = useState(false);
  const [tanitimBitti, setTanitimBitti] = useState(false);

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
  // opens. If the gate never opens we want the user to see our own boot state
  // and us to learn the gate is the problem — a frozen native splash tells
  // nobody anything.
  useEffect(dismissSplash, []);

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

  // Akış: native splash → (bootstrap sürerken sade yükleniyor) → ilk açılışta
  // tanıtım karuseli → ana sayfa. Markalı JS splash kaldırıldı; asgari süre
  // gecikmesi de onunla gitti — bootstrap biter bitmez uygulama açılır.
  const tanitimAcik = tanitimGerekli && !tanitimBitti;

  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider fontsReady={fontsReady}>
            <WizardDraftProvider>
              <StatusBar style="dark" />
              {bootWarning === undefined ? null : (
                <View style={styles.warning}>
                  <Text style={styles.warningText}>
                    Demo verisi yüklenemedi: {bootWarning}
                  </Text>
                </View>
              )}
              {!ready ? (
                /* Sade geçiş durumu: krem zemin (native splash ile aynı) +
                 * küçük gösterge. Boş beyaz ekran da, tam ekran markalı
                 * splash de değil — bootstrap tipik olarak <1 sn sürer. */
                <View style={styles.boot} testID="acilis-yukleniyor">
                  <ActivityIndicator color={light.primary} size="large" />
                </View>
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
