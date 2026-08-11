/**
 * §6 SES — the voice-cloning pipeline (SPEC §7).
 *
 * Two things here are not obvious from the column list:
 *
 *  1. `voice_profiles.consent_id` is the gate. A profile without a consent row is a
 *     biometric processing violation, not a missing field, so the FK exists even though it
 *     is nullable while the profile is still a `draft`.
 *
 *  2. `voice_provider_bindings` exists because a cloned voice is *rented*, not owned.
 *     ElevenLabs caps us at ~660 concurrent slots, so `vpb_evict_idx` drives an LRU
 *     eviction sweep over `state = 'active' and occupies_slot`. A profile can therefore be
 *     `ready` in our database while its provider binding is `evicted` — re-creating it is a
 *     job, not an error.
 *
 * Transcribed from docs/SPEC-DATA-MODEL.md §4.6.
 */
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { assets } from './assets.ts';
import { consents } from './consents.ts';
import { users } from './identity.ts';
import {
  VOICE_BINDING_PROVIDER,
  VOICE_BINDING_STATE,
  VOICE_PROFILE_STATUS,
  VOICE_RELATION,
  VOICE_TAKE_STEP,
  VOICE_TONE_HINT,
  type JobError,
  type VoiceQuality,
  inValues,
  tstz,
} from './types.ts';

/** Versioned passages the parent reads aloud. Turkish-heavy on ğıöüşç by design. */
export const voiceScripts = pgTable(
  'voice_scripts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    step: text('step').notNull(),
    locale: text('locale').notNull().default('tr-TR'),
    version: text('version').notNull(),
    titleTr: text('title_tr').notNull(),
    bodyTr: text('body_tr').notNull(),
    targetSec: integer('target_sec').notNull(),
    toneHint: text('tone_hint'),
    isActive: boolean('is_active').notNull().default(true),
  },
  (t) => [check('voice_scripts_tone_hint_check', inValues(t.toneHint, VOICE_TONE_HINT))],
);

export const voiceProfiles = pgTable(
  'voice_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** What the child calls this voice: "Anne", "Babaannem". */
    displayName: text('display_name').notNull(),
    relation: text('relation').notNull(),
    locale: text('locale').notNull().default('tr-TR'),
    status: text('status').notNull().default('draft'),
    consentId: uuid('consent_id').references(() => consents.id),
    consentClipAssetId: uuid('consent_clip_asset_id').references(() => assets.id),
    /** The stitched 90–120 s reference. `ephemeral_30d` retention. */
    referenceAssetId: uuid('reference_asset_id').references(() => assets.id),
    previewAssetId: uuid('preview_asset_id').references(() => assets.id),
    quality: jsonb('quality').$type<VoiceQuality>(),
    qualityScore: numeric('quality_score', { precision: 4, scale: 3 }),
    /** How well the read-back matched a randomly chosen sentence — anti-replay. */
    asrMatchScore: numeric('asr_match_score', { precision: 4, scale: 3 }),
    failureReason: text('failure_reason'),
    acceptedAt: tstz('accepted_at'),
    lastUsedAt: tstz('last_used_at'),
    revokedAt: tstz('revoked_at'),
    deletedAt: tstz('deleted_at'),
    createdAt: tstz('created_at').notNull().defaultNow(),
    updatedAt: tstz('updated_at').notNull().defaultNow(),
  },
  (t) => [
    check('voice_profiles_relation_check', inValues(t.relation, VOICE_RELATION)),
    check('voice_profiles_status_check', inValues(t.status, VOICE_PROFILE_STATUS)),
    uniqueIndex('voice_profiles_user_name_idx')
      .on(t.userId, sql`lower(${t.displayName})`)
      .where(sql`${t.deletedAt} is null`),
    /** Supports the "at most 2 active profiles per account" rule the API enforces. */
    index('voice_profiles_active_idx')
      .on(t.userId)
      .where(sql`${t.status} in ('ready','preview_ready') and ${t.deletedAt} is null`),
  ],
);

/** One row per recording attempt, so a parent can retry a single passage. */
export const voiceTakes = pgTable(
  'voice_takes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    voiceProfileId: uuid('voice_profile_id')
      .notNull()
      .references(() => voiceProfiles.id, { onDelete: 'cascade' }),
    step: text('step').notNull(),
    attempt: integer('attempt').notNull().default(1),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id),
    scriptId: uuid('script_id').references(() => voiceScripts.id),
    expectedText: text('expected_text'),
    asrText: text('asr_text'),
    asrSimilarity: numeric('asr_similarity', { precision: 4, scale: 3 }),
    quality: jsonb('quality').$type<VoiceQuality>(),
    accepted: boolean('accepted').notNull().default(false),
    /** Machine codes turned into Turkish coaching in the app: ['GURULTULU','KISA']. */
    issues: text('issues').array().notNull().default([]),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  (t) => [
    check('voice_takes_step_check', inValues(t.step, VOICE_TAKE_STEP)),
    index('voice_takes_profile_idx').on(t.voiceProfileId, t.step, t.attempt.desc()),
  ],
);

export const voiceProviderBindings = pgTable(
  'voice_provider_bindings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    voiceProfileId: uuid('voice_profile_id')
      .notNull()
      .references(() => voiceProfiles.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    providerVoiceId: text('provider_voice_id'),
    providerConsentId: text('provider_consent_id'),
    /** Providers that take the embedding inline hold no slot at all. */
    inlineEmbedding: text('inline_embedding'),
    occupiesSlot: boolean('occupies_slot').notNull().default(true),
    /** Created for one render and torn down — the release valve under the 660 ceiling. */
    isEphemeral: boolean('is_ephemeral').notNull().default(false),
    state: text('state').notNull().default('creating'),
    lastUsedAt: tstz('last_used_at'),
    expiresAt: tstz('expires_at'),
    error: jsonb('error').$type<JobError>(),
    createdAt: tstz('created_at').notNull().defaultNow(),
    deletedAt: tstz('deleted_at'),
  },
  (t) => [
    check('voice_provider_bindings_provider_check', inValues(t.provider, VOICE_BINDING_PROVIDER)),
    check('voice_provider_bindings_state_check', inValues(t.state, VOICE_BINDING_STATE)),
    uniqueIndex('vpb_profile_provider_idx')
      .on(t.voiceProfileId, t.provider)
      .where(sql`${t.state} <> 'deleted'`),
    /** LRU eviction sweep. Deliberately narrow: only rows that actually cost a slot. */
    index('vpb_evict_idx')
      .on(t.lastUsedAt)
      .where(sql`${t.state} = 'active' and ${t.occupiesSlot}`),
  ],
);
