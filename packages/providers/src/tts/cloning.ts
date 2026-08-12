/**
 * tts/cloning.ts — the one gate that decides whether a parent is asked to record at all.
 *
 * ⭐ THE PRODUCT PROMISE. "Your child hears YOUR voice" is what this product is sold on, and
 * it is the one feature the free tier cannot deliver at any quality: no free provider clones
 * voices. So it is a switch (`VOICE_CLONING_ENABLED`), off by default, and the failure mode
 * when it is off is a REFUSAL a parent can read — never a system voice standing in.
 *
 * ⚠️ CHECK THIS BEFORE THE RECORDING FLOW, not after it. The adapters call it too, but by
 * the time an adapter is reached the parent has already recorded ninety seconds, signed a
 * biometric consent and waited for an upload. Refusing there is correct and late. The right
 * place is whatever renders "sesinizi kaydedin" — today those routes are 501 stubs
 * (`apps/api/src/routes/v1/index.ts`), so this function is the marker that says where the
 * check belongs when they are written.
 *
 * The sentence is deliberately not "an error occurred": a parent who is told the feature is
 * temporarily off waits for it, and a parent who is told something broke tries again in a
 * loop. Both are disappointed; only one is misled.
 */

import { ProviderError } from '../core/errors';
import type { ProviderName } from '../core/types';
import { FREE_TIER_UNSUPPORTED_TR } from '../google/free-tier';
import type { TtsSettings } from './settings';

/** Providers that can actually clone a voice. `google` is absent, and that is the point. */
const CLONING_PROVIDERS: ReadonlySet<string> = new Set(['elevenlabs', 'cartesia']);

export function providerCanClone(provider: string): boolean {
  return CLONING_PROVIDERS.has(provider);
}

/** Is the feature available right now — both switched on and backed by a capable vendor? */
export function voiceCloningAvailable(settings: TtsSettings, provider: string): boolean {
  return settings.cloningEnabled && providerCanClone(provider);
}

/**
 * Throws the refusal a parent should see. Non-retryable and NOT failover-worthy, so
 * `ProviderRouter` stops the route rather than asking a second vendor the same impossible
 * question three times over.
 */
export function assertVoiceCloningAvailable(
  settings: TtsSettings,
  provider: ProviderName,
): void {
  if (voiceCloningAvailable(settings, provider)) return;

  const detail = providerCanClone(provider)
    ? `voice cloning is switched off (VOICE_CLONING_ENABLED=false) for provider "${provider}"`
    : `provider "${provider}" cannot clone voices. Set TTS_PROVIDER_PRIMARY=elevenlabs with ` +
      'ELEVENLABS_API_KEY and VOICE_CLONING_ENABLED=true.';

  throw new ProviderError({
    kind: 'invalid_request',
    provider,
    operation: 'tts.voice.create',
    detail,
    userMessageTr: FREE_TIER_UNSUPPORTED_TR.voiceCloning,
  });
}
