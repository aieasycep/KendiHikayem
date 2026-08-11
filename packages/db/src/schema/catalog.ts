/**
 * §5 KATALOG — editorially curated, seeded, never user-writable.
 *
 * These tables are the guardrails on generation: a parent picks a theme, an art style and
 * builder traits from here, and the prompt is assembled from `prompt_pack` / `style_dna_en`
 * / `dna_en`. Free text never reaches the model unchecked, and the same `style_dna_en` block
 * copied verbatim into every page prompt is what keeps twelve illustrations looking like one
 * book.
 *
 * Transcribed from docs/SPEC-DATA-MODEL.md §4.5.
 */
import { boolean, check, integer, jsonb, numeric, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';

import { assets } from './assets';
import {
  AGE_BAND,
  BOOK_BINDING,
  CHARACTER_BUILDER_FIELD,
  COLOR_PROFILE,
  SYSTEM_VOICE_GENDER,
  type JsonObject,
  inValues,
} from './types';

export const storyThemes = pgTable('story_themes', {
  /** e.g. 'uyku_oncesi', '23_nisan'. */
  code: text('code').primaryKey(),
  titleTr: text('title_tr').notNull(),
  subtitleTr: text('subtitle_tr'),
  /** e.g. 'Yolculuk → dinlenme'. */
  archetype: text('archetype'),
  ageBands: text('age_bands').array().notNull(),
  icon: text('icon'),
  /** Mechanical rules, refrain, resolution shape — merged into the stage-1 prompt. */
  promptPack: jsonb('prompt_pack').$type<JsonObject>().notNull(),
  sampleFirstLineTr: text('sample_first_line_tr'),
  isReligious: boolean('is_religious').notNull().default(false),
  culturalTag: text('cultural_tag'),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
});

export const artStyles = pgTable('art_styles', {
  /** e.g. 'suluboya', 'duz_vektor'. */
  code: text('code').primaryKey(),
  titleTr: text('title_tr').notNull(),
  /** Copied verbatim into every page prompt — do not paraphrase per page. */
  styleDnaEn: text('style_dna_en').notNull(),
  negativePromptEn: text('negative_prompt_en').notNull(),
  stylePlateAssetId: uuid('style_plate_asset_id').references(() => assets.id),
  previewAssetId: uuid('preview_asset_id').references(() => assets.id),
  isVector: boolean('is_vector').notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
});

/** The photo-free character builder. `dna_en` is the English fragment the model sees. */
export const characterBuilderOptions = pgTable(
  'character_builder_options',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    field: text('field').notNull(),
    code: text('code').notNull(),
    labelTr: text('label_tr').notNull(),
    swatchHex: text('swatch_hex'),
    /** e.g. "warm olive skin". */
    dnaEn: text('dna_en').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [
    check('character_builder_options_field_check', inValues(t.field, CHARACTER_BUILDER_FIELD)),
    unique('character_builder_options_field_code_key').on(t.field, t.code),
  ],
);

export const bookFormats = pgTable(
  'book_formats',
  {
    /** e.g. 'kare21_24_sert'. */
    code: text('code').primaryKey(),
    titleTr: text('title_tr').notNull(),
    trimWMm: numeric('trim_w_mm', { precision: 6, scale: 2 }).notNull(),
    trimHMm: numeric('trim_h_mm', { precision: 6, scale: 2 }).notNull(),
    /** Common denominator across printers (Lulu 3.175 / Gelato 4). */
    bleedMm: numeric('bleed_mm', { precision: 4, scale: 2 }).notNull().default('5.0'),
    /** Covers Lulu's 19 mm casewrap requirement. */
    safeMm: numeric('safe_mm', { precision: 4, scale: 2 }).notNull().default('20.0'),
    /** Must be a multiple of 4 — printers fold in signatures. */
    pageCount: integer('page_count').notNull(),
    binding: text('binding').notNull(),
    paper: text('paper').notNull(),
    colorProfile: text('color_profile').notNull().default('srgb'),
    targetDpi: integer('target_dpi').notNull().default(300),
    basePriceTry: numeric('base_price_try', { precision: 10, scale: 2 }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
  },
  (t) => [
    check('book_formats_binding_check', inValues(t.binding, BOOK_BINDING)),
    check('book_formats_color_profile_check', inValues(t.colorProfile, COLOR_PROFILE)),
  ],
);

/** The fallback narrators, for parents who do not want to clone their own voice. */
export const systemVoices = pgTable(
  'system_voices',
  {
    /** e.g. 'zeynep_sicak'. */
    code: text('code').primaryKey(),
    displayName: text('display_name').notNull(),
    descriptionTr: text('description_tr'),
    gender: text('gender'),
    provider: text('provider').notNull(),
    providerVoiceId: text('provider_voice_id').notNull(),
    sampleAssetId: uuid('sample_asset_id').references(() => assets.id),
    ageBands: text('age_bands')
      .array()
      .notNull()
      .default([...AGE_BAND]),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
  },
  (t) => [check('system_voices_gender_check', inValues(t.gender, SYSTEM_VOICE_GENDER))],
);
