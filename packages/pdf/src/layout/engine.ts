/**
 * layout/engine.ts — story + format → a finished, measurable book.
 *
 * This is the only place that decides where anything sits on paper. It is deliberately
 * PURE: no file system, no network, no PDF library. It takes text, image descriptors
 * (pixel sizes, not bytes) and the format, and returns geometry. That purity is what lets
 * the preflight run before a single 4K image is downloaded — the expensive part of the
 * pipeline stays behind the gate that can still say no.
 *
 * Layout rules that exist for physical reasons, not aesthetic ones:
 *
 *   · Full-bleed art is drawn to the CANVAS (trim + bleed), never to the trim. Art that
 *     stops at the trim line produces a white hairline after cutting.
 *   · Text lives inside `safe`, which is the trim inset by the safe margin AND by the
 *     gutter on the spine side. A hardcover block does not open flat.
 *   · The text panel is a filled shape under the text. Type straight on illustration is
 *     unreadable for an early reader as soon as the art gets busy.
 *   · The QR sits in the OUTER top corner, diagonally opposite the text panel, so a thumb
 *     holding the book open never covers it.
 */

import { insetRectSides, mmToPt, rect, type RectPt } from '../units';
import { getBookFormat, type BookFormatSpec } from '../formats';
import { calculateSpine, coverGeometry, spineTakesText, type SpineBreakdown } from '../spine';
import { loadFontSet, type FontSet } from '../fonts/registry';
import { typeset, typesetToFit, type TypesetStyle } from '../text/typeset';
import { normalizeTypographyTr } from '../text/turkish';
import { buildQrMatrix, QR_QUIET_MODULES } from '../qr/matrix';
import { mintQrToken, pageAudioUrl, type RandomSource } from '../qr/token';
import { planPages, type PagePlanEntry } from './plan';
import { PRINT_COLORS, typeRampFor, type TypeRamp } from './theme';
import type {
  BookLayout,
  ColorMode,
  CoverLayout,
  PageBlock,
  PageLayout,
  PrintImageRef,
  Rgb,
  SpreadRef,
  TextBlock,
} from './types';
import { possessive, toUpperTr } from '@kendihikayem/shared';

export interface StoryPageInput {
  /** 1-based story page number, as the reader sees it. */
  pageNo: number;
  textTr: string;
  image?: PrintImageRef;
}

export interface ImprintInput {
  orderNo?: string;
  buildId?: string;
  revision?: number;
  producedAt?: Date;
  /** Free-form extra line, e.g. the printer's name once the partner is fixed. */
  printerTr?: string;
}

export interface QrInput {
  enabled: boolean;
  /** `PUBLIC_BASE_URL`; the printed link is `${baseUrl}/p/${token}`. */
  baseUrl: string;
  /** Pre-minted tokens per story page (from `page_audio_links`). Missing ones are minted. */
  tokens?: Record<number, string>;
  /** Whole-book token used on the memories page. */
  bookToken?: string;
  /** "Anne" — printed under the code so the child knows whose voice it is. */
  renditionLabelTr?: string;
  random?: RandomSource;
}

export interface BookBuildInput {
  formatCode?: string;
  format?: BookFormatSpec;
  story: {
    titleTr: string;
    heroName: string;
    ageBand: string;
    lessonTr?: string;
    blurbTr?: string;
  };
  pages: StoryPageInput[];
  coverImage?: PrintImageRef;
  backCoverImage?: PrintImageRef;
  dedicationTr?: string;
  imprint?: ImprintInput;
  qr?: QrInput;
  colorMode?: ColorMode;
  /** Provider-supplied spine (SPEC §9 step 6) — overrides the local formula. */
  spine?: SpineBreakdown;
  fonts?: FontSet;
}

const PAGE_NUMBER_PT = 9;
const QR_BOX_MM = 24;
const PANEL_RADIUS_MM = 6;
const PANEL_PADDING_MM = 7;

/** Geometry shared by every interior page. */
function pageBoxes(
  format: BookFormatSpec,
  side: 'left' | 'right',
): { canvas: RectPt; trim: RectPt; safe: RectPt } {
  const bleed = mmToPt(format.bleedMm);
  const canvas = rect(
    0,
    0,
    mmToPt(format.trimWidthMm + format.bleedMm * 2),
    mmToPt(format.trimHeightMm + format.bleedMm * 2),
  );
  const trim = rect(bleed, bleed, mmToPt(format.trimWidthMm), mmToPt(format.trimHeightMm));
  const margin = mmToPt(format.safeMarginMm);
  const gutter = mmToPt(format.gutterMm);
  const safe = insetRectSides(trim, {
    top: margin,
    bottom: margin,
    // A recto (odd, right-hand) page has the gutter on its left.
    left: margin + (side === 'right' ? gutter : 0),
    right: margin + (side === 'left' ? gutter : 0),
  });
  return { canvas, trim, safe };
}

