/**
 * preflight/index.ts — ⭐ CATCH THE PRINTER'S REJECTION BEFORE THE PARENT PAYS.
 *
 * A printer rejects a file days after the order, once the money is taken, the 4K images are
 * rendered and a delivery date has been promised to a child. Every rejection reason is
 * something we can measure ourselves, so we do — and we say it in Turkish, about a page the
 * parent recognises, with the fix implied:
 *
 *     "Masalın 3. sayfasındaki görsel düşük çözünürlüklü (168 DPI); baskıda bulanık
 *      çıkabilir. Bu sayfayı yeniden çizdirin."
 *
 * The four booleans the contract exposes (`BookBuild.checks`) are derived here, and
 * `warningsTr` is the flattened human list. `ok === false` means the order stays locked —
 * `packages/providers/print/orders/state.ts` refuses to leave `created` without it.
 *
 * Severity rule: `error` blocks the order, `warning` is shown but allows it. Anything a
 * printer would REJECT is an error; anything a parent might merely dislike is a warning.
 */

import {
  MIN_ACCEPTABLE_DPI,
  TARGET_DPI,
  edgeSlackPt,
  effectiveDpi,
  ptToMm,
  type RectPt,
} from '../units';
import { PDFDict, PDFDocument, PDFName } from 'pdf-lib';

import type { BookLayout, ImageBlock, PageLayout, QrBlock, TextBlock } from '../layout/types';
import type { FontSet } from '../fonts/registry';
import { qrPhysicalCheck } from '../qr/matrix';
import { normalizeTypographyTr } from '../text/turkish';

export type PreflightSeverity = 'error' | 'warning';

export type PreflightCode =
  | 'dusuk_cozunurluk'
  | 'gorsel_eksik'
  | 'gorsel_insan_onayinda'
  | 'tasma_payi'
  | 'guvenli_alan'
  | 'metin_sigmadi'
  | 'font_glifi_eksik'
  | 'karekod_okunmaz'
  | 'sayfa_sayisi'
  | 'hikaye_sigmadi'
  | 'renk_profili'
  | 'sirt_uyusmazligi';

export interface PreflightIssue {
  code: PreflightCode;
  severity: PreflightSeverity;
  /** Book page (1-based) the issue sits on. */
  pageNo?: number;
  /** Story page the parent knows, when the book page maps to one. */
  storyPageNo?: number;
  messageTr: string;
  detail?: Record<string, unknown>;
}

export interface PreflightReport {
  /** No errors. Warnings do not block. */
  ok: boolean;
  /** Exactly the four booleans in `BookBuild.checks`. */
  checks: {
    dpiOk: boolean;
    fontsEmbedded: boolean;
    safeZoneOk: boolean;
    bleedOk: boolean;
  };
  issues: PreflightIssue[];
  /** `BookBuild.warningsTr` — errors first, then warnings, in page order. */
  warningsTr: string[];
  stats: {
    pages: number;
    images: number;
    qrCodes: number;
    minDpi: number;
    /** Smallest distance from any text block to the safe-zone edge, in mm. */
    minSafeSlackMm: number;
  };
}

export interface PreflightOptions {
  fonts: FontSet;
  /** Warn when text comes closer than this to the safe-zone edge. */
  safeWarnMm?: number;
  /** Effective DPI below which we refuse to build at all. */
  minDpi?: number;
  targetDpi?: number;
}

const ordinalTr = (n: number): string => `${n}.`;

/**
 * 220 mm at exactly 300 DPI is 2598.4 px; whichever way the image pipeline rounds, the
 * result is a hair under or over. Half a DPI of slack keeps that rounding from producing a
 * warning on a perfectly good page.
 */
const DPI_ROUNDING_SLACK = 0.5;

/** Where the parent thinks the problem is. */
function pageLabel(page: PageLayout): string {
  if (page.pageNo === 0) return 'Kapaktaki';
  if (page.storyPageNo) return `Masalın ${ordinalTr(page.storyPageNo)} sayfasındaki`;
  if (page.kind === 'title') return 'Başlık sayfasındaki';
  if (page.kind === 'dedication') return 'İthaf sayfasındaki';
  if (page.kind === 'imprint') return 'Künye sayfasındaki';
  if (page.kind === 'memories') return 'Anı sayfasındaki';
  return `Kitabın ${ordinalTr(page.pageNo)} sayfasındaki`;
}

