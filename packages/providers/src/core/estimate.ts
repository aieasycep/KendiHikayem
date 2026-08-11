/**
 * core/estimate.ts — `estimateCost()`, the first step of the reservation protocol.
 *
 *   estimateCost() → cost_reservations(held) → entitlements FOR UPDATE → work → commit
 *
 * The estimate is deliberately CONSERVATIVE (it includes the ×1.4 image-QA retry
 * allowance from SPEC §6.1). An estimate that is too low lets a job start that the cap
 * should have blocked; an estimate that is too high only makes the parent wait for the
 * next period. Erring high is the cheap mistake.
 *
 * Two currencies live here and must not be confused:
 *   · USD    — internal production budget, checked against the three caps. Never shown.
 *   · CREDIT — what the parent bought. Integer, product-priced, shown in the wizard.
 * `CostPreview` in the contract carries credits; `cost_reservations.amount_usd` carries USD.
 */

import type { EstimateOperation, Tier } from '@kendihikayem/contract';

import {
  type PriceBook,
  DEFAULT_PRICE_BOOK,
  priceImageCall,
  priceLlmCall,
  priceTtsCall,
  roundUsd,
} from './pricing';

/** SPEC §6.1 reference scenario: 12 spreads, ~700 TR words, 13 images. */
export const REFERENCE_STORY = {
  pageCount: 12,
  /** 12 pages + cover. */
  imageCount: 13,
  characterSheetVariants: 3,
  /** ~5.200 characters ≈ 5 minutes of narration. */
  characters: 5200,
  outlineTokens: { input: 1000, output: 2000, cachedInput: 3000 },
  fillTokens: { input: 1000, output: 7000, cachedInput: 3000 },
  judgeTokens: { input: 2000, output: 500 },
} as const;

/** SPEC §8.3: retry budget of 2 per page works out to a ~1.4× image cost multiplier. */
export const IMAGE_RETRY_MULTIPLIER = 1.4;

export interface EstimateParams {
  pageCount?: number;
  imageCount?: number;
  /** Characters to synthesise. Defaults to the reference story. */
  characters?: number;
  tier?: Tier;
  /** `true` once a printed book is ordered — this is what unlocks 4K (SPEC §6.2 rule 1). */
  print?: boolean;
  batch?: boolean;
  /** Estimated cache hit ratio for regeneration flows (0..1). */
  cacheHitRatio?: number;
}

export interface CostEstimate {
  totalUsd: number;
  breakdownUsd: {
    llm: number;
    image: number;
    tts: number;
    other: number;
  };
  /** Integer credits charged to the parent. */
  credits: number;
  breakdownCredits: { llm: number; image: number; tts: number };
  willConsumeQuota: boolean;
}

/**
 * Credits per operation. A PRODUCT decision, not a cost calculation — deliberately coarse
 * so the wizard can show a stable number. `story_outline` is free on purpose: the skeleton
 * gate must be frictionless, because a rejection there is what keeps the average cost at
 * $0.03 instead of $4 (SPEC §6.2 rule 1).
 *
 * TODO(contract-rfc): credits-per-operation is currently a server constant. If pricing
 * experiments need it per-plan it should move to `plans.features`.
 */
const OPERATION_CREDITS: Record<EstimateOperation, { total: number; consumesQuota: boolean }> = {
  story_outline: { total: 0, consumesQuota: false },
  story_fill: { total: 1, consumesQuota: true },
  page_rewrite: { total: 0, consumesQuota: false },
  page_reillustrate: { total: 1, consumesQuota: false },
  audio_render: { total: 2, consumesQuota: false },
  book_build: { total: 3, consumesQuota: false },
  export_mp4: { total: 1, consumesQuota: false },
};

const zeroBreakdown = () => ({ llm: 0, image: 0, tts: 0, other: 0 });

/**
 * Splits integer credits across the three buckets the contract's `CostPreview` exposes,
 * proportionally to USD. Integer-safe: the remainder lands on the largest bucket so the
 * parts always sum to the whole (a mismatch is what makes a receipt look broken).
 */
function splitCredits(
  total: number,
  usd: { llm: number; image: number; tts: number },
): { llm: number; image: number; tts: number } {
  const sum = usd.llm + usd.image + usd.tts;
  if (total === 0 || sum <= 0) return { llm: 0, image: 0, tts: 0 };

  const raw = {
    llm: (usd.llm / sum) * total,
    image: (usd.image / sum) * total,
    tts: (usd.tts / sum) * total,
  };
  const floored = {
    llm: Math.floor(raw.llm),
    image: Math.floor(raw.image),
    tts: Math.floor(raw.tts),
  };
  let remainder = total - (floored.llm + floored.image + floored.tts);

  // Hand the remainder to the biggest fractional parts, largest first.
  const order: Array<'llm' | 'image' | 'tts'> = ['llm', 'image', 'tts'];
  order.sort((a, b) => raw[b] - floored[b] - (raw[a] - floored[a]));
  for (const key of order) {
    if (remainder <= 0) break;
    floored[key] += 1;
    remainder -= 1;
  }
  return floored;
}