function bodyStyle(fonts: FontSet, ramp: TypeRamp): TypesetStyle {
  return {
    font: fonts.get('body'),
    sizePt: ramp.bodyPt,
    leadingPt: ramp.bodyLeadingPt,
    align: 'left',
    hyphenate: true,
    paragraphSpacingPt: ramp.bodyPt * 0.4,
  };
}

/** Places a typeset block so its FIRST baseline lands correctly inside `box`. */
function textBlock(
  box: RectPt,
  result: ReturnType<typeof typeset>,
  options: {
    fontRole: TextBlock['fontRole'];
    align?: TextBlock['align'];
    color?: Rgb;
    verticalAlign?: 'top' | 'middle' | 'bottom';
    overflow?: boolean;
    paragraphSpacingPt?: number;
    rotationDeg?: TextBlock['rotationDeg'];
    ignoreSafeZone?: boolean;
  },
): TextBlock {
  const verticalAlign = options.verticalAlign ?? 'top';
  const height = result.heightPt;
  let y = box.y + box.height - height;
  if (verticalAlign === 'middle') y = box.y + (box.height - height) / 2;
  if (verticalAlign === 'bottom') y = box.y;

  return {
    kind: 'text',
    box: { x: box.x, y: Math.max(box.y, y), width: box.width, height },
    lines: result.lines,
    fontRole: options.fontRole,
    sizePt: result.sizePt,
    leadingPt: result.leadingPt,
    align: options.align ?? 'left',
    color: options.color ?? PRINT_COLORS.ink,
    ...(options.paragraphSpacingPt ? { paragraphSpacingPt: options.paragraphSpacingPt } : {}),
    ...(options.overflow ? { overflow: true } : {}),
    ...(options.rotationDeg ? { rotationDeg: options.rotationDeg } : {}),
    ...(options.ignoreSafeZone ? { ignoreSafeZone: true } : {}),
  };
}

function fullBleedImage(canvas: RectPt, image: PrintImageRef): PageBlock {
  return { kind: 'image', box: canvas, image, fit: 'cover', fullBleed: true };
}

function pageNumberBlock(
  fonts: FontSet,
  safe: RectPt,
  side: 'left' | 'right',
  pageNo: number,
  color: Rgb,
): TextBlock {
  const font = fonts.get('body');
  const label = String(pageNo);
  const width = font.widthOf(label, PAGE_NUMBER_PT);
  const x = side === 'right' ? safe.x + safe.width - width : safe.x;
  return {
    kind: 'text',
    box: { x, y: safe.y - mmToPt(6), width, height: PAGE_NUMBER_PT },
    lines: [{ text: label, widthPt: width, paragraph: 0, hyphenated: false }],
    fontRole: 'body',
    sizePt: PAGE_NUMBER_PT,
    leadingPt: PAGE_NUMBER_PT,
    align: 'left',
    color,
    ignoreSafeZone: true,
  };
}

interface QrPlacement {
  block: PageBlock;
  caption?: TextBlock;
  token: string;
}

function qrPlacement(
  fonts: FontSet,
  safe: RectPt,
  side: 'left' | 'right',
  token: string,
  qr: QrInput,
  captionTr: string,
): QrPlacement {
  const url = pageAudioUrl(qr.baseUrl, token);
  const matrix = buildQrMatrix(url, 'M');
  const boxSize = mmToPt(QR_BOX_MM);
  // Outer top corner: opposite the text panel, away from the gutter and from the thumb.
  const x = side === 'right' ? safe.x + safe.width - boxSize : safe.x;
  const box = rect(x, safe.y + safe.height - boxSize, boxSize, boxSize);

  const caption = typeset(captionTr, boxSize + mmToPt(6), {
    font: fonts.get('body'),
    sizePt: 7.5,
    leadingPt: 9,
    align: 'center',
    hyphenate: false,
  });

  return {
    token,
    block: {
      kind: 'qr',
      box,
      modules: matrix.modules,
      quietModules: QR_QUIET_MODULES,
      dark: PRINT_COLORS.ink,
      light: PRINT_COLORS.white,
      url,
      token,
    },
    caption: textBlock(
      rect(box.x - mmToPt(3), box.y - mmToPt(7), boxSize + mmToPt(6), mmToPt(6)),
      caption,
      { fontRole: 'body', align: 'center', color: PRINT_COLORS.inkMuted, verticalAlign: 'top' },
    ),
  };
}

