# KendiHikayem — SPEC-DATA-MODEL

> NORMATİF. `packages/db` (Drizzle şeması + migration) bu bölüme birebir uyar.
> Tam bağlam: `docs/SPEC.md`

---

## 4. Veri Modeli (SQL DDL)

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- ═══════════════ 1. KİMLİK ═══════════════

CREATE TABLE users (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_guest            boolean NOT NULL DEFAULT true,
  guest_device_id     text,
  phone_e164          text UNIQUE,
  email               citext UNIQUE,
  display_name        text,
  locale              text NOT NULL DEFAULT 'tr-TR',
  timezone            text NOT NULL DEFAULT 'Europe/Istanbul',
  is_adult_declared   boolean NOT NULL DEFAULT false,
  adult_declared_at   timestamptz,
  status              text NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','suspended','deletion_requested','deleted')),
  marketing_opt_in    boolean NOT NULL DEFAULT false,
  iys_synced_at       timestamptz,                    -- İleti Yönetim Sistemi
  policy_version      text NOT NULL DEFAULT 'v1',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  last_seen_at        timestamptz,
  deletion_requested_at timestamptz,
  deleted_at          timestamptz,
  CHECK (is_guest OR phone_e164 IS NOT NULL OR email IS NOT NULL)
);
CREATE INDEX users_guest_device_idx ON users(guest_device_id) WHERE is_guest;

CREATE TABLE auth_identities (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider     text NOT NULL CHECK (provider IN ('otp_sms','otp_email','apple','google')),
  provider_uid text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_uid)
);

CREATE TABLE otp_challenges (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel     text NOT NULL CHECK (channel IN ('sms','email')),
  destination text NOT NULL,
  code_hash   text NOT NULL,
  attempts    int  NOT NULL DEFAULT 0,
  ip          inet,
  expires_at  timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX otp_dest_idx ON otp_challenges(destination, created_at DESC);

CREATE TABLE sessions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_hash text NOT NULL UNIQUE,
  device_id          text, user_agent text, ip inet,
  expires_at         timestamptz NOT NULL,
  revoked_at         timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notification_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform   text NOT NULL CHECK (platform IN ('web_push','ios','android')),
  token      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE (platform, token)
);

-- ═══════════════ 2. VARLIKLAR (S3) ═══════════════
-- assets önce gelir; consents ve diğerleri buna FK verir.

CREATE TABLE assets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id   uuid REFERENCES users(id) ON DELETE SET NULL,
  kind            text NOT NULL CHECK (kind IN (
                    'voice_reference_raw','voice_take_raw','voice_consent_clip','voice_preview',
                    'tts_chunk','tts_full','tts_alignment_json',
                    'image_style_plate','image_character_sheet','image_face_ref',
                    'image_page_2k','image_page_4k','image_page_screen',
                    'pdf_interior','pdf_cover','pdf_digital','pdf_preview',
                    'export_mp4','privacy_export')),
  bucket          text NOT NULL,
  storage_key     text NOT NULL,
  region          text NOT NULL DEFAULT 'eu-central-1',
  kms_key_alias   text,                                -- voice-raw: ayrı CMK (Kurul 2018/10)
  mime_type       text NOT NULL,
  size_bytes      bigint,
  sha256          text,                                -- içerik cache anahtarının parçası
  duration_ms     int, sample_rate_hz int, channels smallint,
  width_px        int, height_px int,
  provider        text,
  retention_class text NOT NULL DEFAULT 'standard'
                    CHECK (retention_class IN ('ephemeral_30d','standard','legal_hold_10y')),
  purge_after     timestamptz,
  purged_at       timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bucket, storage_key)
);
CREATE INDEX assets_purge_idx ON assets(purge_after)
  WHERE purged_at IS NULL AND purge_after IS NOT NULL;
CREATE INDEX assets_owner_kind_idx ON assets(owner_user_id, kind);

-- ═══════════════ 3. HUKUK / RIZA (KVKK ispat zinciri) ═══════════════

CREATE TABLE legal_documents (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind           text NOT NULL CHECK (kind IN (
                   'aydinlatma_genel','aydinlatma_ses','aydinlatma_cocuk',
                   'riza_ses_biyometrik','riza_yurtdisi','riza_cocuk','riza_pazarlama',
                   'kullanim_kosullari','gizlilik_politikasi',
                   'mesafeli_satis','on_bilgilendirme')),
  version        text NOT NULL,                        -- '2026-08-01.1'
  locale         text NOT NULL DEFAULT 'tr-TR',
  body_md        text NOT NULL,
  body_sha256    text NOT NULL,
  published_at   timestamptz NOT NULL DEFAULT now(),
  effective_from timestamptz NOT NULL,
  effective_to   timestamptz,
  UNIQUE (kind, version, locale)
);

