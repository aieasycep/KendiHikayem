/**
 * llm/factory.ts — TWO env vars decide who writes the story, and neither is in code.
 *
 *   API_MODE=mock            → MockStoryLlmAdapter, no key, deterministic Turkish
 *   API_MODE=live +
 *     LLM_PROVIDER_PRIMARY=gemini     → GeminiLlmAdapter   ⭐ default: the free tier
 *                          =anthropic → AnthropicLlmAdapter
 *                          =openai    → OpenAiLlmAdapter
 *
 * ⭐ WHY GEMINI IS THE DEFAULT. Not a quality judgement — Google AI Studio is the only
 * major vendor with a genuinely free tier, and this product has to reach the store before it
 * can earn the money to pay for a better one. Both paid adapters stay fully wired: moving to
 * the paid tier is `LLM_PROVIDER_PRIMARY=anthropic` plus that vendor's key, with no code
 * change and no model id to hunt down (they are already in `packages/config`).
 *
 * `packages/config` refuses to boot in `live` without the SELECTED provider's key
 * (superRefine), so a misconfiguration is a startup message naming the variable rather than
 * a 3am failure halfway through a paid generation.
 */

import type { Env } from '@kendihikayem/config';

import type { LlmAdapter, LlmPurpose } from '../core/adapters';
import type { ModerationAdapter } from '../core/adapters';
import { DEFAULT_PRICE_BOOK, FREE_TIER_PRICE_BOOK, type PriceBook } from '../core/pricing';
import { RequestPacer, minIntervalMsForRpm } from '../google/pacing';
import { AnthropicLlmAdapter } from './anthropic';
import { GeminiLlmAdapter } from './gemini';
import { MockStoryLlmAdapter } from './mock-story';
import { OpenAiLlmAdapter } from './openai';
import { OpenAiModerationAdapter } from '../moderation/openai';
import type { FetchLike } from './http';
import type { LlmEffort, PurposeProfile } from './types';

export interface LlmRouteOptions {
  env: Env;
  priceBook?: PriceBook;
  /** Injected by tests to replay recorded vendor responses. */
  fetchImpl?: FetchLike;
  /** Forces the mock adapter regardless of `API_MODE` (used by the e2e pipeline test). */
  forceMock?: boolean;
  /** Injected by tests so free-tier pacing does not actually sleep. */
  pacer?: RequestPacer;
}

/**
 * Which price book the adapters meter with.
 *
 * ⚠️ `PROVIDER_COST_TIER=free` OVERRIDES a caller-supplied book, deliberately. The cost tier
 * is a property of the ACCOUNT, not of the call site: on a free tier every rate genuinely is
 * zero, and a caller passing list prices would fill `provider_usage.cost_usd` with money
 * nobody spent — which then trips `COST_CAP_DAILY_USD` and blocks parents over an imaginary
 * bill. `billed_units` stays real either way, so quota consumption is still measured.
 */
export function priceBookFromEnv(env: Env, override?: PriceBook): PriceBook {
  if (env.PROVIDER_COST_TIER === 'free') return FREE_TIER_PRICE_BOOK;
  return override ?? DEFAULT_PRICE_BOOK;
}

/** Model id per stage, straight from config. No literal ever appears in code. */
function modelsFor(env: Env): Record<LlmPurpose, string> {
  return {
    outline: env.LLM_MODEL_OUTLINE,
    fill: env.LLM_MODEL_FILL,
    judge: env.LLM_MODEL_JUDGE,
    // These three are cheap, structured tasks; they ride the outline-tier model.
    character_dna: env.LLM_MODEL_OUTLINE,
    illustration_prompt: env.LLM_MODEL_OUTLINE,
    page_rewrite: env.LLM_MODEL_OUTLINE,
  };
}

function fallbackModelsFor(env: Env): Record<LlmPurpose, string> {
  return {
    outline: env.LLM_MODEL_FALLBACK_OUTLINE,
    fill: env.LLM_MODEL_FALLBACK_FILL,
    judge: env.LLM_MODEL_FALLBACK_JUDGE,
    character_dna: env.LLM_MODEL_FALLBACK_OUTLINE,
    illustration_prompt: env.LLM_MODEL_FALLBACK_OUTLINE,
    page_rewrite: env.LLM_MODEL_FALLBACK_OUTLINE,
  };
}

/** The Gemini text route's model ids. Kept separate so switching back is one variable. */
function geminiModelsFor(env: Env): Record<LlmPurpose, string> {
  return {
    outline: env.LLM_MODEL_GEMINI_OUTLINE,
    fill: env.LLM_MODEL_GEMINI_FILL,
    judge: env.LLM_MODEL_GEMINI_JUDGE,
    character_dna: env.LLM_MODEL_GEMINI_OUTLINE,
    illustration_prompt: env.LLM_MODEL_GEMINI_OUTLINE,
    page_rewrite: env.LLM_MODEL_GEMINI_OUTLINE,
  };
}

function maxTokensFor(env: Env): Record<LlmPurpose, number> {
  return {
    outline: env.LLM_MAX_OUTPUT_TOKENS_OUTLINE,
    fill: env.LLM_MAX_OUTPUT_TOKENS_FILL,
    judge: env.LLM_MAX_OUTPUT_TOKENS_JUDGE,
    character_dna: env.LLM_MAX_OUTPUT_TOKENS_OUTLINE,
    illustration_prompt: env.LLM_MAX_OUTPUT_TOKENS_OUTLINE,
    page_rewrite: env.LLM_MAX_OUTPUT_TOKENS_OUTLINE,
  };
}

