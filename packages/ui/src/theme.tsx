/**
 * theme.tsx — tema sağlayıcısı.
 *
 * İki tema vardır: `light` (gündüz — ana sayfa, kitaplık, ayarlar, baskı) ve
 * `dark` (gece — oynatıcı her zaman gece temasındadır, çünkü kullanım anı yatma
 * saatidir). Sağlayıcı yoksa bileşenler gündüz temasıyla çalışır; yani F1/F3
 * ekranları hiçbir kurulum yapmadan `@kendihikayem/ui` bileşenlerini kullanabilir.
 *
 * FONTLAR: kök layout `fontsReady` verdiğinde tip ölçeği Fraunces/Nunito'lu
 * `brandTypeScale`e geçer. Fontlar yüklenmeden ekran ASLA bekletilmez; sistem
 * fontuyla render edilir, font gelince tema değişir ve metin kendiliğinden
 * markalı fonta döner.
 *
 * Yerel geçersiz kılma: `<ThemeScope mode="dark">` bir alt ağacı gece temasına
 * alır. Oynatıcı bunu kullanır; uygulamanın geri kalanına dokunmaz. Font durumu
 * üst temadan miras alınır.
 */

import { createContext, useContext, useMemo, type ReactElement, type ReactNode } from 'react';

import { dark, light, type ColorRoles } from './tokens/colors';
import { motion, radius, spacing, touchTarget } from './tokens/layout';
import { brandTypeScale, typeScale } from './tokens/typography';

export type ThemeMode = 'light' | 'dark';

export interface Theme {
  mode: ThemeMode;
  colors: ColorRoles;
  spacing: typeof spacing;
  radius: typeof radius;
  motion: typeof motion;
  touchTarget: typeof touchTarget;
  type: typeof typeScale;
  /** Marka fontları (Fraunces + Nunito) yüklendi mi? */
  fontsReady: boolean;
}

function buildTheme(mode: ThemeMode, fontsReady: boolean): Theme {
  return {
    mode,
    colors: mode === 'dark' ? dark : light,
    spacing,
    radius,
    motion,
    touchTarget,
    type: fontsReady ? brandTypeScale : typeScale,
    fontsReady,
  };
}

export const lightTheme: Theme = buildTheme('light', false);
export const darkTheme: Theme = buildTheme('dark', false);

const ThemeContext = createContext<Theme>(lightTheme);

export function ThemeProvider({
  mode = 'light',
  fontsReady = false,
  children,
}: {
  mode?: ThemeMode;
  /** Kök layout `useFonts` sonucunu geçirir; ekranlar fontu BEKLEMEZ. */
  fontsReady?: boolean;
  children: ReactNode;
}): ReactElement {
  const value = useMemo(() => buildTheme(mode, fontsReady), [mode, fontsReady]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Bir alt ağacı belirli temaya sabitler (oynatıcı → her zaman gece). */
export function ThemeScope({
  mode,
  children,
}: {
  mode: ThemeMode;
  children: ReactNode;
}): ReactElement {
  // Font durumu üstteki temadan miras alınır — gece kapsamı fontları sıfırlamaz.
  const parent = useContext(ThemeContext);
  return (
    <ThemeProvider mode={mode} fontsReady={parent.fontsReady}>
      {children}
    </ThemeProvider>
  );
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