CREATE TABLE consents (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,  -- 10 yıl yaşar
  child_id          uuid,                              -- FK aşağıda
  subject           text NOT NULL CHECK (subject IN (
                      'ses_biyometrik','yurtdisi_aktarim','cocuk_verisi',
                      'pazarlama','aydinlatma_goruntuleme')),
  granted           boolean NOT NULL,
  document_id       uuid NOT NULL REFERENCES legal_documents(id),
  document_sha256   text NOT NULL,                     -- metin değişse de kanıt sabit
  method            text NOT NULL CHECK (method IN ('checkbox','voice','payment','implicit_view')),
  evidence_asset_id uuid REFERENCES assets(id),        -- sesli rıza klibi
  provider_consent_id text,                            -- OpenAI cons_… / Azure consentId
  ip                inet, user_agent text, device_id text, app_version text,
  granted_at        timestamptz NOT NULL DEFAULT now(),
  revoked_at        timestamptz,
  revoke_reason     text,
  purge_after       timestamptz NOT NULL               -- granted_at + 10 yıl (ispat yükü)
);
CREATE INDEX consents_user_subject_idx ON consents(user_id, subject, granted_at DESC);

-- ═══════════════ 4. ÇOCUK PROFİLİ (FOTOĞRAF KOLONU YOK — bilinçli) ═══════════════

CREATE TABLE children (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  given_name          text NOT NULL,                   -- allowlist regex ile doğrulanır
  nickname            text,
  birth_year          int CHECK (birth_year BETWEEN 2005 AND 2035),  -- tam tarih TOPLANMAZ
  age_band            text NOT NULL CHECK (age_band IN ('3-5','6-8','9-12')),
  gender_presentation text CHECK (gender_presentation IN ('kiz','erkek','belirtilmemis')),
  interests           text[] NOT NULL DEFAULT '{}',    -- katalogdan, serbest metin değil
  default_character_id uuid,                           -- FK aşağıda
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz
);
CREATE INDEX children_user_idx ON children(user_id) WHERE deleted_at IS NULL;
ALTER TABLE consents ADD CONSTRAINT consents_child_fk
  FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE SET NULL;

-- ═══════════════ 5. KATALOG ═══════════════

CREATE TABLE story_themes (
  code         text PRIMARY KEY,                       -- 'uyku_oncesi','23_nisan'
  title_tr     text NOT NULL, subtitle_tr text,
  archetype    text,                                   -- 'Yolculuk → dinlenme'
  age_bands    text[] NOT NULL,
  icon         text,
  prompt_pack  jsonb NOT NULL,                         -- mekanik kurallar, nakarat, çözüm biçimi
  sample_first_line_tr text,
  is_religious boolean NOT NULL DEFAULT false,
  cultural_tag text,
  sort_order   int NOT NULL DEFAULT 0,
  is_active    boolean NOT NULL DEFAULT true
);

CREATE TABLE art_styles (
  code               text PRIMARY KEY,                 -- 'suluboya','duz_vektor'
  title_tr           text NOT NULL,
  style_dna_en       text NOT NULL,                    -- her prompt'a BİREBİR kopyalanan blok
  negative_prompt_en text NOT NULL,
  style_plate_asset_id uuid REFERENCES assets(id),
  preview_asset_id     uuid REFERENCES assets(id),
  is_vector          boolean NOT NULL DEFAULT false,
  sort_order         int NOT NULL DEFAULT 0,
  is_active          boolean NOT NULL DEFAULT true
);

CREATE TABLE character_builder_options (               -- fotoğrafsız karakter kurucu
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field      text NOT NULL CHECK (field IN (
               'ten_tonu','sac_rengi','sac_tipi','sac_uzunluk','goz_rengi',
               'gozluk','cil','kiyafet','favori_oyuncak')),
  code       text NOT NULL,
  label_tr   text NOT NULL,
  swatch_hex text,
  dna_en     text NOT NULL,                            -- "warm olive skin"
  sort_order int NOT NULL DEFAULT 0,
  UNIQUE (field, code)
);

