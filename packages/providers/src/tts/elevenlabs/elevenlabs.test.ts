/**
 * The real ElevenLabs adapter, driven by recorded responses.
 *
 * ⚠️ NO LIVE CALL IS MADE OR HAS EVER BEEN MADE. This proves the adapter's half of the
 * conversation: what it sends, how it reads what comes back, how each vendor failure maps
 * onto a `ProviderErrorKind` the router acts on, and that every path prices itself into
 * `provider_usage`. It cannot and does not prove the Turkish quality of a cloned voice.
 */

import { describe, expect, it, vi } from 'vitest';

import { ProviderError } from '../../core/errors';
import type { HttpRequest, HttpResponse, HttpTransport } from '../http';
import { HttpNetworkError, HttpTimeoutError } from '../http';
import { ttsSettingsFromEnv } from '../settings';
import { ElevenLabsTtsAdapter } from './adapter';
import * as fixtures from './fixtures';
import { parseEnv } from '@kendihikayem/config';

const ctx = {
  requestId: 'req-00000000-0000-5000-8000-000000000001',
  correlationId: 'corr-1',
  userId: 'user-1',
};

function settings(overrides: Record<string, string> = {}) {
  return ttsSettingsFromEnv(
    parseEnv({
      AUTH_SECRET: 'x'.repeat(40),
      ELEVENLABS_API_KEY: 'sk-test-key',
      TTS_PROVIDER_PRIMARY: 'elevenlabs',
      // ⚠️ Cloning is OFF by default now — the free narrator cannot do it, and the switch
      // is enforced on EVERY provider so that "off" means off rather than "off unless we
      // happened to fail over to a vendor that can". These tests are the paid path, so they
      // say so explicitly.
      VOICE_CLONING_ENABLED: 'true',
      ...overrides,
    }),
  );
}

/** Records what the adapter sent and replays a scripted response. */
function transportFor(...responses: HttpResponse[]): {
  transport: HttpTransport;
  requests: HttpRequest[];
} {
  const requests: HttpRequest[] = [];
  let index = 0;
  const transport: HttpTransport = async (request) => {
    requests.push(request);
    const response = responses[Math.min(index, responses.length - 1)];
    index += 1;
    if (!response) throw new Error('no scripted response');
    return response;
  };
  return { transport, requests };
}

function adapterWith(responses: HttpResponse[], overrides: Record<string, string> = {}) {
  const { transport, requests } = transportFor(...responses);
  let clock = 1000;
  const adapter = new ElevenLabsTtsAdapter({
    settings: settings(overrides),
    transport,
    now: () => (clock += 25),
  });
  return { adapter, requests };
}


/**
 * Awaits a call that must fail, and returns the typed error.
 *
 * The `.catch(e => e)` idiom types as a union with the success value, so every assertion
 * afterwards needs a cast; this narrows once and fails the test loudly if the call
 * unexpectedly SUCCEEDED, which a bare cast would hide.
 */
async function failure(call: Promise<unknown>): Promise<ProviderError> {
  try {
    await call;
  } catch (error) {
    if (ProviderError.is(error)) return error;
    throw error;
  }
  throw new Error('expected the call to fail, but it succeeded');
}

const PAGE_TR = "Elif'in bahçesindeki ağacın dalları rüzgârda usulca sallandı.";

/* ── Synthesis ─────────────────────────────────────────────────────────────── */