/**
 * Effective DPI of an image as PLACED. `cover` scales up to fill the box, so the resolution
 * that matters is the one after that scale — a 1024 px picture stretched over 216 mm is
 * 120 DPI no matter what its own metadata claims.
 */
export function placedDpi(block: ImageBlock): number {
  const dpiX = effectiveDpi(block.image.widthPx, block.box.width);
  const dpiY = effectiveDpi(block.image.heightPx, block.box.height);
  return block.fit === 'cover' ? Math.min(dpiX, dpiY) : Math.max(dpiX, dpiY);
}

function checkImage(
  page: PageLayout,
  block: ImageBlock,
  issues: PreflightIssue[],
  options: Required<Pick<PreflightOptions, 'minDpi' | 'targetDpi'>>,
  colorMode: BookLayout['colorMode'],
): number {
  const base = {
    pageNo: page.pageNo,
    ...(page.storyPageNo ? { storyPageNo: page.storyPageNo } : {}),
  };

  if (block.image.status === 'missing' || block.image.widthPx <= 0) {
    issues.push({
      ...base,
      code: 'gorsel_eksik',
      severity: 'error',
      messageTr: `${pageLabel(page)} görsel henüz üretilmemiş. Bu sayfa boş basılır; lütfen görseli yeniden üretin.`,
    });
    return 0;
  }

  if (block.image.status === 'manual_review') {
    issues.push({
      ...base,
      code: 'gorsel_insan_onayinda',
      severity: 'error',
      messageTr: `${pageLabel(page)} görsel insan onayında bekliyor. Onaylanmadan kitap baskıya gönderilemez.`,
    });
  }

  const dpi = placedDpi(block);
  if (dpi < options.minDpi) {
    issues.push({
      ...base,
      code: 'dusuk_cozunurluk',
      severity: 'error',
      messageTr: `${pageLabel(page)} görsel çok düşük çözünürlüklü (${Math.round(dpi)} DPI). Baskıda bulanık çıkar; en az ${options.targetDpi} DPI gerekir.`,
      detail: { dpi, widthPx: block.image.widthPx, heightPx: block.image.heightPx },
    });
  } else if (dpi < options.targetDpi - DPI_ROUNDING_SLACK) {
    issues.push({
      ...base,
      code: 'dusuk_cozunurluk',
      severity: 'warning',
      messageTr: `${pageLabel(page)} görsel ${Math.round(dpi)} DPI; baskı için önerilen ${options.targetDpi} DPI'nın altında. Ayrıntılar hafif yumuşak çıkabilir.`,
      detail: { dpi },
    });
  }

  if (block.fullBleed) {
    // Full-bleed art must reach the sheet edge, not the trim line: otherwise the guillotine
    // leaves a white hairline down the side of the page.
    const covers =
      block.box.x <= page.canvas.x + 0.5 &&
      block.box.y <= page.canvas.y + 0.5 &&
      block.box.x + block.box.width >= page.canvas.x + page.canvas.width - 0.5 &&
      block.box.y + block.box.height >= page.canvas.y + page.canvas.height - 0.5;
    if (!covers) {
      issues.push({
        ...base,
        code: 'tasma_payi',
        severity: 'error',
        messageTr: `${pageLabel(page)} görsel taşma payına (bleed) kadar uzanmıyor. Kesimden sonra kenarda beyaz çizgi kalır.`,
      });
    }
  }

  const imageSpace = block.image.colorSpace ?? 'srgb';
  if (colorMode === 'cmyk' && imageSpace !== 'cmyk') {
    issues.push({
      ...base,
      code: 'renk_profili',
      severity: 'warning',
      messageTr: `${pageLabel(page)} görsel RGB; matbaa CMYK istiyorsa dönüşüm baskıda yapılır ve renkler bir tık solabilir.`,
    });
  }
  if (colorMode === 'srgb' && imageSpace === 'cmyk') {
    issues.push({
      ...base,
      code: 'renk_profili',
      severity: 'warning',
      messageTr: `${pageLabel(page)} görsel CMYK; bu dosya sRGB olarak hazırlanıyor. Ekranda gördüğünüzden farklı basılabilir.`,
    });
  }

  return dpi;
}

