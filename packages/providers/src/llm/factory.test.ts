/**
 * The which-vendor-runs test.
 *
 * Two claims this file exists to keep honest:
 *
 *   1. ⭐ THE FREE STACK IS THE DEFAULT, and it comes up with ONE key. A deployment that
 *      only has `GOOGLE_GENAI_API_KEY` must boot and must route text, illustration and
 *      narration through it — that is the difference between shipping and not shipping.
 *   2. MOVING TO THE PAID TIER IS ONE VARIABLE PER CAPABILITY, with no code change. If that
 *      ever stops being true it stops here, rather than during a migration.
 */

import { describe, expect, it } from 'vitest';
import { parseEnv } from '@kendihikayem/config';

import { createLlmRoute, createModerationRoute, priceBookFromEnv } from './factory';
import { AnthropicLlmAdapter } from './anthropic';
import { GeminiLlmAdapter } from './gemini';
import { OpenAiLlmAdapter } from './openai';
import { MockStoryLlmAdapter } from './mock-story';
import { OpenAiModerationAdapter } from '../moderation/openai';
import { createVoiceRoute } from '../tts/factory';
import { GoogleTtsAdapter } from '../tts/google/adapter';
import { ElevenLabsTtsAdapter } from '../tts/elevenlabs/adapter';
import { createImageAdapterRoute } from '../image/factory';
import { GeminiImageAdapter } from '../image/gemini/adapter';
import { DEFAULT_PRICE_BOOK, FREE_TIER_PRICE_BOOK } from '../core/pricing';

const BASE = {
  AUTH_SECRET: 'test-secret-that-is-definitely-long-enough-32',
  NODE_ENV: 'test',
};

/** ⭐ What a parent-facing deployment needs on day one: one AI key, plus infrastructure. */
const FREE_TIER_KEYS = {
  GOOGLE_GENAI_API_KEY: 'test-google',
  // Moderation. The endpoint is FREE — the key is an account, not a bill — and it is the
  // one safety layer that must never be switched off to save money (SPEC §10.4 K2/K4b).
  OPENAI_API_KEY: 'sk-test-openai',
  S3_ACCESS_KEY_ID: 'test',
  S3_SECRET_ACCESS_KEY: 'test',
};

const PAID_KEYS = {
  ...FREE_TIER_KEYS,
  ANTHROPIC_API_KEY: 'sk-test-anthropic',
  ELEVENLABS_API_KEY: 'test-eleven',
};

describe('⭐ the free stack, with one key', () => {
  it('boots in live mode with GOOGLE_GENAI_API_KEY and nothing else from a vendor', () => {
    // The whole point: no Anthropic key, no ElevenLabs key, and the process still starts.
    const env = parseEnv({ ...BASE, ...FREE_TIER_KEYS, API_MODE: 'live' });

    expect(env.LLM_PROVIDER_PRIMARY).toBe('gemini');
    expect(env.IMAGE_PROVIDER_PRIMARY).toBe('google');
    expect(env.VOICE_PRIMARY).toBe('google');
    expect(env.PROVIDER_COST_TIER).toBe('free');
    // ⚠️ And cloning is OFF by default, because no free provider can do it.
    expect(env.VOICE_CLONING_ENABLED).toBe(false);
  });

  it('routes text, illustration and narration through that one key', () => {
    const env = parseEnv({ ...BASE, ...FREE_TIER_KEYS, API_MODE: 'live' });

    const llm = createLlmRoute({ env });
    expect(llm).toHaveLength(1);
    expect(llm[0]).toBeInstanceOf(GeminiLlmAdapter);
    expect(llm[0]!.provider).toBe('google');

    const image = createImageAdapterRoute({
      mode: 'live',
      primary: env.IMAGE_PROVIDER_PRIMARY,
      fallback: env.IMAGE_PROVIDER_FALLBACK,
      models: { primary: env.IMAGE_MODEL_PRIMARY, fallback: env.IMAGE_MODEL_FALLBACK },
      google: {
        apiKey: env.GOOGLE_GENAI_API_KEY,
        baseUrl: env.GOOGLE_GENAI_BASE_URL,
        apiVersion: env.GOOGLE_GENAI_API_VERSION,
        timeoutMs: env.IMAGE_REQUEST_TIMEOUT_MS,
      },
    });
    expect(image[0]).toBeInstanceOf(GeminiImageAdapter);

    const voice = createVoiceRoute({ env });
    expect(voice.tts).toHaveLength(1);
    expect(voice.tts[0]).toBeInstanceOf(GoogleTtsAdapter);
    // Recorded in the boot log so a misconfigured live deploy is visible at a glance.
    expect(voice.description).toContain('cloning=off');
  });

  it('reads the Gemini model ids from config, never a literal', () => {
    const env = parseEnv({
      ...BASE,
      ...FREE_TIER_KEYS,
      API_MODE: 'live',
      LLM_MODEL_GEMINI_FILL: 'custom-fill-id',
      LLM_MODEL_GEMINI_JUDGE: 'custom-judge-id',
    });
    const adapter = createLlmRoute({ env })[0] as GeminiLlmAdapter;

    expect(adapter.modelFor('fill')).toBe('custom-fill-id');
    expect(adapter.modelFor('judge')).toBe('custom-judge-id');
    // Distinct tiers: the judge runs on the cheaper/faster free model.
    expect(adapter.modelFor('fill')).not.toBe(adapter.modelFor('judge'));
  });

  it('⭐ falls back to the syllable estimate, because the free narrator returns no timings', () => {
    const env = parseEnv({ ...BASE, ...FREE_TIER_KEYS, API_MODE: 'live' });
    const voice = createVoiceRoute({ env });

    // No WhisperX configured and no vendor timings ⇒ `sentence_estimate`, which is honest
    // about its granularity: the client highlights sentences instead of drifting words.
    expect(voice.align).toHaveLength(0);
    expect(voice.description).toContain('sentence_estimate');
  });
});