/* ── page builders ─────────────────────────────────────────────────────────── */

function buildTitlePage(
  input: BookBuildInput,
  fonts: FontSet,
  ramp: TypeRamp,
  boxes: ReturnType<typeof pageBoxes>,
): PageBlock[] {
  const { canvas, safe } = boxes;
  const blocks: PageBlock[] = [
    { kind: 'rect', box: canvas, fill: PRINT_COLORS.cream },
  ];

  const title = typesetToFit(
    input.story.titleTr,
    { widthPt: safe.width, heightPt: safe.height * 0.5 },
    {
      font: fonts.get('title'),
      sizePt: ramp.titlePt,
      leadingPt: ramp.titlePt * 1.2,
      align: 'center',
      hyphenate: false,
    },
    { minSizePt: ramp.titleMinPt, leadingRatio: 1.2 },
  );
  blocks.push(
    textBlock(rect(safe.x, safe.y + safe.height * 0.42, safe.width, safe.height * 0.5), title, {
      fontRole: 'title',
      align: 'center',
      verticalAlign: 'top',
      overflow: title.overflow,
    }),
  );

  const heroLine = normalizeTypographyTr(
    `${possessive(input.story.heroName)} özel masalı`,
  );
  const hero = typeset(heroLine, safe.width, {
    font: fonts.get('bodyItalic'),
    sizePt: ramp.captionPt + 4,
    leadingPt: ramp.captionPt + 8,
    align: 'center',
    hyphenate: false,
  });
  blocks.push(
    textBlock(rect(safe.x, safe.y + safe.height * 0.3, safe.width, mmToPt(20)), hero, {
      fontRole: 'bodyItalic',
      align: 'center',
      color: PRINT_COLORS.inkMuted,
      verticalAlign: 'top',
    }),
  );

  // A hairline rule instead of an ornament: it survives any press, any paper.
  blocks.push({
    kind: 'line',
    from: { x: safe.x + safe.width * 0.35, y: safe.y + safe.height * 0.26 },
    to: { x: safe.x + safe.width * 0.65, y: safe.y + safe.height * 0.26 },
    color: PRINT_COLORS.purple,
    widthPt: 1.2,
  });

  const brand = typeset('KendiHikayem', safe.width, {
    font: fonts.get('body'),
    sizePt: ramp.captionPt,
    leadingPt: ramp.captionPt + 2,
    align: 'center',
    hyphenate: false,
  });
  blocks.push(
    textBlock(rect(safe.x, safe.y, safe.width, mmToPt(10)), brand, {
      fontRole: 'body',
      align: 'center',
      color: PRINT_COLORS.inkMuted,
      verticalAlign: 'bottom',
    }),
  );
  return blocks;
}

function buildDedicationPage(
  input: BookBuildInput,
  fonts: FontSet,
  ramp: TypeRamp,
  boxes: ReturnType<typeof pageBoxes>,
): PageBlock[] {
  const { canvas, safe } = boxes;
  const blocks: PageBlock[] = [{ kind: 'rect', box: canvas, fill: PRINT_COLORS.cream }];

  const text = input.dedicationTr?.trim();
  if (!text) return blocks;

  const dedication = typesetToFit(
    text,
    { widthPt: safe.width * 0.8, heightPt: safe.height * 0.6 },
    {
      font: fonts.get('bodyItalic'),
      sizePt: ramp.bodyPt,
      leadingPt: ramp.bodyLeadingPt,
      align: 'center',
      hyphenate: true,
    },
    { minSizePt: ramp.bodyMinPt - 2, leadingRatio: ramp.bodyLeadingPt / ramp.bodyPt },
  );

  blocks.push(
    textBlock(
      rect(safe.x + safe.width * 0.1, safe.y, safe.width * 0.8, safe.height),
      dedication,
      {
        fontRole: 'bodyItalic',
        align: 'center',
        verticalAlign: 'middle',
        overflow: dedication.overflow,
      },
    ),
  );
  return blocks;
}

