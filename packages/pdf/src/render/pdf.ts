/**
 * render/pdf.ts — layout → PDF bytes.
 *
 * Deliberately a DUMB renderer: every position, every line break and every colour was
 * decided in `layout/`. This file only knows how to speak pdf-lib. That split is what makes
 * the preflight trustworthy — it measures the same structure the renderer draws, so
 * "preview says safe, print says not" cannot happen.
 *
 * Three things here are printer requirements rather than choices:
 *
 *  1. **Boxes.** Chromium never writes TrimBox/BleedBox (SPEC §9 step 4 warns about it),
 *     and a POD provider validates them first. We set MediaBox = BleedBox = the full sheet,
 *     TrimBox = the cut size, CropBox = MediaBox, and the invariant
 *     TrimBox ⊆ BleedBox ⊆ MediaBox holds by construction.
 *  2. **Subset-embedded fonts.** `subset: true` embeds only the glyphs used. Non-embedded
 *     fonts are the single most common POD rejection.
 *  3. **Single-page imposition by default.** POD printers want one PDF page per book page
 *     and impose themselves. `imposition: 'spread'` exists for the parent-facing preview
 *     (and for a printer that asks for reader spreads) and glues two pages side by side
 *     with the inner bleed removed — never both files from one imposition.
 */