/**
 * Per-stage request shaping. The judge gets its own row because the cheap tier rejects both
 * an effort hint and adaptive thinking — sending either is a 400, not a downgrade.
 */
function profilesFor(env: Env): Record<LlmPurpose, PurposeProfile> {
  const outline: PurposeProfile = {
    thinking: env.LLM_THINKING_MODE,
    effort: env.LLM_OUTLINE_EFFORT as LlmEffort,
  };
  return {
    outline,
    fill: { thinking: env.LLM_THINKING_MODE, effort: env.LLM_FILL_EFFORT },
    judge: { thinking: env.LLM_JUDGE_THINKING_MODE, effort: env.LLM_JUDGE_EFFORT as LlmEffort },
    character_dna: outline,
    illustration_prompt: outline,
    page_rewrite: outline,
  };
}

/**
 * The ordered route for `ProviderRouter`: `[primary, ...fallbacks]`.
 * A single-element route is the normal case — the fallback is opt-in per environment.
 */
export function createLlmRoute(options: LlmRouteOptions): LlmAdapter[] {
  const { env } = options;
  const priceBook = priceBookFromEnv(env, options.priceBook);

  if (options.forceMock || env.API_MODE === 'mock') {
    // ⚠️ The DOUBLE is priced at LIST prices even while `PROVIDER_COST_TIER=free`, and that
    // is not an oversight. `mock` means no vendor is called at all, so there is no free tier
    // to be on; the double exists precisely to exercise reservations, cost caps and the
    // ledger before any key exists. Zeroing it here would leave every one of those tests
    // asserting against 0 and quietly stop testing the thing they were written for.
    return [
      new MockStoryLlmAdapter({ models: modelsFor(env), priceBook: options.priceBook ?? DEFAULT_PRICE_BOOK }),
    ];
  }

  const shared = {
    priceBook,
    maxOutputTokens: maxTokensFor(env),
    timeoutMs: env.LLM_REQUEST_TIMEOUT_MS,
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
  };

  const gemini = (): LlmAdapter =>
    new GeminiLlmAdapter({
      apiKey: env.GOOGLE_GENAI_API_KEY,
      baseUrl: env.GOOGLE_GENAI_BASE_URL,
      apiVersion: env.GOOGLE_GENAI_API_VERSION,
      models: geminiModelsFor(env),
      profiles: profilesFor(env),
      // ⚠️ ONE pacer per route, built here rather than inside the adapter: the free tier's
      // requests-per-minute budget belongs to the KEY, so two adapter instances each with
      // their own pacer would happily spend it twice over.
      pacer: options.pacer ?? new RequestPacer({ minIntervalMs: minIntervalMsForRpm(env.GOOGLE_LLM_RPM) }),
      ...shared,
    });

  const anthropic = (): LlmAdapter =>
    new AnthropicLlmAdapter({
      apiKey: env.ANTHROPIC_API_KEY,
      baseUrl: env.ANTHROPIC_BASE_URL,
      apiVersion: env.ANTHROPIC_API_VERSION,
      beta: env.ANTHROPIC_BETA,
      models: modelsFor(env),
      profiles: profilesFor(env),
      ...shared,
    });

  const openai = (models: Record<LlmPurpose, string>) => (): LlmAdapter =>
    new OpenAiLlmAdapter({
      apiKey: env.OPENAI_API_KEY,
      baseUrl: env.OPENAI_BASE_URL,
      models,
      ...shared,
    });

  const build: Record<'gemini' | 'anthropic' | 'openai', () => LlmAdapter> = {
    gemini,
    anthropic,
    // As a PRIMARY, OpenAI runs on the main model ids; as a FALLBACK it runs on the
    // `LLM_MODEL_FALLBACK_*` set. Same adapter, different rows in config.
    openai: openai(modelsFor(env)),
  };

  const primary = build[env.LLM_PROVIDER_PRIMARY]();
  if (env.LLM_FALLBACK_PROVIDER === 'none') return [primary];

  const fallback =
    env.LLM_FALLBACK_PROVIDER === 'anthropic'
      ? anthropic()
      : openai(fallbackModelsFor(env))();

  // A fallback that IS the primary is a route that retries the same broken vendor twice.
  return fallback.provider === primary.provider ? [primary] : [primary, fallback];
}

export interface ModerationRouteOptions {
  env: Env;
  fetchImpl?: FetchLike;
  /** Mock mode has no moderation vendor; the caller supplies the in-repo fake. */
  mockAdapter?: ModerationAdapter;
}

/**
 * Moderation is free and runs three times per story, so there is no "save money by turning
 * it off" lever here on purpose.
 */
export function createModerationRoute(options: ModerationRouteOptions): ModerationAdapter[] {
  const { env } = options;
  if (env.API_MODE === 'mock') {
    return options.mockAdapter ? [options.mockAdapter] : [];
  }
  return [
    new OpenAiModerationAdapter({
      apiKey: env.OPENAI_API_KEY,
      baseUrl: env.OPENAI_BASE_URL,
      model: env.MODERATION_MODEL,
      blockThreshold: env.MODERATION_BLOCK_THRESHOLD,
      timeoutMs: env.MODERATION_TIMEOUT_MS,
      ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    }),
  ];
}
