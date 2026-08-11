import { Stack } from 'expo-router';
import type { ReactNode } from 'react';

import { lightTheme } from '@kendihikayem/ui';

/**
 * bastir/[id] — baskı yığını (F2). Üst navigatördeki rota adı "bastir/[id]"
 * olarak KORUNDU; (app)/_layout.tsx'e dokunulmadı.
 *
 *   index    → B01 format + B03 ithaf + B04 QR ayarı
 *   onizleme → B02 spread önizleme + preflight uyarıları
 *   siparis  → B05 adet/adres + B06 özet + CAYMA HAKKI + ödeme
 *   takip    → B08 sipariş takibi
 */
export default function BastirLayout(): ReactNode {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: lightTheme.colors.background },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="onizleme" />
      <Stack.Screen name="siparis" />
      <Stack.Screen name="takip" />
    </Stack>
  );
}
