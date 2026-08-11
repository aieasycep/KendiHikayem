/**
 * media/storage/filesystem.ts — the driver that makes "no MinIO" a non-event.
 *
 * ⚠️ THIS ENVIRONMENT HAS NO S3 AND NO MINIO. Rather than stubbing storage out and losing
 * the ability to test the media path end to end, this driver implements the same
 * `ObjectStore` contract against the local filesystem — INCLUDING expiring signed URLs,
 * which is the part a stub would have skipped and the part the product's privacy promise
 * rests on.
 *
 * The signature is HMAC-SHA256 over `key|expiry`, verified by `verifySignedUrl`. It is not
 * theatre: `apps/api` serves media through a route that calls the verifier, so in
 * development the same "a URL leaks ⇒ it expires in 15 minutes" property holds as in
 * production. Because the same interface is used in both, moving to S3 changes one factory
 * line and nothing else.
 *
 * Not suitable for multi-node production: no replication, no lifecycle rules, no KMS. The
 * `assets.retention_class` written alongside is still honoured by the purge job, which
 * deletes through this interface.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

import {
  ObjectNotFoundError,
  type ObjectStore,
  type PutObjectInput,
  type RetentionClass,
  type SignedUrl,
  type StoredObject,
} from './types';

export interface FilesystemObjectStoreOptions {
  /** `MEDIA_LOCAL_ROOT`. Created on first write. */
  root: string;
  /** Reported as `bucket` so `assets` rows look identical across drivers. */
  bucket: string;
  /** `MEDIA_URL_SIGNING_SECRET` (or `AUTH_SECRET`). */
  signingSecret: string;
  /** Where the media route lives, e.g. `http://localhost:3001`. */
  publicBaseUrl: string;
  /** Route prefix the API serves signed media from. */
  routePrefix?: string;
  now?: () => number;
}

interface SidecarMetadata {
  contentType: string;
  retentionClass: RetentionClass;
  sha256?: string;
  metadata?: Record<string, string>;
}

export class FilesystemObjectStore implements ObjectStore {
  readonly driver = 'filesystem' as const;
  readonly bucket: string;

  private readonly root: string;
  private readonly signingSecret: string;
  private readonly publicBaseUrl: string;
  private readonly routePrefix: string;
  private readonly now: () => number;

  constructor(options: FilesystemObjectStoreOptions) {
    this.bucket = options.bucket;
    this.root = resolve(options.root, options.bucket);
    this.signingSecret = options.signingSecret;
    this.publicBaseUrl = options.publicBaseUrl.replace(/\/+$/u, '');
    this.routePrefix = options.routePrefix ?? '/v1/media';
    this.now = options.now ?? Date.now;
  }

  async put(input: PutObjectInput): Promise<StoredObject> {
    const path = this.pathFor(input.key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, input.body);

    const sidecar: SidecarMetadata = {
      contentType: input.contentType,
      retentionClass: input.retentionClass ?? 'standard',
      ...(input.sha256 ? { sha256: input.sha256 } : {}),
      ...(input.metadata ? { metadata: input.metadata } : {}),
    };
    await writeFile(`${path}.meta.json`, JSON.stringify(sidecar));

    return {
      bucket: this.bucket,
      key: input.key,
      sizeBytes: input.body.byteLength,
      contentType: input.contentType,
      retentionClass: sidecar.retentionClass,
      ...(input.sha256 ? { sha256: input.sha256 } : {}),
    };
  }

  async get(key: string): Promise<Uint8Array> {
    try {
      return new Uint8Array(await readFile(this.pathFor(key)));
    } catch {
      throw new ObjectNotFoundError(this.bucket, key);
    }
  }

  async head(key: string): Promise<StoredObject | undefined> {
    const path = this.pathFor(key);
    try {
      const stats = await stat(path);
      const sidecar = await this.readSidecar(path);
      return {
        bucket: this.bucket,
        key,
        sizeBytes: stats.size,
        contentType: sidecar?.contentType ?? 'application/octet-stream',
        retentionClass: sidecar?.retentionClass ?? 'standard',
        ...(sidecar?.sha256 ? { sha256: sidecar.sha256 } : {}),
      };
    } catch {
      return undefined;
    }
  }

  async delete(key: string): Promise<void> {
    const path = this.pathFor(key);
    await rm(path, { force: true });
    await rm(`${path}.meta.json`, { force: true });
  }

  async signedUrl(key: string, expiresInSec: number): Promise<SignedUrl> {
    const expiresAtMs = this.now() + expiresInSec * 1000;
    const expires = Math.floor(expiresAtMs / 1000);
    const signature = this.sign(key, expires);
    const url =
      `${this.publicBaseUrl}${this.routePrefix}/${encodeURI(key)}` +
      `?exp=${expires}&sig=${signature}`;
    return { url, expiresInSec, expiresAt: new Date(expiresAtMs).toISOString() };
  }

  /**
   * The verifier `apps/api` calls before streaming bytes.
   *
   * Constant-time comparison: a signature check that leaks timing is a signature check an
   * attacker can walk byte by byte.
   */
  verifySignedUrl(key: string, expires: number, signature: string): boolean {
    if (!Number.isFinite(expires) || expires * 1000 < this.now()) return false;
    const expected = Buffer.from(this.sign(key, expires), 'hex');
    let provided: Buffer;
    try {
      provided = Buffer.from(signature, 'hex');
    } catch {
      return false;
    }
    if (expected.length !== provided.length) return false;
    return timingSafeEqual(expected, provided);
  }

  private sign(key: string, expires: number): string {
    return createHmac('sha256', this.signingSecret).update(`${key}|${expires}`).digest('hex');
  }

  private async readSidecar(path: string): Promise<SidecarMetadata | undefined> {
    try {
      return JSON.parse(await readFile(`${path}.meta.json`, 'utf8')) as SidecarMetadata;
    } catch {
      return undefined;
    }
  }

  /**
   * Resolves a key to a path INSIDE the bucket root.
   *
   * Keys are constructed by `storageKeys`, but a key that ever reaches this from a request
   * parameter must not be able to escape with `../`. Cheap to enforce, catastrophic to omit.
   */
  private pathFor(key: string): string {
    const normalised = key.replace(/^\/+/u, '');
    const path = resolve(join(this.root, normalised));
    if (path !== this.root && !path.startsWith(this.root + sep)) {
      throw new Error(`storage key escapes the bucket root: ${key}`);
    }
    return path;
  }
}
