import { z } from 'zod';

/**
 * Environment schema. Every variable documented in `.env.example` is declared here and
 * nowhere else. Adding a variable to `.env.example` without adding it here is a bug:
 * it will be silently ignored.
 */

/* ── coercion helpers ─────────────────────────────────────────────────────── */

const TRUTHY = new Set(['1', 'true', 'yes', 'on', 'evet']);
const FALSY = new Set(['0', 'false', 'no', 'off', 'hayir', 'hayır', '']);

/** Accepts the usual shell spellings of a boolean; rejects anything ambiguous. */
const zBool = (defaultValue: boolean) =>
  z
    .union([z.boolean(), z.string()])
    .default(defaultValue)
    .transform((value, ctx) => {
      if (typeof value === 'boolean') return value;
      const normalized = value.trim().toLowerCase();
      if (TRUTHY.has(normalized)) return true;
      if (FALSY.has(normalized)) return false;
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `expected a boolean-like value, received "${value}"`,
      });
      return z.NEVER;
    });

const zInt = (defaultValue: number, min?: number, max?: number) => {
  let schema = z.coerce.number().int();
  if (min !== undefined) schema = schema.min(min);
  if (max !== undefined) schema = schema.max(max);
  return schema.default(defaultValue);
};

const zNumber = (defaultValue: number, min = 0) =>
  z.coerce.number().min(min).default(defaultValue);

/** Treats "" the same as "not set" — shells and CI love exporting empty strings. */
const zOptionalString = () =>
  z
    .string()
    .trim()
    .optional()
    .transform((value) => (value === undefined || value === '' ? undefined : value));

/* ── enums ────────────────────────────────────────────────────────────────── */

export const apiModeSchema = z.enum(['mock', 'live']);
export type ApiMode = z.infer<typeof apiModeSchema>;

export const nodeEnvSchema = z.enum(['development', 'test', 'production']);
export type NodeEnv = z.infer<typeof nodeEnvSchema>;

export const voiceProviderSchema = z.enum(['elevenlabs', 'cartesia', 'azure', 'system']);
export type VoiceProvider = z.infer<typeof voiceProviderSchema>;

export const printAdapterSchema = z.enum(['manual_tr', 'cloudprinter', 'gelato', 'lulu']);
export type PrintAdapter = z.infer<typeof printAdapterSchema>;

/**
 * Secondary LLM vendor the router falls over to when the primary is exhausted.
 * `none` = single-provider route (the default): a fallback nobody has ever exercised is a
 * liability, so it is opt-in per environment.
 */
export const llmFallbackProviderSchema = z.enum(['none', 'openai']);
export type LlmFallbackProvider = z.infer<typeof llmFallbackProviderSchema>;

/**
 * Who draws. `fake` is the in-repo deterministic double — it is a legitimate production
 * value in `API_MODE=mock`, and the only value that works with no vendor key at all.
 */
export const imageProviderSchema = z.enum(['google', 'fake']);
export type ImageProvider = z.infer<typeof imageProviderSchema>;

/**
 * Where rendered media lands. `filesystem` is not a toy: it is what runs when no MinIO/S3
 * exists (CI, a laptop, this environment). Signed URLs work in both drivers, so no caller
 * has to know which one is active.
 */
export const mediaStorageDriverSchema = z.enum(['s3', 'filesystem']);
export type MediaStorageDriver = z.infer<typeof mediaStorageDriverSchema>;

/** `book_formats.color_profile` mirror — what the print rendition is converted to. */
export const printColorSpaceSchema = z.enum(['srgb', 'cmyk']);
export type PrintColorSpace = z.infer<typeof printColorSpaceSchema>;

export const logLevelSchema = z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']);
export type LogLevel = z.infer<typeof logLevelSchema>;

/**
 * Which halves of the product this process runs.
 *
 * `api` and `worker` are the REAL topology (SPEC §2): two deployments, scaled apart,
 * because an image fan-out must never be able to starve `GET /v1/jobs/:id`. `all` is a
 * DEPLOYMENT CONVENIENCE, not a third architecture — it exists because free hosting tiers
 * (Render, Fly's smallest allowance) give you exactly one always-on process, and a product
 * nobody can afford to host is a product nobody uses.
 *
 * What `all` does NOT do is merge the two: the Fastify server and the BullMQ workers are
 * still built by the same two functions, from the same two entry points, with the same
 * dependencies. They just share one Node process, one Postgres pool and one queue
 * registry. Splitting back apart is one environment variable, no code change — which is
 * the property that keeps this from becoming an architecture.
 */
