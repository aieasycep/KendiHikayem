import { describe, expect, it } from 'vitest';

import { EnvValidationError, parseEnv } from './env';
import { isSecretKey, maskSecret, redactEnv } from './redaction';

const MIN: Record<string, string> = {
  AUTH_SECRET: 'a'.repeat(32),
};

describe('parseEnv', () => {
  it('defaults to mock mode with no provider keys at all', () => {
    const env = parseEnv(MIN);
    expect(env.API_MODE).toBe('mock');
    expect(env.NODE_ENV).toBe('development');
    expect(env.PRINT_ADAPTER).toBe('manual_tr');
    expect(env.MEDIA_SIGNED_URL_TTL_SEC).toBe(900);
  });

  it('rejects a short AUTH_SECRET', () => {
    expect(() => parseEnv({ AUTH_SECRET: 'kisa' })).toThrow(EnvValidationError);
  });

  it('coerces boolean-ish and numeric strings', () => {
    const env = parseEnv({ ...MIN, S3_FORCE_PATH_STYLE: 'false', DATABASE_POOL_MAX: '25' });
    expect(env.S3_FORCE_PATH_STYLE).toBe(false);
    expect(env.DATABASE_POOL_MAX).toBe(25);
  });

  it('treats an empty string as unset', () => {
    const env = parseEnv({ ...MIN, ANTHROPIC_API_KEY: '' });
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it('demands provider credentials in live mode', () => {
    let issues: readonly string[] = [];
    try {
      parseEnv({ ...MIN, API_MODE: 'live' });
    } catch (error) {
      issues = (error as EnvValidationError).issues;
    }
    expect(issues.join('\n')).toContain('ANTHROPIC_API_KEY');
    expect(issues.join('\n')).toContain('GOOGLE_GENAI_API_KEY');
    expect(issues.join('\n')).toContain('VOICE_PRIMARY');
  });

  it('accepts live mode once every credential is present', () => {
    const env = parseEnv({
      ...MIN,
      API_MODE: 'live',
      ANTHROPIC_API_KEY: 'sk-ant-x',
      OPENAI_API_KEY: 'sk-x',
      GOOGLE_GENAI_API_KEY: 'g-x',
      S3_ACCESS_KEY_ID: 'id',
      S3_SECRET_ACCESS_KEY: 'secret',
      ELEVENLABS_API_KEY: 'el-x',
    });
    expect(env.API_MODE).toBe('live');
  });
});

/* ── image pipeline configuration (A4) ────────────────────────────────────── */

describe('image pipeline env', () => {
  it('ships defaults that match SPEC §8/§9 without any key', () => {
    const env = parseEnv(MIN);
    expect(env.IMAGE_PROVIDER_PRIMARY).toBe('google');
    expect(env.IMAGE_PROVIDER_FALLBACK).toBeUndefined();
    // SPEC §8.2 step 5: 2 retries per page = 3 attempts, then manual_review.
    expect(env.IMAGE_QA_MAX_ATTEMPTS).toBe(3);
    expect(env.IMAGE_QA_PALETTE_DELTA_E_MAX).toBe(20);
    expect(env.IMAGE_QA_STRICT).toBe(false);
    // SPEC §9: 21 cm trim, 5 mm bleed, 300 DPI.
    expect(env.PRINT_TARGET_DPI).toBe(300);
    expect(env.PRINT_BLEED_MM).toBe(5);
    expect(env.PRINT_TRIM_MM).toBe(210);
    expect(env.PRINT_COLOR_SPACE).toBe('srgb');
  });

  it('does not demand a Gemini key in live mode when the image provider is the fake', () => {
    // How a live deployment runs everything else while the illustration key is pending.
    const env = parseEnv({
      ...MIN,
      API_MODE: 'live',
      IMAGE_PROVIDER_PRIMARY: 'fake',
      ANTHROPIC_API_KEY: 'sk-ant-x',
      OPENAI_API_KEY: 'sk-x',
      S3_ACCESS_KEY_ID: 'id',
      S3_SECRET_ACCESS_KEY: 'secret',
      ELEVENLABS_API_KEY: 'el-x',
    });
    expect(env.IMAGE_PROVIDER_PRIMARY).toBe('fake');
  });

  it('demands the Gemini key when google is only the FALLBACK', () => {
    let issues: readonly string[] = [];
    try {
      parseEnv({
        ...MIN,
        API_MODE: 'live',
        IMAGE_PROVIDER_PRIMARY: 'fake',
        IMAGE_PROVIDER_FALLBACK: 'google',
        ANTHROPIC_API_KEY: 'sk-ant-x',
        OPENAI_API_KEY: 'sk-x',
        S3_ACCESS_KEY_ID: 'id',
        S3_SECRET_ACCESS_KEY: 'secret',
        ELEVENLABS_API_KEY: 'el-x',
      });
    } catch (error) {
      issues = (error as EnvValidationError).issues;
    }
    expect(issues.join('\n')).toContain('GOOGLE_GENAI_API_KEY');
  });

  it('refuses s3 storage without credentials, in mock mode too', () => {
    let issues: readonly string[] = [];
    try {
      parseEnv({ ...MIN, MEDIA_STORAGE_DRIVER: 's3' });
    } catch (error) {
      issues = (error as EnvValidationError).issues;
    }
    expect(issues.join('\n')).toContain('S3_ACCESS_KEY_ID');
  });

  it('refuses CMYK output without an ICC profile', () => {
    // Without a profile the printer separates black text into four inks and it mis-registers.
    let issues: readonly string[] = [];
    try {
      parseEnv({ ...MIN, PRINT_COLOR_SPACE: 'cmyk' });
    } catch (error) {
      issues = (error as EnvValidationError).issues;
    }
    expect(issues.join('\n')).toContain('PRINT_ICC_PROFILE_PATH');
  });

  it('defaults to the filesystem driver so no S3 is needed to run', () => {
    expect(parseEnv(MIN).MEDIA_STORAGE_DRIVER).toBe('filesystem');
  });
});

describe('redaction', () => {
  it('masks credentials but keeps model ids readable', () => {
    expect(isSecretKey('ANTHROPIC_API_KEY')).toBe(true);
    expect(isSecretKey('DATABASE_URL')).toBe(true);
    expect(isSecretKey('S3_KMS_KEY_ID')).toBe(false);
    expect(isSecretKey('LLM_MODEL_FILL')).toBe(false);
    expect(maskSecret('sk-ant-super-secret')).toBe('sk-a************');
    expect(redactEnv({ LLM_MODEL_FILL: 'claude-opus-5', AUTH_SECRET: 'x'.repeat(40) })).toEqual({
      LLM_MODEL_FILL: 'claude-opus-5',
      AUTH_SECRET: 'xxxx************',
    });
  });
});
