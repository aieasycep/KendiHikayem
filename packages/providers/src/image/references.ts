/**
 * image/references.ts — how an `assets.id` becomes bytes an adapter can send.
 *
 * `packages/providers` must not know about S3, Postgres or the filesystem (the boundary
 * lint enforces the first two). So the adapter takes a resolver, and the worker — which is
 * allowed to know all three — supplies one backed by `packages/media`'s object store.
 *
 * Resolution is CACHED per instance: one book renders thirteen pages against the same
 * character sheet, face crop and style plate. Fetching those three 4K images thirteen
 * times over would triple the storage traffic of a book for nothing.
 */

import type { ImageReference } from '../core/adapters';

export interface ResolvedReference {
  bytes: Uint8Array;
  mimeType: string;
}

export interface ImageReferenceResolver {
  resolve(reference: ImageReference): Promise<ResolvedReference>;
}

/** Test double and mock-mode resolver: an explicit map of asset id → bytes. */
export class InMemoryReferenceResolver implements ImageReferenceResolver {
  private readonly entries = new Map<string, ResolvedReference>();

  constructor(entries: Record<string, ResolvedReference> = {}) {
    for (const [id, value] of Object.entries(entries)) this.entries.set(id, value);
  }

  set(assetId: string, value: ResolvedReference): this {
    this.entries.set(assetId, value);
    return this;
  }

  async resolve(reference: ImageReference): Promise<ResolvedReference> {
    const found = this.entries.get(reference.assetId);
    if (!found) {
      throw new Error(
        `reference asset ${reference.assetId} (${reference.kind}) is not available`,
      );
    }
    return found;
  }
}

/**
 * Wraps another resolver with a bounded per-instance cache.
 *
 * `maxEntries` is small on purpose: a worker renders one book at a time per slot, and an
 * unbounded cache of 4K images is a memory leak with a friendly name.
 */
export class CachingReferenceResolver implements ImageReferenceResolver {
  private readonly cache = new Map<string, ResolvedReference>();

  constructor(
    private readonly inner: ImageReferenceResolver,
    private readonly maxEntries = 16,
  ) {}

  async resolve(reference: ImageReference): Promise<ResolvedReference> {
    const cached = this.cache.get(reference.assetId);
    if (cached) return cached;

    const resolved = await this.inner.resolve(reference);
    if (this.cache.size >= this.maxEntries) {
      // Insertion-ordered map: the oldest key is the first one out.
      const oldest = this.cache.keys().next();
      if (!oldest.done) this.cache.delete(oldest.value);
    }
    this.cache.set(reference.assetId, resolved);
    return resolved;
  }

  clear(): void {
    this.cache.clear();
  }
}
