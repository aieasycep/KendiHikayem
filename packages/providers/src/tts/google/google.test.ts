/**
 * The free narrator, driven by RECORDED responses.
 *
 * ⚠️ NEVER RUN AGAINST THE LIVE API. No key, no egress. These tests prove the adapter's half
 * of the contract — request shape, base64 → PCM, 24 kHz → 48 kHz resampling, error mapping,
 * the ledger row, and the clone refusal. They CANNOT prove the thing the product is judged
 * on: whether the Turkish coming out of a prebuilt voice is warm enough to read a child to
 * sleep, and whether ğ/ı/ö/ü/ş/ç and long agglutinated words survive it. That needs a key, a
 * speaker and a human listening.
 */

import { describe, expect, it } from 'vitest';

import { GoogleTtsAdapter } from './adapter';
import { parseVoiceMap, sampleRateFromMimeType } from './wire';
import { assertVoiceCloningAvailable, voiceCloningAvailable } from '../cloning';
import type { HttpRequest, HttpResponse, HttpTransport } from '../http';
import type { TtsSettings } from '../settings';
import { pcm16ToFloat } from '../audio/assemble';
import type { ProviderCallContext } from '../../core/types';
import { ProviderError } from '../../core/errors';
import { FREE_TIER_PRICE_BOOK } from '../../core/pricing';
import { RequestPacer } from '../../google/pacing';

/* ── a real, decodable 24 kHz sine, so the resampler has something to resample ─ */

const VENDOR_RATE = 24_000;
const PIPELINE_RATE = 48_000;
const TONE_MS = 500;

function sinePcm16(sampleRate: number, durationMs: number, hz = 220): Uint8Array {
  const count = Math.round((durationMs / 1000) * sampleRate);
  const bytes = new Uint8Array(count * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < count; i += 1) {
    view.setInt16(i * 2, Math.round(Math.sin((2 * Math.PI * hz * i) / sampleRate) * 20_000), true);
  }
  return bytes;
}

const TONE_24K = sinePcm16(VENDOR_RATE, TONE_MS);

function audioResponse(overrides: { mimeType?: string; pcm?: Uint8Array } = {}): unknown {
  return {
    candidates: [
      {
        content: {
          role: 'model',
          parts: [
            {
              inlineData: {
                mimeType: overrides.mimeType ?? `audio/L16;codec=pcm;rate=${VENDOR_RATE}`,
                data: Buffer.from(overrides.pcm ?? TONE_24K).toString('base64'),
              },
            },
          ],
        },
        finishReason: 'STOP',
      },
    ],
    usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 900, totalTokenCount: 1_020 },
    modelVersion: 'test-tts-model-001',
  };
}

/** ⭐ A per-DAY exhaustion — the free tier's real ceiling for narration is ~15 requests. */
const DAILY_429 = {
  error: {
    code: 429,
    message: 'You exceeded your current quota, please check your plan and billing details.',
    status: 'RESOURCE_EXHAUSTED',
    details: [
      {
        '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
        violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }],
      },
    ],
  },
};

/* ── harness ───────────────────────────────────────────────────────────────── */

function stubTransport(
  responses: Array<{ status?: number; body: unknown; headers?: Record<string, string> }>,
): { transport: HttpTransport; calls: HttpRequest[] } {
  const calls: HttpRequest[] = [];
  let index = 0;

  const transport: HttpTransport = async (request) => {
    calls.push(request);
    const recorded = responses[Math.min(index, responses.length - 1)]!;
    index += 1;
    const text =
      typeof recorded.body === 'string' ? recorded.body : JSON.stringify(recorded.body);
    const response: HttpResponse = {
      status: recorded.status ?? 200,
      headers: recorded.headers ?? {},
      bytes: new TextEncoder().encode(text),
    };
    return response;
  };

  return { transport, calls };
}

