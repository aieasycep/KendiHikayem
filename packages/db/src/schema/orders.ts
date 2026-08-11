/**
 * §11 BASKI & TİCARET — print-ready builds, QR audio links, orders, payments, printers.
 *
 * The 6502 gate is the reason `orders` carries four withdrawal-waiver columns instead of a
 * single boolean. Turkish consumer law only removes the right of withdrawal for a
 * personalised good if the notice was shown *before* the order was confirmed — so we store
 * which document (`withdrawal_waiver_doc_id`), when it was shown
 * (`withdrawal_waiver_shown_at`) and that it was accepted. The table-level CHECK then
 * refuses to let an order leave `created` without that acceptance: the legal precondition
 * is a constraint, not a code path someone can forget.
 *
 * `page_audio_links.token` is what a QR code in the printed book resolves to. It is
 * unguessable and revocable, because a printed book cannot be recalled.
 *
 * Transcribed from docs/SPEC-DATA-MODEL.md §4.11.
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
import { audioRenditions } from './audio.ts';
import { subscriptions } from './billing.ts';
import { bookFormats } from './catalog.ts';
import { legalDocuments } from './consents.ts';
import { users } from './identity.ts';
import { stories } from './stories.ts';
import {
  BOOK_BUILD_STATUS,
  ORDER_STATUS,
  PAYMENT_PROVIDER,
  PAYMENT_STATUS,
  PRINT_JOB_STATUS,
  PRINT_PROVIDER,
  type BookBuildChecks,
  type JobError,
  type JsonObject,
  type PrintFiles,
  inValues,
  tstz,
} from './types.ts';

export const bookBuilds = pgTable(
  'book_builds',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storyId: uuid('story_id')
      .notNull()
      .references(() => stories.id, { onDelete: 'cascade' }),
    formatCode: text('format_code')
      .notNull()
      .references(() => bookFormats.code),
    revision: integer('revision').notNull().default(1),
    status: text('status').notNull().default('building'),
    interiorPdfAssetId: uuid('interior_pdf_asset_id').references(() => assets.id),
    coverPdfAssetId: uuid('cover_pdf_asset_id').references(() => assets.id),
    previewPdfAssetId: uuid('preview_pdf_asset_id').references(() => assets.id),
    digitalPdfAssetId: uuid('digital_pdf_asset_id').references(() => assets.id),
    spineMm: numeric('spine_mm', { precision: 6, scale: 2 }),
    dedicationTr: text('dedication_tr'),
    /** Which narration the printed QR codes play. */
    qrRenditionId: uuid('qr_rendition_id').references(() => audioRenditions.id),
    checks: jsonb('checks').$type<BookBuildChecks>(),
    warnings: text('warnings').array().notNull().default([]),
    error: jsonb('error').$type<JobError>(),
    createdAt: tstz('created_at').notNull().defaultNow(),
    readyAt: tstz('ready_at'),
  },
  (t) => [
    check('book_builds_status_check', inValues(t.status, BOOK_BUILD_STATUS)),
    unique('book_builds_story_format_revision_key').on(t.storyId, t.formatCode, t.revision),
  ],
);

