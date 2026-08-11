/**
 * theme.tsx — tema sağlayıcısı.
 *
 * İki tema vardır: `light` (gündüz — kitaplık, ayarlar, baskı) ve `dark`
 * (gece — oynatıcı her zaman gece temasındadır, çünkü kullanım anı yatma
 * saatidir). Sağlayıcı yoksa bileşenler gündüz temasıyla çalışır; yani F1/F3
 * ekranları hiçbir kurulum yapmadan `@kendihikayem/ui` bileşenlerini kullanabilir.
 *
 * Yerel geçersiz kılma: `<ThemeScope mode="dark">` bir alt ağacı gece temasına
 * alır. Oynatıcı bunu kullanır; uygulamanın geri kalanına dokunmaz.
 */

import { createContext, useContext, useMemo, type ReactElement, type ReactNode } from 'react';

import { dark, light, type ColorRoles } from './tokens/colors';
import { motion, radius, spacing, touchTarget } from './tokens/layout';
import { typeScale } from './tokens/typography';

export type ThemeMode = 'light' | 'dark';

export interface Theme {
  mode: ThemeMode;
  colors: ColorRoles;
  spacing: typeof spacing;
  radius: typeof radius;
  motion: typeof motion;
  touchTarget: typeof touchTarget;
  type: typeof typeScale;
}

function buildTheme(mode: ThemeMode): Theme {
  return {
    mode,
    colors: mode === 'dark' ? dark : light,
    spacing,
    radius,
    motion,
    touchTarget,
    type: typeScale,
  };
}

export const lightTheme: Theme = buildTheme('light');
export const darkTheme: Theme = buildTheme('dark');

const ThemeContext = createContext<Theme>(lightTheme);

export function ThemeProvider({
  mode = 'light',
  children,
}: {
  mode?: ThemeMode;
  children: ReactNode;
}): ReactElement {
  const value = useMemo(() => buildTheme(mode), [mode]);
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
  return <ThemeProvider mode={mode}>{children}</ThemeProvider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
