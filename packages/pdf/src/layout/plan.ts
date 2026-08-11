/**
 * layout/plan.ts — which book page carries what.
 *
 * A printed block has a FIXED page count (24 for the MVP format) because a press sheet
 * folds into four pages. The story, however, is 6–16 pages depending on the age band. The
 * plan is what reconciles the two, and it must come out EXACTLY right: 23 pages is not a
 * book, and eight blank pages at the back is not a book anyone wants to keep.
 *
 * Order:
 *
 *   p1  başlık            title page
 *   p2  ithaf             dedication (decorative when the parent wrote none)
 *   p3… hikâye            the story — one page each, or a picture page + a text page when
 *                         the format has room (short 0-2 stories get the roomier rhythm)
 *   …   son               closing page
 *   …   anı sayfası       the whole-book QR + "bu masal senin için yazıldı"
 *   …   okuma günlüğü     reading log — the parent notes who read it and when
 *   pN  künye             imprint: order no, build revision, production date, legal notes
 *
 * The reading log is not filler for its own sake: it is the "anı biriktirme" the product
 * sells, and it is what makes the arithmetic land on an exact multiple of four without
 * inserting blank paper.
 */

import type { PageKind } from './types';

/** Fixed pages that always exist: title, dedication, closing, imprint. */
const FIXED_PAGES = 4;
/** The reading log stops being charming past this many pages. */
const MAX_READING_LOG_PAGES = 8;

export interface PagePlanEntry {
  pageNo: number;
  kind: PageKind;
  /** 1-based story page this book page belongs to. */
  storyPageNo?: number;
  /** In two-page rhythm, whether this is the picture half or the text half. */
  half?: 'picture' | 'text';
}

export interface PagePlan {
  entries: PagePlanEntry[];
  pageCount: number;
  pagesPerStoryPage: 1 | 2;
  readingLogPages: number;
  blankPages: number;
  /** Story pages that did not fit — the build reports them instead of silently dropping. */
  droppedStoryPages: number[];
}

export class PagePlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PagePlanError';
  }
}

/**
 * Builds the plan for `storyPageCount` story pages inside a `pageCount`-page block.
 *
 * @throws PagePlanError when `pageCount` is not a positive multiple of four.
 */
export function planPages(storyPageCount: number, pageCount: number): PagePlan {
  if (!Number.isInteger(pageCount) || pageCount <= 0 || pageCount % 4 !== 0) {
    throw new PagePlanError(`interior page count must be a positive multiple of 4, got ${pageCount}`);
  }
  if (!Number.isInteger(storyPageCount) || storyPageCount <= 0) {
    throw new PagePlanError(`story page count must be a positive integer, got ${storyPageCount}`);
  }

  const available = pageCount - FIXED_PAGES;
  if (available < 1) throw new PagePlanError(`format too short for a book: ${pageCount} pages`);

  // Two pages per story page (picture + text) only when the block can carry it AND still
  // leave room for the memories page.
  const pagesPerStoryPage: 1 | 2 = available - 1 >= storyPageCount * 2 ? 2 : 1;

  const droppedStoryPages: number[] = [];
  let usedStoryPages = storyPageCount;
  if (usedStoryPages * pagesPerStoryPage > available) {
    usedStoryPages = Math.floor(available / pagesPerStoryPage);
    for (let pageNo = usedStoryPages + 1; pageNo <= storyPageCount; pageNo += 1) {
      droppedStoryPages.push(pageNo);
    }
  }

  const storyPages = usedStoryPages * pagesPerStoryPage;
  let spare = available - storyPages;

  const memoriesPages = spare > 0 ? 1 : 0;
  spare -= memoriesPages;
  const readingLogPages = Math.min(spare, MAX_READING_LOG_PAGES);
  spare -= readingLogPages;
  const blankPages = spare;

  const entries: PagePlanEntry[] = [];
  const push = (kind: PageKind, extra: Omit<PagePlanEntry, 'pageNo' | 'kind'> = {}): void => {
    entries.push({ pageNo: entries.length + 1, kind, ...extra });
  };

  push('title');
  push('dedication');
  for (let storyPageNo = 1; storyPageNo <= usedStoryPages; storyPageNo += 1) {
    if (pagesPerStoryPage === 2) {
      push('story', { storyPageNo, half: 'picture' });
      push('story_text', { storyPageNo, half: 'text' });
    } else {
      push('story', { storyPageNo });
    }
  }
  push('closing');
  for (let i = 0; i < memoriesPages; i += 1) push('memories');
  for (let i = 0; i < readingLogPages; i += 1) push('reading_log');
  for (let i = 0; i < blankPages; i += 1) push('blank');
  push('imprint');

  if (entries.length !== pageCount) {
    // Defensive: the arithmetic above must land exactly, or the printer rejects the file.
    throw new PagePlanError(
      `page plan produced ${entries.length} pages for a ${pageCount}-page format`,
    );
  }

  return {
    entries,
    pageCount,
    pagesPerStoryPage,
    readingLogPages,
    blankPages,
    droppedStoryPages,
  };
}
