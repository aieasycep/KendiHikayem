/**
 * The `API_MODE` switch — the single thing that has to work on the day the key arrives.
 */

import { describe, expect, it } from 'vitest';

import { GeminiImageAdapter } from './gemini/adapter';
import { createImageAdapter, createImageAdapterRoute } from './factory';

const GOOGLE = {
  baseUrl: 'https://example.invalid',
  apiVersion: 'v1beta',
  timeoutMs: 1_000,
};

const MODELS = { primary: 'image-model-primary', fallback: 'image-model-secondary' };

describe('createImageAdapterRoute', () => {
  it('gives the double in mock mode even when google is configured', () => {
    // Protects the developer who left IMAGE_PROVIDER_PRIMARY=google in .env and expected
    // `API_MODE=mock` to mean "no billed calls".
    const route = createImageAdapterRoute({
      mode: 'mock',
      primary: 'google',
      models: MODELS,
      google: { ...GOOGLE, apiKey: 'real-key' },
    });
    expect(route).toHaveLength(1);
    expect(route[0]!.provider).toBe('fake');
  });

  it('gives the real adapter in live mode, carrying the configured model id', () => {
    const adapter = createImageAdapter({
      mode: 'live',
      primary: 'google',
      models: MODELS,
      google: { ...GOOGLE, apiKey: 'real-key' },
    });
    expect(adapter.provider).toBe('google');
    expect(adapter).toBeInstanceOf(GeminiImageAdapter);
    expect((adapter as GeminiImageAdapter).endpoint).toContain(
      `/models/${MODELS.primary}:generateContent`,
    );
  });

  it('builds a two-adapter route when a fallback is configured', () => {
    const route = createImageAdapterRoute({
      mode: 'live',
      primary: 'google',
      fallback: 'fake',
      models: MODELS,
      google: { ...GOOGLE, apiKey: 'real-key' },
    });
    expect(route.map((a) => a.provider)).toEqual(['google', 'fake']);
  });

  it('uses the fallback model id for the fallback adapter', () => {
    const route = createImageAdapterRoute({
      mode: 'live',
      primary: 'google',
      fallback: 'google',
      models: MODELS,
      google: { ...GOOGLE, apiKey: 'real-key' },
    });
    expect((route[1] as GeminiImageAdapter).endpoint).toContain(MODELS.fallback);
  });

  it('constructs without a key — the refusal happens per call, not at boot', () => {
    // Boot-time validation is packages/config's job; the adapter's job is a clean error
    // on the call, so a mis-set fallback cannot take the worker down at startup.
    const adapter = createImageAdapter({
      mode: 'live',
      primary: 'google',
      models: MODELS,
      google: { ...GOOGLE, apiKey: undefined },
    });
    expect(adapter.provider).toBe('google');
  });

  it('ignores the fallback in mock mode', () => {
    const route = createImageAdapterRoute({
      mode: 'mock',
      primary: 'google',
      fallback: 'google',
      models: MODELS,
      google: { ...GOOGLE, apiKey: 'real-key' },
    });
    expect(route).toHaveLength(1);
  });
});
