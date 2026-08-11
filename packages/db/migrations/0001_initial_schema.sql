CREATE TABLE "auth_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_uid" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_identities_provider_uid_key" UNIQUE("provider","provider_uid"),
	CONSTRAINT "auth_identities_provider_check" CHECK ("auth_identities"."provider" in ('otp_sms', 'otp_email', 'apple', 'google'))
);
--> statement-breakpoint
CREATE TABLE "notification_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "notification_tokens_platform_token_key" UNIQUE("platform","token"),
	CONSTRAINT "notification_tokens_platform_check" CHECK ("notification_tokens"."platform" in ('web_push', 'ios', 'android'))
);
--> statement-breakpoint
CREATE TABLE "otp_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" text NOT NULL,
	"destination" text NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"ip" "inet",
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "otp_challenges_channel_check" CHECK ("otp_challenges"."channel" in ('sms', 'email'))
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"refresh_token_hash" text NOT NULL,
	"device_id" text,
	"user_agent" text,
	"ip" "inet",
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_refresh_token_hash_unique" UNIQUE("refresh_token_hash")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"is_guest" boolean DEFAULT true NOT NULL,
	"guest_device_id" text,
	"phone_e164" text,
	"email" "citext",
	"display_name" text,
	"locale" text DEFAULT 'tr-TR' NOT NULL,
	"timezone" text DEFAULT 'Europe/Istanbul' NOT NULL,
	"is_adult_declared" boolean DEFAULT false NOT NULL,
	"adult_declared_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"marketing_opt_in" boolean DEFAULT false NOT NULL,
	"iys_synced_at" timestamp with time zone,
	"policy_version" text DEFAULT 'v1' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	"deletion_requested_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "users_phone_e164_unique" UNIQUE("phone_e164"),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_status_check" CHECK ("users"."status" in ('active', 'suspended', 'deletion_requested', 'deleted')),
	CONSTRAINT "users_contactable_check" CHECK ("users"."is_guest" or "users"."phone_e164" is not null or "users"."email" is not null)
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid,
	"kind" text NOT NULL,
	"bucket" text NOT NULL,
	"storage_key" text NOT NULL,
	"region" text DEFAULT 'eu-central-1' NOT NULL,
	"kms_key_alias" text,
	"mime_type" text NOT NULL,
	"size_bytes" bigint,
	"sha256" text,
	"duration_ms" integer,
	"sample_rate_hz" integer,
	"channels" smallint,
	"width_px" integer,
	"height_px" integer,
	"provider" text,
	"retention_class" text DEFAULT 'standard' NOT NULL,
	"purge_after" timestamp with time zone,
	"purged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assets_bucket_key_key" UNIQUE("bucket","storage_key"),
	CONSTRAINT "assets_kind_check" CHECK ("assets"."kind" in ('voice_reference_raw', 'voice_take_raw', 'voice_consent_clip', 'voice_preview', 'tts_chunk', 'tts_full', 'tts_alignment_json', 'image_style_plate', 'image_character_sheet', 'image_face_ref', 'image_page_2k', 'image_page_4k', 'image_page_screen', 'pdf_interior', 'pdf_cover', 'pdf_digital', 'pdf_preview', 'export_mp4', 'privacy_export')),
	CONSTRAINT "assets_retention_class_check" CHECK ("assets"."retention_class" in ('ephemeral_30d', 'standard', 'legal_hold_10y'))
);
--> statement-breakpoint
CREATE TABLE "consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"child_id" uuid,
	"subject" text NOT NULL,
	"granted" boolean NOT NULL,
	"document_id" uuid NOT NULL,
	"document_sha256" text NOT NULL,
	"method" text NOT NULL,
	"evidence_asset_id" uuid,
	"provider_consent_id" text,
	"ip" "inet",
	"user_agent" text,
	"device_id" text,
	"app_version" text,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoke_reason" text,
	"purge_after" timestamp with time zone NOT NULL,
	CONSTRAINT "consents_subject_check" CHECK ("consents"."subject" in ('ses_biyometrik', 'yurtdisi_aktarim', 'cocuk_verisi', 'pazarlama', 'aydinlatma_goruntuleme')),
	CONSTRAINT "consents_method_check" CHECK ("consents"."method" in ('checkbox', 'voice', 'payment', 'implicit_view'))
);
--> statement-breakpoint
CREATE TABLE "legal_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"version" text NOT NULL,
	"locale" text DEFAULT 'tr-TR' NOT NULL,
	"body_md" text NOT NULL,
	"body_sha256" text NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_to" timestamp with time zone,
	CONSTRAINT "legal_documents_kind_version_locale_key" UNIQUE("kind","version","locale"),
	CONSTRAINT "legal_documents_kind_check" CHECK ("legal_documents"."kind" in ('aydinlatma_genel', 'aydinlatma_ses', 'aydinlatma_cocuk', 'riza_ses_biyometrik', 'riza_yurtdisi', 'riza_cocuk', 'riza_pazarlama', 'kullanim_kosullari', 'gizlilik_politikasi', 'mesafeli_satis', 'on_bilgilendirme'))
);
--> statement-breakpoint
CREATE TABLE "children" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"given_name" text NOT NULL,
	"nickname" text,
	"birth_year" integer,
	"age_band" text NOT NULL,
	"gender_presentation" text,
	"interests" text[] DEFAULT '{}' NOT NULL,
	"default_character_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "children_birth_year_check" CHECK ("children"."birth_year" between 2005 and 2035),
	CONSTRAINT "children_age_band_check" CHECK ("children"."age_band" in ('3-5', '6-8', '9-12')),
	CONSTRAINT "children_gender_presentation_check" CHECK ("children"."gender_presentation" in ('kiz', 'erkek', 'belirtilmemis'))
);
--> statement-breakpoint
CREATE TABLE "art_styles" (
	"code" text PRIMARY KEY NOT NULL,
	"title_tr" text NOT NULL,
	"style_dna_en" text NOT NULL,
	"negative_prompt_en" text NOT NULL,
	"style_plate_asset_id" uuid,
	"preview_asset_id" uuid,
	"is_vector" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "book_formats" (
	"code" text PRIMARY KEY NOT NULL,
	"title_tr" text NOT NULL,
	"trim_w_mm" numeric(6, 2) NOT NULL,
	"trim_h_mm" numeric(6, 2) NOT NULL,
	"bleed_mm" numeric(4, 2) DEFAULT '5.0' NOT NULL,
	"safe_mm" numeric(4, 2) DEFAULT '20.0' NOT NULL,
	"page_count" integer NOT NULL,
	"binding" text NOT NULL,
	"paper" text NOT NULL,
	"color_profile" text DEFAULT 'srgb' NOT NULL,
	"target_dpi" integer DEFAULT 300 NOT NULL,
	"base_price_try" numeric(10, 2) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "book_formats_binding_check" CHECK ("book_formats"."binding" in ('sert_kapak', 'amerikan', 'tel_dikis')),
	CONSTRAINT "book_formats_color_profile_check" CHECK ("book_formats"."color_profile" in ('srgb', 'cmyk_x3', 'cmyk_x4'))
);
--> statement-breakpoint
CREATE TABLE "character_builder_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"field" text NOT NULL,
	"code" text NOT NULL,
	"label_tr" text NOT NULL,
	"swatch_hex" text,
	"dna_en" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "character_builder_options_field_code_key" UNIQUE("field","code"),
	CONSTRAINT "character_builder_options_field_check" CHECK ("character_builder_options"."field" in ('ten_tonu', 'sac_rengi', 'sac_tipi', 'sac_uzunluk', 'goz_rengi', 'gozluk', 'cil', 'kiyafet', 'favori_oyuncak'))
);
--> statement-breakpoint
CREATE TABLE "story_themes" (
	"code" text PRIMARY KEY NOT NULL,
	"title_tr" text NOT NULL,
	"subtitle_tr" text,
	"archetype" text,
	"age_bands" text[] NOT NULL,
	"icon" text,
	"prompt_pack" jsonb NOT NULL,
	"sample_first_line_tr" text,
	"is_religious" boolean DEFAULT false NOT NULL,
	"cultural_tag" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_voices" (
	"code" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"description_tr" text,
	"gender" text,
	"provider" text NOT NULL,
	"provider_voice_id" text NOT NULL,
	"sample_asset_id" uuid,
	"age_bands" text[] DEFAULT '{"3-5","6-8","9-12"}' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "system_voices_gender_check" CHECK ("system_voices"."gender" in ('kadin', 'erkek', 'notr'))
);
--> statement-breakpoint
CREATE TABLE "voice_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"relation" text NOT NULL,
	"locale" text DEFAULT 'tr-TR' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"consent_id" uuid,
	"consent_clip_asset_id" uuid,
	"reference_asset_id" uuid,
	"preview_asset_id" uuid,
	"quality" jsonb,
	"quality_score" numeric(4, 3),
	"asr_match_score" numeric(4, 3),
	"failure_reason" text,
	"accepted_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "voice_profiles_relation_check" CHECK ("voice_profiles"."relation" in ('anne', 'baba', 'diger')),
	CONSTRAINT "voice_profiles_status_check" CHECK ("voice_profiles"."status" in ('draft', 'recording', 'processing', 'preview_ready', 'ready', 'failed', 'revoked', 'deleted'))
);
--> statement-breakpoint
CREATE TABLE "voice_provider_bindings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"voice_profile_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_voice_id" text,
	"provider_consent_id" text,
	"inline_embedding" text,
	"occupies_slot" boolean DEFAULT true NOT NULL,
	"is_ephemeral" boolean DEFAULT false NOT NULL,
	"state" text DEFAULT 'creating' NOT NULL,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"error" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "voice_provider_bindings_provider_check" CHECK ("voice_provider_bindings"."provider" in ('elevenlabs', 'cartesia', 'azure', 'openai', 'google', 'selfhost')),
	CONSTRAINT "voice_provider_bindings_state_check" CHECK ("voice_provider_bindings"."state" in ('creating', 'active', 'evicted', 'deleting', 'deleted', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "voice_scripts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"step" text NOT NULL,
	"locale" text DEFAULT 'tr-TR' NOT NULL,
	"version" text NOT NULL,
	"title_tr" text NOT NULL,
	"body_tr" text NOT NULL,
	"target_sec" integer NOT NULL,
	"tone_hint" text,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "voice_scripts_tone_hint_check" CHECK ("voice_scripts"."tone_hint" in ('sakin', 'heyecanli', 'fisilti', 'diyalog'))
);
--> statement-breakpoint
CREATE TABLE "voice_takes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"voice_profile_id" uuid NOT NULL,
	"step" text NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"asset_id" uuid NOT NULL,
	"script_id" uuid,
	"expected_text" text,
	"asr_text" text,
	"asr_similarity" numeric(4, 3),
	"quality" jsonb,
	"accepted" boolean DEFAULT false NOT NULL,
	"issues" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "voice_takes_step_check" CHECK ("voice_takes"."step" in ('mic_test', 'consent_clip', 'passage_1', 'passage_2', 'passage_3', 'passage_4'))
);
--> statement-breakpoint
CREATE TABLE "stories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"child_id" uuid,
	"title" text,
	"age_band" text NOT NULL,
	"theme_code" text,
	"art_style_code" text NOT NULL,
	"hero_name" text NOT NULL,
	"hero_is_child" boolean DEFAULT true NOT NULL,
	"page_count" integer DEFAULT 12 NOT NULL,
	"language" text DEFAULT 'tr-TR' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"religious_opt_in" boolean DEFAULT false NOT NULL,
	"cultural_tags" text[] DEFAULT '{}' NOT NULL,
	"lesson_tr" text,
	"request_input" jsonb NOT NULL,
	"outline" jsonb,
	"safety" jsonb,
	"model_meta" jsonb,
	"cost_usd" numeric(10, 4) DEFAULT '0' NOT NULL,
	"series_id" uuid,
	"series_index" integer,
	"is_favorite" boolean DEFAULT false NOT NULL,
	"approved_at" timestamp with time zone,
	"ready_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "stories_age_band_check" CHECK ("stories"."age_band" in ('3-5', '6-8', '9-12')),
	CONSTRAINT "stories_status_check" CHECK ("stories"."status" in ('draft', 'outline_generating', 'outline_ready', 'outline_rejected', 'content_generating', 'content_ready', 'images_generating', 'ready', 'approved', 'failed', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "story_characters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"story_id" uuid NOT NULL,
	"role" text NOT NULL,
	"name_tr" text NOT NULL,
	"canon_en" text NOT NULL,
	"builder_input" jsonb,
	"character_sheet_asset_id" uuid,
	"face_ref_asset_id" uuid,
	"sheet_variants" jsonb,
	"is_primary" boolean DEFAULT false NOT NULL,
	"reusable_for_child_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "story_characters_role_check" CHECK ("story_characters"."role" in ('kahraman', 'yardimci', 'ebeveyn', 'hayvan', 'diger'))
);
--> statement-breakpoint
CREATE TABLE "story_page_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"text_tr" text,
	"source" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "story_page_revisions_page_revision_key" UNIQUE("page_id","revision"),
	CONSTRAINT "story_page_revisions_source_check" CHECK ("story_page_revisions"."source" in ('ai', 'user', 'ai_rewrite'))
);
--> statement-breakpoint
CREATE TABLE "story_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"story_id" uuid NOT NULL,
	"page_no" integer NOT NULL,
	"text_tr" text,
	"text_sha256" text,
	"scene_summary_tr" text,
	"illustration_prompt_en" text,
	"prompt_sha256" text,
	"emotion" text,
	"time_of_day" text,
	"camera" text,
	"text_safe_zone" text DEFAULT 'bottom' NOT NULL,
	"word_count" integer,
	"image_asset_id" uuid,
	"image_print_asset_id" uuid,
	"image_status" text DEFAULT 'pending' NOT NULL,
	"image_attempts" integer DEFAULT 0 NOT NULL,
	"image_qa" jsonb,
	"edited_by_user" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "story_pages_story_page_no_key" UNIQUE("story_id","page_no"),
	CONSTRAINT "story_pages_emotion_check" CHECK ("story_pages"."emotion" in ('sakin', 'nese', 'merak', 'hafif_endise', 'cozulme', 'sicak_kapanis')),
	CONSTRAINT "story_pages_text_safe_zone_check" CHECK ("story_pages"."text_safe_zone" in ('bottom', 'top', 'left', 'right')),
	CONSTRAINT "story_pages_image_status_check" CHECK ("story_pages"."image_status" in ('pending', 'generating', 'qa_failed', 'manual_review', 'ready', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "audio_page_marks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rendition_id" uuid NOT NULL,
	"page_id" uuid NOT NULL,
	"page_no" integer NOT NULL,
	"start_ms" integer NOT NULL,
	"end_ms" integer NOT NULL,
	"chunk_asset_id" uuid,
	CONSTRAINT "audio_page_marks_rendition_page_key" UNIQUE("rendition_id","page_no")
);
--> statement-breakpoint
CREATE TABLE "audio_renditions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"story_id" uuid NOT NULL,
	"voice_kind" text NOT NULL,
	"voice_profile_id" uuid,
	"system_voice_code" text,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"tier" text DEFAULT 'quality' NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"full_asset_id" uuid,
	"alignment_asset_id" uuid,
	"alignment_source" text,
	"duration_ms" integer,
	"billed_units" bigint,
	"billing_unit" text,
	"cost_usd" numeric(10, 5),
	"content_hash" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"error" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "audio_renditions_voice_kind_check" CHECK ("audio_renditions"."voice_kind" in ('cloned', 'system')),
	CONSTRAINT "audio_renditions_tier_check" CHECK ("audio_renditions"."tier" in ('draft', 'quality')),
	CONSTRAINT "audio_renditions_status_check" CHECK ("audio_renditions"."status" in ('queued', 'running', 'succeeded', 'failed', 'stale')),
	CONSTRAINT "audio_renditions_alignment_source_check" CHECK ("audio_renditions"."alignment_source" in ('provider', 'forced_alignment', 'sentence_estimate', 'none')),
	CONSTRAINT "audio_renditions_billing_unit_check" CHECK ("audio_renditions"."billing_unit" in ('character', 'utf8-byte', 'second')),
	CONSTRAINT "audio_renditions_voice_ref_check" CHECK (("audio_renditions"."voice_kind" = 'cloned' and "audio_renditions"."voice_profile_id" is not null)
       or ("audio_renditions"."voice_kind" = 'system' and "audio_renditions"."system_voice_code" is not null))
);
--> statement-breakpoint
CREATE TABLE "content_cache" (
	"cache_key" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"asset_id" uuid,
	"payload" jsonb,
	"hit_count" integer DEFAULT 0 NOT NULL,
	"saved_usd" numeric(10, 5) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_hit_at" timestamp with time zone,
	CONSTRAINT "content_cache_kind_check" CHECK ("content_cache"."kind" in ('image', 'tts_chunk', 'llm'))
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"user_id" uuid NOT NULL,
	"key" text NOT NULL,
	"endpoint" text NOT NULL,
	"request_hash" text NOT NULL,
	"response_status" integer,
	"response_body" jsonb,
	"job_id" uuid,
	"locked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone DEFAULT now() + interval '24 hours' NOT NULL,
	CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY("user_id","key")
);
--> statement-breakpoint
CREATE TABLE "job_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"job_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_events_job_seq_key" UNIQUE("job_id","seq")
);
--> statement-breakpoint
CREATE TABLE "job_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"step_key" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempt" integer DEFAULT 0 NOT NULL,
	"input_hash" text NOT NULL,
	"output" jsonb,
	"provider" text,
	"provider_model" text,
	"provider_request_id" text,
	"cost_usd" numeric(10, 5) DEFAULT '0' NOT NULL,
	"error" jsonb,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "job_steps_job_step_key" UNIQUE("job_id","step_key"),
	CONSTRAINT "job_steps_status_check" CHECK ("job_steps"."status" in ('pending', 'running', 'succeeded', 'failed', 'skipped'))
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"story_id" uuid,
	"voice_profile_id" uuid,
	"order_id" uuid,
	"parent_job_id" uuid,
	"status" text DEFAULT 'queued' NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"progress_current" integer DEFAULT 0 NOT NULL,
	"progress_total" integer DEFAULT 1 NOT NULL,
	"progress_label" text,
	"eta_ms" integer,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"bull_job_id" text,
	"attempt" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"input" jsonb,
	"output" jsonb,
	"error" jsonb,
	"estimated_cost_usd" numeric(10, 5),
	"actual_cost_usd" numeric(10, 5) DEFAULT '0' NOT NULL,
	"reservation_id" uuid,
	"correlation_id" text NOT NULL,
	"next_retry_at" timestamp with time zone,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "jobs_user_idempotency_key" UNIQUE("user_id","idempotency_key"),
	CONSTRAINT "jobs_kind_check" CHECK ("jobs"."kind" in ('story_outline', 'story_fill', 'story_page_rewrite', 'voice_create', 'voice_delete', 'image_character_sheet', 'image_book', 'image_page', 'audio_render', 'pdf_build', 'print_submit', 'export_mp4', 'privacy_export', 'privacy_delete')),
	CONSTRAINT "jobs_status_check" CHECK ("jobs"."status" in ('queued', 'running', 'waiting_approval', 'succeeded', 'failed', 'cancelled', 'dead_letter'))
);
--> statement-breakpoint
CREATE TABLE "cost_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"job_id" uuid,
	"amount_usd" numeric(10, 5) NOT NULL,
	"state" text DEFAULT 'held' NOT NULL,
	"expires_at" timestamp with time zone DEFAULT now() + interval '30 minutes' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone,
	CONSTRAINT "cost_reservations_state_check" CHECK ("cost_reservations"."state" in ('held', 'committed', 'released'))
);
--> statement-breakpoint
CREATE TABLE "credit_ledger" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"delta" integer NOT NULL,
	"reason" text NOT NULL,
	"ref_type" text,
	"ref_id" uuid,
	"balance_after" integer NOT NULL,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_ledger_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "credit_ledger_reason_check" CHECK ("credit_ledger"."reason" in ('purchase', 'subscription_grant', 'free_grant', 'story_spend', 'audio_spend', 'image_retry', 'refund', 'admin_adjust'))
);
--> statement-breakpoint
CREATE TABLE "entitlements" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"plan_code" text NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"stories_used" integer DEFAULT 0 NOT NULL,
	"credits_balance" integer DEFAULT 0 NOT NULL,
	"period_cost_usd" numeric(10, 4) DEFAULT '0' NOT NULL,
	"reserved_cost_usd" numeric(10, 4) DEFAULT '0' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"code" text PRIMARY KEY NOT NULL,
	"title_tr" text NOT NULL,
	"price_try" numeric(10, 2) NOT NULL,
	"period" text NOT NULL,
	"story_quota" integer,
	"voice_quota" integer DEFAULT 0 NOT NULL,
	"image_tier" text DEFAULT 'preview' NOT NULL,
	"tts_tier" text DEFAULT 'draft' NOT NULL,
	"monthly_cost_cap_usd" numeric(10, 2) NOT NULL,
	"features" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "plans_period_check" CHECK ("plans"."period" in ('month', 'year', 'once'))
);
--> statement-breakpoint
CREATE TABLE "provider_health" (
	"provider" text PRIMARY KEY NOT NULL,
	"circuit_state" text DEFAULT 'closed' NOT NULL,
	"error_rate_5m" numeric(5, 4),
	"p95_latency_ms" integer,
	"opened_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_health_circuit_state_check" CHECK ("provider_health"."circuit_state" in ('closed', 'half_open', 'open'))
);
--> statement-breakpoint
CREATE TABLE "provider_usage" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"job_step_id" uuid,
	"user_id" uuid,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"operation" text NOT NULL,
	"billing_unit" text NOT NULL,
	"billed_units" numeric(14, 2) NOT NULL,
	"unit_price_usd" numeric(14, 10) NOT NULL,
	"cost_usd" numeric(10, 5) NOT NULL,
	"cache_hit" boolean DEFAULT false NOT NULL,
	"latency_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_usage_billing_unit_check" CHECK ("provider_usage"."billing_unit" in ('character', 'utf8_byte', 'second', 'token', 'image', 'megapixel', 'request'))
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_code" text NOT NULL,
	"source" text NOT NULL,
	"external_id" text,
	"status" text NOT NULL,
	"current_period_start" timestamp with time zone NOT NULL,
	"current_period_end" timestamp with time zone NOT NULL,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_source_check" CHECK ("subscriptions"."source" in ('web', 'ios_iap', 'android_iap', 'grant')),
	CONSTRAINT "subscriptions_status_check" CHECK ("subscriptions"."status" in ('trialing', 'active', 'past_due', 'cancelled', 'expired'))
);
--> statement-breakpoint
CREATE TABLE "book_builds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"story_id" uuid NOT NULL,
	"format_code" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'building' NOT NULL,
	"interior_pdf_asset_id" uuid,
	"cover_pdf_asset_id" uuid,
	"preview_pdf_asset_id" uuid,
	"digital_pdf_asset_id" uuid,
	"spine_mm" numeric(6, 2),
	"dedication_tr" text,
	"qr_rendition_id" uuid,
	"checks" jsonb,
	"warnings" text[] DEFAULT '{}' NOT NULL,
	"error" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ready_at" timestamp with time zone,
	CONSTRAINT "book_builds_story_format_revision_key" UNIQUE("story_id","format_code","revision"),
	CONSTRAINT "book_builds_status_check" CHECK ("book_builds"."status" in ('building', 'ready', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_no" text NOT NULL,
	"user_id" uuid NOT NULL,
	"story_id" uuid NOT NULL,
	"book_build_id" uuid NOT NULL,
	"status" text DEFAULT 'created' NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price_try" numeric(10, 2) NOT NULL,
	"shipping_try" numeric(10, 2) DEFAULT '0' NOT NULL,
	"discount_try" numeric(10, 2) DEFAULT '0' NOT NULL,
	"total_try" numeric(10, 2) NOT NULL,
	"currency" text DEFAULT 'TRY' NOT NULL,
	"installment" integer DEFAULT 1 NOT NULL,
	"withdrawal_waiver_doc_id" uuid,
	"withdrawal_waiver_shown_at" timestamp with time zone,
	"withdrawal_waiver_accepted" boolean DEFAULT false NOT NULL,
	"distance_contract_doc_id" uuid,
	"recipient_name" text NOT NULL,
	"recipient_phone" text NOT NULL,
	"address_line1" text NOT NULL,
	"address_line2" text,
	"district" text NOT NULL,
	"city" text NOT NULL,
	"postal_code" text,
	"country" text DEFAULT 'TR' NOT NULL,
	"gift_note_tr" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "orders_order_no_unique" UNIQUE("order_no"),
	CONSTRAINT "orders_status_check" CHECK ("orders"."status" in ('created', 'awaiting_payment', 'paid', 'in_production', 'shipped', 'delivered', 'cancelled', 'refunded', 'failed')),
	CONSTRAINT "orders_withdrawal_waiver_check" CHECK ("orders"."status" = 'created' or "orders"."withdrawal_waiver_accepted")
);
--> statement-breakpoint
CREATE TABLE "page_audio_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"book_build_id" uuid NOT NULL,
	"page_no" integer NOT NULL,
	"token" text NOT NULL,
	"rendition_id" uuid NOT NULL,
	"hit_count" integer DEFAULT 0 NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "page_audio_links_token_unique" UNIQUE("token"),
	CONSTRAINT "page_audio_links_build_page_key" UNIQUE("book_build_id","page_no")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid,
	"subscription_id" uuid,
	"provider" text NOT NULL,
	"provider_ref" text,
	"amount_try" numeric(10, 2) NOT NULL,
	"installment" integer DEFAULT 1 NOT NULL,
	"status" text NOT NULL,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_provider_check" CHECK ("payments"."provider" in ('iyzico', 'paytr', 'apple_iap', 'google_iap')),
	CONSTRAINT "payments_status_check" CHECK ("payments"."status" in ('init', 'authorized', 'captured', 'failed', 'refunded'))
);
--> statement-breakpoint
CREATE TABLE "print_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_order_id" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"files" jsonb,
	"cost_try" numeric(10, 2),
	"tracking_carrier" text,
	"tracking_no" text,
	"events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"operator_note" text,
	"submitted_at" timestamp with time zone,
	"shipped_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "print_jobs_provider_check" CHECK ("print_jobs"."provider" in ('manual_tr', 'cloudprinter', 'gelato', 'lulu')),
	CONSTRAINT "print_jobs_status_check" CHECK ("print_jobs"."status" in ('queued', 'submitted', 'accepted', 'printing', 'shipped', 'error', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "abuse_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_user_id" uuid,
	"reporter_email" text,
	"target_type" text NOT NULL,
	"target_id" uuid,
	"reason" text NOT NULL,
	"detail" text,
	"status" text DEFAULT 'open' NOT NULL,
	"sla_due_at" timestamp with time zone NOT NULL,
	"resolution" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "abuse_reports_target_type_check" CHECK ("abuse_reports"."target_type" in ('story', 'image', 'voice_profile', 'user')),
	CONSTRAINT "abuse_reports_reason_check" CHECK ("abuse_reports"."reason" in ('ses_benim_izinsiz', 'uygunsuz_icerik', 'telif', 'diger')),
	CONSTRAINT "abuse_reports_status_check" CHECK ("abuse_reports"."status" in ('open', 'triaged', 'actioned', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "data_subject_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'received' NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"note" text,
	"result_asset_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "data_subject_requests_kind_check" CHECK ("data_subject_requests"."kind" in ('access', 'export', 'rectify', 'erase', 'object', 'consent_withdraw')),
	CONSTRAINT "data_subject_requests_status_check" CHECK ("data_subject_requests"."status" in ('received', 'in_progress', 'completed', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "deletion_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"target" text NOT NULL,
	"ref" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "deletion_tasks_target_check" CHECK ("deletion_tasks"."target" in ('voice_provider', 'image_provider', 'llm_logs', 'storage_objects', 'db_rows')),
	CONSTRAINT "deletion_tasks_status_check" CHECK ("deletion_tasks"."status" in ('pending', 'running', 'completed', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "moderation_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"story_id" uuid,
	"page_no" integer,
	"surface" text NOT NULL,
	"stage" text NOT NULL,
	"engine" text NOT NULL,
	"verdict" text NOT NULL,
	"categories" jsonb,
	"scores" jsonb,
	"excerpt" text,
	"action_taken" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "moderation_events_surface_check" CHECK ("moderation_events"."surface" in ('parent_input', 'story_text', 'illustration_prompt', 'image_output', 'voice_script', 'user_edit')),
	CONSTRAINT "moderation_events_stage_check" CHECK ("moderation_events"."stage" in ('pre', 'post')),
	CONSTRAINT "moderation_events_engine_check" CHECK ("moderation_events"."engine" in ('deterministic', 'injection_detector', 'openai_moderation', 'llm_judge', 'age_rubric', 'provider_block', 'brand_denylist')),
	CONSTRAINT "moderation_events_verdict_check" CHECK ("moderation_events"."verdict" in ('pass', 'flag', 'block')),
	CONSTRAINT "moderation_events_action_taken_check" CHECK ("moderation_events"."action_taken" in ('none', 'retry', 'regenerate', 'manual_review', 'account_flag'))
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"aggregate" text NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"dedupe_key" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_dedupe_key_unique" UNIQUE("dedupe_key"),
	CONSTRAINT "outbox_status_check" CHECK ("outbox"."status" in ('pending', 'sent', 'failed', 'dead'))
);
--> statement-breakpoint
CREATE TABLE "webhook_inbox" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"signature_ok" boolean NOT NULL,
	"payload" jsonb NOT NULL,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_inbox_source_external_key" UNIQUE("source","external_id")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"entity_type" text,
	"entity_id" uuid,
	"before" jsonb,
	"after" jsonb,
	"ip" "inet",
	"user_agent" text,
	"trace_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_log_actor_type_check" CHECK ("audit_log"."actor_type" in ('user', 'admin', 'system', 'provider'))
);
--> statement-breakpoint
ALTER TABLE "auth_identities" ADD CONSTRAINT "auth_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_tokens" ADD CONSTRAINT "notification_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_document_id_legal_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."legal_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_evidence_asset_id_assets_id_fk" FOREIGN KEY ("evidence_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "children" ADD CONSTRAINT "children_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "children" ADD CONSTRAINT "children_default_character_id_story_characters_id_fk" FOREIGN KEY ("default_character_id") REFERENCES "public"."story_characters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "art_styles" ADD CONSTRAINT "art_styles_style_plate_asset_id_assets_id_fk" FOREIGN KEY ("style_plate_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "art_styles" ADD CONSTRAINT "art_styles_preview_asset_id_assets_id_fk" FOREIGN KEY ("preview_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_voices" ADD CONSTRAINT "system_voices_sample_asset_id_assets_id_fk" FOREIGN KEY ("sample_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_profiles" ADD CONSTRAINT "voice_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_profiles" ADD CONSTRAINT "voice_profiles_consent_id_consents_id_fk" FOREIGN KEY ("consent_id") REFERENCES "public"."consents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_profiles" ADD CONSTRAINT "voice_profiles_consent_clip_asset_id_assets_id_fk" FOREIGN KEY ("consent_clip_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_profiles" ADD CONSTRAINT "voice_profiles_reference_asset_id_assets_id_fk" FOREIGN KEY ("reference_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_profiles" ADD CONSTRAINT "voice_profiles_preview_asset_id_assets_id_fk" FOREIGN KEY ("preview_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_provider_bindings" ADD CONSTRAINT "voice_provider_bindings_voice_profile_id_voice_profiles_id_fk" FOREIGN KEY ("voice_profile_id") REFERENCES "public"."voice_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_takes" ADD CONSTRAINT "voice_takes_voice_profile_id_voice_profiles_id_fk" FOREIGN KEY ("voice_profile_id") REFERENCES "public"."voice_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_takes" ADD CONSTRAINT "voice_takes_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_takes" ADD CONSTRAINT "voice_takes_script_id_voice_scripts_id_fk" FOREIGN KEY ("script_id") REFERENCES "public"."voice_scripts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_theme_code_story_themes_code_fk" FOREIGN KEY ("theme_code") REFERENCES "public"."story_themes"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_art_style_code_art_styles_code_fk" FOREIGN KEY ("art_style_code") REFERENCES "public"."art_styles"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_characters" ADD CONSTRAINT "story_characters_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_characters" ADD CONSTRAINT "story_characters_character_sheet_asset_id_assets_id_fk" FOREIGN KEY ("character_sheet_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_characters" ADD CONSTRAINT "story_characters_face_ref_asset_id_assets_id_fk" FOREIGN KEY ("face_ref_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_characters" ADD CONSTRAINT "story_characters_reusable_for_child_id_children_id_fk" FOREIGN KEY ("reusable_for_child_id") REFERENCES "public"."children"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_page_revisions" ADD CONSTRAINT "story_page_revisions_page_id_story_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."story_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_page_revisions" ADD CONSTRAINT "story_page_revisions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_pages" ADD CONSTRAINT "story_pages_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_pages" ADD CONSTRAINT "story_pages_image_asset_id_assets_id_fk" FOREIGN KEY ("image_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_pages" ADD CONSTRAINT "story_pages_image_print_asset_id_assets_id_fk" FOREIGN KEY ("image_print_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audio_page_marks" ADD CONSTRAINT "audio_page_marks_rendition_id_audio_renditions_id_fk" FOREIGN KEY ("rendition_id") REFERENCES "public"."audio_renditions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audio_page_marks" ADD CONSTRAINT "audio_page_marks_page_id_story_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."story_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audio_page_marks" ADD CONSTRAINT "audio_page_marks_chunk_asset_id_assets_id_fk" FOREIGN KEY ("chunk_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audio_renditions" ADD CONSTRAINT "audio_renditions_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audio_renditions" ADD CONSTRAINT "audio_renditions_voice_profile_id_voice_profiles_id_fk" FOREIGN KEY ("voice_profile_id") REFERENCES "public"."voice_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audio_renditions" ADD CONSTRAINT "audio_renditions_system_voice_code_system_voices_code_fk" FOREIGN KEY ("system_voice_code") REFERENCES "public"."system_voices"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audio_renditions" ADD CONSTRAINT "audio_renditions_full_asset_id_assets_id_fk" FOREIGN KEY ("full_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audio_renditions" ADD CONSTRAINT "audio_renditions_alignment_asset_id_assets_id_fk" FOREIGN KEY ("alignment_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_cache" ADD CONSTRAINT "content_cache_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_events" ADD CONSTRAINT "job_events_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_steps" ADD CONSTRAINT "job_steps_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_voice_profile_id_voice_profiles_id_fk" FOREIGN KEY ("voice_profile_id") REFERENCES "public"."voice_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_parent_job_id_jobs_id_fk" FOREIGN KEY ("parent_job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_reservations" ADD CONSTRAINT "cost_reservations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_reservations" ADD CONSTRAINT "cost_reservations_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_plan_code_plans_code_fk" FOREIGN KEY ("plan_code") REFERENCES "public"."plans"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_usage" ADD CONSTRAINT "provider_usage_job_step_id_job_steps_id_fk" FOREIGN KEY ("job_step_id") REFERENCES "public"."job_steps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_usage" ADD CONSTRAINT "provider_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_code_plans_code_fk" FOREIGN KEY ("plan_code") REFERENCES "public"."plans"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_builds" ADD CONSTRAINT "book_builds_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_builds" ADD CONSTRAINT "book_builds_format_code_book_formats_code_fk" FOREIGN KEY ("format_code") REFERENCES "public"."book_formats"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_builds" ADD CONSTRAINT "book_builds_interior_pdf_asset_id_assets_id_fk" FOREIGN KEY ("interior_pdf_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_builds" ADD CONSTRAINT "book_builds_cover_pdf_asset_id_assets_id_fk" FOREIGN KEY ("cover_pdf_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_builds" ADD CONSTRAINT "book_builds_preview_pdf_asset_id_assets_id_fk" FOREIGN KEY ("preview_pdf_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_builds" ADD CONSTRAINT "book_builds_digital_pdf_asset_id_assets_id_fk" FOREIGN KEY ("digital_pdf_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_builds" ADD CONSTRAINT "book_builds_qr_rendition_id_audio_renditions_id_fk" FOREIGN KEY ("qr_rendition_id") REFERENCES "public"."audio_renditions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_book_build_id_book_builds_id_fk" FOREIGN KEY ("book_build_id") REFERENCES "public"."book_builds"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_withdrawal_waiver_doc_id_legal_documents_id_fk" FOREIGN KEY ("withdrawal_waiver_doc_id") REFERENCES "public"."legal_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_distance_contract_doc_id_legal_documents_id_fk" FOREIGN KEY ("distance_contract_doc_id") REFERENCES "public"."legal_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_audio_links" ADD CONSTRAINT "page_audio_links_book_build_id_book_builds_id_fk" FOREIGN KEY ("book_build_id") REFERENCES "public"."book_builds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_audio_links" ADD CONSTRAINT "page_audio_links_rendition_id_audio_renditions_id_fk" FOREIGN KEY ("rendition_id") REFERENCES "public"."audio_renditions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "abuse_reports" ADD CONSTRAINT "abuse_reports_reporter_user_id_users_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_subject_requests" ADD CONSTRAINT "data_subject_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_subject_requests" ADD CONSTRAINT "data_subject_requests_result_asset_id_assets_id_fk" FOREIGN KEY ("result_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deletion_tasks" ADD CONSTRAINT "deletion_tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_events" ADD CONSTRAINT "moderation_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_events" ADD CONSTRAINT "moderation_events_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "otp_dest_idx" ON "otp_challenges" USING btree ("destination","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "users_guest_device_idx" ON "users" USING btree ("guest_device_id") WHERE "users"."is_guest";--> statement-breakpoint
CREATE INDEX "assets_purge_idx" ON "assets" USING btree ("purge_after") WHERE "assets"."purged_at" is null and "assets"."purge_after" is not null;--> statement-breakpoint
CREATE INDEX "assets_owner_kind_idx" ON "assets" USING btree ("owner_user_id","kind");--> statement-breakpoint
CREATE INDEX "consents_user_subject_idx" ON "consents" USING btree ("user_id","subject","granted_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "children_user_idx" ON "children" USING btree ("user_id") WHERE "children"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "voice_profiles_user_name_idx" ON "voice_profiles" USING btree ("user_id",lower("display_name")) WHERE "voice_profiles"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "voice_profiles_active_idx" ON "voice_profiles" USING btree ("user_id") WHERE "voice_profiles"."status" in ('ready','preview_ready') and "voice_profiles"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "vpb_profile_provider_idx" ON "voice_provider_bindings" USING btree ("voice_profile_id","provider") WHERE "voice_provider_bindings"."state" <> 'deleted';--> statement-breakpoint
CREATE INDEX "vpb_evict_idx" ON "voice_provider_bindings" USING btree ("last_used_at") WHERE "voice_provider_bindings"."state" = 'active' and "voice_provider_bindings"."occupies_slot";--> statement-breakpoint
CREATE INDEX "voice_takes_profile_idx" ON "voice_takes" USING btree ("voice_profile_id","step","attempt" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "stories_user_idx" ON "stories" USING btree ("user_id","created_at" DESC NULLS LAST) WHERE "stories"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "stories_child_idx" ON "stories" USING btree ("child_id","created_at" DESC NULLS LAST) WHERE "stories"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "stories_series_idx" ON "stories" USING btree ("series_id","series_index");--> statement-breakpoint
CREATE UNIQUE INDEX "audio_rend_dedupe_idx" ON "audio_renditions" USING btree ("story_id","content_hash") WHERE "audio_renditions"."status" in ('queued','running','succeeded');--> statement-breakpoint
CREATE INDEX "jobs_user_active_idx" ON "jobs" USING btree ("user_id","status","queued_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "jobs_story_idx" ON "jobs" USING btree ("story_id","kind");--> statement-breakpoint
CREATE INDEX "jobs_retry_idx" ON "jobs" USING btree ("status","next_retry_at") WHERE "jobs"."status" in ('queued','failed');--> statement-breakpoint
CREATE INDEX "cost_res_expiry_idx" ON "cost_reservations" USING btree ("expires_at") WHERE "cost_reservations"."state" = 'held';--> statement-breakpoint
CREATE INDEX "credit_user_idx" ON "credit_ledger" USING btree ("user_id","id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "pu_created_idx" ON "provider_usage" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "pu_user_idx" ON "provider_usage" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "subs_active_idx" ON "subscriptions" USING btree ("user_id") WHERE "subscriptions"."status" in ('trialing','active','past_due');--> statement-breakpoint
CREATE INDEX "orders_user_idx" ON "orders" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status") WHERE "orders"."status" in ('paid','in_production');--> statement-breakpoint
CREATE INDEX "abuse_sla_idx" ON "abuse_reports" USING btree ("sla_due_at") WHERE "abuse_reports"."status" in ('open','triaged');--> statement-breakpoint
CREATE INDEX "deletion_pending_idx" ON "deletion_tasks" USING btree ("status","run_at") WHERE "deletion_tasks"."status" <> 'completed';--> statement-breakpoint
CREATE INDEX "moderation_flagged_idx" ON "moderation_events" USING btree ("created_at" DESC NULLS LAST) WHERE "moderation_events"."verdict" <> 'pass';--> statement-breakpoint
CREATE INDEX "outbox_pending_idx" ON "outbox" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id","created_at" DESC NULLS LAST);