import { PDFDocument, degrees, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

import { mmToPt, ptToPx, type RectPt } from '../units';
import type { FontRole, FontSet } from '../fonts/registry';
import type {
  BookLayout,
  ColorMode,
  ImageBlock,
  PageBlock,
  PageLayout,
  QrBlock,
  TextBlock,
} from '../layout/types';
import type { PrintImageSource } from '../images/source';
import { toPdfColor } from './color';

export type Imposition = 'single' | 'spread';

export interface RenderOptions {
  images: PrintImageSource;
  fonts: FontSet;
  colorMode?: ColorMode;
  imposition?: Imposition;
  metadata?: {
    title?: string;
    author?: string;
    subject?: string;
    keywords?: string[];
    producedAt?: Date;
  };
  /** Ops/debug aid: draws the trim and safe boxes. NEVER true for a file sent to print. */
  drawGuides?: boolean;
}

const PRODUCER = 'KendiHikayem PDF (pdf-lib)';

/* ── helpers ───────────────────────────────────────────────────────────────── */

function roundedRectPath(width: number, height: number, radius: number): string {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  // y-down coordinates, anchored at the top-left corner — pdf-lib's drawSvgPath contract.
  return [
    `M ${r} 0`,
    `H ${width - r}`,
    `A ${r} ${r} 0 0 1 ${width} ${r}`,
    `V ${height - r}`,
    `A ${r} ${r} 0 0 1 ${width - r} ${height}`,
    `H ${r}`,
    `A ${r} ${r} 0 0 1 0 ${height - r}`,
    `V ${r}`,
    `A ${r} ${r} 0 0 1 ${r} 0`,
    'Z',
  ].join(' ');
}

interface DrawContext {
  page: PDFPage;
  fonts: Map<FontRole, PDFFont>;
  colorMode: ColorMode;
  /** Origin offset — non-zero when two pages are imposed onto one spread sheet. */
  dx: number;
  dy: number;
  images: Map<string, PDFImage>;
}

function drawRect(ctx: DrawContext, block: Extract<PageBlock, { kind: 'rect' }>): void {
  const box = shift(block.box, ctx);
  const fill = block.fill ? toPdfColor(block.fill, ctx.colorMode) : undefined;
  if (block.radiusPt && block.radiusPt > 0 && fill) {
    ctx.page.drawSvgPath(roundedRectPath(box.width, box.height, block.radiusPt), {
      x: box.x,
      y: box.y + box.height,
      color: fill,
      opacity: block.opacity ?? 1,
      borderWidth: 0,
    });
    return;
  }
  ctx.page.drawRectangle({
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    ...(fill ? { color: fill } : {}),
    opacity: block.opacity ?? 1,
    ...(block.strokeColor
      ? {
          borderColor: toPdfColor(block.strokeColor, ctx.colorMode),
          borderWidth: block.strokeWidthPt ?? 0.5,
        }
      : {}),
  });
}

function drawLine(ctx: DrawContext, block: Extract<PageBlock, { kind: 'line' }>): void {
  ctx.page.drawLine({
    start: { x: block.from.x + ctx.dx, y: block.from.y + ctx.dy },
    end: { x: block.to.x + ctx.dx, y: block.to.y + ctx.dy },
    thickness: block.widthPt,
    color: toPdfColor(block.color, ctx.colorMode),
    opacity: block.opacity ?? 1,
  });
}

function drawText(ctx: DrawContext, block: TextBlock): void {
  const font = ctx.fonts.get(block.fontRole);
  if (!font) throw new Error(`font role not embedded: ${block.fontRole}`);
  const color = toPdfColor(block.color, ctx.colorMode);
  const box = shift(block.box, ctx);

  if (block.rotationDeg === 90) {
    const line = block.lines[0];
    if (!line) return;
    ctx.page.drawText(line.text, {
      x: box.x + block.sizePt * 0.85,
      y: box.y,
      size: block.sizePt,
      font,
      color,
      rotate: degrees(90),
    });
    return;
  }

  const ascender = font.heightAtSize(block.sizePt, { descender: false });
  let baseline = box.y + box.height - ascender;
  let previousParagraph = block.lines[0]?.paragraph ?? 0;

  for (const line of block.lines) {
    if (line.paragraph !== previousParagraph) {
      baseline -= block.paragraphSpacingPt ?? 0;
      previousParagraph = line.paragraph;
    }
    let x = box.x;
    if (block.align === 'center') x = box.x + (box.width - line.widthPt) / 2;
    if (block.align === 'right') x = box.x + box.width - line.widthPt;
    if (line.text.length > 0) {
      ctx.page.drawText(line.text, { x, y: baseline, size: block.sizePt, font, color });
    }
    baseline -= block.leadingPt;
  }
}

function drawQr(ctx: DrawContext, block: QrBlock): void {
  const box = shift(block.box, ctx);
  const total = block.modules.length + block.quietModules * 2;
  const module = box.width / total;

  // Quiet zone: a scanner needs the light border as much as it needs the modules.
  ctx.page.drawRectangle({
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    color: toPdfColor(block.light, ctx.colorMode),
  });

  const dark = toPdfColor(block.dark, ctx.colorMode);
  const origin = box.y + box.height - block.quietModules * module;
  block.modules.forEach((row, rowIndex) => {
    row.forEach((isDark, colIndex) => {
      if (!isDark) return;
      ctx.page.drawRectangle({
        x: box.x + (block.quietModules + colIndex) * module,
        y: origin - (rowIndex + 1) * module,
        // Hairline overlap: adjacent modules must not show a white seam after RIP rounding.
        width: module + 0.05,
        height: module + 0.05,
        color: dark,
      });
    });
  });
}

async function drawImage(
  ctx: DrawContext,
  block: ImageBlock,
  source: PrintImageSource,
  doc: PDFDocument,
  colorMode: ColorMode,
): Promise<void> {
  const box = shift(block.box, ctx);
  const cacheKey = block.image.ref;
  let embedded = ctx.images.get(cacheKey);

  if (!embedded) {
    const loaded = await source.load({
      ref: block.image,
      targetWidthPx: ptToPx(block.box.width),
      targetHeightPx: ptToPx(block.box.height),
      colorMode,
    });
    embedded =
      loaded.mimeType === 'image/png'
        ? await doc.embedPng(loaded.bytes)
        : await doc.embedJpg(loaded.bytes);
    ctx.images.set(cacheKey, embedded);
  }

  const scale =
    block.fit === 'cover'
      ? Math.max(box.width / embedded.width, box.height / embedded.height)
      : Math.min(box.width / embedded.width, box.height / embedded.height);
  const width = embedded.width * scale;
  const height = embedded.height * scale;

  ctx.page.drawImage(embedded, {
    x: box.x + (box.width - width) / 2,
    y: box.y + (box.height - height) / 2,
    width,
    height,
    opacity: block.opacity ?? 1,
  });
}

function shift(box: RectPt, ctx: DrawContext): RectPt {
  return { x: box.x + ctx.dx, y: box.y + ctx.dy, width: box.width, height: box.height };
}

function drawGuides(ctx: DrawContext, page: PageLayout): void {
  const trim = shift(page.trim, ctx);
  const safe = shift(page.safe, ctx);
  ctx.page.drawRectangle({
    ...trim,
    borderColor: rgb(1, 0, 0),
    borderWidth: 0.4,
    opacity: 0,
    borderOpacity: 0.8,
  });
  ctx.page.drawRectangle({
    ...safe,
    borderColor: rgb(0, 0.5, 1),
    borderWidth: 0.4,
    opacity: 0,
    borderOpacity: 0.8,
  });
}

async function drawBlocks(
  ctx: DrawContext,
  blocks: readonly PageBlock[],
  options: { doc: PDFDocument; source: PrintImageSource; colorMode: ColorMode },
): Promise<void> {
  for (const block of blocks) {
    switch (block.kind) {
      case 'rect':
        drawRect(ctx, block);
        break;
      case 'line':
        drawLine(ctx, block);
        break;
      case 'text':
        drawText(ctx, block);
        break;
      case 'qr':
        drawQr(ctx, block);
        break;
      case 'image':
        await drawImage(ctx, block, options.source, options.doc, options.colorMode);
        break;
      default:
        break;
    }
  }
}

async function createDocument(
  layout: BookLayout,
  options: RenderOptions,
  kind: 'ic' | 'kapak' | 'onizleme',
): Promise<{ doc: PDFDocument; fonts: Map<FontRole, PDFFont> }> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);

  const fonts = new Map<FontRole, PDFFont>();
  for (const font of options.fonts.all()) {
    // subset: true — only the glyphs the book actually uses are embedded.
    fonts.set(font.role, await doc.embedFont(font.bytes, { subset: true }));
  }

  const producedAt = options.metadata?.producedAt ?? new Date();
  const label = { ic: 'iç sayfalar', kapak: 'kapak', onizleme: 'önizleme' }[kind];
  doc.setTitle(`${options.metadata?.title ?? layout.meta.titleTr} — ${label}`);
  doc.setAuthor(options.metadata?.author ?? 'KendiHikayem');
  doc.setSubject(
    options.metadata?.subject ??
      `${layout.format.titleTr} · ${layout.format.pageCount} sayfa · sırt ${layout.spine.spineMm.toFixed(1)} mm`,
  );
  doc.setKeywords(options.metadata?.keywords ?? [layout.meta.formatCode, kind]);
  doc.setProducer(PRODUCER);
  doc.setCreator(PRODUCER);
  doc.setCreationDate(producedAt);
  doc.setModificationDate(producedAt);
  return { doc, fonts };
}

