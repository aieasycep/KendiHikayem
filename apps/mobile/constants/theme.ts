/**
 * Minimal design tokens for the skeleton app.
 *
 * The real design system lives in packages/ui and is owned by F2 (docs/SPEC.md §12).
 * These values exist only so the navigation skeleton looks intentional in the first APK;
 * replace them with packages/ui tokens as soon as that package lands.
 */

export const colors = {
  background: '#FFF8F0',
  surface: '#FFFFFF',
  surfaceMuted: '#F3EADF',
  border: '#E6D9C9',
  ink: '#2B2118',
  inkMuted: '#7A6A59',
  primary: '#C2410C',
  primaryInk: '#FFFFFF',
  accent: '#0F766E',
  demoBadge: '#7C3AED',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 14,
  lg: 22,
} as const;

/**
 * Accessibility floor from the design constitution (SPEC §11.0): body text is never
 * smaller than 18 pt, because the reader is often a parent holding a phone at arm's length.
 */
export const typography = {
  title: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  heading: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  body: { fontSize: 18, lineHeight: 26, fontWeight: '400' },
  label: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
} as const;