function buildStoryPage(
  input: BookBuildInput,
  fonts: FontSet,
  ramp: TypeRamp,
  boxes: ReturnType<typeof pageBoxes>,
  entry: PagePlanEntry,
  side: 'left' | 'right',
  storyPage: StoryPageInput | undefined,
  qrToken: string | undefined,
): { blocks: PageBlock[]; qrToken?: string } {
  const { canvas, safe } = boxes;
  const blocks: PageBlock[] = [];
  const withText = entry.half !== 'picture';

  if (storyPage?.image) {
    blocks.push(fullBleedImage(canvas, storyPage.image));
  } else if (entry.half === 'text') {
    blocks.push({ kind: 'rect', box: canvas, fill: PRINT_COLORS.cream });
  } else {
    // No illustration yet (manual review, or a failed page): a tinted page still prints.
    blocks.push({ kind: 'rect', box: canvas, fill: PRINT_COLORS.sand });
  }

  if (withText && storyPage) {
    const padding = mmToPt(PANEL_PADDING_MM);
    const column = safe.width - padding * 2;
    const body = typesetToFit(
      storyPage.textTr,
      { widthPt: column, heightPt: safe.height * 0.5 - padding * 2 },
      bodyStyle(fonts, ramp),
      { minSizePt: ramp.bodyMinPt, leadingRatio: ramp.bodyLeadingPt / ramp.bodyPt },
    );

    const panelHeight = body.heightPt + padding * 2;
    const panel = rect(safe.x, safe.y, safe.width, Math.min(panelHeight, safe.height));
    if (entry.half !== 'text') {
      blocks.push({
        kind: 'rect',
        box: panel,
        fill: PRINT_COLORS.paper,
        opacity: 0.9,
        radiusPt: mmToPt(PANEL_RADIUS_MM),
      });
    }
    blocks.push(
      textBlock(
        rect(panel.x + padding, panel.y + padding, column, panel.height - padding * 2),
        body,
        {
          fontRole: 'body',
          align: 'left',
          verticalAlign: 'middle',
          overflow: body.overflow,
          paragraphSpacingPt: ramp.bodyPt * 0.4,
        },
      ),
    );
  }

  let usedToken: string | undefined;
  if (qrToken && input.qr?.enabled && withText) {
    const labelTr = input.qr.renditionLabelTr
      ? `${input.qr.renditionLabelTr} okusun`
      : 'Bu sayfayı dinle';
    const placement = qrPlacement(fonts, safe, side, qrToken, input.qr, labelTr);
    blocks.push(placement.block);
    if (placement.caption) blocks.push(placement.caption);
    usedToken = qrToken;
  }

  blocks.push(
    pageNumberBlock(
      fonts,
      safe,
      side,
      entry.pageNo,
      storyPage?.image ? PRINT_COLORS.white : PRINT_COLORS.inkMuted,
    ),
  );

  return usedToken ? { blocks, qrToken: usedToken } : { blocks };
}

function buildClosingPage(
  input: BookBuildInput,
  fonts: FontSet,
  ramp: TypeRamp,
  boxes: ReturnType<typeof pageBoxes>,
): PageBlock[] {
  const { canvas, safe } = boxes;
  const blocks: PageBlock[] = [{ kind: 'rect', box: canvas, fill: PRINT_COLORS.cream }];

  const son = typeset('Son.', safe.width, {
    font: fonts.get('title'),
    sizePt: ramp.titlePt * 0.8,
    leadingPt: ramp.titlePt,
    align: 'center',
    hyphenate: false,
  });
  blocks.push(
    textBlock(rect(safe.x, safe.y + safe.height * 0.55, safe.width, mmToPt(30)), son, {
      fontRole: 'title',
      align: 'center',
      verticalAlign: 'top',
    }),
  );

  if (input.story.lessonTr) {
    const lesson = typesetToFit(
      input.story.lessonTr,
      { widthPt: safe.width * 0.8, heightPt: safe.height * 0.3 },
      {
        font: fonts.get('bodyItalic'),
        sizePt: ramp.captionPt + 4,
        leadingPt: ramp.captionPt + 9,
        align: 'center',
        hyphenate: true,
      },
      { minSizePt: 10, leadingRatio: 1.5 },
    );
    blocks.push(
      textBlock(
        rect(safe.x + safe.width * 0.1, safe.y + safe.height * 0.3, safe.width * 0.8, mmToPt(40)),
        lesson,
        {
          fontRole: 'bodyItalic',
          align: 'center',
          color: PRINT_COLORS.inkMuted,
          verticalAlign: 'top',
          overflow: lesson.overflow,
        },
      ),
    );
  }
  return blocks;
}

