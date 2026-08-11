/**
 * layout/theme.ts — the printed book's palette and type ramp.
 *
 * The colours mirror the app's brand tokens (`packages/ui/src/tokens/colors.ts`), copied as
 * literals rather than imported: `packages/ui` is a React Native package and the print
 * pipeline must not depend on it. When the brand moves, both move — the duplication is two
 * values, and the alternative is a server package importing a client package.
 *
 * ⚠️ INK ON PAPER IS NOT INK ON SCREEN. Two rules encoded below:
 *   · Body text is K-ONLY black (0,0,0,1 in CMYK). A "rich black" built from four inks
 *     needs perfect registration; at 18 pt on a press that drifts 0.1 mm, four-colour text
 *     looks blurred. This is the same reason SPEC §9 passes `-dDeviceGrayToK=true` to
 *     Ghostscript.
 *   · Paper is not white. The cream that looks warm on screen prints as a visible tint, so
 *     text pages use the paper's own white and reserve the cream for panels.
 *
 * Type sizes follow SPEC §9 step 3: 28–34 pt for 0-2 (one sentence per page), 18–24 pt for
 * 3-5, 16–20 pt for 6-8; leading = size + 4–6 pt.
 */

import type { Rgb } from './types';

const hex = (value: string): Rgb => ({
  r: parseInt(value.slice(1, 3), 16) / 255,
  g: parseInt(value.slice(3, 5), 16) / 255,
  b: parseInt(value.slice(5, 7), 16) / 255,
});

export const PRINT_COLORS = {
  /** Body text. Rendered as K-only when the output is CMYK — see render/color.ts. */
  ink: hex('#2C2825'),
  inkMuted: hex('#7A6D62'),
  paper: { r: 1, g: 1, b: 1 } satisfies Rgb,
  cream: hex('#FAF8F4'),
  sand: hex('#F2EDE6'),
  linen: hex('#E8E0D4'),
  purple: hex('#7C5CBF'),
  lavenderMist: hex('#EDE8F8'),
  coral: hex('#F08B6E'),
  white: { r: 1, g: 1, b: 1 } satisfies Rgb,
} as const;

export type AgeBand = '0-2' | '3-5' | '6-8';

export interface TypeRamp {
  /** Story body text. */
  bodyPt: number;
  bodyMinPt: number;
  bodyLeadingPt: number;
  /** Title page. */
  titlePt: number;
  titleMinPt: number;
  /** Dedication, imprint, captions. */
  captionPt: number;
  /** Characters per line the column aims for; drives the text panel width. */
  targetLineChars: number;
}

export const TYPE_RAMP: Record<AgeBand, TypeRamp> = {
  '0-2': {
    bodyPt: 32,
    bodyMinPt: 26,
    bodyLeadingPt: 38,
    titlePt: 46,
    titleMinPt: 30,
    captionPt: 12,
    targetLineChars: 22,
  },
  '3-5': {
    bodyPt: 22,
    bodyMinPt: 18,
    bodyLeadingPt: 28,
    titlePt: 42,
    titleMinPt: 28,
    captionPt: 11,
    targetLineChars: 30,
  },
  '6-8': {
    bodyPt: 18,
    bodyMinPt: 15,
    bodyLeadingPt: 23,
    titlePt: 38,
    titleMinPt: 26,
    captionPt: 10,
    targetLineChars: 38,
  },
};

export function typeRampFor(ageBand: string): TypeRamp {
  return TYPE_RAMP[(ageBand as AgeBand) in TYPE_RAMP ? (ageBand as AgeBand) : '3-5'];
}
