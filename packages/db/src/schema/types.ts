/**
 * Shared column helpers and JSONB payload shapes.
 *
 * Everything here exists so the twelve schema modules stay a literal transcription of
 * docs/SPEC-DATA-MODEL.md §4 — no invented columns, no invented constraints.
 */
import { sql, type SQL, type SQLWrapper } from 'drizzle-orm';
import { customType, timestamp } from 'drizzle-orm/pg-core';

/* ── column helpers ───────────────────────────────────────────────────────── */

/**
 * `citext` — case-insensitive text. Requires `CREATE EXTENSION citext`, which migration
 * 0000 installs. Used only for `users.email`: an address differing in case is the same
 * address, and enforcing that in the database beats remembering to `lower()` at 40 call
 * sites.
 */
export const citext = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'citext';
  },
});

/** `timestamptz`. Every timestamp in this schema is timezone-aware — never `timestamp`. */
export const tstz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

/**
 * Renders `col in ('a','b',…)` for a CHECK constraint.
 *
 * The literals go through `sql.raw` on purpose: a CHECK lives in DDL, where a bind
 * parameter cannot appear. Values come exclusively from the frozen tuples below, never
 * from user input.
 */
export function inValues(column: SQLWrapper, values: readonly string[]): SQL {
  return sql`${column} in (${sql.raw(values.map((value) => `'${value}'`).join(', '))})`;
}

/* ── frozen value tuples ──────────────────────────────────────────────────────
 * Each tuple mirrors one CHECK (… IN …) in the spec. They are exported so the API,
 * the workers and the seeds all agree on the same spelling — a typo becomes a type
 * error instead of a runtime constraint violation.
 * ─────────────────────────────────────────────────────────────────────────── */

export const USER_STATUS = ['active', 'suspended', 'deletion_requested', 'deleted'] as const;
export const AUTH_PROVIDER = ['otp_sms', 'otp_email', 'apple', 'google'] as const;
export const OTP_CHANNEL = ['sms', 'email'] as const;
export const NOTIFICATION_PLATFORM = ['web_push', 'ios', 'android'] as const;

export const ASSET_KIND = [
  'voice_reference_raw',
  'voice_take_raw',
  'voice_consent_clip',
  'voice_preview',
  'tts_chunk',
  'tts_full',
  'tts_alignment_json',
  'image_style_plate',
  'image_character_sheet',
  'image_face_ref',
  'image_page_2k',
  'image_page_4k',
  'image_page_screen',
  'pdf_interior',
  'pdf_cover',
  'pdf_digital',
  'pdf_preview',
  'export_mp4',
  'privacy_export',
] as const;
/** `ephemeral_30d` raw voice vs `legal_hold_10y` consent evidence — SPEC §10. */
export const RETENTION_CLASS = ['ephemeral_30d', 'standard', 'legal_hold_10y'] as const;

export const LEGAL_DOCUMENT_KIND = [
  'aydinlatma_genel',
  'aydinlatma_ses',
  'aydinlatma_cocuk',
  'riza_ses_biyometrik',
  'riza_yurtdisi',
  'riza_cocuk',
  'riza_pazarlama',
  'kullanim_kosullari',
  'gizlilik_politikasi',
  'mesafeli_satis',
  'on_bilgilendirme',
] as const;
export const CONSENT_SUBJECT = [
  'ses_biyometrik',
  'yurtdisi_aktarim',
  'cocuk_verisi',
  'pazarlama',
  'aydinlatma_goruntuleme',
] as const;
export const CONSENT_METHOD = ['checkbox', 'voice', 'payment', 'implicit_view'] as const;

export const AGE_BAND = ['3-5', '6-8', '9-12'] as const;
export const GENDER_PRESENTATION = ['kiz', 'erkek', 'belirtilmemis'] as const;

export const CHARACTER_BUILDER_FIELD = [
  'ten_tonu',
  'sac_rengi',
  'sac_tipi',
  'sac_uzunluk',
  'goz_rengi',
  'gozluk',
  'cil',
  'kiyafet',
  'favori_oyuncak',
] as const;
export const BOOK_BINDING = ['sert_kapak', 'amerikan', 'tel_dikis'] as const;
export const COLOR_PROFILE = ['srgb', 'cmyk_x3', 'cmyk_x4'] as const;
export const SYSTEM_VOICE_GENDER = ['kadin', 'erkek', 'notr'] as const;

