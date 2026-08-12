/**
 * tts/factory.ts — the one place that decides which vendor speaks.
 *
 * ⭐ THE FREE STACK IS THE DEFAULT. `TTS_PROVIDER_PRIMARY=google` (or the older
 * `VOICE_PRIMARY`) puts the Gemini narrator in front: real Turkish narration from prebuilt
 * voices, on the same key text and illustration already use. `API_MODE=live` plus
 * `GOOGLE_GENAI_API_KEY` is the whole setup.
 *
 * Moving to the paid narrator — the one that can clone a parent's voice — is three
 * variables and no code change:
 *
 *     TTS_PROVIDER_PRIMARY=elevenlabs
 *     ELEVENLABS_API_KEY=sk-...
 *     VOICE_CLONING_ENABLED=true
 *
 * ⚠️ WHY CLONING HAS ITS OWN SWITCH. No free provider clones voices, and the honest failure
 * mode is a refusal a parent can read, not a system voice quietly standing in for them.
 * `VOICE_CLONING_ENABLED=false` (the default) is what the API and worker check before ever
 * asking a parent to record; `GoogleTtsAdapter.createVoice` is the last line of that
 * defence, and `packages/config` refuses to boot with cloning on and a provider that cannot
 * do it.
 *
 * A vendor whose key is missing is SKIPPED rather than constructed-and-left-to-fail: a route
 * entry that cannot authenticate burns a retry budget on every single chunk before failing
 * over. And `VOICE_FALLBACK` defaults to `system` (i.e. none) because a PAID fallback behind
 * a free primary is how a free-tier deployment starts spending money the first time Google
 * throttles it.
 */

import type { Env } from '@kendihikayem/config';

import type { AlignAdapter, TtsAdapter } from '../core/adapters';
import type { PriceBook } from '../core/pricing';
import { FakeAlignAdapter, FakeTtsAdapter } from '../core/fakes/adapters';
import { RequestPacer, minIntervalMsForRpm } from '../google/pacing';
import { priceBookFromEnv } from '../llm/factory';
import type { HttpTransport } from './http';
import { ttsSettingsFromEnv, type TtsSettings } from './settings';
import { ElevenLabsTtsAdapter } from './elevenlabs/adapter';
import { CartesiaTtsAdapter } from './cartesia/adapter';
import { GoogleTtsAdapter } from './google/adapter';
import { WhisperXAlignAdapter } from './align/whisperx';

export interface VoiceRouteOptions {
  env: Env;
  priceBook?: PriceBook;
  /** Injected by tests; production uses `fetch`. */
  transport?: HttpTransport;
  /** Fakes only: zero simulated latency in tests. */
  fakeLatencyMs?: number;
  /** Injected by tests so free-tier pacing does not actually sleep. */
  pacer?: RequestPacer;
}

/**
 * Which narrator is selected. `TTS_PROVIDER_PRIMARY` is the name the free-tier switch
 * introduced and wins when set; `VOICE_PRIMARY` is the original and stays valid, so an
 * existing `.env` keeps working instead of being silently ignored.
 */
export function voicePrimaryOf(env: Env): Env['VOICE_PRIMARY'] {
  return env.TTS_PROVIDER_PRIMARY ?? env.VOICE_PRIMARY;
}

export interface VoiceRoute {
  /** Ordered `[primary, ...fallbacks]` — exactly what `ProviderRouter` expects. */
  tts: TtsAdapter[];
  align: AlignAdapter[];
  settings: TtsSettings;
  /** What was chosen and why. Logged at boot so a misconfigured live deploy is visible. */
  description: string;
}