function buildMemoriesPage(
  input: BookBuildInput,
  fonts: FontSet,
  ramp: TypeRamp,
  boxes: ReturnType<typeof pageBoxes>,
  bookToken: string | undefined,
): { blocks: PageBlock[]; qrToken?: string } {
  const { canvas, safe } = boxes;
  const blocks: PageBlock[] = [{ kind: 'rect', box: canvas, fill: PRINT_COLORS.lavenderMist }];

  const heading = typeset('Bu masal senin için yazıldı', safe.width, {
    font: fonts.get('title'),
    sizePt: ramp.titlePt * 0.55,
    leadingPt: ramp.titlePt * 0.7,
    align: 'center',
    hyphenate: false,
  });
  blocks.push(
    textBlock(rect(safe.x, safe.y + safe.height - mmToPt(30), safe.width, mmToPt(30)), heading, {
      fontRole: 'title',
      align: 'center',
      verticalAlign: 'top',
    }),
  );

  if (bookToken && input.qr?.enabled) {
    const url = pageAudioUrl(input.qr.baseUrl, bookToken);
    const matrix = buildQrMatrix(url, 'M');
    const boxSize = mmToPt(45);
    const box = rect(
      safe.x + (safe.width - boxSize) / 2,
      safe.y + safe.height * 0.38,
      boxSize,
      boxSize,
    );
    blocks.push({
      kind: 'qr',
      box,
      modules: matrix.modules,
      quietModules: QR_QUIET_MODULES,
      dark: PRINT_COLORS.ink,
      light: PRINT_COLORS.white,
      url,
      token: bookToken,
    });

    const voice = input.qr.renditionLabelTr ?? 'sevdiğin bir ses';
    const explain = typeset(
      normalizeTypographyTr(
        `Karekodu telefonun kamerasıyla okut; masalın tamamını ${voice} sesiyle dinle. ` +
          'Bağlantıyı istediğin zaman hesabından kapatabilirsin.',
      ),
      safe.width * 0.85,
      {
        font: fonts.get('body'),
        sizePt: ramp.captionPt + 2,
        leadingPt: ramp.captionPt + 7,
        align: 'center',
        hyphenate: true,
      },
    );
    blocks.push(
      textBlock(
        rect(safe.x + safe.width * 0.075, safe.y + mmToPt(10), safe.width * 0.85, mmToPt(45)),
        explain,
        { fontRole: 'body', align: 'center', color: PRINT_COLORS.inkMuted, verticalAlign: 'top' },
      ),
    );
    return { blocks, qrToken: bookToken };
  }

  return { blocks };
}

function buildReadingLogPage(
  fonts: FontSet,
  ramp: TypeRamp,
  boxes: ReturnType<typeof pageBoxes>,
  first: boolean,
): PageBlock[] {
  const { canvas, safe } = boxes;
  const blocks: PageBlock[] = [{ kind: 'rect', box: canvas, fill: PRINT_COLORS.paper }];

  let top = safe.y + safe.height;
  if (first) {
    const heading = typeset('Okuma günlüğü', safe.width, {
      font: fonts.get('title'),
      sizePt: ramp.titlePt * 0.5,
      leadingPt: ramp.titlePt * 0.6,
      align: 'left',
      hyphenate: false,
    });
    blocks.push(
      textBlock(rect(safe.x, top - mmToPt(16), safe.width, mmToPt(16)), heading, {
        fontRole: 'title',
        align: 'left',
        verticalAlign: 'top',
      }),
    );
    const note = typeset(
      'Bu masalı ne zaman, kiminle okuduğunuzu buraya yazın. Yıllar sonra en çok bu satırlar okunacak.',
      safe.width,
      {
        font: fonts.get('bodyItalic'),
        sizePt: ramp.captionPt,
        leadingPt: ramp.captionPt + 4,
        align: 'left',
        hyphenate: true,
      },
    );
    blocks.push(
      textBlock(rect(safe.x, top - mmToPt(30), safe.width, mmToPt(14)), note, {
        fontRole: 'bodyItalic',
        align: 'left',
        color: PRINT_COLORS.inkMuted,
        verticalAlign: 'top',
      }),
    );
    top -= mmToPt(36);
  }

  const rowHeight = mmToPt(22);
  const rows = Math.max(1, Math.floor((top - safe.y) / rowHeight));
  for (let i = 0; i < rows; i += 1) {
    const y = top - (i + 1) * rowHeight;
    blocks.push({
      kind: 'line',
      from: { x: safe.x, y: y + mmToPt(4) },
      to: { x: safe.x + safe.width, y: y + mmToPt(4) },
      color: PRINT_COLORS.linen,
      widthPt: 0.8,
    });
    const label = typeset('Tarih —  Okuyan —  Not', safe.width, {
      font: fonts.get('body'),
      sizePt: 8,
      leadingPt: 10,
      align: 'left',
      hyphenate: false,
    });
    blocks.push(
      textBlock(rect(safe.x, y + mmToPt(5), safe.width, mmToPt(5)), label, {
        fontRole: 'body',
        align: 'left',
        color: PRINT_COLORS.inkMuted,
        verticalAlign: 'bottom',
      }),
    );
  }
  return blocks;
}