export const VOICE_TONE_HINT = ['sakin', 'heyecanli', 'fisilti', 'diyalog'] as const;
export const VOICE_RELATION = ['anne', 'baba', 'diger'] as const;
export const VOICE_PROFILE_STATUS = [
  'draft',
  'recording',
  'processing',
  'preview_ready',
  'ready',
  'failed',
  'revoked',
  'deleted',
] as const;
export const VOICE_TAKE_STEP = [
  'mic_test',
  'consent_clip',
  'passage_1',
  'passage_2',
  'passage_3',
  'passage_4',
] as const;
export const VOICE_BINDING_PROVIDER = [
  'elevenlabs',
  'cartesia',
  'azure',
  'openai',
  'google',
  'selfhost',
] as const;
export const VOICE_BINDING_STATE = [
  'creating',
  'active',
  'evicted',
  'deleting',
  'deleted',
  'failed',
] as const;

export const STORY_STATUS = [
  'draft',
  'outline_generating',
  'outline_ready',
  'outline_rejected',
  'content_generating',
  'content_ready',
  'images_generating',
  'ready',
  'approved',
  'failed',
  'archived',
] as const;
export const STORY_CHARACTER_ROLE = [
  'kahraman',
  'yardimci',
  'ebeveyn',
  'hayvan',
  'diger',
] as const;
export const PAGE_EMOTION = [
  'sakin',
  'nese',
  'merak',
  'hafif_endise',
  'cozulme',
  'sicak_kapanis',
] as const;
export const TEXT_SAFE_ZONE = ['bottom', 'top', 'left', 'right'] as const;
export const IMAGE_STATUS = [
  'pending',
  'generating',
  'qa_failed',
  'manual_review',
  'ready',
  'failed',
] as const;
export const REVISION_SOURCE = ['ai', 'user', 'ai_rewrite'] as const;

export const VOICE_KIND = ['cloned', 'system'] as const;
export const AUDIO_TIER = ['draft', 'quality'] as const;
export const AUDIO_STATUS = ['queued', 'running', 'succeeded', 'failed', 'stale'] as const;
export const ALIGNMENT_SOURCE = [
  'provider',
  'forced_alignment',
  'sentence_estimate',
  'none',
] as const;
export const AUDIO_BILLING_UNIT = ['character', 'utf8-byte', 'second'] as const;

export const JOB_KIND = [
  'story_outline',
  'story_fill',
  'story_page_rewrite',
  'voice_create',
  'voice_delete',
  'image_character_sheet',
  'image_book',
  'image_page',
  'audio_render',
  'pdf_build',
  'print_submit',
  'export_mp4',
  'privacy_export',
  'privacy_delete',
] as const;
export const JOB_STATUS = [
  'queued',
  'running',
  'waiting_approval',
  'succeeded',
  'failed',
  'cancelled',
  'dead_letter',
] as const;
export const JOB_STEP_STATUS = ['pending', 'running', 'succeeded', 'failed', 'skipped'] as const;
export const CONTENT_CACHE_KIND = ['image', 'tts_chunk', 'llm'] as const;

export const PLAN_PERIOD = ['month', 'year', 'once'] as const;
export const SUBSCRIPTION_SOURCE = ['web', 'ios_iap', 'android_iap', 'grant'] as const;
export const SUBSCRIPTION_STATUS = [
  'trialing',
  'active',
  'past_due',
  'cancelled',
  'expired',
] as const;
export const RESERVATION_STATE = ['held', 'committed', 'released'] as const;
export const USAGE_BILLING_UNIT = [
  'character',
  'utf8_byte',
  'second',
  'token',
  'image',
  'megapixel',
  'request',
] as const;
export const CREDIT_REASON = [
  'purchase',
  'subscription_grant',
  'free_grant',
  'story_spend',
  'audio_spend',
  'image_retry',
  'refund',
  'admin_adjust',
] as const;
export const CIRCUIT_STATE = ['closed', 'half_open', 'open'] as const;

