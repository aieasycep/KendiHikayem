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
