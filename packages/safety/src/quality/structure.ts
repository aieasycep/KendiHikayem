/**
 * quality/structure.ts — the shape of the book, not the shape of its sentences.
 *
 * Two rules here are load-bearing product rules rather than style preferences:
 *
 *   · REFRAIN AT 0-2. A book for a toddler is a rhythm, not a plot: the same phrase must
 *     come back on nearly every page (`BABY_STORY` in packages/mock is the reference —
 *     "İyi geceler" on seven of eight pages). Without it the "0-2" band is just a short
 *     3-5 book, which is the failure mode this whole band exists to prevent.
 *   · NO UNRESOLVED ENDING. SPEC §10.4's matrix marks "çözümsüz son" ❌ for every band we
 *     ship. A bedtime story that ends on a cliffhanger is a bedtime story that does not
 *     end bedtime.
 */

import type { AgeBand } from '@kendihikayem/contract';
import { countWords, toLowerTr, words } from '@kendihikayem/shared';

import { SAFETY_MESSAGES_TR } from '../messages.tr';
import type { SafetyViolation } from '../types';

/** Bands that must have a repeated phrase, and how strictly. */
const REFRAIN_RULE: Record<AgeBand, { required: boolean; minPageRatio: number }> = {
  '0-2': { required: true, minPageRatio: 0.5 },
  '3-5': { required: false, minPageRatio: 0.25 },
  '6-8': { required: false, minPageRatio: 0 },
};

/** A closing page containing one of these is asking the reader to wait for more. */
const CLIFFHANGER_MARKERS = [
  'devam edecek',
  'peki ya',
  'acaba ne olacak',
  'kim bilir',
  'sonra ne oldu',
  'bilmiyordu ama',
];

/** A warm close. Missing one is a warning: the product is a bedtime product. */
const WARM_CLOSE_MARKERS = [
  'iyi geceler',
  'uyudu',
  'uykuya',
  'sarıldı',
  'gülümsedi',
  'mutluydu',
  'huzur',
  'güvende',
  'sıcacık',
  'yanındaydı',
  'sevgi',
  'tatlı rüyalar',
];

export const MAX_TITLE_WORDS = 6;

/**
 * How often the child's own name should appear across the book.
 *
 * Lower for 0-2 on purpose, and the reference text is why: `BABY_STORY` names Deniz on two
 * of eight pages because the other six belong to the refrain ("İyi geceler ay / kuşlar /
 * kedi…"). Holding a lullaby to a storybook's name density would fail a correct book.
 */
const MIN_HERO_PAGE_RATIO: Record<AgeBand, number> = {
  '0-2': 0.2,
  '3-5': 0.3,
  '6-8': 0.3,
};

export interface StructureInput {
  ageBand: AgeBand;
  heroName: string;
  titleTr?: string | undefined;
  pages: ReadonlyArray<{ pageNo: number; textTr: string }>;
}

export interface StructureResult {
  violations: SafetyViolation[];
  /** The detected refrain, for the ops view and for the regeneration prompt. */
  refrain?: string;
  heroNamePageRatio: number;
}

