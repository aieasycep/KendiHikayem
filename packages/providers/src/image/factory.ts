/**
 * image/factory.ts — which illustration adapter this process runs.
 *
 * ⭐ THE ONE SWITCH. `API_MODE=mock` → the deterministic double. `API_MODE=live` → the
 * real Gemini adapter. Nothing downstream — not the QA gate, not the processors, not the
 * flow — knows or cares which one it got; they all see `ImageAdapter`.
 *
 * Refusal beats a silent downgrade. `API_MODE=live` with `IMAGE_PROVIDER_PRIMARY=google`
 * and no key does NOT quietly fall back to the fake: `packages/config` refuses to boot
 * (a book made of placeholder bytes that the parent was charged for is worse than a
 * process that will not start). Running live on the double is still possible — it just has
 * to be SAID, with `IMAGE_PROVIDER_PRIMARY=fake`.
 */

import type { ImageAdapter } from '../core/adapters';
import { FakeImageAdapter } from '../core/fakes/adapters';
import type { FailurePlan } from '../core/fakes/support';
import type { PriceBook } from '../core/pricing';
import { GeminiImageAdapter, type ImageFetchLike } from './gemini/adapter';
import type { ImageReferenceResolver } from './references';
import { InMemoryReferenceResolver } from './references';

/** Mirrors `ImageProvider` in packages/config, without importing it (no cycle). */
export type ImageProviderName = 'google' | 'fake';

export interface ImageAdapterFactoryOptions {
  mode: 'mock' | 'live';
  /** `IMAGE_PROVIDER_PRIMARY`. */
  primary: ImageProviderName;
  /** `IMAGE_PROVIDER_FALLBACK`. Undefined = single-adapter route. */
  fallback?: ImageProviderName | undefined;
  models: {
    /** `IMAGE_MODEL_PRIMARY`. */
    primary: string;
    /** `IMAGE_MODEL_FALLBACK`; falls back to the primary model id when unset. */
    fallback?: string | undefined;
  };
  google: {
    apiKey?: string | undefined;
    baseUrl: string;
    apiVersion: string;
    timeoutMs: number;
  };
  references?: ImageReferenceResolver;
  priceBook?: PriceBook;
  fetchImpl?: ImageFetchLike;
  /** Fakes only. */
  failures?: FailurePlan;
  latencyMs?: number;
}

function buildOne(
  provider: ImageProviderName,
  model: string,
  options: ImageAdapterFactoryOptions,
): ImageAdapter {
  if (provider === 'fake') {
    return new FakeImageAdapter({
      model,
      ...(options.priceBook ? { priceBook: options.priceBook } : {}),
      ...(options.failures ? { failures: options.failures } : {}),
      ...(options.latencyMs !== undefined ? { latencyMs: options.latencyMs } : {}),
    });
  }

  return new GeminiImageAdapter({
    model,
    apiKey: options.google.apiKey,
    baseUrl: options.google.baseUrl,
    apiVersion: options.google.apiVersion,
    timeoutMs: options.google.timeoutMs,
    references: options.references ?? new InMemoryReferenceResolver(),
    ...(options.priceBook ? { priceBook: options.priceBook } : {}),
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
  });
}

/**
 * Builds the ordered route `[primary, ...fallback]` for `ProviderRouter`.
 *
 * In `mock` every entry is the double regardless of the configured provider — that is what
 * `mock` means, and it keeps `IMAGE_PROVIDER_PRIMARY=google` in a developer's `.env` from
 * making a real, billed call the moment they forget which mode they are in.
 */
export function createImageAdapterRoute(options: ImageAdapterFactoryOptions): ImageAdapter[] {
  const primaryProvider: ImageProviderName = options.mode === 'mock' ? 'fake' : options.primary;
  const route: ImageAdapter[] = [buildOne(primaryProvider, options.models.primary, options)];

  if (options.mode === 'live' && options.fallback) {
    route.push(
      buildOne(options.fallback, options.models.fallback ?? options.models.primary, options),
    );
  }
  return route;
}

/** Convenience for callers that only want the primary. */
export function createImageAdapter(options: ImageAdapterFactoryOptions): ImageAdapter {
  return createImageAdapterRoute(options)[0]!;
}