describe('synthesize', () => {
  it('asks for timestamps, the configured model and the configured format', async () => {
    const { adapter, requests } = adapterWith([fixtures.synthesisSuccess(PAGE_TR)]);

    await adapter.synthesize(
      {
        text: PAGE_TR,
        voice: { kind: 'cloned', providerVoiceId: 'voice-abc' },
        tier: 'quality',
        languageCode: 'tr',
        outputFormat: 'pcm_48000',
        previousText: 'Önceki sayfa böyle bitmişti.',
        nextText: 'Sonraki sayfa böyle başlıyor.',
      },
      ctx,
    );

    const request = requests[0]!;
    expect(request.url).toContain('/v1/text-to-speech/voice-abc/with-timestamps');
    expect(request.url).toContain('output_format=pcm_48000');
    // Authentication is the vendor's own header, never `Authorization: Bearer`.
    expect(request.headers['xi-api-key']).toBe('sk-test-key');
    // Stable across retries so the vendor can dedupe and not bill twice.
    expect(request.headers['x-request-id']).toBe(ctx.requestId);

    const body = request.json as Record<string, unknown>;
    expect(body['model_id']).toBe('eleven_multilingual_v2'); // from config, not from code
    expect(body['language_code']).toBe('tr');
    expect(body['previous_text']).toBe('Önceki sayfa böyle bitmişti.');
    expect(body['next_text']).toBe('Sonraki sayfa böyle başlıyor.');
  });

  it('uses the draft model for the draft tier', async () => {
    const { adapter, requests } = adapterWith([fixtures.synthesisSuccess(PAGE_TR)]);
    await adapter.synthesize(
      {
        text: PAGE_TR,
        voice: { kind: 'system', providerVoiceId: 'sys-1' },
        tier: 'draft',
        languageCode: 'tr',
        outputFormat: 'pcm_48000',
      },
      ctx,
    );
    expect((requests[0]!.json as Record<string, unknown>)['model_id']).toBe('eleven_flash_v2_5');
  });

  it('honours a model id change made purely in configuration', async () => {
    const { adapter, requests } = adapterWith([fixtures.synthesisSuccess(PAGE_TR)], {
      TTS_MODEL_QUALITY: 'eleven_v4_turkish_preview',
    });
    await adapter.synthesize(
      {
        text: PAGE_TR,
        voice: { kind: 'cloned', providerVoiceId: 'voice-abc' },
        tier: 'quality',
        languageCode: 'tr',
        outputFormat: 'pcm_48000',
      },
      ctx,
    );
    expect((requests[0]!.json as Record<string, unknown>)['model_id']).toBe(
      'eleven_v4_turkish_preview',
    );
  });

  it('turns character timings into Turkish word timings, keeping Elif\'in whole', async () => {
    const { adapter } = adapterWith([fixtures.synthesisSuccess(PAGE_TR)]);

    const result = await adapter.synthesize(
      {
        text: PAGE_TR,
        voice: { kind: 'cloned', providerVoiceId: 'voice-abc' },
        tier: 'quality',
        languageCode: 'tr',
        outputFormat: 'pcm_48000',
      },
      ctx,
    );

    const words = result.value.alignment!;
    expect(words[0]!.word).toBe("Elif'in");
    expect(words.map((w) => w.word)).toEqual([
      "Elif'in",
      'bahçesindeki',
      'ağacın',
      'dalları',
      'rüzgârda',
      'usulca',
      'sallandı',
    ]);
    // Ascending, non-overlapping, and inside the audio.
    for (const [index, word] of words.entries()) {
      expect(word.endMs).toBeGreaterThan(word.startMs);
      if (index > 0) expect(word.startMs).toBeGreaterThanOrEqual(words[index - 1]!.endMs - 1);
    }
    expect(result.value.durationMs).toBeGreaterThan(0);
  });

  it('prices the call by the characters the VENDOR billed, not by text.length', async () => {
    // The vendor bills 84 characters for a 60-character string (normalisation is billable).
    const { adapter } = adapterWith([
      fixtures.synthesisSuccess(PAGE_TR, { characterCost: 84 }),
    ]);

    const result = await adapter.synthesize(
      {
        text: PAGE_TR,
        voice: { kind: 'cloned', providerVoiceId: 'voice-abc' },
        tier: 'quality',
        languageCode: 'tr',
        outputFormat: 'pcm_48000',
      },
      ctx,
    );

    const usage = result.usage[0]!;
    expect(usage.billedUnits).toBe(84);
    expect(usage.billingUnit).toBe('character');
    expect(usage.provider).toBe('elevenlabs');
    // 84 chars × $0.165/1k = $0.01386
    expect(usage.costUsd).toBeCloseTo(0.01386, 5);
    expect(result.value.billedCharacters).toBe(84);
  });

  it('falls back to our own character count when the vendor sends no cost header', async () => {
    const { adapter } = adapterWith([fixtures.synthesisSuccess(PAGE_TR)]);
    const result = await adapter.synthesize(
      {
        text: PAGE_TR,
        voice: { kind: 'cloned', providerVoiceId: 'voice-abc' },
        tier: 'quality',
        languageCode: 'tr',
        outputFormat: 'pcm_48000',
      },
      ctx,
    );
    expect(result.value.billedCharacters).toBe(PAGE_TR.length);
  });

  it('still returns audio when the vendor sends no alignment', async () => {
    const { adapter } = adapterWith([fixtures.synthesisWithoutAlignment(4)]);
    const result = await adapter.synthesize(
      {
        text: PAGE_TR,
        voice: { kind: 'cloned', providerVoiceId: 'voice-abc' },
        tier: 'quality',
        languageCode: 'tr',
        outputFormat: 'pcm_48000',
      },
      ctx,
    );

    expect(result.value.alignment).toBeUndefined();
    // Duration still known: raw PCM length ÷ (48 kHz × 2 bytes).
    expect(result.value.durationMs).toBe(4000);
  });
});