/**
 * The single entry point. `apps/api` calls it for `POST /v1/estimates` (show the parent a
 * price) and `apps/worker` calls it for the reservation (hold the budget) — one function,
 * so the number the parent saw is the number that was reserved.
 */
export function estimateCost(
  operation: EstimateOperation,
  params: EstimateParams = {},
  book: PriceBook = DEFAULT_PRICE_BOOK,
): CostEstimate {
  const breakdown = zeroBreakdown();

  const pageCount = params.pageCount ?? REFERENCE_STORY.pageCount;
  const imageCount = params.imageCount ?? REFERENCE_STORY.imageCount;
  const characters = params.characters ?? REFERENCE_STORY.characters;
  const tier: Tier = params.tier ?? 'quality';
  const batch = params.batch ?? true;
  const resolution = params.print ? 'print_4k' : 'screen_2k';
  const cacheMiss = 1 - Math.min(Math.max(params.cacheHitRatio ?? 0, 0), 1);

  switch (operation) {
    case 'story_outline': {
      // The cheap gate. Moderation is free; the judge runs at most twice.
      breakdown.llm =
        priceLlmCall(book, 'outline', REFERENCE_STORY.outlineTokens, batch) +
        priceLlmCall(book, 'judge', REFERENCE_STORY.judgeTokens, batch) +
        priceLlmCall(book, 'character_dna', { input: 800, output: 600 }, batch);
      breakdown.other = book.moderation.perCallUsd * 3;
      break;
    }

    case 'story_fill': {
      // The expensive stage: fill + illustration prompts + style plate + sheets + pages.
      breakdown.llm =
        priceLlmCall(book, 'fill', REFERENCE_STORY.fillTokens, batch) +
        priceLlmCall(book, 'judge', REFERENCE_STORY.judgeTokens, batch) +
        priceLlmCall(book, 'illustration_prompt', { input: 1500, output: 200 * pageCount }, batch);

      const stylePlate = priceImageCall(book, 'screen_2k', 1, batch);
      const sheets = priceImageCall(book, 'print_4k', REFERENCE_STORY.characterSheetVariants, batch);
      const pages = priceImageCall(book, resolution, imageCount, batch) * IMAGE_RETRY_MULTIPLIER;
      breakdown.image = (stylePlate + sheets + pages) * cacheMiss;
      breakdown.other = book.compute.perJobUsd;
      break;
    }

    case 'page_rewrite': {
      breakdown.llm =
        priceLlmCall(book, 'page_rewrite', { input: 1200, output: 400 }, batch) +
        priceLlmCall(book, 'judge', { input: 800, output: 200 }, batch);
      break;
    }

    case 'page_reillustrate': {
      breakdown.llm = priceLlmCall(book, 'illustration_prompt', { input: 1500, output: 250 }, batch);
      breakdown.image = priceImageCall(book, resolution, 1, batch) * IMAGE_RETRY_MULTIPLIER;
      break;
    }

    case 'audio_render': {
      // The cache lever in its purest form: editing page 3 re-synthesises 1 chunk, not 12.
      breakdown.tts = priceTtsCall(book, tier, characters) * cacheMiss;
      breakdown.other =
        book.align.perMinuteUsd * (characters / 1000) + book.compute.perJobUsd;
      break;
    }

    case 'book_build': {
      // Print order: 4K regeneration of every image plus the PDF render (SPEC §8.2 step 7).
      breakdown.image = priceImageCall(book, 'print_4k', imageCount, batch) * cacheMiss;
      breakdown.other = book.compute.perJobUsd;
      break;
    }

    case 'export_mp4': {
      breakdown.other = book.compute.perJobUsd * 2;
      break;
    }
  }

  breakdown.llm = roundUsd(breakdown.llm);
  breakdown.image = roundUsd(breakdown.image);
  breakdown.tts = roundUsd(breakdown.tts);
  breakdown.other = roundUsd(breakdown.other);

  const totalUsd = roundUsd(
    breakdown.llm + breakdown.image + breakdown.tts + breakdown.other,
  );

  const credit = OPERATION_CREDITS[operation];
  return {
    totalUsd,
    breakdownUsd: breakdown,
    credits: credit.total,
    breakdownCredits: splitCredits(credit.total, breakdown),
    willConsumeQuota: credit.consumesQuota,
  };
}

/** Contract projection — exactly the `CostPreview` shape `POST /v1/estimates` returns. */
export function toCostPreview(estimate: CostEstimate): {
  credits: number;
  breakdown: { llm: number; image: number; tts: number };
  willConsumeQuota: boolean;
} {
  return {
    credits: estimate.credits,
    breakdown: estimate.breakdownCredits,
    willConsumeQuota: estimate.willConsumeQuota,
  };
}