function buildImprintPage(
  input: BookBuildInput,
  fonts: FontSet,
  ramp: TypeRamp,
  boxes: ReturnType<typeof pageBoxes>,
  spineMm: number,
  format: BookFormatSpec,
): PageBlock[] {
  const { canvas, safe } = boxes;
  const blocks: PageBlock[] = [{ kind: 'rect', box: canvas, fill: PRINT_COLORS.cream }];

  const producedAt = input.imprint?.producedAt ?? new Date();
  const dateTr = new Intl.DateTimeFormat('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Istanbul',
  }).format(producedAt);

  const lines = [
    input.story.titleTr,
    `${input.story.heroName} için hazırlandı · ${input.story.ageBand} yaş`,
    '',
    'KendiHikayem — kişiye özel çocuk kitabı',
    `Format: ${format.titleTr} · ${format.paperTr} · sırt ${spineMm.toFixed(1)} mm`,
    `Üretim: ${dateTr}`,
    input.imprint?.orderNo ? `Sipariş no: ${input.imprint.orderNo}` : '',
    input.imprint?.buildId
      ? `Kitap sürümü: ${input.imprint.buildId}${input.imprint.revision ? ` r${input.imprint.revision}` : ''}`
      : '',
    input.imprint?.printerTr ? `Baskı: ${input.imprint.printerTr}` : '',
    '',
    'Bu kitap tek nüsha olarak, yalnızca bu aile için üretilmiştir; satışa sunulmaz ve ISBN taşımaz.',
    'Metin ve görseller yapay zekâ desteğiyle, ebeveyn onayıyla üretilmiştir.',
    'Karekod bağlantıları hesabınızdan kapatılabilir.',
  ]
    .filter((line) => line !== undefined)
    .join('\n');

  const imprint = typeset(normalizeTypographyTr(lines), safe.width, {
    font: fonts.get('body'),
    sizePt: ramp.captionPt - 1,
    leadingPt: ramp.captionPt + 3,
    align: 'left',
    hyphenate: false,
    paragraphSpacingPt: 2,
  });
  blocks.push(
    textBlock(rect(safe.x, safe.y, safe.width, safe.height), imprint, {
      fontRole: 'body',
      align: 'left',
      color: PRINT_COLORS.inkMuted,
      verticalAlign: 'bottom',
      paragraphSpacingPt: 2,
    }),
  );
  return blocks;
}

