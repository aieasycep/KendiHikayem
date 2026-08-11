import { Stack } from 'expo-router';
import type { ReactNode } from 'react';

import { lightTheme } from '@kendihikayem/ui';

/**
 * hikaye/[id] — hikaye yığını (F2).
 *
 * Sekme kaydındaki rota adı ("hikaye/[id]") DEĞİŞMEDİ: dizinleşen rota, üst
 * navigatörde aynı adla tek giriş olarak görünür; (app)/_layout.tsx'e (F1)
 * dokunmak gerekmez.
 *
 *   index  → hikaye detayı (P02/P03 düzenleme, Kapı 2 onayı, çevrimdışı indirme)
 *   oynat  → P01 oynatıcı (tam ekran, gece teması)
 *   sesler → P04 ses yönetimi
 *   paylas → P05 dışa aktarma (PDF/MP4/QR)
 */
export default function HikayeLayout(): ReactNode {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: lightTheme.colors.background },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="oynat" options={{ animation: 'fade' }} />
      <Stack.Screen name="sesler" />
      <Stack.Screen name="paylas" />
    </Stack>
  );
}
