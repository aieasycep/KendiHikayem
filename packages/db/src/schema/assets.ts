/**
 * §2 VARLIKLAR — every binary the product produces or ingests lives in S3 and is
 * described by exactly one `assets` row. Nothing else in the schema stores a bucket key.
 *
 * `retention_class` is the load-bearing column: `ephemeral_30d` is what a raw voice
 * recording gets (KVKK data minimisation), `legal_hold_10y` is what a consent clip gets
 * (the burden of proving consent outlives the account). The purge cron reads
 * `assets_purge_idx` and nothing else.
 *
 * Transcribed from docs/SPEC-DATA-MODEL.md §4.2.
 */
import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  integer,
  pgTable,
  smallint,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { users } from './identity.ts';
import { ASSET_KIND, RETENTION_CLASS, inValues, tstz } from './types.ts';

export const assets = pgTable(
  'assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** SET NULL, not CASCADE: deleting a user must not orphan the S3 purge task. */
    ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
    kind: text('kind').notNull(),
    bucket: text('bucket').notNull(),
    storageKey: text('storage_key').notNull(),
    region: text('region').notNull().default('eu-central-1'),
    /** Raw voice lives under its own CMK (Kurul 2018/10). */
    kmsKeyAlias: text('kms_key_alias'),
    mimeType: text('mime_type').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }),
    /** Part of the content-cache key — see `content_cache`. */
    sha256: text('sha256'),
    durationMs: integer('duration_ms'),
    sampleRateHz: integer('sample_rate_hz'),
    channels: smallint('channels'),
    widthPx: integer('width_px'),
    heightPx: integer('height_px'),
    provider: text('provider'),
    retentionClass: text('retention_class').notNull().default('standard'),
    purgeAfter: tstz('purge_after'),
    purgedAt: tstz('purged_at'),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  (t) => [
    check('assets_kind_check', inValues(t.kind, ASSET_KIND)),
    check('assets_retention_class_check', inValues(t.retentionClass, RETENTION_CLASS)),
    unique('assets_bucket_key_key').on(t.bucket, t.storageKey),
    index('assets_purge_idx')
      .on(t.purgeAfter)
      .where(sql`${t.purgedAt} is null and ${t.purgeAfter} is not null`),
    index('assets_owner_kind_idx').on(t.ownerUserId, t.kind),
  ],
);
