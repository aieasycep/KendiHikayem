/**
 * core/pricing.ts — the price book.
 *
 * Rows are keyed by LOGICAL PURPOSE, never by model id: `eslint.config.mjs` rejects a
 * hardcoded model name outright (SPEC §3 rule 6), and more importantly the model behind
 * `llm.fill` is a config value that changes without this file changing.
 *
 * Sourced from SPEC §6.1 and cross-checked against published per-MTok list prices
 * (2026-06 snapshot). Two multipliers matter as much as the base rates:
 *
 *   · prompt cache read ≈ 0.10 × input  — SPEC §6.2 rule 2 makes caching mandatory;
 *     a sustained `cachedInput = 0` means a silent invalidator, which is an alarm.
 *   · batch ≈ 0.50 × everything         — SPEC §6.2 rule 3: book generation is async,
 *     so the latency-insensitive paths take the discount by default.
 *
 * ⚠️ These are ESTIMATES used for reservations. `provider_usage` records what the vendor
 * actually billed; the reconcile scheduler compares the two. When they diverge, this table
 * is wrong — not the ledger.
 */

/** USD per 1,000,000 tokens. */
export interface LlmRate {
  inputPerMTokUsd: number;
  outputPerMTokUsd: number;
  /** Prompt-cache read rate. ~10% of input on every vendor we route to. */
  cachedInputPerMTokUsd: number;
}

/** Which stage the row prices. Mirrors `LlmPurpose` in core/adapters.ts. */
export type LlmPriceKey =
  | 'outline'
  | 'fill'
  | 'judge'
  | 'character_dna'
  | 'illustration_prompt'
  | 'page_rewrite';

export interface ImageRate {
  perImageUsd: number;
}

export interface TtsRate {
  per1kCharsUsd: number;
}

export interface PriceBook {
  llm: Record<LlmPriceKey, LlmRate>;
  /** Keyed by `ImageResolution`. 4K is ~1.8× 2K — the whole reason 4K waits for an order. */
  image: Record<'preview_1k' | 'screen_2k' | 'print_4k', ImageRate>;
  /** Keyed by `Tier`. */
  tts: Record<'draft' | 'quality', TtsRate>;
  moderation: { perCallUsd: number };
  align: { perMinuteUsd: number };
  /** ffmpeg + PDF render on our own compute — small but not zero (SPEC §6.1). */
  compute: { perJobUsd: number };
  /** Multiplier applied when `batch: true`. */
  batchMultiplier: number;
}

/**
 * The shipped default. Overridable per environment so a price change is a config edit,
 * not a deploy — `apps/worker` passes whatever `packages/config` resolved.
 */
export const DEFAULT_PRICE_BOOK: PriceBook = {
  llm: {
    /** Stage 1 skeleton — mid-tier model. */
    outline: { inputPerMTokUsd: 3, outputPerMTokUsd: 15, cachedInputPerMTokUsd: 0.3 },
    /** Stage 2 fill — the flagship. ~$0.178/book at 4k in / 7k out with caching. */
    fill: { inputPerMTokUsd: 5, outputPerMTokUsd: 25, cachedInputPerMTokUsd: 0.5 },
    /** Age-rubric judge — the cheap tier. */
    judge: { inputPerMTokUsd: 1, outputPerMTokUsd: 5, cachedInputPerMTokUsd: 0.1 },
    character_dna: { inputPerMTokUsd: 3, outputPerMTokUsd: 15, cachedInputPerMTokUsd: 0.3 },
    illustration_prompt: { inputPerMTokUsd: 3, outputPerMTokUsd: 15, cachedInputPerMTokUsd: 0.3 },
    page_rewrite: { inputPerMTokUsd: 5, outputPerMTokUsd: 25, cachedInputPerMTokUsd: 0.5 },
  },
  image: {
    preview_1k: { perImageUsd: 0.035 },
    screen_2k: { perImageUsd: 0.067 },
    print_4k: { perImageUsd: 0.12 },
  },
  tts: {
    draft: { per1kCharsUsd: 0.055 },
    quality: { per1kCharsUsd: 0.165 },
  },
  moderation: { perCallUsd: 0 },
  align: { perMinuteUsd: 0.002 },
  compute: { perJobUsd: 0.02 },
  batchMultiplier: 0.5,
};

/* ── Priced helpers ────────────────────────────────────────────────────────── */

export interface LlmTokenCounts {
  input: number;
  output: number;
  cachedInput?: number;
}

/**
 * Prices one LLM call. `cachedInput` tokens are billed at the cache-read rate and are
 * NOT double-counted in `input` — the caller passes uncached input in `input`.
 */
export function priceLlmCall(
  book: PriceBook,
  key: LlmPriceKey,
  tokens: LlmTokenCounts,
  batch = false,
): number {
  const rate = book.llm[key];
  const multiplier = batch ? book.batchMultiplier : 1;
  const cached = tokens.cachedInput ?? 0;
  const usd =
    (tokens.input * rate.inputPerMTokUsd +
      cached * rate.cachedInputPerMTokUsd +
      tokens.output * rate.outputPerMTokUsd) /
    1_000_000;
  return usd * multiplier;
}

export function priceImageCall(
  book: PriceBook,
  resolution: keyof PriceBook['image'],
  count = 1,
  batch = false,
): number {
  return book.image[resolution].perImageUsd * count * (batch ? book.batchMultiplier : 1);
}

export function priceTtsCall(
  book: PriceBook,
  tier: keyof PriceBook['tts'],
  characters: number,
): number {
  return (book.tts[tier].per1kCharsUsd * characters) / 1000;
}

/** Rounds to `provider_usage.cost_usd` precision (numeric(10,5)). */
export function roundUsd(value: number, decimals = 5): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