/** MediaBox = BleedBox = sheet, TrimBox = cut size. The order POD validators check. */
function applyBoxes(page: PDFPage, canvas: RectPt, trim: RectPt): void {
  page.setMediaBox(canvas.x, canvas.y, canvas.width, canvas.height);
  page.setCropBox(canvas.x, canvas.y, canvas.width, canvas.height);
  page.setBleedBox(canvas.x, canvas.y, canvas.width, canvas.height);
  page.setTrimBox(trim.x, trim.y, trim.width, trim.height);
}

/* ── interior ──────────────────────────────────────────────────────────────── */

export async function renderInterior(
  layout: BookLayout,
  options: RenderOptions,
): Promise<Uint8Array> {
  const colorMode = options.colorMode ?? layout.colorMode;
  const imposition = options.imposition ?? 'single';
  const { doc, fonts } = await createDocument(
    layout,
    options,
    imposition === 'spread' ? 'onizleme' : 'ic',
  );
  const images = new Map<string, PDFImage>();

  if (imposition === 'single') {
    for (const pageLayout of layout.interior) {
      const page = doc.addPage([pageLayout.canvas.width, pageLayout.canvas.height]);
      applyBoxes(page, pageLayout.canvas, pageLayout.trim);
      const ctx: DrawContext = { page, fonts, colorMode, dx: 0, dy: 0, images };
      await drawBlocks(ctx, pageLayout.blocks, { doc, source: options.images, colorMode });
      if (options.drawGuides) drawGuides(ctx, pageLayout);
    }
  } else {
    // Reader spreads: two trims side by side. The inner bleed is dropped — it sits in the
    // gutter, where there is nothing to cut.
    const bleed = mmToPt(layout.format.bleedMm);
    const trimW = mmToPt(layout.format.trimWidthMm);
    const sheetWidth = trimW * 2 + bleed * 2;
    const sheetHeight = mmToPt(layout.format.trimHeightMm) + bleed * 2;

    for (const spread of layout.spreads) {
      const left = layout.interior.find((p) => p.pageNo === spread.leftPageNo);
      const right = layout.interior.find((p) => p.pageNo === spread.rightPageNo);
      const page = doc.addPage([sheetWidth, sheetHeight]);
      applyBoxes(
        page,
        { x: 0, y: 0, width: sheetWidth, height: sheetHeight },
        { x: bleed, y: bleed, width: trimW * 2, height: sheetHeight - bleed * 2 },
      );
      if (left) {
        const ctx: DrawContext = { page, fonts, colorMode, dx: 0, dy: 0, images };
        await drawBlocks(ctx, left.blocks, { doc, source: options.images, colorMode });
      }
      if (right) {
        const ctx: DrawContext = { page, fonts, colorMode, dx: trimW, dy: 0, images };
        await drawBlocks(ctx, right.blocks, { doc, source: options.images, colorMode });
      }
    }
  }

  return doc.save();
}

/* ── cover ─────────────────────────────────────────────────────────────────── */

export async function renderCover(
  layout: BookLayout,
  options: RenderOptions,
): Promise<Uint8Array> {
  const colorMode = options.colorMode ?? layout.colorMode;
  const { doc, fonts } = await createDocument(layout, options, 'kapak');
  const page = doc.addPage([layout.cover.canvas.width, layout.cover.canvas.height]);
  applyBoxes(page, layout.cover.canvas, layout.cover.trim);

  const ctx: DrawContext = { page, fonts, colorMode, dx: 0, dy: 0, images: new Map() };
  await drawBlocks(ctx, layout.cover.blocks, { doc, source: options.images, colorMode });

  if (options.drawGuides) {
    for (const panel of [layout.cover.backPanel, layout.cover.spinePanel, layout.cover.frontPanel]) {
      page.drawRectangle({
        ...panel,
        borderColor: rgb(1, 0, 0),
        borderWidth: 0.4,
        opacity: 0,
        borderOpacity: 0.8,
      });
    }
  }

  return doc.save();
}
