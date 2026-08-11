/**
 * layout/types.ts — the renderer-independent description of a printed book.
 *
 * The layout engine produces this structure; `render/interior.ts` and `render/cover.ts`
 * only translate it into pdf-lib calls, and `preflight/` only measures it. Keeping the
 * geometry in one plain data structure is what makes the preflight honest: it inspects the
 * same boxes that are drawn, not a parallel guess.
 *
 * Everything is in POINTS with a bottom-left origin, i.e. PDF user space, so nothing has
 * to be flipped downstream.
 */

import type { RectPt } from '../units';
import type { BookFormatSpec } from '../formats';
import type { SpineBreakdown } from '../spine';
import type { TypesetLine } from '../text/typeset';
import type { FontRole } from '../fonts/registry';

/** sRGB components in 0..1. Converted to the output colour space at render time. */
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export type ColorMode = 'srgb' | 'cmyk';

/**
 * A picture the layout wants, described well enough for the preflight to judge it BEFORE
 * any bytes are loaded: the effective DPI is `widthPx / boxWidth`, so pixel size and box
 * are all that is needed.
 */
export interface PrintImageRef {
  /** `assets.id` or, in tests/demos, a file path. Resolved by a `PrintImageSource`. */
  ref: string;
  widthPx: number;
  heightPx: number;
  mimeType: 'image/jpeg' | 'image/png';
  /** How many colour components the file carries; 4 means the file is already CMYK. */
  colorSpace?: 'srgb' | 'cmyk' | 'gray';
  /** Set by the image pipeline when a page is stuck in human review (SPEC §8.3). */
  status?: 'ready' | 'manual_review' | 'missing';
}

export type PageKind =
  | 'title'
  | 'dedication'
  | 'story'
  | 'story_text'
  | 'closing'
  | 'memories'
  | 'reading_log'
  | 'imprint'
  | 'blank';

export interface TextBlock {
  kind: 'text';
  /** The column the lines were broken into — the safe-zone check measures THIS box. */
  box: RectPt;
  lines: TypesetLine[];
  fontRole: FontRole;
  sizePt: number;
  leadingPt: number;
  align: 'left' | 'center' | 'right';
  color: Rgb;
  paragraphSpacingPt?: number;
  /** True when even the minimum size did not fit; the preflight turns it into a warning. */
  overflow?: boolean;
  /** Only used by the spine, which reads bottom-to-top on a shelf. Single line. */
  rotationDeg?: 0 | 90 | 270;
  /** Excluded from the safe-zone check — set only on the spine and on bleed ornaments. */
  ignoreSafeZone?: boolean;
}

export interface ImageBlock {
  kind: 'image';
  box: RectPt;
  image: PrintImageRef;
  /** `cover` crops to fill (full-bleed art), `contain` fits inside (spot illustrations). */
  fit: 'cover' | 'contain';
  /** Full-bleed art must reach the bleed edge; the preflight enforces it. */
  fullBleed: boolean;
  opacity?: number;
}

export interface RectBlock {
  kind: 'rect';
  box: RectPt;
  fill?: Rgb;
  opacity?: number;
  radiusPt?: number;
  strokeColor?: Rgb;
  strokeWidthPt?: number;
}

export interface LineBlock {
  kind: 'line';
  from: { x: number; y: number };
  to: { x: number; y: number };
  color: Rgb;
  widthPt: number;
  opacity?: number;
}

export interface QrBlock {
  kind: 'qr';
  box: RectPt;
  /** Square matrix of dark modules — drawn as vector rectangles, never as a bitmap. */
  modules: boolean[][];
  /** Quiet zone in modules; the spec minimum is 4 and scanners really do need it. */
  quietModules: number;
  dark: Rgb;
  light: Rgb;
  /** The URL encoded in the matrix — kept for the ops record and for tests. */
  url: string;
  token: string;
}

export type PageBlock = TextBlock | ImageBlock | RectBlock | LineBlock | QrBlock;

export interface PageLayout {
  /** 1-based, as the printer counts. */
  pageNo: number;
  kind: PageKind;
  /** `right` = recto (odd page): the gutter is on its LEFT. */
  side: 'left' | 'right';
  /** Full sheet including bleed — becomes MediaBox and BleedBox. */
  canvas: RectPt;
  /** Where the guillotine cuts — becomes TrimBox. */
  trim: RectPt;
  /** Trim minus safe margin, minus the extra gutter allowance on the spine side. */
  safe: RectPt;
  blocks: PageBlock[];
  /** Set on `story` / `story_text` pages. */
  storyPageNo?: number;
  /** Set when this page carries a QR code. */
  qrToken?: string;
}

export interface CoverLayout {
  canvas: RectPt;
  trim: RectPt;
  frontPanel: RectPt;
  backPanel: RectPt;
  spinePanel: RectPt;
  blocks: PageBlock[];
  spineMm: number;
}

export interface SpreadRef {
  index: number;
  leftPageNo: number;
  rightPageNo: number;
}

export interface BookLayout {
  format: BookFormatSpec;
  spine: SpineBreakdown;
  colorMode: ColorMode;
  interior: PageLayout[];
  cover: CoverLayout;
  /** Reading-order pairs the app flips through in B02. */
  spreads: SpreadRef[];
  meta: {
    titleTr: string;
    heroName: string;
    ageBand: string;
    formatCode: string;
    /** page → token, for `page_audio_links`. */
    qrTokens: Record<number, string>;
    qrEnabled: boolean;
    qrRenditionLabelTr?: string;
    storyPageCount: number;
    /** True when a story page had to be dropped because the format is too short. */
    truncated: boolean;
  };
}