/* ── Error mapping ─────────────────────────────────────────────────────────── */

describe('vendor failures map to router-actionable kinds', () => {
  async function synthesizeWith(response: HttpResponse): Promise<ProviderError> {
    const { adapter } = adapterWith([response]);
    return failure(
      adapter.synthesize(
        {
          text: PAGE_TR,
          voice: { kind: 'cloned', providerVoiceId: 'voice-abc' },
          tier: 'quality',
          languageCode: 'tr',
          outputFormat: 'pcm_48000',
        },
        ctx,
      ),
    );
  }

  it('429 → rate_limited, retryable, with the vendor\'s own Retry-After', async () => {
    const error = await synthesizeWith(fixtures.RATE_LIMITED);
    expect(error.kind).toBe('rate_limited');
    expect(error.retryable).toBe(true);
    expect(error.retryAfterMs).toBe(3000);
    expect(error.apiErrorCode).toBe('RATE_LIMITED');
  });

  it('voice_limit_reached → slot_exhausted even though it arrives as a 400', async () => {
    // ⚠️ The regression this guards: classifying by HTTP status alone makes the slot ceiling
    // look like a bad request, LRU eviction never runs, and every new parent is told the
    // service is unavailable while 660 dormant voices hold the slots.
    const error = await synthesizeWith(fixtures.SLOT_LIMIT_REACHED);
    expect(error.kind).toBe('slot_exhausted');
    expect(error.retryable).toBe(true);
    expect(error.apiErrorCode).toBe('VOICE_SLOT_EXHAUSTED');
  });

  it('quota_exceeded → quota_exhausted even though it arrives as a 401', async () => {
    const error = await synthesizeWith(fixtures.QUOTA_EXCEEDED);
    expect(error.kind).toBe('quota_exhausted');
    expect(error.retryable).toBe(false);
  });

  it('a genuine 401 → auth, not retryable', async () => {
    const error = await synthesizeWith(fixtures.INVALID_API_KEY);
    expect(error.kind).toBe('auth');
    expect(error.retryable).toBe(false);
  });

  it('5xx → unavailable, retryable', async () => {
    const error = await synthesizeWith(fixtures.SERVER_ERROR);
    expect(error.kind).toBe('unavailable');
    expect(error.retryable).toBe(true);
  });

  it('422 → invalid_request, not retryable', async () => {
    const error = await synthesizeWith(fixtures.VALIDATION_ERROR);
    expect(error.kind).toBe('invalid_request');
    expect(error.retryable).toBe(false);
    expect(error.detail).toContain('field required');
  });

  it('a client-side timeout → timeout, retryable', async () => {
    const adapter = new ElevenLabsTtsAdapter({
      settings: settings(),
      transport: async () => {
        throw new HttpTimeoutError(120_000);
      },
    });
    const error = await failure(
      adapter.synthesize(
        {
          text: PAGE_TR,
          voice: { kind: 'cloned', providerVoiceId: 'v' },
          tier: 'quality',
          languageCode: 'tr',
          outputFormat: 'pcm_48000',
        },
        ctx,
      ),
    );
    expect(error.kind).toBe('timeout');
    expect(error.retryable).toBe(true);
  });

  it('a socket failure → unavailable, never a raw TypeError', async () => {
    const adapter = new ElevenLabsTtsAdapter({
      settings: settings(),
      transport: async () => {
        throw new HttpNetworkError('fetch failed');
      },
    });
    const error = await failure(
      adapter.synthesize(
        {
          text: PAGE_TR,
          voice: { kind: 'cloned', providerVoiceId: 'v' },
          tier: 'quality',
          languageCode: 'tr',
          outputFormat: 'pcm_48000',
        },
        ctx,
      ),
    );
    expect(error.kind).toBe('unavailable');
  });

  it('a missing key fails as auth at the call, without touching the network', async () => {
    const transport = vi.fn();
    const adapter = new ElevenLabsTtsAdapter({
      settings: settings({ ELEVENLABS_API_KEY: '' }),
      transport,
    });
    const error = await failure(
      adapter.synthesize(
        {
          text: PAGE_TR,
          voice: { kind: 'cloned', providerVoiceId: 'v' },
          tier: 'quality',
          languageCode: 'tr',
          outputFormat: 'pcm_48000',
        },
        ctx,
      ),
    );

    expect(error.kind).toBe('auth');
    expect(transport).not.toHaveBeenCalled();
  });
});

