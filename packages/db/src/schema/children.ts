/**
 * §4 ÇOCUK PROFİLİ.
 *
 * There is no photo column, and that is a design decision rather than an omission: the
 * character builder produces a likeness from catalogue traits, so the product never needs
 * to store a child's face. Likewise `birth_year` instead of a birth date — the age band is
 * all the story generator uses, so the full date is never collected.
 *
 * Transcribed from docs/SPEC-DATA-MODEL.md §4.4.
 */
import { sql } from 'drizzle-orm';
import { type AnyPgColumn, check, index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { users } from './identity.ts';
import { storyCharacters } from './stories.ts';
import { AGE_BAND, GENDER_PRESENTATION, inValues, tstz } from './types.ts';

export const children = pgTable(
  'children',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Validated against an allowlist regex before insert — it reaches an LLM prompt. */
    givenName: text('given_name').notNull(),
    nickname: text('nickname'),
    birthYear: integer('birth_year'),
    ageBand: text('age_band').notNull(),
    genderPresentation: text('gender_presentation'),
    /** Catalogue codes, never free text: this array is interpolated into a prompt. */
    interests: text('interests').array().notNull().default([]),
    /**
     * Lets "Elif's hero" carry across stories. Circular with `story_characters`, so the
     * reference is declared lazily — see the matching lazy reference in stories.ts.
     */
    defaultCharacterId: uuid('default_character_id').references(
      (): AnyPgColumn => storyCharacters.id,
      { onDelete: 'set null' },
    ),
    createdAt: tstz('created_at').notNull().defaultNow(),
    updatedAt: tstz('updated_at').notNull().defaultNow(),
    deletedAt: tstz('deleted_at'),
  },
  (t) => [
    check('children_birth_year_check', sql`${t.birthYear} between 2005 and 2035`),
    check('children_age_band_check', inValues(t.ageBand, AGE_BAND)),
    check(
      'children_gender_presentation_check',
      inValues(t.genderPresentation, GENDER_PRESENTATION),
    ),
    index('children_user_idx')
      .on(t.userId)
      .where(sql`${t.deletedAt} is null`),
  ],
);