function checkTextSafety(
  page: PageLayout,
  block: TextBlock,
  issues: PreflightIssue[],
  safeWarnMm: number,
): number {
  if (block.ignoreSafeZone) return Number.POSITIVE_INFINITY;

  // Measure the real line boxes, not the paragraph box: a centred short line does not come
  // as close to the edge as its column does.
  const lineBoxes: RectPt[] = block.lines.map((line, index) => {
    let x = block.box.x;
    if (block.align === 'center') x = block.box.x + (block.box.width - line.widthPt) / 2;
    if (block.align === 'right') x = block.box.x + block.box.width - line.widthPt;
    return {
      x,
      y: block.box.y + block.box.height - (index + 1) * block.leadingPt,
      width: line.widthPt,
      height: block.leadingPt,
    };
  });

  let worst = Number.POSITIVE_INFINITY;
  for (const lineBox of lineBoxes) {
    worst = Math.min(worst, edgeSlackPt(page.safe, lineBox));
  }
  if (!Number.isFinite(worst)) return Number.POSITIVE_INFINITY;

  const base = {
    pageNo: page.pageNo,
    ...(page.storyPageNo ? { storyPageNo: page.storyPageNo } : {}),
  };

  // Slack is measured against the safe box, so "0 mm" means the text sits exactly on the
  // safe boundary — which is where a full-width column is SUPPOSED to sit. Only leaving the
  // safe box is worth saying anything about, and how far out decides error vs warning.
  const overshootMm = worst < 0 ? -ptToMm(worst) : 0;
  if (overshootMm > safeWarnMm) {
    issues.push({
      ...base,
      code: 'guvenli_alan',
      severity: 'error',
      messageTr: `${pageLabel(page)} metin güvenli alanın ${overshootMm.toFixed(1)} mm dışına taşıyor. Ciltte veya kesimde kaybolur.`,
      detail: { slackMm: ptToMm(worst) },
    });
  } else if (overshootMm > 0) {
    issues.push({
      ...base,
      code: 'guvenli_alan',
      severity: 'warning',
      messageTr: `${pageLabel(page)} metin güvenli alanın ${overshootMm.toFixed(1)} mm dışına çıkıyor; kesim payına girmiyor ama cilde yaklaşıyor.`,
      detail: { slackMm: ptToMm(worst) },
    });
  }

  if (block.overflow) {
    issues.push({
      ...base,
      code: 'metin_sigmadi',
      severity: 'error',
      messageTr: `${pageLabel(page)} metin sayfaya sığmıyor. Metni kısaltın ya da bu sayfayı ikiye bölün.`,
    });
  }

  return worst;
}

function checkFonts(
  page: PageLayout,
  block: TextBlock,
  fonts: FontSet,
  issues: PreflightIssue[],
): void {
  const font = fonts.get(block.fontRole);
  const text = block.lines.map((line) => line.text).join(' ');
  const missing = font.missingGlyphs(normalizeTypographyTr(text));
  if (missing.length === 0) return;
  issues.push({
    pageNo: page.pageNo,
    ...(page.storyPageNo ? { storyPageNo: page.storyPageNo } : {}),
    code: 'font_glifi_eksik',
    severity: 'error',
    messageTr: `${pageLabel(page)} metinde yazı tipinin çizemediği karakterler var (${missing.join(' ')}). Baskıda kutu görünür.`,
    detail: { missing, family: font.family },
  });
}

