/**
 * llm/factory.ts — ONE env var flips the whole story pipeline from mock to live.
 *
 *   API_MODE=mock  → MockStoryLlmAdapter, no key needed, deterministic Turkish
 *   API_MODE=live  → AnthropicLlmAdapter [, OpenAiLlmAdapter as the second route entry]
 *
 * That is the entire day-the-key-arrives procedure: fill in `ANTHROPIC_API_KEY` and
 * `OPENAI_API_KEY`, set `API_MODE=live`, restart. `packages/config` already refuses to boot
 * in `live` without those keys (superRefine), so the failure mode is a clear message at
 * startup rather than a 3am surprise mid-generation.
 */

import type { Env } from '@kendihikayem/config';

import type { LlmAdapter, LlmPurpose } from '../core/adapters';
import type { ModerationAdapter } from '../core/adapters';
import type { PriceBook } from '../core/pricing';
import { AnthropicLlmAdapter } from './anthropic';
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

  if (options.forceMock || env.API_MODE === 'mock') {
    return [
      new MockStoryLlmAdapter({
        models: modelsFor(env),
        ...(options.priceBook ? { priceBook: options.priceBook } : {}),
      }),
    ];
  }

  const primary = new AnthropicLlmAdapter({
    apiKey: env.ANTHROPIC_API_KEY,
    baseUrl: env.ANTHROPIC_BASE_URL,
    apiVersion: env.ANTHROPIC_API_VERSION,
    beta: env.ANTHROPIC_BETA,
    models: modelsFor(env),
    profiles: profilesFor(env),
    maxOutputTokens: maxTokensFor(env),
    timeoutMs: env.LLM_REQUEST_TIMEOUT_MS,
    ...(options.priceBook ? { priceBook: options.priceBook } : {}),
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
  });

  if (env.LLM_FALLBACK_PROVIDER === 'none') return [primary];

  return [
    primary,
    new OpenAiLlmAdapter({
      apiKey: env.OPENAI_API_KEY,
      baseUrl: env.OPENAI_BASE_URL,
      models: fallbackModelsFor(env),
      maxOutputTokens: maxTokensFor(env),
      timeoutMs: env.LLM_REQUEST_TIMEOUT_MS,
      ...(options.priceBook ? { priceBook: options.priceBook } : {}),
      ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    }),
  ];
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
