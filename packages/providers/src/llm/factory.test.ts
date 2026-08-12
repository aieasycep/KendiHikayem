/**
 * The day-the-key-arrives test.
 *
 * The claim this file exists to keep honest: switching the story pipeline from the mock
 * model to the real vendor is ONE environment variable and no code change. If that ever
 * stops being true, it stops here rather than in a deploy.
 */

import { describe, expect, it } from 'vitest';
import { parseEnv } from '@kendihikayem/config';

import { createLlmRoute, createModerationRoute } from './factory';
import { AnthropicLlmAdapter } from './anthropic';
import { OpenAiLlmAdapter } from './openai';
import { MockStoryLlmAdapter } from './mock-story';
import { OpenAiModerationAdapter } from '../moderation/openai';

const BASE = {
  AUTH_SECRET: 'test-secret-that-is-definitely-long-enough-32',
  NODE_ENV: 'test',
};

const LIVE_KEYS = {
  ANTHROPIC_API_KEY: 'sk-test-anthropic',
  OPENAI_API_KEY: 'sk-test-openai',
  GOOGLE_GENAI_API_KEY: 'test-google',
  ELEVENLABS_API_KEY: 'test-eleven',
  S3_ACCESS_KEY_ID: 'test',
  S3_SECRET_ACCESS_KEY: 'test',
  IYZICO_API_KEY: 'test',
  IYZICO_SECRET_KEY: 'test',
};

describe('LLM route selection', () => {
  it('uses the deterministic story double in mock mode — no key required', () => {
    const env = parseEnv({ ...BASE, API_MODE: 'mock' });
    const route = createLlmRoute({ env });

    expect(route).toHaveLength(1);
    expect(route[0]).toBeInstanceOf(MockStoryLlmAdapter);
  });

  it('uses the real adapter in live mode, with the configured model ids', () => {
    const env = parseEnv({ ...BASE, ...LIVE_KEYS, API_MODE: 'live' });
    const route = createLlmRoute({ env });

    expect(route).toHaveLength(1);
    const adapter = route[0] as AnthropicLlmAdapter;
    expect(adapter).toBeInstanceOf(AnthropicLlmAdapter);
    expect(adapter.provider).toBe('anthropic');
    // Straight from config — the stage decides the model, the code never names one.
    expect(adapter.modelFor('outline')).toBe(env.LLM_MODEL_OUTLINE);
    expect(adapter.modelFor('fill')).toBe(env.LLM_MODEL_FILL);
    expect(adapter.modelFor('judge')).toBe(env.LLM_MODEL_JUDGE);
    expect(adapter.modelFor('fill')).not.toBe(adapter.modelFor('judge'));
  });

  it('adds the second vendor only when an environment opts in', () => {
    const env = parseEnv({ ...BASE, ...LIVE_KEYS, API_MODE: 'live', LLM_FALLBACK_PROVIDER: 'openai' });
    const route = createLlmRoute({ env });

    expect(route).toHaveLength(2);
    expect(route[0]).toBeInstanceOf(AnthropicLlmAdapter);
    expect(route[1]).toBeInstanceOf(OpenAiLlmAdapter);
  });

  it('builds the real moderation adapter in live mode', () => {
    const env = parseEnv({ ...BASE, ...LIVE_KEYS, API_MODE: 'live' });
    expect(createModerationRoute({ env })[0]).toBeInstanceOf(OpenAiModerationAdapter);
  });

  it('refuses to boot in live mode without the story keys, before any request is made', () => {
    // The failure a missing key produces is a startup error naming the variable — not a
    // 3am generation failure and not a silent fall back to the double.
    expect(() => parseEnv({ ...BASE, ...LIVE_KEYS, ANTHROPIC_API_KEY: '', API_MODE: 'live' })).toThrow(
      /ANTHROPIC_API_KEY/u,
    );
    expect(() => parseEnv({ ...BASE, ...LIVE_KEYS, OPENAI_API_KEY: '', API_MODE: 'live' })).toThrow(
      /OPENAI_API_KEY/u,
    );
  });
});