describe('⭐ the cost ledger on a free tier', () => {
  it('zeroes the rates but keeps recording — a quota is a resource too', () => {
    const free = parseEnv({ ...BASE, ...FREE_TIER_KEYS, API_MODE: 'live' });
    expect(priceBookFromEnv(free)).toBe(FREE_TIER_PRICE_BOOK);
    expect(priceBookFromEnv(free).llm.fill.inputPerMTokUsd).toBe(0);
  });

  it('ignores a caller-supplied paid book while the account is on the free tier', () => {
    const free = parseEnv({ ...BASE, ...FREE_TIER_KEYS, API_MODE: 'live' });
    // Otherwise `provider_usage.cost_usd` fills with money nobody spent, and
    // `COST_CAP_DAILY_USD` starts refusing parents over an imaginary bill.
    expect(priceBookFromEnv(free, DEFAULT_PRICE_BOOK)).toBe(FREE_TIER_PRICE_BOOK);
  });

  it('uses the list prices the moment the tier is switched', () => {
    const paid = parseEnv({ ...BASE, ...PAID_KEYS, API_MODE: 'live', PROVIDER_COST_TIER: 'paid' });
    expect(priceBookFromEnv(paid)).toBe(DEFAULT_PRICE_BOOK);
  });

  it('keeps our own compute priced even on the free tier — ffmpeg is not free', () => {
    expect(FREE_TIER_PRICE_BOOK.compute.perJobUsd).toBe(DEFAULT_PRICE_BOOK.compute.perJobUsd);
  });
});