export function createVoiceRoute(options: VoiceRouteOptions): VoiceRoute {
  const { env } = options;
  const settings = ttsSettingsFromEnv(env);
  const priceBook = priceBookFromEnv(env, options.priceBook);

  if (env.API_MODE !== 'live') {
    return {
      tts: [
        new FakeTtsAdapter({
          provider: 'fake',
          model: env.TTS_MODEL_QUALITY,
          latencyMs: options.fakeLatencyMs ?? 0,
          slotLimit: env.VOICE_SLOT_LIMIT,
          priceBook,
        }),
      ],
      align: [
        new FakeAlignAdapter({
          provider: 'fake',
          model: env.ALIGN_MODEL,
          latencyMs: options.fakeLatencyMs ?? 0,
          priceBook,
        }),
      ],
      settings,
      description: `mock: fake tts (${env.TTS_MODEL_QUALITY}), fake align`,
    };
  }

  // ⚠️ ONE pacer for the route: the free tier's per-minute budget belongs to the API KEY,
  // and the TTS ceiling is the tightest one in the whole product (~3/min, ~15/day).
  const pacer =
    options.pacer ??
    (env.GOOGLE_TTS_RPM > 0
      ? new RequestPacer({ minIntervalMs: minIntervalMsForRpm(env.GOOGLE_TTS_RPM) })
      : undefined);

  const tts: TtsAdapter[] = [];
  const chosen: string[] = [];
  for (const name of [voicePrimaryOf(env), env.VOICE_FALLBACK]) {
    const adapter = buildVendor(name, settings, { ...options, priceBook, ...(pacer ? { pacer } : {}) });
    // Skipped rather than constructed-and-left-to-fail: a route entry whose key is missing
    // would burn a retry budget on every single chunk before failing over.
    if (!adapter || tts.some((existing) => existing.provider === adapter.provider)) continue;
    tts.push(adapter);
    chosen.push(name);
  }

  if (tts.length === 0) {
    throw new Error(
      'API_MODE=live but no voice provider has an API key. The free stack needs ' +
        'GOOGLE_GENAI_API_KEY with TTS_PROVIDER_PRIMARY=google; the paid one needs ' +
        'ELEVENLABS_API_KEY with TTS_PROVIDER_PRIMARY=elevenlabs. Or run API_MODE=mock.',
    );
  }

  const align: AlignAdapter[] = settings.align.url
    ? [
        new WhisperXAlignAdapter({
          settings,
          ...(options.transport ? { transport: options.transport } : {}),
          priceBook,
        }),
      ]
    : // No aligner configured: word timings fall back to the vendor's own or to the
      // sentence estimate, and the CONSENT clip cannot be verified at all — which the
      // consent gate treats as a refusal rather than as a pass.
      //
      // ⚠️ On the free stack there ARE no vendor timings (Gemini TTS returns audio only),
      // so with no WhisperX the karaoke timeline is always `sentence_estimate` — A5's
      // syllable-weighted fallback, with word highlighting switched off client-side.
      [];

  return {
    tts,
    align,
    settings,
    description: `live: tts=${chosen.join('→')}, align=${settings.align.url ? 'whisperx' : 'sentence_estimate'}, cloning=${settings.cloningEnabled ? 'on' : 'off'}`,
  };
}

function buildVendor(
  name: Env['VOICE_PRIMARY'],
  settings: TtsSettings,
  options: VoiceRouteOptions & { priceBook: PriceBook },
): TtsAdapter | undefined {
  const shared = {
    settings,
    priceBook: options.priceBook,
    ...(options.transport ? { transport: options.transport } : {}),
  };

  switch (name) {
    case 'google':
      return settings.google.apiKey
        ? new GoogleTtsAdapter({ ...shared, ...(options.pacer ? { pacer: options.pacer } : {}) })
        : undefined;
    case 'elevenlabs':
      return settings.elevenlabs.apiKey ? new ElevenLabsTtsAdapter(shared) : undefined;
    case 'cartesia':
      return settings.cartesia.apiKey ? new CartesiaTtsAdapter(shared) : undefined;
    case 'azure':
    case 'system':
      // Azure is a documented option in config but has no adapter yet; naming it must not
      // silently produce a route that cannot speak. `system` means "no entry here".
      return undefined;
    default:
      return undefined;
  }
}
