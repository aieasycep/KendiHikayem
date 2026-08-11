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

    OPENAI_API_KEY: zOptionalString(),
    MODERATION_MODEL: z.string().min(1).default('omni-moderation-latest'),

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
    IMAGE_QA_TEXT_SCORE_MAX: zNumber(0.5, 0),
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
