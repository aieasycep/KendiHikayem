import { Stack } from 'expo-router';
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
export default function RootLayout(): ReactNode {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await ensureMockServer();
      await ensureGuestSession();
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
  bootText: { ...typography.body, color: colors.inkMuted },
});