export const processModeSchema = z.enum(['api', 'worker', 'all']);
export type ProcessMode = z.infer<typeof processModeSchema>;

/**
 * Where BullMQ's Redis lives.
 *
 *  `external`  — a Redis/Valkey somewhere else: the compose stack, Upstash, a managed
 *                instance. `REDIS_URL` points at it and nothing is started locally.
 *  `embedded`  — a `redis-server` started INSIDE this container by the entrypoint, on
 *                loopback. The choice free-tier hosting forces, and defensible here
 *                because the source of truth is Postgres: BullMQ holds pointers only
 *                (`apps/worker/src/queues.ts`), so losing the whole of Redis is a
 *                re-enqueue (`resumeRecoverableJobs`), not a lost book.
 *
 * Switching between them is this one variable plus `REDIS_URL` — no code path differs.
 */
export const redisModeSchema = z.enum(['external', 'embedded']);
export type RedisMode = z.infer<typeof redisModeSchema>;

/* ── schema ───────────────────────────────────────────────────────────────── */

export const envSchema = z
  .object({
    // 1. runtime mode
    NODE_ENV: nodeEnvSchema.default('development'),
    /**
     * `mock` keeps every outbound AI call inside packages/mock. `live` talks to real
     * providers and makes the provider credentials below mandatory (see superRefine).
     */
    API_MODE: apiModeSchema.default('mock'),
    /**
     * api | worker | all. Defaults to `api` so the historical `node apps/api` behaviour is
     * unchanged; `all` is what the single free web service on Render runs.
     */
    PROCESS_MODE: processModeSchema.default('api'),
    PORT: zInt(3001, 1, 65535),
    HOST: z.string().default('0.0.0.0'),
    PUBLIC_BASE_URL: z.string().url().default('http://localhost:3001'),
    WEB_BASE_URL: z.string().url().default('http://localhost:3000'),
    LOG_LEVEL: logLevelSchema.default('info'),

    // 2. database
    DATABASE_URL: z.string().min(1).default('postgresql://kendihikayem:kendihikayem@localhost:5432/kendihikayem'),
    DATABASE_MIGRATION_URL: zOptionalString(),
    DATABASE_POOL_MAX: zInt(10, 1, 200),
    /**
     * ⚠️ SUPABASE / PGBOUNCER. postgres.js opens a named prepared statement per distinct
     * query. A TRANSACTION-mode pooler (Supabase's Supavisor on port 6543, PgBouncer in
     * `transaction` mode) hands each transaction a different backend connection, so the
     * statement the driver prepared on connection A is missing when the next query lands on
     * connection B — the failure mode is an intermittent
     * `prepared statement "s1" does not exist` / `already exists` under load, never at boot
     * and never in a test.
     *
     * `auto` (the default) reads the connection string: a `pgbouncer=true` parameter, or a
     * Supabase pooler host on the transaction port, turns prepared statements OFF and leaves
     * them ON everywhere else — a direct connection loses nothing. `on`/`off` force it when
     * a pooler this heuristic has not met is in front.
     */
    DATABASE_PREPARED_STATEMENTS: z.enum(['auto', 'on', 'off']).default('auto'),

    // 3. queue
    REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
    QUEUE_PREFIX: z.string().min(1).default('kh'),
    /**
     * `external` (default) or `embedded`. See `redisModeSchema`. The application code is
     * identical either way — this only tells the container entrypoint whether it has to
     * start a `redis-server`, and tells the boot log which of the two it is talking to.
     */
    REDIS_MODE: redisModeSchema.default('external'),
    /**
     * TLS for the queue connection. `auto` derives it from the scheme (`rediss://` ⇒ on),
     * which is what every managed provider (Upstash, Redis Cloud) hands you. Forcing it is
     * for the provider that serves TLS on a `redis://` URL.
     */
    REDIS_TLS: z.enum(['auto', 'on', 'off']).default('auto'),

    // 4. object storage
    /**
     * S3 API root. Three shapes are known to work with the driver in `packages/media`:
     *   MinIO     `http://localhost:9000`
     *   AWS S3    `https://s3.eu-central-1.amazonaws.com`
     *   Supabase  `https://<proje-ref>.storage.supabase.co/storage/v1/s3`
     *
     * ⚠️ The Supabase form carries a PATH PREFIX. The driver keeps it and signs it (it is
     * part of the SigV4 canonical request); an endpoint whose prefix is dropped signs a
     * different request than it sends and every call comes back 403 SignatureDoesNotMatch.
     */
    S3_ENDPOINT: zOptionalString(),
    /** Must match the bucket's real region: SigV4 puts it in the credential scope. */
    S3_REGION: z.string().default('eu-central-1'),
    S3_ACCESS_KEY_ID: zOptionalString(),
    S3_SECRET_ACCESS_KEY: zOptionalString(),
    S3_FORCE_PATH_STYLE: zBool(true),
    S3_BUCKET_MEDIA: z.string().min(1).default('kh-media'),
    /** KVKK: raw voice reference takes must live in a separate bucket with its own CMK. */
    S3_BUCKET_VOICE_RAW: z.string().min(1).default('kh-voice-raw'),
    S3_KMS_KEY_ID: zOptionalString(),
    S3_VOICE_KMS_KEY_ID: zOptionalString(),
    MEDIA_SIGNED_URL_TTL_SEC: zInt(900, 60, 86400),

    // 5. identity
    AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),
    AUTH_BASE_URL: z.string().url().default('http://localhost:3001'),
    SESSION_TTL_DAYS: zInt(30, 1, 365),
    OTP_DAILY_LIMIT: zInt(5, 1, 100),

    // 6. notifications
    NETGSM_USER: zOptionalString(),
    NETGSM_PASSWORD: zOptionalString(),
    NETGSM_MSG_HEADER: zOptionalString(),
    RESEND_API_KEY: zOptionalString(),
    EMAIL_FROM: z.string().default('KendiHikayem <merhaba@kendihikayem.com>'),
    VAPID_PUBLIC_KEY: zOptionalString(),
    VAPID_PRIVATE_KEY: zOptionalString(),
    VAPID_SUBJECT: zOptionalString(),

    // 7. AI providers — model ids live here, never hardcoded in code (SPEC §3 rule 6)
    ANTHROPIC_API_KEY: zOptionalString(),
    LLM_MODEL_OUTLINE: z.string().min(1).default('claude-sonnet-5'),
    LLM_MODEL_FILL: z.string().min(1).default('claude-opus-5'),
    LLM_MODEL_JUDGE: z.string().min(1).default('claude-haiku-4-5'),
    LLM_FILL_EFFORT: z.enum(['low', 'medium', 'high']).default('high'),

    /* ── 7a. Hikaye üretimi (A3) ───────────────────────────────────────────
     * Model ids above, wiring here. The story pipeline reads every one of these at boot;
     * none of it may appear as a literal in code (SPEC §3 rule 6). */
    ANTHROPIC_BASE_URL: z.string().url().default('https://api.anthropic.com'),
    /** Pinned wire version. A vendor bumping this must be a config change, not a surprise. */
    ANTHROPIC_API_VERSION: z.string().min(1).default('2023-06-01'),
    /** Comma-separated `anthropic-beta` header values; empty = none. */
    ANTHROPIC_BETA: zOptionalString(),
    /** Wall-clock budget for ONE completion. Stage 2 with effort:high is genuinely slow. */
    LLM_REQUEST_TIMEOUT_MS: zInt(180_000, 1_000, 900_000),
    /** Output ceiling per stage. Stage 2 emits ~7k tokens for a 12-spread book (SPEC §6.1). */
    LLM_MAX_OUTPUT_TOKENS_OUTLINE: zInt(4_000, 256, 64_000),
    LLM_MAX_OUTPUT_TOKENS_FILL: zInt(12_000, 256, 64_000),
    LLM_MAX_OUTPUT_TOKENS_JUDGE: zInt(1_500, 128, 32_000),
    /**
     * ⚠️ `adaptive` is the ONLY thinking mode current flagship models accept; the old
     * fixed `budget_tokens` form is rejected outright by them, so it is not configurable
     * here. `off` sends no thinking field at all — required for cheap-tier models that do
     * not implement adaptive thinking.
     */
    LLM_THINKING_MODE: z.enum(['off', 'adaptive']).default('adaptive'),
    /**
     * Reasoning effort per stage. `none` omits the field entirely: the judge runs on a
     * cheap-tier model that rejects an effort hint, and sending one is a 400, not a
     * downgrade. (`LLM_FILL_EFFORT` above carries the stage-2 value.)
     */
    LLM_OUTLINE_EFFORT: z.enum(['none', 'low', 'medium', 'high']).default('medium'),
    LLM_JUDGE_EFFORT: z.enum(['none', 'low', 'medium', 'high']).default('none'),
    /** The judge model is a cheap tier; thinking is off there regardless of the mode. */
    LLM_JUDGE_THINKING_MODE: z.enum(['off', 'adaptive']).default('off'),
    /** Schema mismatch ⇒ re-ask with the validator's complaint. Then give up. */
    LLM_SCHEMA_REPAIR_ATTEMPTS: zInt(2, 0, 5),
    /** Quality gate / judge rejection ⇒ regenerate. SPEC §10.4 K4: max 2, then refund. */
    STORY_QUALITY_MAX_ATTEMPTS: zInt(3, 1, 5),
    /** `false` = a failing TR quality gate only warns. Never set false in production. */
    STORY_QUALITY_GATE_ENFORCED: zBool(true),
    /** Secondary LLM vendor for the router. `none` = single-provider route. */
    LLM_FALLBACK_PROVIDER: llmFallbackProviderSchema.default('none'),
    LLM_MODEL_FALLBACK_OUTLINE: z.string().min(1).default('gpt-5.6-terra'),
    LLM_MODEL_FALLBACK_FILL: z.string().min(1).default('gpt-5.6-sol'),
    LLM_MODEL_FALLBACK_JUDGE: z.string().min(1).default('gpt-5.6-luna'),

    OPENAI_API_KEY: zOptionalString(),
    OPENAI_BASE_URL: z.string().url().default('https://api.openai.com'),
    MODERATION_MODEL: z.string().min(1).default('omni-moderation-latest'),
    /** Moderation is free and on the critical path; it must fail fast, not hang. */
    MODERATION_TIMEOUT_MS: zInt(15_000, 500, 120_000),
    /**
     * `flag` scores at or above this become a BLOCK for a children's product. The vendor's
     * own boolean is tuned for a general audience; ours is not.
     */
    MODERATION_BLOCK_THRESHOLD: zNumber(0.5, 0),

    GOOGLE_GENAI_API_KEY: zOptionalString(),
    IMAGE_MODEL_PRIMARY: z.string().min(1).default('gemini-3-pro-image'),
    IMAGE_MODEL_FALLBACK: zOptionalString(),
    IMAGE_QA_FACE_THRESHOLD: zNumber(0.62, 0),

    /* ── 7b. Görsel üretim hattı (A4) ──────────────────────────────────────
     * Model ids above, wiring here. Everything in this block is a value the image
     * pipeline reads at boot; none of it may appear as a literal in code. */
    IMAGE_PROVIDER_PRIMARY: imageProviderSchema.default('google'),
    /** Second adapter in the `ProviderRouter` route. Empty = single-provider route. */
    IMAGE_PROVIDER_FALLBACK: imageProviderSchema.optional(),
    GOOGLE_GENAI_BASE_URL: z
      .string()
      .url()
      .default('https://generativelanguage.googleapis.com'),
    GOOGLE_GENAI_API_VERSION: z.string().min(1).default('v1beta'),
    /** Wall-clock budget for ONE image call. A 4K page is slow; a hung socket is slower. */
    IMAGE_REQUEST_TIMEOUT_MS: zInt(120_000, 1_000, 600_000),
    /**
     * SPEC §8.2 step 5: retry budget per page is 2, i.e. at most 3 renders, then the page
     * goes to `manual_review` and the book ships without it.
     */
    IMAGE_QA_MAX_ATTEMPTS: zInt(3, 1, 6),
    /** SPEC §8.3 palette drift against the style plate, CIEDE2000. */
    IMAGE_QA_PALETTE_DELTA_E_MAX: zNumber(20, 0),
    /** Normalised edge energy allowed inside the typeset text safe zone (0..1). */
    IMAGE_QA_SAFE_ZONE_MAX: zNumber(0.35, 0),
    /** Text/letter artefact score (0..1). SPEC §8.4: images carry NO text at all. */
    IMAGE_QA_TEXT_SCORE_MAX: zNumber(0.35, 0),
    /**
     * Fail-closed switch. A QA check whose backend is not deployed (no face-embedding
     * service) reports `unavailable`. `false` = ship the page and record the gap;
     * `true` = treat it as a failure. False by default so a missing ML sidecar degrades
     * the QA gate instead of stopping the product.
     */
    IMAGE_QA_STRICT: zBool(false),

    /* ── 7c. Medya işleme ve depolama (A4) ─────────────────────────────── */
    MEDIA_STORAGE_DRIVER: mediaStorageDriverSchema.default('filesystem'),
    /** Root for `MEDIA_STORAGE_DRIVER=filesystem`. Relative paths resolve from cwd. */
    MEDIA_LOCAL_ROOT: z.string().min(1).default('.data/media'),
    /** HMAC key for filesystem signed URLs. Falls back to `AUTH_SECRET` when unset. */
    MEDIA_URL_SIGNING_SECRET: zOptionalString(),
    /** SPEC §9: 21 cm trim at 300 DPI = 2480 px; +5 mm bleed = 2551 px. */
    PRINT_TARGET_DPI: zInt(300, 72, 1200),
    PRINT_BLEED_MM: zNumber(5, 0),
    PRINT_TRIM_MM: zNumber(210, 1),
    PRINT_SAFE_MM: zNumber(20, 0),
    PRINT_COLOR_SPACE: printColorSpaceSchema.default('srgb'),
    /** ISO Coated v2 (ECI) or equivalent. Required when PRINT_COLOR_SPACE=cmyk. */
    PRINT_ICC_PROFILE_PATH: zOptionalString(),

    ELEVENLABS_API_KEY: zOptionalString(),
    CARTESIA_API_KEY: zOptionalString(),
    AZURE_SPEECH_KEY: zOptionalString(),
    AZURE_SPEECH_REGION: z.string().default('westeurope'),
    TTS_MODEL_QUALITY: z.string().min(1).default('eleven_multilingual_v2'),
    TTS_MODEL_DRAFT: z.string().min(1).default('eleven_flash_v2_5'),
    VOICE_PRIMARY: voiceProviderSchema.default('elevenlabs'),
    VOICE_FALLBACK: voiceProviderSchema.default('cartesia'),
    VOICE_SLOT_LIMIT: zInt(660, 1, 100000),
    WHISPERX_URL: zOptionalString(),

    /* ── 7b. Seslendirme ve ses klonlama (A5) ──────────────────────────────
     * Endpoints, budgets and voice-cloning policy. Same rule as everywhere else: no model
     * id, voice id or URL is a literal in code (SPEC §3 rule 6) — the day a key arrives,
     * `API_MODE=live` is the only edit that should be needed. */
    ELEVENLABS_BASE_URL: z.string().url().default('https://api.elevenlabs.io'),
    CARTESIA_BASE_URL: z.string().url().default('https://api.cartesia.ai'),
    /** Pinned wire version; a vendor bumping it must be a config change, not a surprise. */
    CARTESIA_API_VERSION: z.string().min(1).default('2024-11-13'),
    CARTESIA_MODEL_QUALITY: z.string().min(1).default('sonic-2'),
    CARTESIA_MODEL_DRAFT: z.string().min(1).default('sonic-turbo'),
    /** One chunk of narration. Long enough to keep prosody, short enough to re-render cheap. */
    TTS_REQUEST_TIMEOUT_MS: zInt(120_000, 1_000, 600_000),
    /** Voice creation uploads ~2 MB of reference audio and is slow on the vendor side. */
    TTS_VOICE_CREATE_TIMEOUT_MS: zInt(240_000, 1_000, 900_000),
    /**
     * Wire format we ask the vendor for. PCM by default and deliberately so: concatenation,
     * loudness normalisation and silence trimming all happen in-process, and re-encoding
     * MP3 per chunk would stack generation loss across twelve pages of a book.
     */
    TTS_OUTPUT_FORMAT: z.enum(['mp3_44100_128', 'pcm_48000', 'opus_48000']).default('pcm_48000'),
    /**
     * Chunk ceiling in characters. Below the vendor's own limit on purpose: the chunk is the
     * unit of the content cache, so a smaller chunk means editing page 3 re-renders less
     * (SPEC §6.2 rule 4). Chunks still split on page/paragraph lines, never mid-sentence.
     */
    TTS_CHUNK_MAX_CHARS: zInt(1_800, 200, 5_000),
    /** SPEC §7 step 10: four concurrent chunk renders. */
    TTS_CHUNK_CONCURRENCY: zInt(4, 1, 16),
    /** Silence inserted between chunks when they are joined, in ms (SPEC §7 step 10). */
    TTS_CHUNK_GAP_MS: zInt(350, 0, 3_000),
    /** Integrated loudness target for the finished narration (SPEC §7 step 10: −16 LUFS). */
    TTS_LOUDNESS_TARGET_LUFS: z.coerce.number().min(-40).max(-6).default(-16),
    /** True-peak ceiling after normalisation, dBTP. */
    TTS_LOUDNESS_PEAK_CEILING_DB: z.coerce.number().min(-6).max(0).default(-1.5),
    /** Bedtime mode: gain at the last page, relative to the first (contract audio.ts). */
    TTS_BEDTIME_END_GAIN: z.coerce.number().min(0.1).max(1).default(0.6),
    /** Voice-clone timbre knobs. Vendor-neutral names; each adapter maps them to its API. */
    TTS_VOICE_STABILITY: z.coerce.number().min(0).max(1).default(0.45),
    TTS_VOICE_SIMILARITY: z.coerce.number().min(0).max(1).default(0.85),
    TTS_VOICE_STYLE: z.coerce.number().min(0).max(1).default(0.35),
    TTS_VOICE_SPEAKER_BOOST: zBool(true),
    /**
     * ⚠️ SPEC §14 R5. When true, a cloned voice is deleted at the vendor as soon as the
     * render finishes, so the 660-slot ceiling stops being a hard cap on paying customers.
     * The trade is latency: the next story re-uploads the reference. Off by default because
     * re-creation must be proven reliable before it sits in front of a parent.
     */
    VOICE_EPHEMERAL: zBool(false),
    /** How long an idle provider binding may hold a slot before the LRU sweep evicts it. */
    VOICE_BINDING_IDLE_HOURS: zInt(72, 1, 8_760),
    /** Fraction of the slot ceiling at which eviction starts. 0.9 = evict from 594 of 660. */
    VOICE_SLOT_HIGH_WATER: z.coerce.number().min(0.1).max(1).default(0.9),
    /**
     * ⚠️ KVKK. Raw reference recordings are destroyed this many days after the parent
     * accepts the profile (SPEC §7 step 9). Consent clips are NOT covered by this — they
     * carry `legal_hold_10y` and outlive the account on purpose.
     */
    VOICE_RAW_RETENTION_DAYS: zInt(30, 1, 365),
    /** ASR/forced-alignment request budget. Alignment is per-render, not per-chunk. */
    ALIGN_REQUEST_TIMEOUT_MS: zInt(180_000, 1_000, 900_000),
    ALIGN_MODEL: z.string().min(1).default('whisperx-large-v3-tr'),
    /**
     * `ffmpeg` binary, for decoding the container formats the phone records (m4a/webm).
     * WAV is decoded in-process and needs nothing. Empty ⇒ non-WAV uploads are rejected
     * with a clear error rather than silently mis-measured.
     */
    AUDIO_FFMPEG_PATH: zOptionalString(),

    // 8. commerce & print
    IYZICO_API_KEY: zOptionalString(),
    IYZICO_SECRET_KEY: zOptionalString(),
    IYZICO_BASE_URL: z.string().url().default('https://sandbox-api.iyzipay.com'),
    PRINT_ADAPTER: printAdapterSchema.default('manual_tr'),
    /** Base URL of an API-driven printer (Cloudprinter/Gelato/Lulu). Unused by manual_tr. */
    PRINT_PROVIDER_BASE_URL: zOptionalString(),
    PRINT_PROVIDER_API_KEY: zOptionalString(),
    /** HMAC secret for the printer's status webhook; without it webhooks are REFUSED. */
    PRINT_WEBHOOK_SECRET: zOptionalString(),
    /** `{"kare21_24_sert":"sku_..."}` — our format code → the partner's product id. */
    PRINT_SKU_MAP: zOptionalString(),
    /** How often the worker asks the printer where the order is. */
    PRINT_STATUS_POLL_MINUTES: zInt(60, 5, 1440),
    /**
     * SPEC §9: the first orders go out only after a physical proof. The number is config so
     * it can be turned off the day the partner is trusted, not the day someone forgets.
     */
    PRINT_PHYSICAL_PROOF_FIRST_N: zInt(5, 0, 1000),

    /** Printed QR lifetime. The DB has no expiry column; this is the policy over created_at. */
    QR_TOKEN_TTL_DAYS: zInt(3650, 1, 36500),

    /**
     * PDF/X-3 leg (SPEC §9 step 9b). Absent ⇒ skipped; the sRGB file goes to the printer.
     * The colour space and the ICC profile are `PRINT_COLOR_SPACE` / `PRINT_ICC_PROFILE_PATH`.
     */
    PDF_GHOSTSCRIPT_PATH: zOptionalString(),
    PDF_PDFX_DEF_PATH: zOptionalString(),

    /**
     * ⚠️ KDV oranı bir MUHASEBE kararıdır. Basılı kitap istisnası (7166) kişiye özel
     * üretime uygulanır mı, mali müşavir söyler. Varsayılan genel oran: eksik tahsil
     * vergi borcudur, fazla tahsil düzeltilebilir.
     */
    KDV_RATE_PRINT_BOOK: zNumber(0.2, 0),
    KDV_RATE_SHIPPING: zNumber(0.2, 0),

    // 9. cost caps
    COST_CAP_PER_STORY_USD: zNumber(6, 0),
    COST_CAP_DAILY_USD: zNumber(250, 0),

    // 10. observability
    SENTRY_DSN: zOptionalString(),
    OTEL_EXPORTER_OTLP_ENDPOINT: zOptionalString(),
    OTEL_SERVICE_NAME: z.string().default('kendihikayem-api'),
  })
  .superRefine((env, ctx) => {
    /* ── Rules that hold in BOTH modes ───────────────────────────────────────
     * A misconfigured storage driver or a CMYK conversion with no ICC profile is
     * wrong in mock too — it just fails later, on a file nobody is watching. */
    if (env.MEDIA_STORAGE_DRIVER === 's3') {
      for (const key of ['S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const) {
        if (env[key] === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: 'required when MEDIA_STORAGE_DRIVER=s3',
          });
        }
      }
    }
    /**
     * `embedded` means the CONTAINER starts a redis-server on loopback. Pointing the app at
     * a remote host while the entrypoint boots a local one leaves two Redises — the workers
     * consume from the remote, the enqueues land on the local, and the product looks like a
     * queue that silently swallows work. Neither half errors; that is what makes it worth
     * refusing at boot.
     */
    if (env.REDIS_MODE === 'embedded') {
      let host = '';
      try {
        host = new URL(env.REDIS_URL).hostname;
      } catch {
        host = '';
      }
      const loopback = ['localhost', '127.0.0.1', '::1', ''];
      if (!loopback.includes(host)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['REDIS_URL'],
          message: `REDIS_MODE=embedded starts redis inside this container, but REDIS_URL points at "${host}" — set REDIS_MODE=external or point REDIS_URL at 127.0.0.1`,
        });
      }
    }

    if (env.PRINT_COLOR_SPACE === 'cmyk' && env.PRINT_ICC_PROFILE_PATH === undefined) {
      // Converting to CMYK without a profile silently uses a generic one, and the
      // printed black text separates into four inks (SPEC §9 step 9b).
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['PRINT_ICC_PROFILE_PATH'],
        message: 'required when PRINT_COLOR_SPACE=cmyk (e.g. ISO Coated v2)',
      });
    }

    if (env.API_MODE !== 'live') return;

    // In live mode a missing credential is a silent, expensive failure at 3am. Fail at boot.
    const requiredInLive: Array<[keyof typeof env, string]> = [
      ['ANTHROPIC_API_KEY', 'story generation'],
      ['OPENAI_API_KEY', 'moderation'],
      ['S3_ACCESS_KEY_ID', 'object storage'],
      ['S3_SECRET_ACCESS_KEY', 'object storage'],
    ];
    // Only the selected image provider's key is mandatory: `IMAGE_PROVIDER_PRIMARY=fake`
    // is how a live deployment runs the rest of the product before the Gemini key exists.
    const imageProviders = [env.IMAGE_PROVIDER_PRIMARY, env.IMAGE_PROVIDER_FALLBACK];
    if (imageProviders.includes('google')) {
      requiredInLive.push(['GOOGLE_GENAI_API_KEY', 'illustration']);
    }
    for (const [key, purpose] of requiredInLive) {
      if (env[key] === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `required when API_MODE=live (${purpose})`,
        });
      }
    }

    // A printer with an API needs a key; `manual_tr` needs nothing but an operator.
    if (env.PRINT_ADAPTER !== 'manual_tr') {
      if (env.PRINT_PROVIDER_API_KEY === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['PRINT_PROVIDER_API_KEY'],
          message: `required when PRINT_ADAPTER=${env.PRINT_ADAPTER}`,
        });
      }
      if (env.PRINT_PROVIDER_BASE_URL === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['PRINT_PROVIDER_BASE_URL'],
          message: `required when PRINT_ADAPTER=${env.PRINT_ADAPTER}`,
        });
      }
    }

    // iyzico keys are NOT required to boot: a live deployment can run before print sales
    // open. `createPaymentAdapter` refuses at construction instead, so the failure lands
    // where checkout is actually wired rather than blocking every other service.

    // The PDF/X leg is all-or-nothing: half of it produces a file the printer rejects.
    const pdfxParts = [
      env.PDF_GHOSTSCRIPT_PATH,
      env.PRINT_ICC_PROFILE_PATH,
      env.PDF_PDFX_DEF_PATH,
    ];
    if (pdfxParts.some(Boolean) && !pdfxParts.every(Boolean)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['PDF_GHOSTSCRIPT_PATH'],
        message:
          'PDF/X-3 için gs yolu, ICC profili ve PDFX_def.ps birlikte tanımlanmalı (biri eksik)',
      });
    }

    const voiceKeyByProvider: Record<VoiceProvider, string | undefined> = {
      elevenlabs: env.ELEVENLABS_API_KEY,
      cartesia: env.CARTESIA_API_KEY,
      azure: env.AZURE_SPEECH_KEY,
      system: 'n/a',
    };
    if (voiceKeyByProvider[env.VOICE_PRIMARY] === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['VOICE_PRIMARY'],
        message: `VOICE_PRIMARY=${env.VOICE_PRIMARY} but its API key is not set`,
      });
    }

    if (env.NODE_ENV === 'production' && env.PUBLIC_BASE_URL.startsWith('http://')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['PUBLIC_BASE_URL'],
        message: 'must use https in production — signed media URLs leak over http',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

/* ── loader ───────────────────────────────────────────────────────────────── */

export class EnvValidationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(
      [
        'Invalid environment configuration:',
        ...issues.map((issue) => `  - ${issue}`),
        '',
        'See .env.example for the full list of variables.',
      ].join('\n'),
    );
    this.name = 'EnvValidationError';
    this.issues = issues;
  }
}