/** One QR target per printed page. Revocable, because paper is not. */
export const pageAudioLinks = pgTable(
  'page_audio_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookBuildId: uuid('book_build_id')
      .notNull()
      .references(() => bookBuilds.id, { onDelete: 'cascade' }),
    pageNo: integer('page_no').notNull(),
    /** Short and unguessable — it is printed, so it can never be rotated silently. */
    token: text('token').notNull().unique(),
    renditionId: uuid('rendition_id')
      .notNull()
      .references(() => audioRenditions.id),
    hitCount: integer('hit_count').notNull().default(0),
    revokedAt: tstz('revoked_at'),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  (t) => [unique('page_audio_links_build_page_key').on(t.bookBuildId, t.pageNo)],
);

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Human-quotable: 'KH-2026-000123'. */
    orderNo: text('order_no').notNull().unique(),
    /** RESTRICT everywhere: a paid order is a commercial record, not user content. */
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    storyId: uuid('story_id')
      .notNull()
      .references(() => stories.id, { onDelete: 'restrict' }),
    bookBuildId: uuid('book_build_id')
      .notNull()
      .references(() => bookBuilds.id, { onDelete: 'restrict' }),
    status: text('status').notNull().default('created'),
    quantity: integer('quantity').notNull().default(1),
    unitPriceTry: numeric('unit_price_try', { precision: 10, scale: 2 }).notNull(),
    shippingTry: numeric('shipping_try', { precision: 10, scale: 2 }).notNull().default('0'),
    discountTry: numeric('discount_try', { precision: 10, scale: 2 }).notNull().default('0'),
    totalTry: numeric('total_try', { precision: 10, scale: 2 }).notNull(),
    currency: text('currency').notNull().default('TRY'),
    installment: integer('installment').notNull().default(1),
    /** 6502: shown BEFORE confirmation, or the withdrawal exception does not apply. */
    withdrawalWaiverDocId: uuid('withdrawal_waiver_doc_id').references(() => legalDocuments.id),
    withdrawalWaiverShownAt: tstz('withdrawal_waiver_shown_at'),
    withdrawalWaiverAccepted: boolean('withdrawal_waiver_accepted').notNull().default(false),
    distanceContractDocId: uuid('distance_contract_doc_id').references(() => legalDocuments.id),
    recipientName: text('recipient_name').notNull(),
    recipientPhone: text('recipient_phone').notNull(),
    addressLine1: text('address_line1').notNull(),
    addressLine2: text('address_line2'),
    district: text('district').notNull(),
    city: text('city').notNull(),
    postalCode: text('postal_code'),
    country: text('country').notNull().default('TR'),
    giftNoteTr: text('gift_note_tr'),
    createdAt: tstz('created_at').notNull().defaultNow(),
    paidAt: tstz('paid_at'),
    cancelledAt: tstz('cancelled_at'),
  },
  (t) => [
    check('orders_status_check', inValues(t.status, ORDER_STATUS)),
    /** An order cannot progress past `created` without the accepted waiver. */
    check(
      'orders_withdrawal_waiver_check',
      sql`${t.status} = 'created' or ${t.withdrawalWaiverAccepted}`,
    ),
    index('orders_user_idx').on(t.userId, t.createdAt.desc()),
    index('orders_status_idx')
      .on(t.status)
      .where(sql`${t.status} in ('paid','in_production')`),
  ],
);

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'set null' }),
    subscriptionId: uuid('subscription_id').references(() => subscriptions.id, {
      onDelete: 'set null',
    }),
    provider: text('provider').notNull(),
    providerRef: text('provider_ref'),
    amountTry: numeric('amount_try', { precision: 10, scale: 2 }).notNull(),
    installment: integer('installment').notNull().default(1),
    status: text('status').notNull(),
    /** Redact before writing: card data must never land here. */
    raw: jsonb('raw').$type<JsonObject>(),
    createdAt: tstz('created_at').notNull().defaultNow(),
    updatedAt: tstz('updated_at').notNull().defaultNow(),
  },
  (t) => [
    check('payments_provider_check', inValues(t.provider, PAYMENT_PROVIDER)),
    check('payments_status_check', inValues(t.status, PAYMENT_STATUS)),
  ],
);

export const printJobs = pgTable(
  'print_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    providerOrderId: text('provider_order_id'),
    status: text('status').notNull().default('queued'),
    files: jsonb('files').$type<PrintFiles>(),
    costTry: numeric('cost_try', { precision: 10, scale: 2 }),
    trackingCarrier: text('tracking_carrier'),
    trackingNo: text('tracking_no'),
    /** Append-only provider callbacks, kept verbatim for dispute resolution. */
    events: jsonb('events').$type<JsonObject[]>().notNull().default([]),
    operatorNote: text('operator_note'),
    submittedAt: tstz('submitted_at'),
    shippedAt: tstz('shipped_at'),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  (t) => [
    check('print_jobs_provider_check', inValues(t.provider, PRINT_PROVIDER)),
    check('print_jobs_status_check', inValues(t.status, PRINT_JOB_STATUS)),
  ],
);