/* ── Voice cloning ─────────────────────────────────────────────────────────── */

describe('createVoice', () => {
  const reference = [
    { assetId: 'asset-1', durationMs: 110_000, bytes: new Uint8Array([1, 2, 3, 4]) },
  ];

  it('refuses to clone without a consent id, before any network call', async () => {
    const transport = vi.fn();
    const adapter = new ElevenLabsTtsAdapter({ settings: settings(), transport });

    const error = await failure(
      adapter.createVoice({ reference, consentId: '', ephemeral: false }, ctx),
    );

    expect(error.kind).toBe('invalid_request');
    expect(error.detail).toContain('consent');
    expect(transport).not.toHaveBeenCalled();
  });

  it('uploads the reference as multipart and labels it with the consent id', async () => {
    const { adapter, requests } = adapterWith([fixtures.VOICE_CREATED]);

    const result = await adapter.createVoice(
      { reference, consentId: 'consent-uuid-1', ephemeral: false, labels: { relation: 'anne' } },
      ctx,
    );

    const request = requests[0]!;
    expect(request.url).toContain('/v1/voices/add');
    expect(request.form).toBeDefined();

    const labels = request.form!.find((part) => part.kind === 'field' && part.name === 'labels');
    const parsed = JSON.parse((labels as { value: string }).value) as Record<string, string>;
    expect(parsed['consent_id']).toBe('consent-uuid-1');
    expect(parsed['language']).toBe('tr');

    // ⚠️ KVKK data minimisation: the vendor-side name is an opaque id, never "Anne" and
    // never anything derived from the parent or the child.
    const name = request.form!.find((part) => part.kind === 'field' && part.name === 'name');
    expect((name as { value: string }).value).toBe(`kh-${ctx.requestId}`);
    expect((name as { value: string }).value).not.toContain('anne');

    expect(result.value.providerVoiceId).toBe('v0iCe1DfRoMeLeVeN');
    expect(result.usage[0]!.operation).toBe('tts.voice.create');
  });

  it('reports the slot ceiling as slot_exhausted so eviction can run', async () => {
    const { adapter } = adapterWith([fixtures.SLOT_LIMIT_REACHED]);
    const error = await failure(
      adapter.createVoice({ reference, consentId: 'consent-1', ephemeral: false }, ctx),
    );

    expect(error.kind).toBe('slot_exhausted');
    expect(error.retryable).toBe(true);
  });
});

describe('deleteVoice', () => {
  it('treats a 404 as success — the erasure goal is already met', async () => {
    const { adapter } = adapterWith([fixtures.VOICE_NOT_FOUND]);
    const result = await adapter.deleteVoice('voice-gone', ctx);
    expect(result.usage[0]!.operation).toBe('tts.voice.delete');
  });

  it('propagates a real failure so the deletion task retries and alarms', async () => {
    const { adapter } = adapterWith([fixtures.SERVER_ERROR]);
    const error = await failure(adapter.deleteVoice('voice-abc', ctx));
    expect(error.kind).toBe('unavailable');
  });
});

describe('slotUsage', () => {
  it('reads the account ceiling the LRU sweep needs', async () => {
    const { adapter } = adapterWith([fixtures.SUBSCRIPTION]);
    const usage = await adapter.slotUsage(ctx);
    expect(usage).toEqual({ used: 651, limit: 660 });
  });

  it('falls back to the configured ceiling when the vendor reports none', async () => {
    const { adapter } = adapterWith([
      fixtures.jsonResponse(200, { voice_limit: 0, voice_slots_used: 3 }),
    ]);
    const usage = await adapter.slotUsage(ctx);
    expect(usage.limit).toBe(660); // VOICE_SLOT_LIMIT
  });
});