/** Parses an arbitrary record. Pure — used by tests and by `loadEnv`. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (result.success) return result.data;
  throw new EnvValidationError(
    result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
  );
}

let cached: Env | undefined;

/**
 * Reads and validates `process.env` once per process. Throws `EnvValidationError` with an
 * actionable list on the first call if anything is wrong — never returns a partial config.
 */
export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  cached ??= parseEnv(source);
  return cached;
}

/** Test-only: drops the memoised config so a fresh source can be parsed. */
export function resetEnvCache(): void {
  cached = undefined;
}

export const isMockMode = (env: Env): boolean => env.API_MODE === 'mock';
export const isLiveMode = (env: Env): boolean => env.API_MODE === 'live';

/* ── derived process topology ─────────────────────────────────────────────── */

/** Does this process serve HTTP? True for `api` and `all`. */
export const runsHttpServer = (env: Pick<Env, 'PROCESS_MODE'>): boolean =>
  env.PROCESS_MODE === 'api' || env.PROCESS_MODE === 'all';

/** Does this process consume queues and run the schedulers? True for `worker` and `all`. */
export const runsQueueWorkers = (env: Pick<Env, 'PROCESS_MODE'>): boolean =>
  env.PROCESS_MODE === 'worker' || env.PROCESS_MODE === 'all';