describe('⭐ moving to the paid tier is one variable per capability', () => {
  it('LLM_PROVIDER_PRIMARY=anthropic swaps the story vendor, with no code change', () => {
    const env = parseEnv({ ...BASE, ...PAID_KEYS, API_MODE: 'live', LLM_PROVIDER_PRIMARY: 'anthropic' });
    const route = createLlmRoute({ env });

    expect(route).toHaveLength(1);
    const adapter = route[0] as AnthropicLlmAdapter;
    expect(adapter).toBeInstanceOf(AnthropicLlmAdapter);
    expect(adapter.modelFor('fill')).toBe(env.LLM_MODEL_FILL);
    expect(adapter.modelFor('fill')).not.toBe(adapter.modelFor('judge'));
  });

  it('TTS_PROVIDER_PRIMARY=elevenlabs swaps the narrator, and only then may cloning be on', () => {
    const env = parseEnv({
      ...BASE,
      ...PAID_KEYS,
      API_MODE: 'live',
      TTS_PROVIDER_PRIMARY: 'elevenlabs',
      VOICE_CLONING_ENABLED: 'true',
    });
    const voice = createVoiceRoute({ env });

    expect(voice.tts[0]).toBeInstanceOf(ElevenLabsTtsAdapter);
    expect(voice.description).toContain('cloning=on');
  });

  it('⚠️ REFUSES to boot with cloning on and a narrator that cannot clone', () => {
    // The failure this prevents: a parent records ninety seconds of their own voice, is told
    // their child will hear THEM, and a stranger reads instead — discovered at bedtime.
    expect(() =>
      parseEnv({ ...BASE, ...FREE_TIER_KEYS, API_MODE: 'live', VOICE_CLONING_ENABLED: 'true' }),
    ).toThrow(/klonlama/u);
  });

  it('keeps both paid adapters selectable as the fallback vendor', () => {
    const openai = parseEnv({ ...BASE, ...PAID_KEYS, API_MODE: 'live', LLM_FALLBACK_PROVIDER: 'openai' });
    expect(createLlmRoute({ env: openai })[1]).toBeInstanceOf(OpenAiLlmAdapter);

    const anthropic = parseEnv({
      ...BASE,
      ...PAID_KEYS,
      API_MODE: 'live',
      LLM_FALLBACK_PROVIDER: 'anthropic',
    });
    const route = createLlmRoute({ env: anthropic });
    expect(route[0]).toBeInstanceOf(GeminiLlmAdapter);
    expect(route[1]).toBeInstanceOf(AnthropicLlmAdapter);
  });

  it('collapses a fallback that IS the primary — retrying one broken vendor twice is not failover', () => {
    const env = parseEnv({
      ...BASE,
      ...PAID_KEYS,
      API_MODE: 'live',
      LLM_PROVIDER_PRIMARY: 'anthropic',
      LLM_FALLBACK_PROVIDER: 'anthropic',
    });
    expect(createLlmRoute({ env })).toHaveLength(1);
  });
});

describe('boot-time credential checks', () => {
  it('demands ONLY the selected story vendor’s key', () => {
    // Before the free-tier switch this list required ANTHROPIC_API_KEY unconditionally,
    // so a Gemini-only deployment could not boot without buying a key it never calls.
    expect(() =>
      parseEnv({ ...BASE, ...FREE_TIER_KEYS, API_MODE: 'live', LLM_PROVIDER_PRIMARY: 'anthropic' }),
    ).toThrow(/ANTHROPIC_API_KEY/u);

    // …and the Gemini default does not demand it at all.
    expect(() => parseEnv({ ...BASE, ...FREE_TIER_KEYS, API_MODE: 'live' })).not.toThrow();
  });

  it('demands the one Google key when any Google surface is selected', () => {
    expect(() =>
      parseEnv({ ...BASE, ...FREE_TIER_KEYS, GOOGLE_GENAI_API_KEY: '', API_MODE: 'live' }),
    ).toThrow(/GOOGLE_GENAI_API_KEY/u);
  });

  it('still demands the moderation key — free, and never optional', () => {
    expect(() =>
      parseEnv({ ...BASE, ...FREE_TIER_KEYS, OPENAI_API_KEY: '', API_MODE: 'live' }),
    ).toThrow(/OPENAI_API_KEY/u);
  });

  it('refuses a narrator whose key is absent, naming the variable the operator typed', () => {
    expect(() =>
      parseEnv({
        ...BASE,
        ...FREE_TIER_KEYS,
        API_MODE: 'live',
        TTS_PROVIDER_PRIMARY: 'elevenlabs',
      }),
    ).toThrow(/TTS_PROVIDER_PRIMARY/u);
  });
});

describe('mock mode', () => {
  it('uses the deterministic story double — no key required', () => {
    const env = parseEnv({ ...BASE, API_MODE: 'mock' });
    const route = createLlmRoute({ env });

    expect(route).toHaveLength(1);
    expect(route[0]).toBeInstanceOf(MockStoryLlmAdapter);
  });

  it('builds the real moderation adapter in live mode', () => {
    const env = parseEnv({ ...BASE, ...FREE_TIER_KEYS, API_MODE: 'live' });
    expect(createModerationRoute({ env })[0]).toBeInstanceOf(OpenAiModerationAdapter);
  });
});
