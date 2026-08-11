/**
 * @kendihikayem/pdf — print-ready book production.
 *
 * Owner: A6 (SPEC §12). The pipeline in one line:
 *
 *     buildLayout()  →  preflight()  →  renderInterior() / renderCover()
 *       pure geometry    pure checks     pdf-lib bytes (fonts subset-embedded, boxes set)
 *
 * `buildPrintFiles` is the facade the worker calls: it produces the three files an order
 * needs (interior, cover, parent-facing preview) together with the preflight report that
 * decides whether the order may be placed at all.
 *
 * Nothing here talks to a vendor. Page images arrive through `PrintImageSource`, which
 * `packages/media` (A4) implements; the print partner lives behind `PrintAdapter` in
 * `packages/providers`.
 */

export const PACKAGE_NAME = '@kendihikayem/pdf' as const;

export * from './units';
export * from './formats';
export * from './spine';
export * from './text/turkish';
export * from './text/typeset';
export * from './fonts/registry';
export * from './layout/types';
export * from './layout/theme';
export * from './layout/plan';
export * from './layout/engine';
export * from './qr/token';
export * from './qr/matrix';
export * from './images/source';
export * from './images/media';
export * from './render/color';
export * from './render/pdf';
export * from './preflight/index';
export * from './ghostscript/pdfx';

import { buildLayout, type BookBuildInput } from './layout/engine';
import { loadFontSet } from './fonts/registry';
import { preflight, type PreflightReport } from './preflight/index';
import { renderCover, renderInterior, type RenderOptions } from './render/pdf';
import type { BookLayout } from './layout/types';
import type { PrintImageSource } from './images/source';

export interface BuildPrintFilesOptions {
  images: PrintImageSource;
  /** Skip the preview PDF when only the printer files are wanted (saves a render pass). */
  includePreview?: boolean;
  /** Render the printer files even when the preflight failed — ops uses this to look. */
  renderOnFailure?: boolean;
  colorMode?: RenderOptions['colorMode'];
  metadata?: RenderOptions['metadata'];
  drawGuides?: boolean;
  fontDir?: string;
}

export interface PrintFilesResult {
  layout: BookLayout;
  preflight: PreflightReport;
  /** Undefined when the preflight failed and `renderOnFailure` was not set. */
  interiorPdf?: Uint8Array;
  coverPdf?: Uint8Array;
  /** Reader spreads — what B02 shows the parent. */
  previewPdf?: Uint8Array;
}

/**
 * One call: lay out, check, render. The preflight runs BEFORE any rendering, so a book that
 * cannot be printed costs one pass of pure arithmetic instead of three PDF renders and a
 * dozen image downloads.
 */
export async function buildPrintFiles(
  input: BookBuildInput,
  options: BuildPrintFilesOptions,
): Promise<PrintFilesResult> {
  const fonts = input.fonts ?? loadFontSet(options.fontDir);
  const layout = buildLayout({ ...input, fonts });
  const report = preflight(layout, { fonts });

  if (!report.ok && !options.renderOnFailure) {
    return { layout, preflight: report };
  }

  const renderOptions: RenderOptions = {
    images: options.images,
    fonts,
    ...(options.colorMode ? { colorMode: options.colorMode } : {}),
    ...(options.metadata ? { metadata: options.metadata } : {}),
    ...(options.drawGuides ? { drawGuides: true } : {}),
  };

  const interiorPdf = await renderInterior(layout, { ...renderOptions, imposition: 'single' });
  const coverPdf = await renderCover(layout, renderOptions);
  const previewPdf =
    options.includePreview === false
      ? undefined
      : await renderInterior(layout, { ...renderOptions, imposition: 'spread' });

  return {
    layout,
    preflight: report,
    interiorPdf,
    coverPdf,
    ...(previewPdf ? { previewPdf } : {}),
  };
}