export const BOOK_BUILD_STATUS = ['building', 'ready', 'failed'] as const;
export const ORDER_STATUS = [
  'created',
  'awaiting_payment',
  'paid',
  'in_production',
  'shipped',
  'delivered',
  'cancelled',
  'refunded',
  'failed',
] as const;
export const PAYMENT_PROVIDER = ['iyzico', 'paytr', 'apple_iap', 'google_iap'] as const;
export const PAYMENT_STATUS = ['init', 'authorized', 'captured', 'failed', 'refunded'] as const;
export const PRINT_PROVIDER = ['manual_tr', 'cloudprinter', 'gelato', 'lulu'] as const;
export const PRINT_JOB_STATUS = [
  'queued',
  'submitted',
  'accepted',
  'printing',
  'shipped',
  'error',
  'cancelled',
] as const;

export const MODERATION_SURFACE = [
  'parent_input',
  'story_text',
  'illustration_prompt',
  'image_output',
  'voice_script',
  'user_edit',
] as const;
export const MODERATION_STAGE = ['pre', 'post'] as const;
export const MODERATION_ENGINE = [
  'deterministic',
  'injection_detector',
  'openai_moderation',
  'llm_judge',
  'age_rubric',
  'provider_block',
  'brand_denylist',
] as const;
export const MODERATION_VERDICT = ['pass', 'flag', 'block'] as const;
export const MODERATION_ACTION = [
  'none',
  'retry',
  'regenerate',
  'manual_review',
  'account_flag',
] as const;

export const ABUSE_TARGET_TYPE = ['story', 'image', 'voice_profile', 'user'] as const;
export const ABUSE_REASON = ['ses_benim_izinsiz', 'uygunsuz_icerik', 'telif', 'diger'] as const;
export const ABUSE_STATUS = ['open', 'triaged', 'actioned', 'rejected'] as const;
export const DSR_KIND = [
  'access',
  'export',
  'rectify',
  'erase',
  'object',
  'consent_withdraw',
] as const;
export const DSR_STATUS = ['received', 'in_progress', 'completed', 'rejected'] as const;
/** The provider deletion chain: erasing our own rows is not erasure (SPEC §10). */
export const DELETION_TARGET = [
  'voice_provider',
  'image_provider',
  'llm_logs',
  'storage_objects',
  'db_rows',
] as const;
export const DELETION_STATUS = ['pending', 'running', 'completed', 'failed'] as const;
export const AUDIT_ACTOR_TYPE = ['user', 'admin', 'system', 'provider'] as const;
export const OUTBOX_STATUS = ['pending', 'sent', 'failed', 'dead'] as const;

/* ── JSONB payload shapes ─────────────────────────────────────────────────────
 * Deliberately open (`[key: string]: unknown`): the columns are jsonb precisely so a
 * provider can add a field without a migration. The named members are the ones the
 * spec commits to.
 * ─────────────────────────────────────────────────────────────────────────── */

export type JsonObject = Record<string, unknown>;

/** `voice_profiles.quality`, `voice_takes.quality`. */
export interface VoiceQuality {
  snrDb?: number;
  clippingPct?: number;
  peakDbfs?: number;
  wpm?: number;
  rt60Ms?: number;
  bandwidthHz?: number;
  silenceRatio?: number;
  [key: string]: unknown;
}

/** `story_pages.image_qa`. */
export interface ImageQa {
  identityCosine?: number;
  ocrHits?: number;
  paletteDeltaE?: number;
  safeZoneVariance?: number;
  [key: string]: unknown;
}

/** `jobs.error`, `job_steps.error`, `audio_renditions.error`. `userMessageTr` is shown verbatim. */
export interface JobError {
  code?: string;
  provider?: string;
  retryable?: boolean;
  userMessageTr?: string;
  [key: string]: unknown;
}

/** `stories.outline` — stage-1 output, frozen before stage-2 fills the pages. */
export interface StoryOutline {
  kitap_meta?: JsonObject;
  karakter_kanonu?: JsonObject;
  sahne_ozeti?: JsonObject[];
  [key: string]: unknown;
}

/** `stories.model_meta` — which model produced which stage, and what it cost. */
export interface ModelMeta {
  [stage: string]: unknown;
}

/** `book_builds.checks` — the preflight gate before a PDF may reach a printer. */
export interface BookBuildChecks {
  dpiOk?: boolean;
  fontsEmbedded?: boolean;
  safeZoneOk?: boolean;
  bleedOk?: boolean;
  [key: string]: unknown;
}

/** `print_jobs.files`. */
export interface PrintFiles {
  interiorUrl?: string;
  coverUrl?: string;
  workOrderPdfUrl?: string;
  [key: string]: unknown;
}
