/**
 * tts/factory.ts — the one place that decides which vendor speaks.
 *
 * ⭐ THIS IS THE "THE KEY ARRIVED" SWITCH. Today every environment runs `API_MODE=mock` and
 * gets the deterministic fakes, including the demo lullaby the mobile app plays. On the day
 * an ElevenLabs key exists the entire change is:
 *
 *     API_MODE=live
 *     ELEVENLABS_API_KEY=sk-...
 *
 * No code edit, no redeploy of a different build, no model name to hunt down — the ids and
 * endpoints already come from `packages/config`. If `VOICE_FALLBACK` names a vendor whose
 * key is also present, the route becomes `[primary, fallback]` and the router's failover
 * (SPEC §7 step 8) is live too; otherwise it is a single-vendor route, because a fallback
 * nobody has ever exercised is a liability rather than a safety net.
 */

import type { Env } from '@kendihikayem/config';

import type { AlignAdapter, TtsAdapter } from '../core/adapters';
import type { PriceBook } from '../core/pricing';
import { FakeAlignAdapter, FakeTtsAdapter } from '../core/fakes/adapters';
import type { HttpTransport } from './http';
import { ttsSettingsFromEnv, type TtsSettings } from './settings';
import { ElevenLabsTtsAdapter } from './elevenlabs/adapter';
import { CartesiaTtsAdapter } from './cartesia/adapter';
import { WhisperXAlignAdapter } from './align/whisperx';

export interface VoiceRouteOptions {
  env: Env;
  priceBook?: PriceBook;
  /** Injected by tests; production uses `fetch`. */
  transport?: HttpTransport;
  /** Fakes only: zero simulated latency in tests. */
  fakeLatencyMs?: number;
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

  if (env.API_MODE !== 'live') {
    return {
      tts: [
        new FakeTtsAdapter({
          provider: 'fake',
          model: env.TTS_MODEL_QUALITY,
          latencyMs: options.fakeLatencyMs ?? 0,
          slotLimit: env.VOICE_SLOT_LIMIT,
          ...(options.priceBook ? { priceBook: options.priceBook } : {}),
        }),
      ],
      align: [
        new FakeAlignAdapter({
          provider: 'fake',
          model: env.ALIGN_MODEL,
          latencyMs: options.fakeLatencyMs ?? 0,
          ...(options.priceBook ? { priceBook: options.priceBook } : {}),
        }),
      ],
      settings,
      description: `mock: fake tts (${env.TTS_MODEL_QUALITY}), fake align`,
    };
  }

  const tts: TtsAdapter[] = [];
  const chosen: string[] = [];
  for (const name of [env.VOICE_PRIMARY, env.VOICE_FALLBACK]) {
    const adapter = buildVendor(name, settings, options);
    // Skipped rather than constructed-and-left-to-fail: a route entry whose key is missing
    // would burn a retry budget on every single chunk before failing over.
    if (!adapter || tts.some((existing) => existing.provider === adapter.provider)) continue;
    tts.push(adapter);
    chosen.push(name);
  }

  if (tts.length === 0) {
    throw new Error(
      'API_MODE=live but no voice provider has an API key. Set ELEVENLABS_API_KEY (or ' +
        'CARTESIA_API_KEY and VOICE_PRIMARY=cartesia), or run with API_MODE=mock.',
    );
  }

  const align: AlignAdapter[] = settings.align.url
    ? [
        new WhisperXAlignAdapter({
          settings,
          ...(options.transport ? { transport: options.transport } : {}),
          ...(options.priceBook ? { priceBook: options.priceBook } : {}),
        }),
      ]
    : // No aligner configured: word timings fall back to the vendor's own or to the
      // sentence estimate, and the CONSENT clip cannot be verified at all — which the
      // consent gate treats as a refusal rather than as a pass.
      [];

  return {
    tts,
    align,
    settings,
    description: `live: tts=${chosen.join('→')}, align=${settings.align.url ? 'whisperx' : 'none'}`,
  };
}

function buildVendor(
  name: Env['VOICE_PRIMARY'],
  settings: TtsSettings,
  options: VoiceRouteOptions,
): TtsAdapter | undefined {
  const shared = {
    settings,
    ...(options.transport ? { transport: options.transport } : {}),
    ...(options.priceBook ? { priceBook: options.priceBook } : {}),
  };

  switch (name) {
    case 'elevenlabs':
      return settings.elevenlabs.apiKey ? new ElevenLabsTtsAdapter(shared) : undefined;
    case 'cartesia':
      return settings.cartesia.apiKey ? new CartesiaTtsAdapter(shared) : undefined;
    case 'azure':
    case 'system':
      // Azure is a documented option in config but has no adapter yet; naming it must not
      // silently produce a route that cannot speak.
      return undefined;
    default:
      return undefined;
  }
}
