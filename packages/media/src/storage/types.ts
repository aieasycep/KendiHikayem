/**
 * media/storage/types.ts — the object store interface.
 *
 * One interface, two drivers. `S3ObjectStore` is what production runs; `FilesystemObjectStore`
 * is what runs when there is no MinIO — CI, a laptop, this environment. The filesystem
 * driver is not a stub: it stores, retrieves, deletes and issues EXPIRING SIGNED URLS, so
 * the code path that serves a child's illustration is the same one in both drivers and the
 * "media is never public" rule is tested rather than assumed.
 *
 * `retentionClass` is carried through to the `assets` row by the caller. It is on this
 * interface because the store is where the object physically dies, and a purge job that
 * cannot see the class cannot enforce it.
 */

export type RetentionClass = 'ephemeral_30d' | 'standard' | 'legal_hold_10y';

export interface PutObjectInput {
  key: string;
  body: Uint8Array;
  contentType: string;
  /** Written as object metadata where the driver supports it; always returned. */
  retentionClass?: RetentionClass;
  /** sha256 of `body`, for integrity and for the content cache. */
  sha256?: string;
  cacheControl?: string;
  metadata?: Record<string, string>;
}

export interface StoredObject {
  bucket: string;
  key: string;
  sizeBytes: number;
  contentType: string;
  sha256?: string;
  retentionClass: RetentionClass;
  /** Driver-reported entity tag, when there is one. */
  etag?: string;
}

export interface SignedUrl {
  url: string;
  /** Seconds from now. */
  expiresInSec: number;
  expiresAt: string;
}

export interface ObjectStore {
  readonly bucket: string;
  /** Which driver is live. Surfaced in ops output so "why is this a file path" is answerable. */
  readonly driver: 'filesystem' | 's3';

  put(input: PutObjectInput): Promise<StoredObject>;
  get(key: string): Promise<Uint8Array>;
  head(key: string): Promise<StoredObject | undefined>;
  delete(key: string): Promise<void>;
  /** Expiring URL. Media is never public — there is no unsigned accessor on purpose. */
  signedUrl(key: string, expiresInSec: number): Promise<SignedUrl>;
}

export class ObjectNotFoundError extends Error {
  constructor(
    readonly bucket: string,
    readonly key: string,
  ) {
    super(`object not found: ${bucket}/${key}`);
    this.name = 'ObjectNotFoundError';
  }
}

/* ── Key layout ────────────────────────────────────────────────────────────── */

/**
 * Storage keys are STRUCTURED, not random.
 *
 * Prefixing by story then page means a story's media is one `list` call and one delete
 * sweep — which is what makes a KVKK erasure request a bounded operation instead of a scan.
 * The rendition name is in the leaf so a CDN can be told to cache thumbs harder than
 * retina files.
 */
export const storageKeys = {
  stylePlate: (storyId: string) => `stories/${storyId}/style-plate.png`,
  characterSheet: (storyId: string, characterId: string, variant: number) =>
    `stories/${storyId}/characters/${characterId}/sheet-${String(variant).padStart(2, '0')}.png`,
  faceRef: (storyId: string, characterId: string) =>
    `stories/${storyId}/characters/${characterId}/face-ref.png`,
  pageScreen: (storyId: string, pageNo: number, rendition: string, ext: string) =>
    `stories/${storyId}/pages/${String(pageNo).padStart(2, '0')}/${rendition}.${ext}`,
  coverScreen: (storyId: string, rendition: string, ext: string) =>
    `stories/${storyId}/cover/${rendition}.${ext}`,
  pagePrint: (storyId: string, pageNo: number, ext: string) =>
    `stories/${storyId}/print/${String(pageNo).padStart(2, '0')}.${ext}`,
  coverPrint: (storyId: string, ext: string) => `stories/${storyId}/print/cover.${ext}`,
} as const;
