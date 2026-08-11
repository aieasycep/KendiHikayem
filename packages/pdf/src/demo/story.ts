/**
 * demo/story.ts — the demo book, wired from the frozen fixtures.
 *
 * The sample story ("Elif ve Tavan Arasındaki Işık", 12 pages) and the 12 demo
 * illustrations already ship in the repo, so the print pipeline can be exercised end to end
 * with REAL Turkish text and REAL pictures long before a paying order exists. That is the
 * difference between "the code compiles" and "we have held the book".
 *
 * The illustrations are 1024 px demo compositions, i.e. ~120 DPI at 21 cm — deliberately
 * NOT print resolution. The honest build therefore fails preflight, which is exactly what
 * we want to be able to demonstrate; `upscale` simulates what A4's 4K pipeline will deliver.
 */

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Subpath import on purpose: `@kendihikayem/mock` pulls the whole ts-rest contract into
// the type graph, and this file only needs the frozen sample text.
import { SAMPLE_STORY, SAMPLE_STORY_PAGES } from '@kendihikayem/mock/fixtures/story-text';

import { KARE21_24_SERT, pageCanvasMm } from '../formats';
import { calculateSpine, coverGeometry } from '../spine';
import { mmToPx, ptToPx } from '../units';
import type { BookBuildInput } from '../layout/engine';
import type { PrintImageRef } from '../layout/types';

const HERE = dirname(fileURLToPath(import.meta.url));

/** `apps/mobile/assets/demo` — read as FILES, never imported as a module (boundary rule). */
export const DEMO_ASSET_DIR = resolve(HERE, '../../../../apps/mobile/assets/demo');

export const demoAssetPath = (file: string): string => join(DEMO_ASSET_DIR, file);

export interface DemoStoryOptions {
  /**
   * `true` pretends A4's 4K pipeline already ran: every image is described at the exact
   * pixel size its box needs for 300 DPI. `false` uses the real 1024 px demo assets, which
   * is what makes the preflight refuse the book.
   */
  printReady: boolean;
  dedicationTr?: string;
  qr?: { enabled: boolean; baseUrl: string; renditionLabelTr?: string };
  orderNo?: string;
}

/** Native pixel size of the demo compositions in `apps/mobile/assets/demo`. */
export const DEMO_ASSET_PX = 1024;

/** Pixels a full-bleed interior page needs at 300 DPI (220 mm → 2598 px). */
export const PRINT_PAGE_PX = mmToPx(pageCanvasMm(KARE21_24_SERT).widthMm);

/** The cover sheet is much wider than a page: back + spine + front + wrap + bleed. */
export function printCoverPx(): { widthPx: number; heightPx: number } {
  const geometry = coverGeometry(KARE21_24_SERT, calculateSpine(KARE21_24_SERT).spineMm);
  return {
    widthPx: ptToPx(geometry.canvas.width),
    heightPx: ptToPx(geometry.canvas.height),
  };
}

/** Builds the `BookBuildInput` for the demo story. */
export function demoBookInput(options: DemoStoryOptions): BookBuildInput {
  const pagePx = options.printReady ? PRINT_PAGE_PX : DEMO_ASSET_PX;
  const cover = options.printReady
    ? printCoverPx()
    : { widthPx: DEMO_ASSET_PX, heightPx: DEMO_ASSET_PX };

  const imageRef = (file: string, size = { widthPx: pagePx, heightPx: pagePx }): PrintImageRef => ({
    ref: demoAssetPath(file),
    widthPx: size.widthPx,
    heightPx: size.heightPx,
    mimeType: 'image/jpeg',
    colorSpace: 'srgb',
    status: 'ready',
  });

  return {
    formatCode: 'kare21_24_sert',
    story: {
      titleTr: SAMPLE_STORY.titleTr,
      heroName: SAMPLE_STORY.heroName,
      ageBand: SAMPLE_STORY.ageBand,
      lessonTr: SAMPLE_STORY.lessonTr,
      blurbTr: SAMPLE_STORY.blurbTr,
    },
    pages: SAMPLE_STORY_PAGES.map((page) => ({
      pageNo: page.pageNo,
      textTr: page.textTr,
      image: imageRef(`elif-sayfa-${String(page.pageNo).padStart(2, '0')}.webp`),
    })),
    coverImage: imageRef('elif-kapak.webp', cover),
    ...(options.dedicationTr ? { dedicationTr: options.dedicationTr } : {}),
    imprint: {
      ...(options.orderNo ? { orderNo: options.orderNo } : {}),
      buildId: 'demo',
      revision: 1,
      producedAt: new Date('2026-08-11T09:00:00Z'),
      printerTr: 'Demo — matbaaya gönderilmedi',
    },
    ...(options.qr
      ? {
          qr: {
            enabled: options.qr.enabled,
            baseUrl: options.qr.baseUrl,
            ...(options.qr.renditionLabelTr
              ? { renditionLabelTr: options.qr.renditionLabelTr }
              : {}),
          },
        }
      : {}),
    colorMode: 'srgb',
  };
}