/* ── derived connection policy ────────────────────────────────────────────── */

/**
 * Whether postgres.js may use named prepared statements against this URL.
 *
 * The heuristic recognises the two spellings a transaction-mode pooler arrives in:
 *   1. `?pgbouncer=true` — the parameter Prisma popularised and every pooler doc now shows.
 *   2. A Supabase pooler host (`*.pooler.supabase.com`) on port 6543. Supabase serves
 *      SESSION mode on 5432 and TRANSACTION mode on 6543 from the same hostname, and only
 *      the transaction port breaks prepared statements — so the port is the signal, not
 *      the host.
 *
 * Getting this wrong in the safe direction costs a re-parse per query; getting it wrong in
 * the other direction costs an intermittent production error nobody can reproduce locally.
 */
export function usePreparedStatements(
  url: string,
  setting: Env['DATABASE_PREPARED_STATEMENTS'] = 'auto',
): boolean {
  if (setting === 'on') return true;
  if (setting === 'off') return false;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return true;
  }

  const pgbouncerFlag = (parsed.searchParams.get('pgbouncer') ?? '').toLowerCase();
  if (TRUTHY.has(pgbouncerFlag)) return false;

  const host = parsed.hostname.toLowerCase();
  const port = parsed.port || '5432';
  if (host.endsWith('.pooler.supabase.com') && port === '6543') return false;

  return true;
}

/**
 * Whether the queue connection should be wrapped in TLS. `rediss://` is how every managed
 * provider (Upstash, Redis Cloud, Aiven) publishes its endpoint.
 */
export function useRedisTls(url: string, setting: Env['REDIS_TLS'] = 'auto'): boolean {
  if (setting === 'on') return true;
  if (setting === 'off') return false;
  try {
    return new URL(url).protocol === 'rediss:';
  } catch {
    return false;
  }
}
