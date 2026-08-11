/**
 * §7 HİKAYE — the story itself, its cast, its pages and the edit history of those pages.
 *
 * Two hashes carry the cost model:
 *   `story_pages.text_sha256`   → TTS cache key. Re-narrating unchanged text is free.
 *   `story_pages.prompt_sha256` → image cache key. Re-rendering an unchanged prompt is free.
 * Both feed `content_cache`; see jobs.ts.
 *
 * `stories.approved_at` is a hard gate, not a timestamp for display: no TTS render and no
 * print job may start until a human parent has approved the text.
 *
 * Transcribed from docs/SPEC-DATA-MODEL.md §4.7.
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
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { assets } from './assets.ts';
import { artStyles, storyThemes } from './catalog.ts';
import { children } from './children.ts';
import { users } from './identity.ts';
import {
  AGE_BAND,
  IMAGE_STATUS,
  PAGE_EMOTION,
  REVISION_SOURCE,
  STORY_CHARACTER_ROLE,
  STORY_STATUS,
  TEXT_SAFE_ZONE,
  type ImageQa,
  type JsonObject,
  type ModelMeta,
  type StoryOutline,
  inValues,
  tstz,
} from './types.ts';

export const stories = pgTable(
  'stories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    childId: uuid('child_id').references(() => children.id, { onDelete: 'set null' }),
    title: text('title'),
    ageBand: text('age_band').notNull(),
    themeCode: text('theme_code').references(() => storyThemes.code),
    artStyleCode: text('art_style_code')
      .notNull()
      .references(() => artStyles.code),
    heroName: text('hero_name').notNull(),
    heroIsChild: boolean('hero_is_child').notNull().default(true),
    /** 12 spreads = 24 printed pages. */
    pageCount: integer('page_count').notNull().default(12),
    language: text('language').notNull().default('tr-TR'),
    status: text('status').notNull().default('draft'),
    religiousOptIn: boolean('religious_opt_in').notNull().default(false),
    culturalTags: text('cultural_tags').array().notNull().default([]),
    lessonTr: text('lesson_tr'),
    /** SANITISED parent input. The raw string never lands here. */
    requestInput: jsonb('request_input').$type<JsonObject>().notNull(),
    outline: jsonb('outline').$type<StoryOutline>(),
    safety: jsonb('safety').$type<JsonObject>(),
    modelMeta: jsonb('model_meta').$type<ModelMeta>(),
    costUsd: numeric('cost_usd', { precision: 10, scale: 4 }).notNull().default('0'),
    seriesId: uuid('series_id'),
    seriesIndex: integer('series_index'),
    isFavorite: boolean('is_favorite').notNull().default(false),
    /** Precondition for TTS and for print. Nothing downstream may ignore it. */
    approvedAt: tstz('approved_at'),
    readyAt: tstz('ready_at'),
    createdAt: tstz('created_at').notNull().defaultNow(),
    updatedAt: tstz('updated_at').notNull().defaultNow(),
    deletedAt: tstz('deleted_at'),
  },
  (t) => [
    check('stories_age_band_check', inValues(t.ageBand, AGE_BAND)),
    check('stories_status_check', inValues(t.status, STORY_STATUS)),
    index('stories_user_idx')
      .on(t.userId, t.createdAt.desc())
      .where(sql`${t.deletedAt} is null`),
    index('stories_child_idx')
      .on(t.childId, t.createdAt.desc())
      .where(sql`${t.deletedAt} is null`),
    index('stories_series_idx').on(t.seriesId, t.seriesIndex),
  ],
);

export const storyCharacters = pgTable(
  'story_characters',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storyId: uuid('story_id')
      .notNull()
      .references(() => stories.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    nameTr: text('name_tr').notNull(),
    /** CHARACTER_DNA. Written once at cast time and never rewritten — identity drift
     *  across twelve illustrations is the single most visible failure mode. */
    canonEn: text('canon_en').notNull(),
    builderInput: jsonb('builder_input').$type<JsonObject>(),
    characterSheetAssetId: uuid('character_sheet_asset_id').references(() => assets.id),
    faceRefAssetId: uuid('face_ref_asset_id').references(() => assets.id),
    /** The three variants shown to the parent before the cast is locked. */
    sheetVariants: jsonb('sheet_variants').$type<JsonObject>(),
    isPrimary: boolean('is_primary').notNull().default(false),
    reusableForChildId: uuid('reusable_for_child_id').references(() => children.id),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  (t) => [check('story_characters_role_check', inValues(t.role, STORY_CHARACTER_ROLE))],
);

export const storyPages = pgTable(
  'story_pages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storyId: uuid('story_id')
      .notNull()
      .references(() => stories.id, { onDelete: 'cascade' }),
    pageNo: integer('page_no').notNull(),
    textTr: text('text_tr'),
    /** TTS cache key. */
    textSha256: text('text_sha256'),
    sceneSummaryTr: text('scene_summary_tr'),
    illustrationPromptEn: text('illustration_prompt_en'),
    /** Image cache key. */
    promptSha256: text('prompt_sha256'),
    emotion: text('emotion'),
    timeOfDay: text('time_of_day'),
    camera: text('camera'),
    /** Where the typeset text will sit, so the illustrator leaves that area quiet. */
    textSafeZone: text('text_safe_zone').notNull().default('bottom'),
    wordCount: integer('word_count'),
    /** Screen render (2K). */
    imageAssetId: uuid('image_asset_id').references(() => assets.id),
    /** Print render (4K). */
    imagePrintAssetId: uuid('image_print_asset_id').references(() => assets.id),
    imageStatus: text('image_status').notNull().default('pending'),
    imageAttempts: integer('image_attempts').notNull().default(0),
    imageQa: jsonb('image_qa').$type<ImageQa>(),
    editedByUser: boolean('edited_by_user').notNull().default(false),
    createdAt: tstz('created_at').notNull().defaultNow(),
    updatedAt: tstz('updated_at').notNull().defaultNow(),
  },
  (t) => [
    check('story_pages_emotion_check', inValues(t.emotion, PAGE_EMOTION)),
    check('story_pages_text_safe_zone_check', inValues(t.textSafeZone, TEXT_SAFE_ZONE)),
    check('story_pages_image_status_check', inValues(t.imageStatus, IMAGE_STATUS)),
    unique('story_pages_story_page_no_key').on(t.storyId, t.pageNo),
  ],
);

/** Append-only edit history so a parent's rewrite is always reversible. */
export const storyPageRevisions = pgTable(
  'story_page_revisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pageId: uuid('page_id')
      .notNull()
      .references(() => storyPages.id, { onDelete: 'cascade' }),
    revision: integer('revision').notNull(),
    textTr: text('text_tr'),
    source: text('source').notNull(),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  (t) => [
    check('story_page_revisions_source_check', inValues(t.source, REVISION_SOURCE)),
    unique('story_page_revisions_page_revision_key').on(t.pageId, t.revision),
  ],
);