CREATE TABLE book_formats (
  code           text PRIMARY KEY,                     -- 'kare21_24_sert'
  title_tr       text NOT NULL,
  trim_w_mm      numeric(6,2) NOT NULL, trim_h_mm numeric(6,2) NOT NULL,
  bleed_mm       numeric(4,2) NOT NULL DEFAULT 5.0,    -- ortak payda (Lulu 3.175 / Gelato 4)
  safe_mm        numeric(4,2) NOT NULL DEFAULT 20.0,   -- Lulu casewrap 19mm'yi kapsar
  page_count     int NOT NULL,                         -- 24 (4'ün katı)
  binding        text NOT NULL CHECK (binding IN ('sert_kapak','amerikan','tel_dikis')),
  paper          text NOT NULL,
  color_profile  text NOT NULL DEFAULT 'srgb' CHECK (color_profile IN ('srgb','cmyk_x3','cmyk_x4')),
  target_dpi     int NOT NULL DEFAULT 300,
  base_price_try numeric(10,2) NOT NULL,
  is_active      boolean NOT NULL DEFAULT true
);

CREATE TABLE system_voices (
  code              text PRIMARY KEY,                  -- 'zeynep_sicak'
  display_name      text NOT NULL, description_tr text,
  gender            text CHECK (gender IN ('kadin','erkek','notr')),
  provider          text NOT NULL,
  provider_voice_id text NOT NULL,
  sample_asset_id   uuid REFERENCES assets(id),
  age_bands         text[] NOT NULL DEFAULT '{3-5,6-8,9-12}',
  sort_order        int NOT NULL DEFAULT 0,
  is_active         boolean NOT NULL DEFAULT true
);

-- ═══════════════ 6. SES ═══════════════

CREATE TABLE voice_scripts (                           -- okutulacak metinler, versiyonlu
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  step       text NOT NULL,
  locale     text NOT NULL DEFAULT 'tr-TR',
  version    text NOT NULL,
  title_tr   text NOT NULL,                            -- "Sakin anlatım"
  body_tr    text NOT NULL,                            -- masal tonunda, ğıöüşç yoğun
  target_sec int NOT NULL,
  tone_hint  text CHECK (tone_hint IN ('sakin','heyecanli','fisilti','diyalog')),
  is_active  boolean NOT NULL DEFAULT true
);

CREATE TABLE voice_profiles (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name          text NOT NULL,                 -- "Anne", "Babaannem"
  relation              text NOT NULL CHECK (relation IN ('anne','baba','diger')),
  locale                text NOT NULL DEFAULT 'tr-TR',
  status                text NOT NULL DEFAULT 'draft' CHECK (status IN (
                          'draft','recording','processing','preview_ready',
                          'ready','failed','revoked','deleted')),
  consent_id            uuid REFERENCES consents(id),
  consent_clip_asset_id uuid REFERENCES assets(id),
  reference_asset_id    uuid REFERENCES assets(id),    -- birleştirilmiş 90-120 sn
  preview_asset_id      uuid REFERENCES assets(id),
  quality               jsonb,  -- {snrDb,clippingPct,peakDbfs,wpm,rt60Ms,bandwidthHz,silenceRatio}
  quality_score         numeric(4,3),
  asr_match_score       numeric(4,3),                  -- rastgele cümle eşleşmesi
  failure_reason        text,
  accepted_at           timestamptz,
  last_used_at          timestamptz,
  revoked_at            timestamptz, deleted_at timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX voice_profiles_user_name_idx
  ON voice_profiles(user_id, lower(display_name)) WHERE deleted_at IS NULL;
-- Hesap başına en fazla 2 aktif profil: uygulama katmanı + bu index ile denetlenir
CREATE INDEX voice_profiles_active_idx ON voice_profiles(user_id)
  WHERE status IN ('ready','preview_ready') AND deleted_at IS NULL;

CREATE TABLE voice_takes (                             -- her kayıt denemesi
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voice_profile_id uuid NOT NULL REFERENCES voice_profiles(id) ON DELETE CASCADE,
  step             text NOT NULL CHECK (step IN (
                     'mic_test','consent_clip','passage_1','passage_2','passage_3','passage_4')),
  attempt          int NOT NULL DEFAULT 1,
  asset_id         uuid NOT NULL REFERENCES assets(id),
  script_id        uuid REFERENCES voice_scripts(id),
  expected_text    text, asr_text text,
  asr_similarity   numeric(4,3),
  quality          jsonb,
  accepted         boolean NOT NULL DEFAULT false,
  issues           text[] NOT NULL DEFAULT '{}',       -- ['GURULTULU','KISA','KLIPLENME']
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX voice_takes_profile_idx ON voice_takes(voice_profile_id, step, attempt DESC);

CREATE TABLE voice_provider_bindings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voice_profile_id    uuid NOT NULL REFERENCES voice_profiles(id) ON DELETE CASCADE,
  provider            text NOT NULL CHECK (provider IN
                        ('elevenlabs','cartesia','azure','openai','google','selfhost')),
  provider_voice_id   text,
  provider_consent_id text,
  inline_embedding    text,                            -- slot tutmayan sağlayıcılar
  occupies_slot       boolean NOT NULL DEFAULT true,
  is_ephemeral        boolean NOT NULL DEFAULT false,  -- ⭐ ElevenLabs 660 tavanı
  state               text NOT NULL DEFAULT 'creating' CHECK (state IN (
                        'creating','active','evicted','deleting','deleted','failed')),
  last_used_at        timestamptz,
  expires_at          timestamptz,
  error               jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz
);
CREATE UNIQUE INDEX vpb_profile_provider_idx
  ON voice_provider_bindings(voice_profile_id, provider) WHERE state <> 'deleted';
CREATE INDEX vpb_evict_idx ON voice_provider_bindings(last_used_at)
  WHERE state = 'active' AND occupies_slot;            -- LRU tahliye

-- ═══════════════ 7. HİKAYE ═══════════════

CREATE TABLE stories (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  child_id         uuid REFERENCES children(id) ON DELETE SET NULL,
  title            text,
  age_band         text NOT NULL CHECK (age_band IN ('3-5','6-8','9-12')),
  theme_code       text REFERENCES story_themes(code),
  art_style_code   text NOT NULL REFERENCES art_styles(code),
  hero_name        text NOT NULL,
  hero_is_child    boolean NOT NULL DEFAULT true,
  page_count       int NOT NULL DEFAULT 12,            -- 12 spread = 24 basılı sayfa
  language         text NOT NULL DEFAULT 'tr-TR',
  status           text NOT NULL DEFAULT 'draft' CHECK (status IN (
                     'draft','outline_generating','outline_ready','outline_rejected',
                     'content_generating','content_ready','images_generating',
                     'ready','approved','failed','archived')),
  religious_opt_in boolean NOT NULL DEFAULT false,
  cultural_tags    text[] NOT NULL DEFAULT '{}',
  lesson_tr        text,
  request_input    jsonb NOT NULL,                     -- SANITIZE EDİLMİŞ ebeveyn girdisi
  outline          jsonb,                              -- {kitap_meta,karakter_kanonu,sahne_ozeti[]}
  safety           jsonb,                              -- rubrik skorları, judge kararı
  model_meta       jsonb,                              -- {stage1:{model,usage},stage2:{...}}
  cost_usd         numeric(10,4) NOT NULL DEFAULT 0,
  series_id        uuid, series_index int,
  is_favorite      boolean NOT NULL DEFAULT false,
  approved_at      timestamptz,                        -- ⚠️ TTS/baskı ön koşulu
  ready_at         timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz
);
CREATE INDEX stories_user_idx   ON stories(user_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX stories_child_idx  ON stories(child_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX stories_series_idx ON stories(series_id, series_index);

CREATE TABLE story_characters (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id                 uuid NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  role                     text NOT NULL CHECK (role IN
                             ('kahraman','yardimci','ebeveyn','hayvan','diger')),
  name_tr                  text NOT NULL,
  canon_en                 text NOT NULL,              -- CHARACTER_DNA — DEĞİŞMEZ
  builder_input            jsonb,
  character_sheet_asset_id uuid REFERENCES assets(id),
  face_ref_asset_id        uuid REFERENCES assets(id),
  sheet_variants           jsonb,                      -- ebeveyne gösterilen 3 varyant
  is_primary               boolean NOT NULL DEFAULT false,
  reusable_for_child_id    uuid REFERENCES children(id),  -- "Elif'in kahramanı" tekrar kullanılır
  created_at               timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE children ADD CONSTRAINT children_default_character_fk
  FOREIGN KEY (default_character_id) REFERENCES story_characters(id) ON DELETE SET NULL;

CREATE TABLE story_pages (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id               uuid NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  page_no                int NOT NULL,
  text_tr                text,
  text_sha256            text,                         -- ⭐ TTS cache anahtarı
  scene_summary_tr       text,
  illustration_prompt_en text,
  prompt_sha256          text,                         -- ⭐ görsel cache anahtarı
  emotion                text CHECK (emotion IN
                           ('sakin','nese','merak','hafif_endise','cozulme','sicak_kapanis')),
  time_of_day            text, camera text,
  text_safe_zone         text NOT NULL DEFAULT 'bottom'
                           CHECK (text_safe_zone IN ('bottom','top','left','right')),
  word_count             int,
  image_asset_id         uuid REFERENCES assets(id),   -- ekran (2K)
  image_print_asset_id   uuid REFERENCES assets(id),   -- baskı (4K)
  image_status           text NOT NULL DEFAULT 'pending' CHECK (image_status IN (
                           'pending','generating','qa_failed','manual_review','ready','failed')),
  image_attempts         int NOT NULL DEFAULT 0,
  image_qa               jsonb,  -- {identityCosine,ocrHits,paletteDeltaE,safeZoneVariance}
  edited_by_user         boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (story_id, page_no)
);

CREATE TABLE story_page_revisions (                    -- ebeveyn düzenlemesi geri alınabilsin
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id    uuid NOT NULL REFERENCES story_pages(id) ON DELETE CASCADE,
  revision   int NOT NULL,
  text_tr    text,
  source     text NOT NULL CHECK (source IN ('ai','user','ai_rewrite')),
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (page_id, revision)
);

-- ═══════════════ 8. SESLENDİRME ═══════════════

CREATE TABLE audio_renditions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id           uuid NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  voice_kind         text NOT NULL CHECK (voice_kind IN ('cloned','system')),
  voice_profile_id   uuid REFERENCES voice_profiles(id) ON DELETE SET NULL,
  system_voice_code  text REFERENCES system_voices(code),
  provider           text NOT NULL, model text NOT NULL,
  tier               text NOT NULL DEFAULT 'quality' CHECK (tier IN ('draft','quality')),
  status             text NOT NULL DEFAULT 'queued'
                       CHECK (status IN ('queued','running','succeeded','failed','stale')),
  full_asset_id      uuid REFERENCES assets(id),
  alignment_asset_id uuid REFERENCES assets(id),       -- kelime bazlı JSON, S3'te
  alignment_source   text CHECK (alignment_source IN
                       ('provider','forced_alignment','sentence_estimate','none')),
  duration_ms        int,
  billed_units       bigint,
  billing_unit       text CHECK (billing_unit IN ('character','utf8-byte','second')),
  cost_usd           numeric(10,5),
  content_hash       text,                             -- sha256(metin+ses+tier+model) → cache
  is_default         boolean NOT NULL DEFAULT false,
  error              jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  completed_at       timestamptz,
  CHECK ((voice_kind='cloned'  AND voice_profile_id  IS NOT NULL)
      OR (voice_kind='system'  AND system_voice_code IS NOT NULL))
);
CREATE UNIQUE INDEX audio_rend_dedupe_idx ON audio_renditions(story_id, content_hash)
  WHERE status IN ('queued','running','succeeded');

CREATE TABLE audio_page_marks (                        -- sayfa senkronu (~24 satır)
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rendition_id   uuid NOT NULL REFERENCES audio_renditions(id) ON DELETE CASCADE,
  page_id        uuid NOT NULL REFERENCES story_pages(id) ON DELETE CASCADE,
  page_no        int NOT NULL,
  start_ms       int NOT NULL, end_ms int NOT NULL,
  chunk_asset_id uuid REFERENCES assets(id),
  UNIQUE (rendition_id, page_no)
);
-- Kelime bazlı işaretler DB'de DEĞİL, alignment_asset_id ile S3'te JSON.
-- Gerekçe: 1000 kelime × N rendition = milyonlarca satır; sorgulanmıyor, tek parça okunuyor.

-- ═══════════════ 9. İŞ ORKESTRASYONU ═══════════════

CREATE TABLE jobs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind               text NOT NULL CHECK (kind IN (
                       'story_outline','story_fill','story_page_rewrite',
                       'voice_create','voice_delete',
                       'image_character_sheet','image_book','image_page',
                       'audio_render','pdf_build','print_submit',
                       'export_mp4','privacy_export','privacy_delete')),
  story_id           uuid REFERENCES stories(id) ON DELETE CASCADE,
  voice_profile_id   uuid REFERENCES voice_profiles(id) ON DELETE CASCADE,
  order_id           uuid,                             -- FK aşağıda
  parent_job_id      uuid REFERENCES jobs(id) ON DELETE CASCADE,
  status             text NOT NULL DEFAULT 'queued' CHECK (status IN (
                       'queued','running','waiting_approval','succeeded',
                       'failed','cancelled','dead_letter')),
  priority           int NOT NULL DEFAULT 100,         -- paid=50, free=100, batch=200
  progress_current   int NOT NULL DEFAULT 0,
  progress_total     int NOT NULL DEFAULT 1,
  progress_label     text,                             -- "3/12 sayfa çiziliyor" (TÜRKÇE)
  eta_ms             int,
  idempotency_key    text NOT NULL,
  request_hash       text NOT NULL,
  bull_job_id        text,
  attempt            int NOT NULL DEFAULT 0,
  max_attempts       int NOT NULL DEFAULT 3,
  input              jsonb, output jsonb,
  error              jsonb,                            -- {code,provider,retryable,userMessageTr}
  estimated_cost_usd numeric(10,5),
  actual_cost_usd    numeric(10,5) NOT NULL DEFAULT 0,
  reservation_id     uuid,
  correlation_id     text NOT NULL,                    -- OTel trace id
  next_retry_at      timestamptz,
  queued_at          timestamptz NOT NULL DEFAULT now(),
  started_at         timestamptz, finished_at timestamptz,
  UNIQUE (user_id, idempotency_key)
);
CREATE INDEX jobs_user_active_idx ON jobs(user_id, status, queued_at DESC);
CREATE INDEX jobs_story_idx  ON jobs(story_id, kind);
CREATE INDEX jobs_retry_idx  ON jobs(status, next_retry_at) WHERE status IN ('queued','failed');

-- Adım seviyesi idempotency: 12 görselden 3'ü patlarsa yalnızca o 3'ü tekrar üretiriz.
CREATE TABLE job_steps (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id              uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  step_key            text NOT NULL,                   -- 'image:page:07', 'tts:chunk:03'
  kind                text NOT NULL,
  status              text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','running','succeeded','failed','skipped')),
  attempt             int NOT NULL DEFAULT 0,
  input_hash          text NOT NULL,                   -- değişmediyse yeniden çalıştırma
  output              jsonb,
  provider            text, provider_model text,
  provider_request_id text,                            -- uuidv5(step.id) → sağlayıcı dedupe
  cost_usd            numeric(10,5) NOT NULL DEFAULT 0,
  error               jsonb,
  started_at timestamptz, finished_at timestamptz,
  UNIQUE (job_id, step_key)
);

CREATE TABLE job_events (                              -- SSE replay kaynağı (Last-Event-ID)
  id         bigserial PRIMARY KEY,
  job_id     uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  seq        int NOT NULL,
  type       text NOT NULL,
  payload    jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, seq)
);

CREATE TABLE idempotency_keys (                        -- HTTP seviyesi
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key             text NOT NULL,
  endpoint        text NOT NULL,
  request_hash    text NOT NULL,
  response_status int, response_body jsonb,
  job_id          uuid REFERENCES jobs(id),
  locked_at       timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  PRIMARY KEY (user_id, key)
);

CREATE TABLE content_cache (                           -- ⭐ maliyetin en büyük kaldıracı
  cache_key   text PRIMARY KEY,                        -- sha256(provider|model|op|params|prompt)
  kind        text NOT NULL CHECK (kind IN ('image','tts_chunk','llm')),
  asset_id    uuid REFERENCES assets(id),
  payload     jsonb,
  hit_count   int NOT NULL DEFAULT 0,
  saved_usd   numeric(10,5) NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  last_hit_at timestamptz
);

-- ═══════════════ 10. MALİYET & YETKİLENDİRME ═══════════════

CREATE TABLE plans (
  code                 text PRIMARY KEY,
  title_tr             text NOT NULL,
  price_try            numeric(10,2) NOT NULL,
  period               text NOT NULL CHECK (period IN ('month','year','once')),
  story_quota          int,                            -- NULL = sınırsız
  voice_quota          int NOT NULL DEFAULT 0,
  image_tier           text NOT NULL DEFAULT 'preview',
  tts_tier             text NOT NULL DEFAULT 'draft',
  monthly_cost_cap_usd numeric(10,2) NOT NULL,         -- ⚠️ kötüye kullanım tavanı
  features             jsonb NOT NULL DEFAULT '{}',
  is_active            boolean NOT NULL DEFAULT true
);

CREATE TABLE subscriptions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_code            text NOT NULL REFERENCES plans(code),
  source               text NOT NULL CHECK (source IN ('web','ios_iap','android_iap','grant')),
  external_id          text,
  status               text NOT NULL CHECK (status IN
                         ('trialing','active','past_due','cancelled','expired')),
  current_period_start timestamptz NOT NULL,
  current_period_end   timestamptz NOT NULL,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX subs_active_idx ON subscriptions(user_id)
  WHERE status IN ('trialing','active','past_due');

CREATE TABLE entitlements (
  user_id           uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  plan_code         text NOT NULL REFERENCES plans(code),
  period_start      timestamptz NOT NULL, period_end timestamptz NOT NULL,
  stories_used      int NOT NULL DEFAULT 0,
  credits_balance   int NOT NULL DEFAULT 0,
  period_cost_usd   numeric(10,4) NOT NULL DEFAULT 0,
  reserved_cost_usd numeric(10,4) NOT NULL DEFAULT 0,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- İş başlamadan 'held', bitince 'committed'. Çökmede ops cron serbest bırakır.
CREATE TABLE cost_reservations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id     uuid REFERENCES jobs(id) ON DELETE CASCADE,
  amount_usd numeric(10,5) NOT NULL,
  state      text NOT NULL DEFAULT 'held' CHECK (state IN ('held','committed','released')),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 minutes',
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz
);
CREATE INDEX cost_res_expiry_idx ON cost_reservations(expires_at) WHERE state = 'held';

CREATE TABLE provider_usage (                          -- maliyet defteri: her çağrı = 1 satır
  id             bigserial PRIMARY KEY,
  job_step_id    uuid REFERENCES job_steps(id) ON DELETE SET NULL,
  user_id        uuid REFERENCES users(id) ON DELETE SET NULL,
  provider       text NOT NULL, model text NOT NULL,
  operation      text NOT NULL,                        -- 'llm.complete','image.generate','tts.synth'
  billing_unit   text NOT NULL CHECK (billing_unit IN
                   ('character','utf8_byte','second','token','image','megapixel','request')),
  billed_units   numeric(14,2) NOT NULL,
  unit_price_usd numeric(14,10) NOT NULL,
  cost_usd       numeric(10,5) NOT NULL,
  cache_hit      boolean NOT NULL DEFAULT false,
  latency_ms     int,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pu_created_idx ON provider_usage(created_at DESC);
CREATE INDEX pu_user_idx    ON provider_usage(user_id, created_at DESC);

CREATE TABLE credit_ledger (
  id              bigserial PRIMARY KEY,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta           int NOT NULL,
  reason          text NOT NULL CHECK (reason IN (
                    'purchase','subscription_grant','free_grant','story_spend',
                    'audio_spend','image_retry','refund','admin_adjust')),
  ref_type text, ref_id uuid,
  balance_after   int NOT NULL,
  idempotency_key text UNIQUE,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX credit_user_idx ON credit_ledger(user_id, id DESC);

CREATE TABLE provider_health (
  provider       text PRIMARY KEY,
  circuit_state  text NOT NULL DEFAULT 'closed'
                   CHECK (circuit_state IN ('closed','half_open','open')),
  error_rate_5m  numeric(5,4),
  p95_latency_ms int,
  opened_at      timestamptz,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- ═══════════════ 11. BASKI & TİCARET ═══════════════

CREATE TABLE book_builds (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id              uuid NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  format_code           text NOT NULL REFERENCES book_formats(code),
  revision              int NOT NULL DEFAULT 1,
  status                text NOT NULL DEFAULT 'building'
                          CHECK (status IN ('building','ready','failed')),
  interior_pdf_asset_id uuid REFERENCES assets(id),
  cover_pdf_asset_id    uuid REFERENCES assets(id),
  preview_pdf_asset_id  uuid REFERENCES assets(id),
  digital_pdf_asset_id  uuid REFERENCES assets(id),
  spine_mm              numeric(6,2),
  dedication_tr         text,
  qr_rendition_id       uuid REFERENCES audio_renditions(id),  -- QR hangi sesi çalar
  checks                jsonb,   -- {dpiOk,fontsEmbedded,safeZoneOk,bleedOk}
  warnings              text[] NOT NULL DEFAULT '{}',
  error                 jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  ready_at              timestamptz,
  UNIQUE (story_id, format_code, revision)
);

CREATE TABLE page_audio_links (                        -- basılı kitaptaki QR kodları
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_build_id uuid NOT NULL REFERENCES book_builds(id) ON DELETE CASCADE,
  page_no       int NOT NULL,
  token         text NOT NULL UNIQUE,                  -- kısa, tahmin edilemez
  rendition_id  uuid NOT NULL REFERENCES audio_renditions(id),
  hit_count     int NOT NULL DEFAULT 0,
  revoked_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (book_build_id, page_no)
);

CREATE TABLE orders (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_no      text NOT NULL UNIQUE,                  -- 'KH-2026-000123'
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  story_id      uuid NOT NULL REFERENCES stories(id) ON DELETE RESTRICT,
  book_build_id uuid NOT NULL REFERENCES book_builds(id) ON DELETE RESTRICT,
  status        text NOT NULL DEFAULT 'created' CHECK (status IN (
                  'created','awaiting_payment','paid','in_production',
                  'shipped','delivered','cancelled','refunded','failed')),
  quantity       int NOT NULL DEFAULT 1,
  unit_price_try numeric(10,2) NOT NULL,
  shipping_try   numeric(10,2) NOT NULL DEFAULT 0,
  discount_try   numeric(10,2) NOT NULL DEFAULT 0,
  total_try      numeric(10,2) NOT NULL,
  currency       text NOT NULL DEFAULT 'TRY',
  installment    int NOT NULL DEFAULT 1,
  -- ⚠️ 6502: ibare sipariş onayından ÖNCE gösterilmezse cayma istisnası İŞLEMEZ
  withdrawal_waiver_doc_id   uuid REFERENCES legal_documents(id),
  withdrawal_waiver_shown_at timestamptz,
  withdrawal_waiver_accepted boolean NOT NULL DEFAULT false,
  distance_contract_doc_id   uuid REFERENCES legal_documents(id),
  recipient_name text NOT NULL, recipient_phone text NOT NULL,
  address_line1  text NOT NULL, address_line2 text,
  district       text NOT NULL, city text NOT NULL,
  postal_code    text, country text NOT NULL DEFAULT 'TR',
  gift_note_tr   text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  paid_at        timestamptz, cancelled_at timestamptz,
  CHECK (status = 'created' OR withdrawal_waiver_accepted)   -- kolon seviyesinde kapı
);
CREATE INDEX orders_user_idx   ON orders(user_id, created_at DESC);
CREATE INDEX orders_status_idx ON orders(status) WHERE status IN ('paid','in_production');
ALTER TABLE jobs ADD CONSTRAINT jobs_order_fk
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;

CREATE TABLE payments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        uuid REFERENCES orders(id) ON DELETE SET NULL,
  subscription_id uuid REFERENCES subscriptions(id) ON DELETE SET NULL,
  provider        text NOT NULL CHECK (provider IN ('iyzico','paytr','apple_iap','google_iap')),
  provider_ref    text,
  amount_try      numeric(10,2) NOT NULL,
  installment     int NOT NULL DEFAULT 1,
  status          text NOT NULL CHECK (status IN
                    ('init','authorized','captured','failed','refunded')),
  raw             jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE print_jobs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider          text NOT NULL CHECK (provider IN
                      ('manual_tr','cloudprinter','gelato','lulu')),
  provider_order_id text,
  status            text NOT NULL DEFAULT 'queued' CHECK (status IN (
                      'queued','submitted','accepted','printing','shipped','error','cancelled')),
  files             jsonb,                             -- {interiorUrl,coverUrl,workOrderPdfUrl}
  cost_try          numeric(10,2),
  tracking_carrier  text, tracking_no text,
  events            jsonb NOT NULL DEFAULT '[]',
  operator_note     text,
  submitted_at timestamptz, shipped_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ═══════════════ 12. GÜVENLİK, DENETİM, MESAJLAŞMA ═══════════════

CREATE TABLE moderation_events (
  id           bigserial PRIMARY KEY,
  user_id      uuid REFERENCES users(id) ON DELETE SET NULL,
  story_id     uuid REFERENCES stories(id) ON DELETE CASCADE,
  page_no      int,
  surface      text NOT NULL CHECK (surface IN (
                 'parent_input','story_text','illustration_prompt','image_output',
                 'voice_script','user_edit')),
  stage        text NOT NULL CHECK (stage IN ('pre','post')),
  engine       text NOT NULL CHECK (engine IN (
                 'deterministic','injection_detector','openai_moderation',
                 'llm_judge','age_rubric','provider_block','brand_denylist')),
  verdict      text NOT NULL CHECK (verdict IN ('pass','flag','block')),
  categories   jsonb, scores jsonb, excerpt text,
  action_taken text CHECK (action_taken IN
                 ('none','retry','regenerate','manual_review','account_flag')),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX moderation_flagged_idx ON moderation_events(created_at DESC) WHERE verdict <> 'pass';

CREATE TABLE abuse_reports (                           -- Apple 1.2 zorunlu
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_user_id uuid REFERENCES users(id),
  reporter_email   text,                               -- oturumsuz ihbar (ses sahibi)
  target_type      text NOT NULL CHECK (target_type IN
                     ('story','image','voice_profile','user')),
  target_id        uuid,
  reason           text NOT NULL CHECK (reason IN
                     ('ses_benim_izinsiz','uygunsuz_icerik','telif','diger')),
  detail           text,
  status           text NOT NULL DEFAULT 'open'
                     CHECK (status IN ('open','triaged','actioned','rejected')),
  sla_due_at       timestamptz NOT NULL,               -- +72 saat
  resolution       text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX abuse_sla_idx ON abuse_reports(sla_due_at) WHERE status IN ('open','triaged');

CREATE TABLE data_subject_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind            text NOT NULL CHECK (kind IN
                    ('access','export','rectify','erase','object','consent_withdraw')),
  status          text NOT NULL DEFAULT 'received'
                    CHECK (status IN ('received','in_progress','completed','rejected')),
  due_at          timestamptz NOT NULL,                -- +30 gün
  note            text,
  result_asset_id uuid REFERENCES assets(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE deletion_tasks (                          -- bizde silmek YETMEZ
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid REFERENCES users(id) ON DELETE CASCADE,
  target       text NOT NULL CHECK (target IN (
                 'voice_provider','image_provider','llm_logs','storage_objects','db_rows')),
  ref          text NOT NULL,                          -- providerVoiceId, s3 prefix, ...
  status       text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','running','completed','failed')),
  attempts     int NOT NULL DEFAULT 0,
  last_error   text,
  run_at       timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX deletion_pending_idx ON deletion_tasks(status, run_at) WHERE status <> 'completed';

CREATE TABLE audit_log (
  id          bigserial PRIMARY KEY,
  actor_type  text NOT NULL CHECK (actor_type IN ('user','admin','system','provider')),
  actor_id    uuid,
  action      text NOT NULL,                           -- 'voice_profile.created'
  entity_type text, entity_id uuid,
  before jsonb, after jsonb,
  ip inet, user_agent text, trace_id text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_entity_idx ON audit_log(entity_type, entity_id, created_at DESC);

CREATE TABLE outbox (                                  -- at-least-once bildirim
  id           bigserial PRIMARY KEY,
  aggregate    text NOT NULL, aggregate_id uuid NOT NULL,
  event_type   text NOT NULL,
  payload      jsonb NOT NULL,
  dedupe_key   text NOT NULL UNIQUE,
  status       text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','sent','failed','dead')),
  attempts     int NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX outbox_pending_idx ON outbox(status, available_at);

CREATE TABLE webhook_inbox (
  id           bigserial PRIMARY KEY,
  source       text NOT NULL,                          -- 'iyzico','lulu','elevenlabs'
  external_id  text NOT NULL,
  signature_ok boolean NOT NULL,
  payload      jsonb NOT NULL,
  processed_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, external_id)                         -- idempotency
);
```

**İlişki özeti:** `users 1—N children / voice_profiles / stories`. `voice_profiles 1—N voice_takes, 1—N voice_provider_bindings`. `stories 1—N story_pages / story_characters / audio_renditions / book_builds / jobs`. `audio_renditions 1—N audio_page_marks`. `book_builds 1—N page_audio_links, 1—N orders 1—1 print_jobs`. `consents N—1 legal_documents`, `consents → voice_profiles` (rıza olmadan profil olamaz, `RESTRICT`). Her binary `assets` üzerinden S3'e, her uzun iş `jobs → job_steps → provider_usage` üzerinden maliyete bağlı.

---

