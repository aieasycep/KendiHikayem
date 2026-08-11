/**
 * processors/audio-bindings.ts — the 660-slot ceiling, made survivable (SPEC §14 R5).
 *
 * `packages/providers/tts/slots.ts` holds the POLICY (which binding to evict, and when);
 * this file holds the Postgres it runs against and the side effects it triggers. The split
 * exists because the policy is the part worth unit-testing exhaustively and the SQL is the
 * part that needs a real database.
 *
 * The invariant everything here protects: a parent whose voice profile is `ready` must be
 * able to narrate a story, even if their voice was evicted from the vendor three weeks ago.
 * Re-creating it costs a re-upload of the stored reference, and they never find out.
 */

import { sql } from 'drizzle-orm';
import type { Database } from '@kendihikayem/db';
import type { ProviderCallContext, TtsAdapter } from '@kendihikayem/providers';
import { ProviderError, planEviction, type SlotPolicy, type VoiceBinding } from '@kendihikayem/providers';

import { readAudioAsset, type ObjectStore } from './audio-storage';

/**
 * Vendor names `voice_provider_bindings.provider` accepts (schema CHECK, frozen).
 *
 * `fake` is not among them, and that is correct rather than an oversight: a binding row
 * records WHICH VENDOR is holding a slot for us, and the deterministic double is standing in
 * for a configured vendor rather than being one. In `API_MODE=mock` the row therefore names
 * the vendor the double is impersonating (`VOICE_PRIMARY`), which keeps the slot accounting
 * and the deletion chain identical in shape to production instead of taking a mock-only
 * branch — the one place a KVKK erasure must not behave differently in testing.
 */
const BINDING_PROVIDERS: ReadonlySet<string> = new Set([
  'elevenlabs',
  'cartesia',
  'azure',
  'openai',
  'google',
  'selfhost',
]);

export function bindingProviderFor(adapterProvider: string, configuredPrimary: string): string {
  if (BINDING_PROVIDERS.has(adapterProvider)) return adapterProvider;
  return BINDING_PROVIDERS.has(configuredPrimary) ? configuredPrimary : 'elevenlabs';
}

type BindingRow = {
  id: string;
  voice_profile_id: string;
  provider: string;
  provider_voice_id: string | null;
  state: VoiceBinding['state'];
  occupies_slot: boolean;
  is_ephemeral: boolean;
  last_used_at: Date | string | null;
  created_at: Date | string;
};

function toBinding(row: BindingRow): VoiceBinding {
  return {
    id: row.id,
    voiceProfileId: row.voice_profile_id,
    provider: row.provider,
    providerVoiceId: row.provider_voice_id,
    state: row.state,
    occupiesSlot: row.occupies_slot,
    isEphemeral: row.is_ephemeral,
    lastUsedAt: row.last_used_at === null ? null : new Date(row.last_used_at),
    createdAt: new Date(row.created_at),
  };
}

export async function getBinding(
  db: Database,
  voiceProfileId: string,
  provider: string,
): Promise<VoiceBinding | undefined> {
  const rows = await db.execute<BindingRow>(sql`
    select id, voice_profile_id, provider, provider_voice_id, state, occupies_slot,
           is_ephemeral, last_used_at, created_at
      from voice_provider_bindings
     where voice_profile_id = ${voiceProfileId} and provider = ${provider} and state <> 'deleted'
     limit 1
  `);
  return rows[0] ? toBinding(rows[0]) : undefined;
}

export async function upsertBinding(
  db: Database,
  input: {
    voiceProfileId: string;
    provider: string;
    providerVoiceId: string;
    isEphemeral: boolean;
    occupiesSlot?: boolean;
  },
): Promise<string> {
  const rows = await db.execute<{ id: string }>(sql`
    insert into voice_provider_bindings
      (voice_profile_id, provider, provider_voice_id, occupies_slot, is_ephemeral, state,
       last_used_at)
    values (${input.voiceProfileId}, ${input.provider}, ${input.providerVoiceId},
            ${input.occupiesSlot ?? true}, ${input.isEphemeral}, 'active', now())
    on conflict (voice_profile_id, provider) where state <> 'deleted'
    do update set provider_voice_id = excluded.provider_voice_id,
                  state = 'active',
                  is_ephemeral = excluded.is_ephemeral,
                  last_used_at = now(),
                  error = null
    returning id
  `);
  return rows[0]!.id;
}

/** Marks a binding used. Drives the LRU order, so it must happen on EVERY render. */
export async function touchBinding(db: Database, bindingId: string): Promise<void> {
  await db.execute(sql`
    update voice_provider_bindings set last_used_at = now() where id = ${bindingId}
  `);
}

export async function markBindingState(
  db: Database,
  bindingId: string,
  state: VoiceBinding['state'],
  error?: Record<string, unknown>,
): Promise<void> {
  await db.execute(sql`
    update voice_provider_bindings
       set state = ${state},
           error = ${error ? JSON.stringify(error) : null}::jsonb,
           deleted_at = ${state === 'deleted' ? sql`now()` : sql`deleted_at`}
     where id = ${bindingId}
  `);
}

async function activeBindings(db: Database, provider: string): Promise<VoiceBinding[]> {
  const rows = await db.execute<BindingRow>(sql`
    select id, voice_profile_id, provider, provider_voice_id, state, occupies_slot,
           is_ephemeral, last_used_at, created_at
      from voice_provider_bindings
     where provider = ${provider} and state in ('active', 'creating')
  `);
  return rows.map(toBinding);
}

export interface EvictionResult {
  evicted: number;
  failed: number;
  reason: string;
  profileIds: string[];
}

