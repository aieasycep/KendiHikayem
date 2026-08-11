/**
 * Köprü tokenlar — TEK GERÇEK KAYNAK `packages/ui`'dir.
 *
 * Bu dosya iskelet dönemindeki ekranların (onboarding, ses akışı) import ettiği
 * eski arayüzü korur ama DEĞERLERİ artık `@kendihikayem/ui`dan okur. Böylece
 * uygulamada iki farklı palet olamaz: `packages/ui` değişince buradan beslenen
 * ekranlar da aynı commit'te yeni tasarıma geçer.
 *
 * YENİ KOD BU DOSYAYI KULLANMAZ — doğrudan `@kendihikayem/ui` tüketir
 * (useTheme() / tokens). Buradaki ekranlar taşındıkça bu köprü küçülür ve
 * en sonunda silinir.
 */

import { light, palette, radius as uiRadius, spacing as uiSpacing, typeScale } from '@kendihikayem/ui';

export const colors = {
  background: light.background,
  surface: light.surface,
  surfaceMuted: light.surfaceMuted,
  border: light.border,
  ink: light.ink,
  inkMuted: light.inkMuted,
  primary: light.primary,
  primaryInk: light.inkOnPrimary,
  accent: light.accent,
  /** Demo rozeti — markadan bir ton koyu mor, birincil eylemle karışmaz. */
  demoBadge: palette.purple800,
} as const;

export const spacing = {
  xs: uiSpacing.xs,
  sm: uiSpacing.sm,
  md: uiSpacing.md,
  lg: uiSpacing.lg,
  xl: uiSpacing.xl,
} as const;

export const radius = {
  sm: uiRadius.sm,
  md: uiRadius.md,
  lg: uiRadius.lg,
} as const;

/**
 * Erişilebilirlik tabanı (SPEC §11.0): gövde 18 pt altına inmez. Değerler
 * `packages/ui` tip ölçeğiyle aynıdır; fontlar sistem fontudur (bu köprüyü
 * kullanan eski ekranlar marka fontuna taşınırken zaten `useTheme().type`e
 * geçecek).
 */
export const typography = {
  title: typeScale.title,
  heading: typeScale.heading,
  body: typeScale.body,
  label: typeScale.label,
  caption: typeScale.caption,
} as const;