function settings(overrides: Partial<TtsSettings['google']> = {}): TtsSettings {
  return {
    elevenlabs: { baseUrl: 'https://eleven.invalid', apiKey: undefined, headers: {} },
    cartesia: { baseUrl: 'https://cartesia.invalid', apiKey: undefined, headers: {} },
    google: {
      baseUrl: 'https://google.invalid',
      apiVersion: 'v1beta',
      apiKey: 'test-key',
      model: 'test-tts-model',
      defaultVoice: 'DefaultVoice',
      voiceMap: '{"mock-voice-zeynep":"WarmVoice","mock-voice-mert":"CalmVoice"}',
      languageCode: 'tr-TR',
      sampleRate: VENDOR_RATE,
      stylePromptTr: 'Sıcak ve yavaş oku:',
      ...overrides,
    },
    cloningEnabled: false,
    models: {
      elevenlabs: { draft: 'e-draft', quality: 'e-quality' },
      cartesia: { draft: 'c-draft', quality: 'c-quality' },
    },
    outputFormat: 'pcm_48000',
    timeouts: { synthesizeMs: 30_000, createVoiceMs: 60_000, alignMs: 60_000 },
    chunking: { maxChars: 1_800, concurrency: 4, gapMs: 350 },
    loudness: { targetLufs: -16, peakCeilingDb: -1.5, bedtimeEndGain: 0.6 },
    timbre: { stability: 0.45, similarity: 0.85, style: 0.35, speakerBoost: true },
    slots: { limit: 660, highWater: 0.9, idleHours: 72, ephemeral: false },
    retention: { rawDays: 30 },
    align: { url: undefined, model: 'align-model' },
    ffmpegPath: undefined,
  };
}

const CTX: ProviderCallContext = {
  requestId: '11111111-2222-5333-8444-555555555555',
  correlationId: 'trace-1',
  userId: 'user-1',
};

const TEXT = 'Elif uykuya daldığında gördüklerini kimseye anlatmadı.';

const SYNTH_INPUT = {
  text: TEXT,
  voice: { kind: 'system' as const, providerVoiceId: 'mock-voice-zeynep' },
  tier: 'quality' as const,
  languageCode: 'tr' as const,
  outputFormat: 'pcm_48000' as const,
};

/* ── ⭐ voice cloning: refused, never substituted ──────────────────────────── */

describe('⭐ voice cloning on the free tier', () => {
  it('REFUSES, rather than quietly narrating with a stranger’s voice', async () => {
    const { transport, calls } = stubTransport([{ body: audioResponse() }]);
    const adapter = new GoogleTtsAdapter({ settings: settings(), transport });

    const error = (await adapter
      .createVoice(
        {
          reference: [{ assetId: 'a1', bytes: new Uint8Array([1, 2, 3]), durationMs: 95_000 }],
          consentId: 'consent-1',
          ephemeral: false,
        },
        CTX,
      )
      .catch((caught: unknown) => caught)) as ProviderError;

    expect(ProviderError.is(error)).toBe(true);
    // Nothing was uploaded: a parent's voice does not travel to a vendor that cannot use it.
    expect(calls).toHaveLength(0);
  });

  it('tells the parent, in Turkish, that the feature is OFF — not that something broke', async () => {
    const adapter = new GoogleTtsAdapter({ settings: settings(), transport: stubTransport([]).transport });
    const error = (await adapter
      .createVoice({ reference: [], consentId: 'c', ephemeral: false }, CTX)
      .catch((caught: unknown) => caught)) as ProviderError;

    expect(error.userMessageTr).toMatch(/kapalı/u);
    expect(error.userMessageTr).toMatch(/hazır anlatıcı/u);
    // No vendor names, no English, no error codes in what a parent reads.
    expect(error.userMessageTr).not.toMatch(/google|gemini|elevenlabs|error|quota/iu);
    // …and the sentence rides to the job row, which is shown verbatim.
    expect(error.toJobError().userMessageTr).toBe(error.userMessageTr);
  });

  it('is terminal: the router must not shop the same impossible request to a second vendor', async () => {
    const adapter = new GoogleTtsAdapter({ settings: settings(), transport: stubTransport([]).transport });
    const error = (await adapter
      .createVoice({ reference: [], consentId: 'c', ephemeral: false }, CTX)
      .catch((caught: unknown) => caught)) as ProviderError;

    expect(error.retryable).toBe(false);
    // `isFailoverWorthy` covers auth / quota_exhausted / not_found only, so this stops here.
    expect(error.kind).toBe('invalid_request');
  });

  it('the switch is enforced on the PAID provider too, so "off" means off everywhere', async () => {
    // A flag only enforced on the vendor that cannot clone anyway is not a flag, it is a
    // comment. `VOICE_CLONING_ENABLED=false` must also stop a failover to ElevenLabs from
    // quietly re-enabling the feature the product told the parent was off.
    const paidSettings = settings();
    expect(voiceCloningAvailable(paidSettings, 'elevenlabs')).toBe(false);
    expect(() => assertVoiceCloningAvailable(paidSettings, 'elevenlabs')).toThrow(
      /VOICE_CLONING_ENABLED=false/u,
    );

    const enabled: TtsSettings = { ...paidSettings, cloningEnabled: true };
    expect(voiceCloningAvailable(enabled, 'elevenlabs')).toBe(true);
    // …and turning it on still cannot make the free narrator clone.
    expect(voiceCloningAvailable(enabled, 'google')).toBe(false);
    expect(() => assertVoiceCloningAvailable(enabled, 'google')).toThrow(
      /cannot clone voices/u,
    );
  });

  it('reports deletion as done — it never held a voice, and a stuck erasure task hides real ones', async () => {
    const { transport, calls } = stubTransport([]);
    const adapter = new GoogleTtsAdapter({ settings: settings(), transport });

    const result = await adapter.deleteVoice('whatever', CTX);
    expect(result.value).toBeUndefined();
    expect(calls).toHaveLength(0);
    // Still recorded: "we checked and there was nothing there" is an audit fact.
    expect(result.usage[0]).toMatchObject({ operation: 'tts.voice.delete', provider: 'google' });
  });
});

