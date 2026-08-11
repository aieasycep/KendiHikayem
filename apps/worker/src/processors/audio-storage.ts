/**
 * processors/audio-storage.ts — where audio bytes live.
 *
 * Every binary the product produces is described by exactly one `assets` row (schema
 * header), and the bytes themselves sit in object storage. The pipeline talks to this
 * interface rather than to an S3 client for two reasons:
 *
 *  1. There is no S3 in this environment and no credentials, so the integration tests —
 *     including the deletion-chain test, which is the whole point — need a real store they
 *     can inspect. `InMemoryObjectStore` is that store.
 *  2. ⚠️ KVKK (SPEC §2, §10.1). Raw voice recordings must live in a SEPARATE bucket under a
 *     SEPARATE customer-managed key from ordinary media. Making the bucket a parameter of
 *     every call is what stops a raw reference clip from being written next to a page
 *     illustration by a caller who was not thinking about it.
 */

import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { Database } from '@kendihikayem/db';

export interface StoredObject {
  bucket: string;
  key: string;
  bytes: Uint8Array;
  contentType: string;
}

export interface ObjectStore {
  put(input: StoredObject): Promise<void>;
  get(bucket: string, key: string): Promise<Uint8Array | undefined>;
  /** Idempotent: deleting an object that is already gone is a success, not an error. */
  delete(bucket: string, key: string): Promise<void>;
  exists(bucket: string, key: string): Promise<boolean>;
}

/** The test and single-node development store. Production swaps in the S3 client. */
export class InMemoryObjectStore implements ObjectStore {
  private readonly objects = new Map<string, StoredObject>();

  async put(input: StoredObject): Promise<void> {
    this.objects.set(refOf(input.bucket, input.key), input);
  }

  async get(bucket: string, key: string): Promise<Uint8Array | undefined> {
    return this.objects.get(refOf(bucket, key))?.bytes;
  }

  async delete(bucket: string, key: string): Promise<void> {
    this.objects.delete(refOf(bucket, key));
  }

  async exists(bucket: string, key: string): Promise<boolean> {
    return this.objects.has(refOf(bucket, key));
  }

  /** Test affordance: how many objects are left after an erasure ran. */
  get size(): number {
    return this.objects.size;
  }

  keys(): string[] {
    return [...this.objects.keys()];
  }
}

/** `deletion_tasks.ref` for a storage object. One string, parseable both ways. */
export function refOf(bucket: string, key: string): string {
  return `${bucket}/${key}`;
}

export function parseRef(ref: string): { bucket: string; key: string } {
  const slash = ref.indexOf('/');
  if (slash < 0) return { bucket: ref, key: '' };
  return { bucket: ref.slice(0, slash), key: ref.slice(slash + 1) };
}

export interface WriteAssetInput {
  db: Database;
  store: ObjectStore;
  userId: string;
  bucket: string;
  key: string;
  bytes: Uint8Array;
  mimeType: string;
  kind: string;
  retentionClass?: 'ephemeral_30d' | 'standard' | 'legal_hold_10y';
  durationMs?: number;
  sampleRateHz?: number;
  channels?: number;
  provider?: string;
  kmsKeyAlias?: string;
  /** Sets `assets.purge_after`, which the purge cron reads and nothing else. */
  purgeAfterDays?: number;
}

/**
 * Writes the bytes and the row that describes them, in that order.
 *
 * Bytes first is deliberate: a row pointing at an object that does not exist is a broken
 * player for a parent, while an object with no row is invisible garbage the purge sweep
 * cleans up. Given that one of the two has to lose on a crash, it should be the one that
 * costs storage rather than the one that costs a bedtime story.
 */
export async function writeAudioAsset(input: WriteAssetInput): Promise<string> {
  await input.store.put({
    bucket: input.bucket,
    key: input.key,
    bytes: input.bytes,
    contentType: input.mimeType,
  });

  const sha256 = createHash('sha256').update(input.bytes).digest('hex');
  const rows = await input.db.execute<{ id: string }>(sql`
    insert into assets (owner_user_id, kind, bucket, storage_key, mime_type, size_bytes,
                        sha256, duration_ms, sample_rate_hz, channels, provider,
                        kms_key_alias, retention_class, purge_after)
    values (${input.userId}, ${input.kind}, ${input.bucket}, ${input.key}, ${input.mimeType},
            ${input.bytes.byteLength}, ${sha256}, ${input.durationMs ?? null},
            ${input.sampleRateHz ?? null}, ${input.channels ?? null}, ${input.provider ?? null},
            ${input.kmsKeyAlias ?? null}, ${input.retentionClass ?? 'standard'},
            ${input.purgeAfterDays === undefined ? null : sql`now() + make_interval(days => ${input.purgeAfterDays})`})
    on conflict (bucket, storage_key) do update
       set size_bytes = excluded.size_bytes,
           sha256 = excluded.sha256,
           duration_ms = excluded.duration_ms
    returning id
  `);
  return rows[0]!.id;
}

export async function readAudioAsset(
  db: Database,
  store: ObjectStore,
  assetId: string,
): Promise<{ bytes: Uint8Array; mimeType: string } | undefined> {
  const rows = await db.execute<{ bucket: string; storage_key: string; mime_type: string }>(sql`
    select bucket, storage_key, mime_type from assets where id = ${assetId} and purged_at is null
  `);
  const row = rows[0];
  if (!row) return undefined;
  const bytes = await store.get(row.bucket, row.storage_key);
  return bytes ? { bytes, mimeType: row.mime_type } : undefined;
}

/** Storage keys. Grouped by owner so an erasure request can be scoped by prefix. */
export const audioKeys = {
  voiceTake: (profileId: string, step: string, attempt: number) =>
    `voice/${profileId}/takes/${step}-${attempt}.wav`,
  voiceConsentClip: (profileId: string) => `voice/${profileId}/consent.wav`,
  voiceReference: (profileId: string) => `voice/${profileId}/reference.wav`,
  voicePreview: (profileId: string) => `voice/${profileId}/preview.wav`,
  narrationChunk: (renditionId: string, index: number) =>
    `story/${renditionId}/chunk-${String(index).padStart(3, '0')}.pcm`,
  narrationFull: (renditionId: string) => `story/${renditionId}/narration.wav`,
  alignment: (renditionId: string) => `story/${renditionId}/alignment.json`,
} as const;
