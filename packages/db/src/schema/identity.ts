/**
 * §1 KİMLİK — users, auth identities, OTP, sessions, push tokens.
 *
 * Transcribed from docs/SPEC-DATA-MODEL.md §4.1.
 */
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  inet,
  integer,
  pgTable,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import {
  AUTH_PROVIDER,
  NOTIFICATION_PLATFORM,
  OTP_CHANNEL,
  USER_STATUS,
  citext,
  inValues,
  tstz,
} from './types.ts';

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** A parent may create a story before signing up; the guest row is upgraded in place. */
    isGuest: boolean('is_guest').notNull().default(true),
    guestDeviceId: text('guest_device_id'),
    phoneE164: text('phone_e164').unique(),
    email: citext('email').unique(),
    displayName: text('display_name'),
    locale: text('locale').notNull().default('tr-TR'),
    timezone: text('timezone').notNull().default('Europe/Istanbul'),
    /** KVKK: only an adult may consent to voice cloning on a child's behalf. */
    isAdultDeclared: boolean('is_adult_declared').notNull().default(false),
    adultDeclaredAt: tstz('adult_declared_at'),
    status: text('status').notNull().default('active'),
    marketingOptIn: boolean('marketing_opt_in').notNull().default(false),
    /** İleti Yönetim Sistemi reconciliation timestamp. */
    iysSyncedAt: tstz('iys_synced_at'),
    policyVersion: text('policy_version').notNull().default('v1'),
    createdAt: tstz('created_at').notNull().defaultNow(),
    updatedAt: tstz('updated_at').notNull().defaultNow(),
    lastSeenAt: tstz('last_seen_at'),
    deletionRequestedAt: tstz('deletion_requested_at'),
    deletedAt: tstz('deleted_at'),
  },
  (t) => [
    check('users_status_check', inValues(t.status, USER_STATUS)),
    /** A non-guest row without any contact channel is unreachable and unrecoverable. */
    check(
      'users_contactable_check',
      sql`${t.isGuest} or ${t.phoneE164} is not null or ${t.email} is not null`,
    ),
    index('users_guest_device_idx').on(t.guestDeviceId).where(sql`${t.isGuest}`),
  ],
);

export const authIdentities = pgTable(
  'auth_identities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    providerUid: text('provider_uid').notNull(),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  (t) => [
    check('auth_identities_provider_check', inValues(t.provider, AUTH_PROVIDER)),
    unique('auth_identities_provider_uid_key').on(t.provider, t.providerUid),
  ],
);

export const otpChallenges = pgTable(
  'otp_challenges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    channel: text('channel').notNull(),
    destination: text('destination').notNull(),
    /** Never the code itself: an operator with a psql prompt must not be able to log in. */
    codeHash: text('code_hash').notNull(),
    attempts: integer('attempts').notNull().default(0),
    ip: inet('ip'),
    expiresAt: tstz('expires_at').notNull(),
    consumedAt: tstz('consumed_at'),
    createdAt: tstz('created_at').notNull().defaultNow(),
  },
  (t) => [
    check('otp_challenges_channel_check', inValues(t.channel, OTP_CHANNEL)),
    index('otp_dest_idx').on(t.destination, t.createdAt.desc()),
  ],
);

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  refreshTokenHash: text('refresh_token_hash').notNull().unique(),
  deviceId: text('device_id'),
  userAgent: text('user_agent'),
  ip: inet('ip'),
  expiresAt: tstz('expires_at').notNull(),
  revokedAt: tstz('revoked_at'),
  createdAt: tstz('created_at').notNull().defaultNow(),
});

export const notificationTokens = pgTable(
  'notification_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    platform: text('platform').notNull(),
    token: text('token').notNull(),
    createdAt: tstz('created_at').notNull().defaultNow(),
    revokedAt: tstz('revoked_at'),
  },
  (t) => [
    check('notification_tokens_platform_check', inValues(t.platform, NOTIFICATION_PLATFORM)),
    unique('notification_tokens_platform_token_key').on(t.platform, t.token),
  ],
);
