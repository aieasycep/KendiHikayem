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
    PORT: zInt(3001, 1, 65535),
    HOST: z.string().default('0.0.0.0'),
    PUBLIC_BASE_URL: z.string().url().default('http://localhost:3001'),
    WEB_BASE_URL: z.string().url().default('http://localhost:3000'),
    LOG_LEVEL: logLevelSchema.default('info'),

    // 2. database
    DATABASE_URL: z.string().min(1).default('postgresql://kendihikayem:kendihikayem@localhost:5432/kendihikayem'),
    DATABASE_MIGRATION_URL: zOptionalString(),
    DATABASE_POOL_MAX: zInt(10, 1, 200),

    // 3. queue
    REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
    QUEUE_PREFIX: z.string().min(1).default('kh'),

    // 4. object storage
    S3_ENDPOINT: zOptionalString(),
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