function checkQr(page: PageLayout, block: QrBlock, issues: PreflightIssue[]): void {
  const physical = qrPhysicalCheck(
    { modules: block.modules, size: block.modules.length, url: block.url, errorCorrection: 'M' },
    block.box.width,
  );
  if (!physical.ok) {
    issues.push({
      pageNo: page.pageNo,
      ...(page.storyPageNo ? { storyPageNo: page.storyPageNo } : {}),
      code: 'karekod_okunmaz',
      severity: 'error',
      messageTr: `${pageLabel(page)} karekod okunmayabilir: ${physical.reasonTr}`,
      detail: { moduleMm: physical.moduleMm, sizeMm: physical.sizeMm },
    });
  }

  const slack = edgeSlackPt(page.safe, block.box);
  if (slack < 0) {
    issues.push({
      pageNo: page.pageNo,
      code: 'guvenli_alan',
      severity: 'error',
      messageTr: `${pageLabel(page)} karekod güvenli alanın dışına taşıyor; kesimde kırpılabilir.`,
    });
  }
}

/** Runs every check over a finished layout. Pure — no I/O, no PDF bytes needed. */
export function preflight(layout: BookLayout, options: PreflightOptions): PreflightReport {
  const issues: PreflightIssue[] = [];
  const minDpi = options.minDpi ?? MIN_ACCEPTABLE_DPI;
  const targetDpi = options.targetDpi ?? TARGET_DPI;
  const safeWarnMm = options.safeWarnMm ?? 3;

  let minDpiSeen = Number.POSITIVE_INFINITY;
  let minSlack = Number.POSITIVE_INFINITY;
  let images = 0;
  let qrCodes = 0;

  const pages = [
    ...layout.interior,
    // The cover is a page too, and it is the one the printer eyeballs first.
    {
      pageNo: 0,
      kind: 'blank' as const,
      side: 'right' as const,
      canvas: layout.cover.canvas,
      trim: layout.cover.trim,
      safe: layout.cover.trim,
      blocks: layout.cover.blocks,
    },
  ];

  for (const page of pages) {
    for (const block of page.blocks) {
      switch (block.kind) {
        case 'image': {
          images += 1;
          const dpi = checkImage(page, block, issues, { minDpi, targetDpi }, layout.colorMode);
          if (dpi > 0) minDpiSeen = Math.min(minDpiSeen, dpi);
          break;
        }
        case 'text': {
          minSlack = Math.min(minSlack, checkTextSafety(page, block, issues, safeWarnMm));
          checkFonts(page, block, options.fonts, issues);
          break;
        }
        case 'qr':
          qrCodes += 1;
          checkQr(page, block, issues);
          break;
        default:
          break;
      }
    }
  }

  // A story page with no picture block at all: the layout drew a tinted page instead, which
  // is a book with a hole in it. Catch it here — nothing else would.
  for (const page of layout.interior) {
    if (page.kind !== 'story') continue;
    if (page.blocks.some((block) => block.kind === 'image')) continue;
    issues.push({
      pageNo: page.pageNo,
      ...(page.storyPageNo ? { storyPageNo: page.storyPageNo } : {}),
      code: 'gorsel_eksik',
      severity: 'error',
      messageTr: `${pageLabel(page)} görsel henüz üretilmemiş. Bu sayfa boş basılır; lütfen görseli yeniden üretin.`,
    });
  }

  // Structural checks: these are the ones a printer's own validator runs first.
  if (layout.interior.length !== layout.format.pageCount) {
    issues.push({
      code: 'sayfa_sayisi',
      severity: 'error',
      messageTr: `Kitap ${layout.interior.length} sayfa çıktı ama bu format ${layout.format.pageCount} sayfa olmak zorunda. Matbaa bu dosyayı kabul etmez.`,
    });
  }
  if (layout.interior.length % 4 !== 0) {
    issues.push({
      code: 'sayfa_sayisi',
      severity: 'error',
      messageTr: 'Sayfa sayısı 4’ün katı değil; ciltlenebilir bir kitap oluşmuyor.',
    });
  }
  if (layout.meta.truncated) {
    issues.push({
      code: 'hikaye_sigmadi',
      severity: 'error',
      messageTr: `Masal bu formata sığmıyor: ${layout.meta.storyPageCount} sayfalık hikâye ${layout.format.pageCount} sayfalık kitaba yerleşmedi. Daha uzun bir format seçin.`,
    });
  }
  if (layout.spine.disagreementMm !== undefined) {
    issues.push({
      code: 'sirt_uyusmazligi',
      severity: 'warning',
      messageTr: `Sırt kalınlığında matbaa ile aramızda ${layout.spine.disagreementMm.toFixed(2)} mm fark var; matbaanın değeri kullanıldı.`,
    });
  }

  // One line per problem per page: a reading-log page with 8 rows must not shout eight
  // times. Errors win over warnings for the same (code, page).
  const deduped = new Map<string, PreflightIssue>();
  for (const issue of issues) {
    const key = `${issue.code}|${issue.pageNo ?? '-'}`;
    const existing = deduped.get(key);
    if (!existing || (existing.severity === 'warning' && issue.severity === 'error')) {
      deduped.set(key, issue);
    }
  }
  const unique = [...deduped.values()];

  const errors = unique.filter((issue) => issue.severity === 'error');
  const byCode = (code: PreflightCode): boolean =>
    !errors.some((issue) => issue.code === code);

  const sorted = [...unique].sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'error' ? -1 : 1;
    return (a.pageNo ?? 0) - (b.pageNo ?? 0);
  });

  return {
    ok: errors.length === 0,
    checks: {
      dpiOk: byCode('dusuk_cozunurluk') && byCode('gorsel_eksik') && byCode('gorsel_insan_onayinda'),
      fontsEmbedded: byCode('font_glifi_eksik'),
      safeZoneOk: byCode('guvenli_alan') && byCode('metin_sigmadi'),
      bleedOk: byCode('tasma_payi') && byCode('sayfa_sayisi'),
    },
    issues: sorted,
    warningsTr: sorted.map((issue) => issue.messageTr),
    stats: {
      pages: layout.interior.length,
      images,
      qrCodes,
      minDpi: Number.isFinite(minDpiSeen) ? Math.round(minDpiSeen) : 0,
      minSafeSlackMm: Number.isFinite(minSlack) ? Number(ptToMm(minSlack).toFixed(2)) : 0,
    },
  };
}