/* ── request ───────────────────────────────────────────────────────────────── */

describe('the request', () => {
  it('posts to the same endpoint family, with the same key as text and illustration', async () => {
    const { transport, calls } = stubTransport([{ body: audioResponse() }]);
    await new GoogleTtsAdapter({ settings: settings(), transport }).synthesize(SYNTH_INPUT, CTX);

    expect(calls[0]!.url).toBe(
      'https://google.invalid/v1beta/models/test-tts-model:generateContent',
    );
    expect(calls[0]!.headers['x-goog-api-key']).toBe('test-key');
    expect(calls[0]!.headers['x-goog-request-params']).toContain(CTX.requestId);
  });

  it('asks for AUDIO, in Turkish, with the mapped voice', async () => {
    const { transport, calls } = stubTransport([{ body: audioResponse() }]);
    await new GoogleTtsAdapter({ settings: settings(), transport }).synthesize(SYNTH_INPUT, CTX);

    const body = calls[0]!.json as {
      generationConfig: {
        responseModalities: string[];
        speechConfig: {
          languageCode: string;
          voiceConfig: { prebuiltVoiceConfig: { voiceName: string } };
        };
      };
    };
    // A TTS model asked for TEXT answers in prose and the book gets no audio at all.
    expect(body.generationConfig.responseModalities).toEqual(['AUDIO']);
    expect(body.generationConfig.speechConfig.languageCode).toBe('tr-TR');
    expect(body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe(
      'WarmVoice',
    );
  });

  it('keeps the three seeded narrators distinct instead of collapsing them onto one voice', async () => {
    const { transport, calls } = stubTransport([{ body: audioResponse() }]);
    const adapter = new GoogleTtsAdapter({ settings: settings(), transport });

    for (const id of ['mock-voice-zeynep', 'mock-voice-mert', 'mock-voice-deniz']) {
      await adapter.synthesize(
        { ...SYNTH_INPUT, voice: { kind: 'system', providerVoiceId: id } },
        CTX,
      );
    }

    const voices = calls.map(
      (call) =>
        (call.json as { generationConfig: { speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: string } } } } })
          .generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName,
    );
    // Two are mapped; the third is unmapped and falls back rather than failing to speak.
    expect(voices).toEqual(['WarmVoice', 'CalmVoice', 'DefaultVoice']);
  });

  it('prefixes the Turkish style directive, and can be told not to', async () => {
    const withStyle = stubTransport([{ body: audioResponse() }]);
    await new GoogleTtsAdapter({ settings: settings(), transport: withStyle.transport }).synthesize(
      SYNTH_INPUT,
      CTX,
    );
    const styled = (withStyle.calls[0]!.json as { contents: Array<{ parts: Array<{ text: string }> }> })
      .contents[0]!.parts[0]!.text;
    expect(styled.startsWith('Sıcak ve yavaş oku:')).toBe(true);
    expect(styled).toContain(TEXT);

    // ⚠️ The escape hatch that matters: if the model ever READS the directive aloud, this
    // has to be an env edit, not a release.
    const plain = stubTransport([{ body: audioResponse() }]);
    await new GoogleTtsAdapter({
      settings: settings({ stylePromptTr: '' }),
      transport: plain.transport,
    }).synthesize(SYNTH_INPUT, CTX);
    expect(
      (plain.calls[0]!.json as { contents: Array<{ parts: Array<{ text: string }> }> }).contents[0]!
        .parts[0]!.text,
    ).toBe(TEXT);
  });

  it('refuses without a key, before any network call', async () => {
    const { transport, calls } = stubTransport([{ body: audioResponse() }]);
    const adapter = new GoogleTtsAdapter({ settings: settings({ apiKey: undefined }), transport });

    await expect(adapter.synthesize(SYNTH_INPUT, CTX)).rejects.toMatchObject({ kind: 'auth' });
    expect(calls).toHaveLength(0);
  });
});

