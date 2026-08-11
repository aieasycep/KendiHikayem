/**
 * §8 SESLENDİRME — narration renders and their page-level sync marks.
 *
 * Word-level timings are deliberately NOT rows here. A thousand words × N renditions is
 * millions of rows that are never queried individually — they are read once, whole, by the
 * player. They live as JSON in S3 behind `alignment_asset_id`. Page marks (~24 per
 * rendition) do get rows, because the reader seeks by page.
 *
 * `audio_rend_dedupe_idx` is the money index: `content_hash` = sha256(text + voice + tier +
 * model), so asking twice for the same narration returns the first one instead of paying
 * the provider again. The partial predicate excludes `failed`/`stale` so a retry is allowed.
 *
 * Transcribed from docs/SPEC-DATA-MODEL.md §4.8.
 */
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { assets } from './assets.ts';
import { systemVoices } from './catalog.ts';
import { stories, storyPages } from './stories.ts';
import {
  ALIGNMENT_SOURCE,
  AUDIO_BILLING_UNIT,
  AUDIO_STATUS,
  AUDIO_TIER,
  VOICE_KIND,
  type JobError,
  inValues,
  tstz,
} from './types.ts';
import { voiceProfiles } from './voice.ts';

export const audioRenditions = pgTable(
  'audio_renditions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storyId: uuid('story_id')
      .notNull()
      .references(() => stories.id, { onDelete: 'cascade' }),
    voiceKind: text('voice_kind').notNull(),
    /** SET NULL: revoking a voice profile must not delete the books already narrated. */
    voiceProfileId: uuid('voice_profile_id').references(() => voiceProfiles.id, {
      onDelete: 'set null',
    }),
    systemVoiceCode: text('system_voice_code').references(() => systemVoices.code),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    tier: text('tier').notNull().default('quality'),
    status: text('status').notNull().default('queued'),
    fullAssetId: uuid('full_asset_id').references(() => assets.id),
    /** Word-level timings as a single JSON object in S3 — see the file header. */
    alignmentAssetId: uuid('alignment_asset_id').references(() => assets.id),
    alignmentSource: text('alignment_source'),
    durationMs: integer('duration_ms'),
    billedUnits: bigint('billed_units', { mode: 'number' }),
    billingUnit: text('billing_unit'),
    costUsd: numeric('cost_usd', { precision: 10, scale: 5 }),
    /** sha256(text + voice + tier + model) — the dedupe key. */
    contentHash: text('content_hash'),
    isDefault: boolean('is_default').notNull().default(false),
    error: jsonb('error').$type<JobError>(),
    createdAt: tstz('created_at').notNull().defaultNow(),
    completedAt: tstz('completed_at'),
  },
  (t) => [
    check('audio_renditions_voice_kind_check', inValues(t.voiceKind, VOICE_KIND)),
    check('audio_renditions_tier_check', inValues(t.tier, AUDIO_TIER)),
    check('audio_renditions_status_check', inValues(t.status, AUDIO_STATUS)),
    check('audio_renditions_alignment_source_check', inValues(t.alignmentSource, ALIGNMENT_SOURCE)),
    check('audio_renditions_billing_unit_check', inValues(t.billingUnit, AUDIO_BILLING_UNIT)),
    /** A rendition must actually name a voice — either a cloned profile or a system one. */
    check(
      'audio_renditions_voice_ref_check',
      sql`(${t.voiceKind} = 'cloned' and ${t.voiceProfileId} is not null)
       or (${t.voiceKind} = 'system' and ${t.systemVoiceCode} is not null)`,
    ),
    uniqueIndex('audio_rend_dedupe_idx')
      .on(t.storyId, t.contentHash)
      .where(sql`${t.status} in ('queued','running','succeeded')`),
  ],
);

export const audioPageMarks = pgTable(
  'audio_page_marks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    renditionId: uuid('rendition_id')
      .notNull()
      .references(() => audioRenditions.id, { onDelete: 'cascade' }),
    pageId: uuid('page_id')
      .notNull()
      .references(() => storyPages.id, { onDelete: 'cascade' }),
    pageNo: integer('page_no').notNull(),
    startMs: integer('start_ms').notNull(),
    endMs: integer('end_ms').notNull(),
    chunkAssetId: uuid('chunk_asset_id').references(() => assets.id),
  },
  (t) => [unique('audio_page_marks_rendition_page_key').on(t.renditionId, t.pageNo)],
);