function buildCover(
  input: BookBuildInput,
  fonts: FontSet,
  ramp: TypeRamp,
  format: BookFormatSpec,
  spineMm: number,
): CoverLayout {
  const geometry = coverGeometry(format, spineMm);
  const blocks: PageBlock[] = [];

  if (input.coverImage) {
    blocks.push({
      kind: 'image',
      box: geometry.canvas,
      image: input.coverImage,
      fit: 'cover',
      fullBleed: true,
    });
  } else {
    blocks.push({ kind: 'rect', box: geometry.canvas, fill: PRINT_COLORS.lavenderMist });
  }

  // Title band on the front panel — a filled shape so the type never fights the art.
  const safe = geometry.frontSafe;
  const padding = mmToPt(PANEL_PADDING_MM);
  const title = typesetToFit(
    input.story.titleTr,
    { widthPt: safe.width - padding * 2, heightPt: safe.height * 0.45 },
    {
      font: fonts.get('titleBold'),
      sizePt: ramp.titlePt,
      leadingPt: ramp.titlePt * 1.15,
      align: 'center',
      hyphenate: false,
    },
    { minSizePt: ramp.titleMinPt, leadingRatio: 1.15 },
  );
  const heroLine = typeset(normalizeTypographyTr(input.story.heroName), safe.width - padding * 2, {
    font: fonts.get('bodyItalic'),
    sizePt: ramp.captionPt + 6,
    leadingPt: ramp.captionPt + 10,
    align: 'center',
    hyphenate: false,
  });

  const bandHeight = title.heightPt + heroLine.heightPt + padding * 2.5;
  const band = rect(safe.x, safe.y + mmToPt(6), safe.width, bandHeight);
  blocks.push({
    kind: 'rect',
    box: band,
    fill: PRINT_COLORS.paper,
    opacity: 0.92,
    radiusPt: mmToPt(PANEL_RADIUS_MM),
  });
  blocks.push(
    textBlock(
      rect(
        band.x + padding,
        band.y + padding + heroLine.heightPt,
        band.width - padding * 2,
        title.heightPt,
      ),
      title,
      { fontRole: 'titleBold', align: 'center', verticalAlign: 'bottom', overflow: title.overflow },
    ),
  );
  blocks.push(
    textBlock(
      rect(band.x + padding, band.y + padding * 0.5, band.width - padding * 2, heroLine.heightPt),
      heroLine,
      { fontRole: 'bodyItalic', align: 'center', color: PRINT_COLORS.inkMuted, verticalAlign: 'bottom' },
    ),
  );

  // Back cover: the blurb the parent already approved, plus the brand line.
  if (input.story.blurbTr) {
    const backSafe = geometry.backSafe;
    const blurb = typesetToFit(
      input.story.blurbTr,
      { widthPt: backSafe.width - padding * 2, heightPt: backSafe.height * 0.45 },
      {
        font: fonts.get('body'),
        sizePt: ramp.captionPt + 4,
        leadingPt: ramp.captionPt + 10,
        align: 'center',
        hyphenate: true,
      },
      { minSizePt: 9, leadingRatio: 1.5 },
    );
    const backBand = rect(
      backSafe.x,
      backSafe.y + backSafe.height * 0.3,
      backSafe.width,
      blurb.heightPt + padding * 2,
    );
    blocks.push({
      kind: 'rect',
      box: backBand,
      fill: PRINT_COLORS.paper,
      opacity: 0.92,
      radiusPt: mmToPt(PANEL_RADIUS_MM),
    });
    blocks.push(
      textBlock(
        rect(
          backBand.x + padding,
          backBand.y + padding,
          backBand.width - padding * 2,
          blurb.heightPt,
        ),
        blurb,
        { fontRole: 'body', align: 'center', verticalAlign: 'middle', overflow: blurb.overflow },
      ),
    );

    const brand = typeset('KendiHikayem', backSafe.width, {
      font: fonts.get('body'),
      sizePt: ramp.captionPt,
      leadingPt: ramp.captionPt + 2,
      align: 'center',
      hyphenate: false,
    });
    blocks.push(
      textBlock(rect(backSafe.x, backSafe.y, backSafe.width, mmToPt(10)), brand, {
        fontRole: 'body',
        align: 'center',
        color: PRINT_COLORS.white,
        verticalAlign: 'bottom',
      }),
    );
  }

  // Spine text only when the spine is wide enough to carry it legibly.
  if (spineTakesText(spineMm)) {
    const spineFont = fonts.get('titleBold');
    const spineSize = Math.min(12, spineMm * 1.2);
    const label = normalizeTypographyTr(toUpperTr(input.story.titleTr));
    const width = spineFont.widthOf(label, spineSize);
    const available = geometry.spinePanel.height - mmToPt(20);
    const fitted = width <= available ? label : `${label.slice(0, 28)}…`;
    const fittedWidth = spineFont.widthOf(fitted, spineSize);
    blocks.push({
      kind: 'text',
      box: {
        x: geometry.spinePanel.x + geometry.spinePanel.width / 2 - spineSize / 2,
        y: geometry.spinePanel.y + (geometry.spinePanel.height - fittedWidth) / 2,
        width: spineSize,
        height: fittedWidth,
      },
      lines: [{ text: fitted, widthPt: fittedWidth, paragraph: 0, hyphenated: false }],
      fontRole: 'titleBold',
      sizePt: spineSize,
      leadingPt: spineSize,
      align: 'left',
      color: PRINT_COLORS.white,
      rotationDeg: 90,
      ignoreSafeZone: true,
    });
  }

  return {
    canvas: geometry.canvas,
    trim: geometry.trim,
    frontPanel: geometry.frontPanel,
    backPanel: geometry.backPanel,
    spinePanel: geometry.spinePanel,
    blocks,
    spineMm,
  };
}