/**
 * Structural check on RENDERED bytes: does every font descriptor in the file carry an
 * embedded font program? The layout-level check proves the glyphs exist; this proves the
 * renderer wrote the programs into the file, which is the single most common POD rejection.
 *
 * Parses the object graph rather than scanning bytes — pdf-lib writes object streams, so a
 * text scan for `/FontFile2` finds nothing even when the fonts are perfectly embedded.
 */
export async function inspectRenderedFonts(pdf: Uint8Array): Promise<{
  embeddedFontPrograms: number;
  fontDescriptors: number;
  families: string[];
  allEmbedded: boolean;
}> {
  const doc = await PDFDocument.load(pdf, { updateMetadata: false });
  const families = new Set<string>();
  let embeddedFontPrograms = 0;
  let fontDescriptors = 0;

  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFDict)) continue;

    const baseFont = object.get(PDFName.of('BaseFont'));
    if (baseFont instanceof PDFName) families.add(baseFont.asString().replace(/^\//, ''));

    const type = object.get(PDFName.of('Type'));
    if (!(type instanceof PDFName) || type.asString() !== '/FontDescriptor') continue;

    fontDescriptors += 1;
    const hasProgram = ['FontFile', 'FontFile2', 'FontFile3'].some(
      (key) => object.get(PDFName.of(key)) !== undefined,
    );
    if (hasProgram) embeddedFontPrograms += 1;
  }

  return {
    embeddedFontPrograms,
    fontDescriptors,
    families: [...families].sort(),
    allEmbedded: fontDescriptors > 0 && embeddedFontPrograms === fontDescriptors,
  };
}

/** Guard used by the order flow: the build must be clean before money is taken. */
export function assertPrintable(report: PreflightReport): void {
  if (report.ok) return;
  const first = report.issues.find((issue) => issue.severity === 'error');
  throw new PreflightBlockedError(first?.messageTr ?? 'Baskı ön kontrolü geçilemedi.', report);
}

export class PreflightBlockedError extends Error {
  constructor(
    messageTr: string,
    readonly report: PreflightReport,
  ) {
    super(messageTr);
    this.name = 'PreflightBlockedError';
  }
}