/**
 * Frees vendor slots by deleting the least recently used voices.
 *
 * The binding is flipped to `deleting` BEFORE the vendor call and to `evicted` after. That
 * ordering matters on a crash: a row stuck in `deleting` is visibly wrong and gets swept,
 * whereas flipping afterwards would leave a row claiming `active` for a voice that no
 * longer exists — and the next render would fail with a confusing 404 instead of quietly
 * re-creating the voice.
 */
export async function evictLeastRecentlyUsed(
  db: Database,
  adapter: TtsAdapter,
  bindingProvider: string,
  policy: SlotPolicy,
  ctx: ProviderCallContext,
  options: { needed?: number; protect?: string[] } = {},
): Promise<EvictionResult> {
  const bindings = await activeBindings(db, bindingProvider);
  const plan = planEviction(bindings, policy, {
    ...(options.needed !== undefined ? { needed: options.needed } : {}),
    ...(options.protect ? { protect: options.protect } : {}),
  });

  let evicted = 0;
  let failed = 0;
  const profileIds: string[] = [];

  for (const binding of plan.evict) {
    if (!binding.providerVoiceId) continue;
    await markBindingState(db, binding.id, 'deleting');
    try {
      await adapter.deleteVoice(binding.providerVoiceId, ctx);
      // `evicted`, NOT `deleted`: the parent still owns this voice and we still hold their
      // reference audio. This is a cache eviction, not an erasure — conflating the two
      // would make an LRU sweep destroy people's voices.
      await markBindingState(db, binding.id, 'evicted');
      evicted += 1;
      profileIds.push(binding.voiceProfileId);
    } catch (error) {
      failed += 1;
      await markBindingState(db, binding.id, 'active', {
        code: ProviderError.is(error) ? error.apiErrorCode : 'INTERNAL',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { evicted, failed, reason: plan.reason, profileIds };
}

export interface EnsureVoiceInput {
  db: Database;
  store: ObjectStore;
  adapter: TtsAdapter;
  /** The vendor name recorded in the binding row; see `bindingProviderFor`. */
  bindingProvider: string;
  policy: SlotPolicy;
  ctx: ProviderCallContext;
  voiceProfileId: string;
  /** `voice_profiles.consent_id`. Refused without it, every time. */
  consentId: string;
  /** The stitched 90–120 s reference asset. */
  referenceAssetId: string;
  ephemeral: boolean;
}

export interface EnsureVoiceResult {
  providerVoiceId: string;
  bindingId: string;
  /** True when the voice had to be (re-)uploaded rather than reused. */
  created: boolean;
  evicted: number;
}

/**
 * Returns a usable vendor voice id for a profile, creating or re-creating it if needed.
 *
 * This is the function that makes eviction invisible. The call order is:
 *   reuse an active binding → else create → on `slot_exhausted`, evict LRU and create again.
 *
 * The retry is deliberately ONE attempt after eviction, not a loop: if a second slot
 * failure follows an eviction that reported success, something is wrong at the vendor and
 * hammering it turns one parent's wait into everyone's outage. The router's circuit breaker
 * takes over from there, and SPEC §7 step 8's silent fallback to the secondary vendor is
 * the next line of defence.
 */
export async function ensureVoiceBinding(input: EnsureVoiceInput): Promise<EnsureVoiceResult> {
  const existing = await getBinding(input.db, input.voiceProfileId, input.bindingProvider);
  if (existing?.state === 'active' && existing.providerVoiceId) {
    await touchBinding(input.db, existing.id);
    return {
      providerVoiceId: existing.providerVoiceId,
      bindingId: existing.id,
      created: false,
      evicted: 0,
    };
  }

  const reference = await readAudioAsset(input.db, input.store, input.referenceAssetId);
  if (!reference) {
    throw new Error(
      `voice profile ${input.voiceProfileId} has no reference audio; it cannot be re-created`,
    );
  }

  const clip = [
    {
      assetId: input.referenceAssetId,
      durationMs: 0,
      bytes: reference.bytes,
    },
  ];

  let evicted = 0;
  try {
    const result = await input.adapter.createVoice(
      { reference: clip, consentId: input.consentId, ephemeral: input.ephemeral },
      input.ctx,
    );
    const bindingId = await upsertBinding(input.db, {
      voiceProfileId: input.voiceProfileId,
      provider: input.bindingProvider,
      providerVoiceId: result.value.providerVoiceId,
      isEphemeral: input.ephemeral,
    });
    return { providerVoiceId: result.value.providerVoiceId, bindingId, created: true, evicted };
  } catch (error) {
    if (!ProviderError.is(error) || error.kind !== 'slot_exhausted') throw error;

    const sweep = await evictLeastRecentlyUsed(
      input.db,
      input.adapter,
      input.bindingProvider,
      input.policy,
      input.ctx,
      // Never evict the profile we are about to create — it would be a loop that always
      // frees exactly the slot it needs and then takes it back.
      { needed: 1, protect: [input.voiceProfileId] },
    );
    evicted = sweep.evicted;
    if (sweep.evicted === 0) throw error;

    const retry = await input.adapter.createVoice(
      { reference: clip, consentId: input.consentId, ephemeral: input.ephemeral },
      input.ctx,
    );
    const bindingId = await upsertBinding(input.db, {
      voiceProfileId: input.voiceProfileId,
      provider: input.bindingProvider,
      providerVoiceId: retry.value.providerVoiceId,
      isEphemeral: input.ephemeral,
    });
    return { providerVoiceId: retry.value.providerVoiceId, bindingId, created: true, evicted };
  }
}