/* ── entry point ───────────────────────────────────────────────────────────── */

export function buildLayout(input: BookBuildInput): BookLayout {
  const format = input.format ?? getBookFormat(input.formatCode ?? 'kare21_24_sert');
  const fonts = input.fonts ?? loadFontSet();
  const ramp = typeRampFor(input.story.ageBand);
  const spine = input.spine ?? calculateSpine(format, format.pageCount);
  const colorMode = input.colorMode ?? 'srgb';

  const storyByPage = new Map(input.pages.map((page) => [page.pageNo, page]));
  const plan = planPages(input.pages.length, format.pageCount);

  const qrTokens: Record<number, string> = {};
  const random = input.qr?.random;
  const tokenFor = (storyPageNo: number): string => {
    const existing = input.qr?.tokens?.[storyPageNo];
    const token = existing ?? mintQrToken(random);
    qrTokens[storyPageNo] = token;
    return token;
  };
  const bookToken = input.qr?.enabled
    ? (input.qr.bookToken ?? mintQrToken(random))
    : undefined;

  let readingLogSeen = 0;
  const interior: PageLayout[] = plan.entries.map((entry) => {
    const side: 'left' | 'right' = entry.pageNo % 2 === 1 ? 'right' : 'left';
    const boxes = pageBoxes(format, side);
    let blocks: PageBlock[] = [];
    let qrToken: string | undefined;

    switch (entry.kind) {
      case 'title':
        blocks = buildTitlePage(input, fonts, ramp, boxes);
        break;
      case 'dedication':
        blocks = buildDedicationPage(input, fonts, ramp, boxes);
        break;
      case 'story':
      case 'story_text': {
        const storyPage = entry.storyPageNo ? storyByPage.get(entry.storyPageNo) : undefined;
        const wantsQr = input.qr?.enabled === true && entry.half !== 'picture';
        const token = wantsQr && entry.storyPageNo ? tokenFor(entry.storyPageNo) : undefined;
        const built = buildStoryPage(input, fonts, ramp, boxes, entry, side, storyPage, token);
        blocks = built.blocks;
        qrToken = built.qrToken;
        break;
      }
      case 'closing':
        blocks = buildClosingPage(input, fonts, ramp, boxes);
        break;
      case 'memories': {
        const built = buildMemoriesPage(input, fonts, ramp, boxes, bookToken);
        blocks = built.blocks;
        qrToken = built.qrToken;
        break;
      }
      case 'reading_log':
        readingLogSeen += 1;
        blocks = buildReadingLogPage(fonts, ramp, boxes, readingLogSeen === 1);
        break;
      case 'imprint':
        blocks = buildImprintPage(input, fonts, ramp, boxes, spine.spineMm, format);
        break;
      case 'blank':
      default:
        blocks = [{ kind: 'rect', box: boxes.canvas, fill: PRINT_COLORS.cream }];
        break;
    }

    return {
      pageNo: entry.pageNo,
      kind: entry.kind,
      side,
      canvas: boxes.canvas,
      trim: boxes.trim,
      safe: boxes.safe,
      blocks,
      ...(entry.storyPageNo ? { storyPageNo: entry.storyPageNo } : {}),
      ...(qrToken ? { qrToken } : {}),
    };
  });

  const spreads: SpreadRef[] = [];
  for (let i = 0; i + 1 < interior.length; i += 2) {
    spreads.push({
      index: spreads.length,
      leftPageNo: interior[i]?.pageNo ?? i + 1,
      rightPageNo: interior[i + 1]?.pageNo ?? i + 2,
    });
  }

  return {
    format,
    spine,
    colorMode,
    interior,
    cover: buildCover(input, fonts, ramp, format, spine.spineMm),
    spreads,
    meta: {
      titleTr: input.story.titleTr,
      heroName: input.story.heroName,
      ageBand: input.story.ageBand,
      formatCode: format.code,
      qrTokens,
      qrEnabled: input.qr?.enabled === true,
      ...(input.qr?.renditionLabelTr
        ? { qrRenditionLabelTr: input.qr.renditionLabelTr }
        : {}),
      storyPageCount: input.pages.length,
      truncated: plan.droppedStoryPages.length > 0,
    },
  };
}
