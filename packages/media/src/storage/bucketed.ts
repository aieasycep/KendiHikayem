/**
 * media/storage/bucketed.ts — the multi-bucket face of the object store.
 *
 * WHY A SECOND SHAPE. `ObjectStore` (types.ts) binds ONE bucket at construction, which is
 * right for the illustration pipeline: it only ever writes media. The audio and print
 * pipelines cannot work that way — ⚠️ KVKK (SPEC §2, §10.1) puts raw voice reference takes
 * in their OWN bucket under their own key, and `apps/worker/src/processors/audio-storage.ts`
 * therefore takes the bucket as a PARAMETER of every call, so a reference clip cannot be
 * written next to a page illustration by a caller who was not thinking about it.
 *
 * Until now the only implementation of that shape was `InMemoryObjectStore`, which is also
 * what `buildRuntime` defaulted to — meaning a production worker wrote every narration and
 * every voice take into a `Map` and lost them on restart. This is the driver-backed
 * implementation that closes that gap: one `ObjectStore` per bucket, created lazily, so the
 * bucket-per-call contract is preserved and the credentials are configured once.
 *
 * Deliberately NOT merged with `ObjectStore`: the single-bucket interface is the one the
 * image pipeline should keep, precisely because it makes writing to the wrong bucket
 * impossible rather than merely wrong.
 */

import { type ObjectStoreConfig, createObjectStore } from './factory';
import { ObjectNotFoundError, type ObjectStore, type RetentionClass } from './types';

/** What the audio/print pipelines hand over. Mirrors `processors/audio-storage.ts`. */
export interface BucketedBlob {
  bucket: string;
  key: string;
  bytes: Uint8Array;
  contentType: string;
}

export interface BucketedObjectStore {
  put(input: BucketedBlob): Promise<void>;
  get(bucket: string, key: string): Promise<Uint8Array | undefined>;
  /** Idempotent: deleting an object that is already gone is a success, not an error. */
  delete(bucket: string, key: string): Promise<void>;
  exists(bucket: string, key: string): Promise<boolean>;
}

export interface BucketedObjectStoreOptions {
  /** Everything except `bucket`, which this store supplies per call. */
  config: Omit<ObjectStoreConfig, 'bucket'>;
  /**
   * Per-bucket retention. The class travels as object metadata so an object found without
   * its `assets` row is still classifiable by the purge sweep — which is what makes a KVKK
   * deletion promise auditable rather than aspirational.
   */
  retentionByBucket?: Record<string, RetentionClass>;
}

/**
 * Routes bucket-parameterised calls onto one single-bucket driver per bucket.
 *
 * The per-bucket drivers are cached: constructing one is cheap (no connection is opened —
 * the S3 driver is `fetch` plus arithmetic), but caching keeps `signedUrl` deterministic
 * for a given clock and keeps the filesystem driver from re-resolving its root per write.
 */
export class DriverBackedObjectStore implements BucketedObjectStore {
  private readonly drivers = new Map<string, ObjectStore>();

  constructor(private readonly options: BucketedObjectStoreOptions) {}

  /** The single-bucket driver for `bucket`, for callers that need signed URLs or HEAD. */
  driverFor(bucket: string): ObjectStore {
    const cached = this.drivers.get(bucket);
    if (cached) return cached;
    const created = createObjectStore({ ...this.options.config, bucket });
    this.drivers.set(bucket, created);
    return created;
  }

  /** Which driver is live, for ops output. */
  get driver(): 'filesystem' | 's3' {
    return this.options.config.driver;
  }

  async put(input: BucketedBlob): Promise<void> {
    const retentionClass = this.options.retentionByBucket?.[input.bucket];
    await this.driverFor(input.bucket).put({
      key: input.key,
      body: input.bytes,
      contentType: input.contentType,
      ...(retentionClass ? { retentionClass } : {}),
    });
  }

  /**
   * `undefined` for a missing object, not a throw: the callers here are erasure checks and
   * cache lookups, and both treat absence as an ordinary answer. A transport failure still
   * throws — "we could not reach storage" and "it is not there" must not be the same value,
   * or a network blip reads as a completed deletion.
   */
  async get(bucket: string, key: string): Promise<Uint8Array | undefined> {
    try {
      return await this.driverFor(bucket).get(key);
    } catch (error) {
      if (error instanceof ObjectNotFoundError) return undefined;
      throw error;
    }
  }

  async delete(bucket: string, key: string): Promise<void> {
    await this.driverFor(bucket).delete(key);
  }

  async exists(bucket: string, key: string): Promise<boolean> {
    return (await this.driverFor(bucket).head(key)) !== undefined;
  }
}

export function createBucketedObjectStore(
  options: BucketedObjectStoreOptions,
): DriverBackedObjectStore {
  return new DriverBackedObjectStore(options);
}
