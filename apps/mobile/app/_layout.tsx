import { Stack } from 'expo-router';
import type { ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';

import { colors, typography } from '../constants/theme';
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
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps): ReactNode {
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

  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <WizardDraftProvider>
            <StatusBar style="dark" />
            {bootWarning === undefined ? null : (
              <View style={styles.warning}>
                <Text style={styles.warningText}>
                  Demo verisi yüklenemedi: {bootWarning}
                </Text>
              </View>
            )}
            {ready ? (
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: colors.background },
                }}
              >
                <Stack.Screen name="(onboarding)" />
                <Stack.Screen name="(app)" />
              </Stack>
            ) : (
              <View style={styles.boot}>
                <ActivityIndicator color={colors.primary} size="large" />
                <Text style={styles.bootText}>KendiHikayem hazırlanıyor…</Text>
              </View>
            )}
          </WizardDraftProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  boot: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  bootText: { ...typography.body, color: colors.inkMuted, textAlign: 'center' },
  errorTitle: { ...typography.body, fontSize: 22, fontWeight: '700', color: colors.ink },
  errorDetail: {
    ...typography.body,
    color: colors.ink,
    paddingHorizontal: 20,
    textAlign: 'center',
  },
  warning: {
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  warningText: { ...typography.body, fontSize: 13, color: colors.background },
});