/* ── ⭐ the audio itself ───────────────────────────────────────────────────── */

describe('⭐ 24 kHz in, 48 kHz out', () => {
  it('resamples to the rate the worker assembles at, so the story is not played double-speed', async () => {
    const { transport } = stubTransport([{ body: audioResponse() }]);
    const result = await new GoogleTtsAdapter({ settings: settings(), transport }).synthesize(
      SYNTH_INPUT,
      CTX,
    );

    // `apps/worker` hardcodes 48 kHz when it turns these bytes into samples. Handing back
    // the vendor's 24 kHz would play the whole narration twice as fast, an octave up, with
    // every word timing at half its true position.
    const frames = result.value.audio.byteLength / 2;
    expect(frames).toBeCloseTo((TONE_MS / 1000) * PIPELINE_RATE, -2);
    expect(result.value.mimeType).toBe('audio/L16');
    // Duration is unchanged by resampling — that is the point of resampling.
    expect(result.value.durationMs).toBeGreaterThanOrEqual(TONE_MS - 5);
    expect(result.value.durationMs).toBeLessThanOrEqual(TONE_MS + 5);
  });

  it('reads the rate from the response rather than trusting the configured constant', async () => {
    // A vendor that quietly switches to 16 kHz while we keep dividing by 24 000 produces a
    // story at the wrong pitch — audible only to whoever is listening, i.e. a child.
    const { transport } = stubTransport([
      { body: audioResponse({ mimeType: 'audio/L16;codec=pcm;rate=16000', pcm: sinePcm16(16_000, TONE_MS) }) },
    ]);
    const result = await new GoogleTtsAdapter({ settings: settings(), transport }).synthesize(
      SYNTH_INPUT,
      CTX,
    );

    expect(result.value.durationMs).toBeGreaterThanOrEqual(TONE_MS - 5);
    expect(result.value.durationMs).toBeLessThanOrEqual(TONE_MS + 5);
    expect(result.value.audio.byteLength / 2).toBeCloseTo((TONE_MS / 1000) * PIPELINE_RATE, -2);
  });

  it('produces audio that actually decodes, not just bytes of the right length', async () => {
    const { transport } = stubTransport([{ body: audioResponse() }]);
    const result = await new GoogleTtsAdapter({ settings: settings(), transport }).synthesize(
      SYNTH_INPUT,
      CTX,
    );

    const samples = pcm16ToFloat(result.value.audio);
    const peak = samples.reduce((max, s) => Math.max(max, Math.abs(s)), 0);
    // A silent buffer of the right size would pass every other assertion in this file.
    expect(peak).toBeGreaterThan(0.3);
  });

  it('returns NO word timings, so the pipeline falls to the syllable estimate', async () => {
    const { transport } = stubTransport([{ body: audioResponse() }]);
    const result = await new GoogleTtsAdapter({ settings: settings(), transport }).synthesize(
      SYNTH_INPUT,
      CTX,
    );

    // This API returns audio only. `alignment` absent ⇒ `alignmentSource` becomes
    // `sentence_estimate` upstream and the client highlights sentences, not words. The
    // manifest format is untouched, which is what the karaoke tests depend on.
    expect(result.value.alignment).toBeUndefined();
  });

  it('treats a 200 with no audio part as a vendor change, not as an empty narration', async () => {
    const { transport } = stubTransport([
      { body: { candidates: [{ content: { parts: [{ text: 'buyurun' }] }, finishReason: 'STOP' }] } },
    ]);
    await expect(
      new GoogleTtsAdapter({ settings: settings(), transport }).synthesize(SYNTH_INPUT, CTX),
    ).rejects.toMatchObject({ kind: 'unavailable', retryable: true });
  });

  it('maps a safety refusal to content_blocked, which is terminal', async () => {
    const { transport } = stubTransport([
      { body: { candidates: [{ content: { parts: [] }, finishReason: 'SAFETY' }] } },
    ]);
    const error = (await new GoogleTtsAdapter({ settings: settings(), transport })
      .synthesize(SYNTH_INPUT, CTX)
      .catch((caught: unknown) => caught)) as ProviderError;

    expect(error.kind).toBe('content_blocked');
    expect(error.retryable).toBe(false);
  });
});