export function checkStructure(input: StructureInput): StructureResult {
  const violations: SafetyViolation[] = [];
  const pages = input.pages;
  if (pages.length === 0) return { violations, heroNamePageRatio: 0 };

  /* ── refrain ──────────────────────────────────────────────────────────── */
  const rule = REFRAIN_RULE[input.ageBand];
  const refrain = findRefrain(pages.map((page) => page.textTr), rule.minPageRatio);
  if (rule.required && !refrain) {
    violations.push(
      build('REFRAIN_MISSING', 'block', `${input.ageBand} bandında her sayfada dönen nakarat yok`),
    );
  } else if (!rule.required && rule.minPageRatio > 0 && !refrain) {
    violations.push(
      build('REFRAIN_MISSING', 'flag', `${input.ageBand}: tekrar eden bir yapı bulunamadı`),
    );
  }

  /* ── ending ───────────────────────────────────────────────────────────── */
  const lastPage = pages[pages.length - 1];
  if (lastPage) {
    const lower = toLowerTr(lastPage.textTr);
    const cliffhanger = CLIFFHANGER_MARKERS.find((marker) => lower.includes(marker));
    if (cliffhanger) {
      violations.push(
        build('UNRESOLVED_ENDING', 'block', `son sayfada askıda bırakan ifade: "${cliffhanger}"`, lastPage.pageNo),
      );
    } else if (lower.trim().endsWith('?')) {
      violations.push(
        build('UNRESOLVED_ENDING', 'block', 'son sayfa soruyla bitiyor', lastPage.pageNo),
      );
    } else if (!WARM_CLOSE_MARKERS.some((marker) => lower.includes(marker))) {
      violations.push(
        build('UNRESOLVED_ENDING', 'flag', 'son sayfada sıcak kapanış işareti yok', lastPage.pageNo),
      );
    }
  }

  /* ── title ────────────────────────────────────────────────────────────── */
  if (input.titleTr && countWords(input.titleTr) > MAX_TITLE_WORDS) {
    violations.push(
      build('TITLE_TOO_LONG', 'flag', `${countWords(input.titleTr)} kelime (üst sınır ${MAX_TITLE_WORDS})`),
    );
  }

  /* ── the child is actually in their own book ──────────────────────────── */
  const heroLower = toLowerTr(input.heroName.trim());
  const pagesWithHero = pages.filter((page) => toLowerTr(page.textTr).includes(heroLower)).length;
  const heroNamePageRatio = pagesWithHero / pages.length;
  if (heroLower !== '' && pagesWithHero === 0) {
    violations.push(
      build('HERO_NAME_MISSING', 'block', `"${input.heroName}" hiçbir sayfada geçmiyor`),
    );
  } else if (heroLower !== '' && heroNamePageRatio < MIN_HERO_PAGE_RATIO[input.ageBand]) {
    violations.push(
      build(
        'HERO_NAME_MISSING',
        'flag',
        `"${input.heroName}" sayfaların yalnızca %${Math.round(heroNamePageRatio * 100)}'inde geçiyor`,
      ),
    );
  }

  return {
    violations,
    ...(refrain ? { refrain } : {}),
    heroNamePageRatio,
  };
}

function build(
  code: 'REFRAIN_MISSING' | 'UNRESOLVED_ENDING' | 'TITLE_TOO_LONG' | 'HERO_NAME_MISSING',
  severity: 'flag' | 'block',
  detail: string,
  pageNo?: number,
): SafetyViolation {
  return {
    code,
    engine: 'deterministic',
    severity,
    messageTr: SAFETY_MESSAGES_TR[code],
    detail,
    ...(pageNo !== undefined ? { pageNo } : {}),
  };
}

/**
 * Longest word sequence (2-5 words) that appears on at least `minRatio` of the pages.
 * Deliberately naive: a refrain IS a literal repetition, and anything cleverer would start
 * finding "structure" in coincidence.
 */
export function findRefrain(pageTexts: readonly string[], minRatio: number): string | undefined {
  if (minRatio <= 0 || pageTexts.length < 2) return undefined;
  const needed = Math.max(2, Math.ceil(pageTexts.length * minRatio));
  const normalized = pageTexts.map((text) => words(toLowerTr(text)));

  let best: string | undefined;
  for (let size = 5; size >= 2; size -= 1) {
    const counts = new Map<string, number>();
    for (const pageWords of normalized) {
      const seenOnPage = new Set<string>();
      for (let start = 0; start + size <= pageWords.length; start += 1) {
        const gram = pageWords.slice(start, start + size).join(' ');
        if (seenOnPage.has(gram)) continue;
        seenOnPage.add(gram);
        counts.set(gram, (counts.get(gram) ?? 0) + 1);
      }
    }
    for (const [gram, count] of counts) {
      if (count >= needed) {
        best = gram;
        break;
      }
    }
    if (best) break;
  }
  return best;
}
