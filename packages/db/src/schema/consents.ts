/**
 * §3 HUKUK / RIZA — the KVKK proof chain.
 *
 * The single most important column in this file is `consents.document_sha256`. The FK to
 * `legal_documents` says *which document row* was shown; the hash says *what that text
 * actually said at that moment*. If the wording is ever corrected in place, the FK still
 * resolves but the hash no longer matches — and that mismatch is the evidence, not a bug.
 *
 * `user_id` is `ON DELETE RESTRICT` on purpose: a consent record outlives the account it
 * belongs to (ten-year burden of proof), so deleting a user must go through the erasure
 * pipeline rather than a cascade.
 *
 * Transcribed from docs/SPEC-DATA-MODEL.md §4.3.
 */
import { boolean, check, index, inet, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';

import { assets } from './assets';
import { children } from './children';
import { users } from './identity';
import {
  CONSENT_METHOD,
  CONSENT_SUBJECT,
  LEGAL_DOCUMENT_KIND,
  inValues,
  tstz,
} from './types';

export const legalDocuments = pgTable(
  'legal_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind').notNull(),
    /** e.g. '2026-08-01.1' — documents are append-only; a correction is a new version. */
    version: text('version').notNull(),
    locale: text('locale').notNull().default('tr-TR'),
    bodyMd: text('body_md').notNull(),
    bodySha256: text('body_sha256').notNull(),
    publishedAt: tstz('published_at').notNull().defaultNow(),
    effectiveFrom: tstz('effective_from').notNull(),
    effectiveTo: tstz('effective_to'),
  },
  (t) => [
    check('legal_documents_kind_check', inValues(t.kind, LEGAL_DOCUMENT_KIND)),
    unique('legal_documents_kind_version_locale_key').on(t.kind, t.version, t.locale),
  ],
);

export const consents = pgTable(
  'consents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    childId: uuid('child_id').references(() => children.id, { onDelete: 'set null' }),
    subject: text('subject').notNull(),
    granted: boolean('granted').notNull(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => legalDocuments.id),
    /** The proof anchor. Copied at grant time, never recomputed. */
    documentSha256: text('document_sha256').notNull(),
    method: text('method').notNull(),
    /** The spoken consent clip, when `method = 'voice'`. */
    evidenceAssetId: uuid('evidence_asset_id').references(() => assets.id),
    /** OpenAI `cons_…` / Azure consentId — proof we passed consent downstream too. */
    providerConsentId: text('provider_consent_id'),
    ip: inet('ip'),
    userAgent: text('user_agent'),
    deviceId: text('device_id'),
    appVersion: text('app_version'),
    grantedAt: tstz('granted_at').notNull().defaultNow(),
    revokedAt: tstz('revoked_at'),
    revokeReason: text('revoke_reason'),
    /** granted_at + 10 years. Set by the application, not a default: the clock is legal. */
    purgeAfter: tstz('purge_after').notNull(),
  },
  (t) => [
    check('consents_subject_check', inValues(t.subject, CONSENT_SUBJECT)),
    check('consents_method_check', inValues(t.method, CONSENT_METHOD)),
    index('consents_user_subject_idx').on(t.userId, t.subject, t.grantedAt.desc()),
  ],
);