/* ── ⭐ quota and metering ─────────────────────────────────────────────────── */

describe('⭐ free-tier quota and the ledger', () => {
  it('maps the daily exhaustion to quota_exhausted with actionable Turkish', async () => {
    const { transport } = stubTransport([{ status: 429, body: DAILY_429 }]);
    const error = (await new GoogleTtsAdapter({ settings: settings(), transport })
      .synthesize(SYNTH_INPUT, CTX)
      .catch((caught: unknown) => caught)) as ProviderError;

    expect(error.kind).toBe('quota_exhausted');
    expect(error.retryable).toBe(false);
    expect(error.userMessageTr).toMatch(/yarın/iu);
  });

  it('writes a usage row with zero cost and REAL characters', async () => {
    const { transport } = stubTransport([{ body: audioResponse() }]);
    const result = await new GoogleTtsAdapter({
      settings: settings(),
      transport,
      priceBook: FREE_TIER_PRICE_BOOK,
    }).synthesize(SYNTH_INPUT, CTX);

    const usage = result.usage[0]!;
    expect(usage.provider).toBe('google');
    expect(usage.operation).toBe('tts.synth');
    expect(usage.costUsd).toBe(0);
    // Characters, so the row stays comparable with the ElevenLabs and Cartesia rows the day
    // the paid narrator is switched on. Requests — the thing that actually runs out on the
    // free tier — are `COUNT(*)` over these same rows.
    expect(usage.billingUnit).toBe('character');
    expect(usage.billedUnits).toBe(TEXT.length);
    expect(result.value.billedCharacters).toBe(TEXT.length);
  });

  it('prices the identical call above zero on the paid book', async () => {
    const { transport } = stubTransport([{ body: audioResponse() }]);
    const result = await new GoogleTtsAdapter({ settings: settings(), transport }).synthesize(
      SYNTH_INPUT,
      CTX,
    );
    expect(result.usage[0]!.costUsd).toBeGreaterThan(0);
  });

  it('paces chunks so a four-way concurrent render does not burn the whole minute budget', async () => {
    const { transport } = stubTransport([{ body: audioResponse() }]);
    let clock = 0;
    const slept: number[] = [];
    const pacer = new RequestPacer({
      minIntervalMs: 20_000, // 3 rpm
      now: () => clock,
      sleep: async (ms) => {
        slept.push(ms);
        clock += ms;
      },
    });
    const adapter = new GoogleTtsAdapter({ settings: settings(), transport, pacer });

    // The chunk renderer runs four at a time (`TTS_CHUNK_CONCURRENCY`).
    await Promise.all([
      adapter.synthesize(SYNTH_INPUT, CTX),
      adapter.synthesize(SYNTH_INPUT, CTX),
      adapter.synthesize(SYNTH_INPUT, CTX),
      adapter.synthesize(SYNTH_INPUT, CTX),
    ]);

    expect(slept).toEqual([20_000, 20_000, 20_000]);
  });
});

/* ── wire helpers ──────────────────────────────────────────────────────────── */

describe('wire helpers', () => {
  it('reads the sample rate out of the vendor mime type', () => {
    expect(sampleRateFromMimeType('audio/L16;codec=pcm;rate=24000')).toBe(24_000);
    expect(sampleRateFromMimeType('audio/L16')).toBeUndefined();
    expect(sampleRateFromMimeType(undefined)).toBeUndefined();
  });

  it('survives a typo in the voice map instead of taking the narrator offline', () => {
    expect(parseVoiceMap('{"a":"B"}')).toEqual({ a: 'B' });
    expect(parseVoiceMap('')).toEqual({});
    // `undefined` = malformed, which the adapter surfaces as `voiceMapMalformed` and then
    // narrates with the default voice anyway.
    expect(parseVoiceMap('{oops')).toBeUndefined();
    expect(parseVoiceMap('["not","an","object"]')).toBeUndefined();
  });

  it('flags a malformed map on the adapter rather than swallowing it', () => {
    const adapter = new GoogleTtsAdapter({
      settings: settings({ voiceMap: '{oops' }),
      transport: stubTransport([]).transport,
    });
    expect(adapter.voiceMapMalformed).toBe(true);
  });
});
