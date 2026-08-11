/**
 * tts/slots.ts — a cloned voice is RENTED, not owned.
 *
 * SPEC §14 R5 is the risk this file answers: ElevenLabs caps the account at ~660 concurrent
 * custom voices. That is not "660 users" — it is 660 voices resident at the vendor at once,
 * and without a policy the 661st parent to finish recording is told the service is
 * unavailable while hundreds of dormant voices sit in slots nobody has played in weeks.
 *
 * So a `voice_provider_bindings` row is a CACHE ENTRY, not a permanent fact. A profile can
 * be `ready` in our database while its binding is `evicted`; re-creating it from the stored
 * reference audio is a job, not an error, and the parent never learns it happened.
 *
 * The policy is here (pure, testable); the Postgres implementation of the store lives in
 * the worker, where the database is.
 */

/** One vendor-side voice we are holding a slot for. */
export interface VoiceBinding {
  id: string;
  voiceProfileId: string;
  provider: string;
  providerVoiceId: string | null;
  state: 'creating' | 'active' | 'evicted' | 'deleting' | 'deleted' | 'failed';
  occupiesSlot: boolean;
  isEphemeral: boolean;
  lastUsedAt: Date | null;
  createdAt: Date;
}

export interface SlotPolicy {
  /** The vendor ceiling (`VOICE_SLOT_LIMIT`). */
  limit: number;
  /** Fraction of the ceiling at which eviction starts, e.g. 0.9 → evict from 594 of 660. */
  highWater: number;
  /** A binding idle longer than this is a candidate even below the high-water mark. */
  idleHours: number;
}

export interface EvictionPlan {
  /** Bindings to delete at the vendor, least recently used first. */
  evict: VoiceBinding[];
  reason: 'high_water' | 'idle' | 'make_room' | 'none';
  /** Slots free after the plan is carried out. */
  projectedFree: number;
}

/**
 * Chooses which voices to evict.
 *
 * ⚠️ TWO EXCLUSIONS THAT ARE NOT OPTIMISATIONS:
 *
 *  · A binding in `creating` is never evicted. It belongs to a parent currently watching
 *    the "sesiniz hazırlanıyor" screen, and evicting it turns their first experience of the
 *    product's headline feature into a failure.
 *  · A binding that does not occupy a slot (an inline-embedding vendor) is never evicted,
 *    because deleting it frees nothing and costs a re-upload.
 *
 * Ordering is strictly least-recently-used, with never-used bindings treated as oldest —
 * a voice created and never played is the cheapest thing in the account to lose.
 */
export function planEviction(
  bindings: readonly VoiceBinding[],
  policy: SlotPolicy,
  options: { needed?: number; now?: Date; protect?: readonly string[] } = {},
): EvictionPlan {
  const now = options.now ?? new Date();
  const needed = options.needed ?? 0;
  const protectedIds = new Set(options.protect ?? []);

  const occupying = bindings.filter(
    (binding) => binding.state === 'active' && binding.occupiesSlot,
  );
  const creating = bindings.filter((binding) => binding.state === 'creating').length;
  const used = occupying.length + creating;
  const threshold = Math.floor(policy.limit * policy.highWater);

  const candidates = occupying
    .filter((binding) => !protectedIds.has(binding.voiceProfileId))
    .sort((a, b) => lastUsed(a) - lastUsed(b));

  // 1. Room is needed right now — a create call just came back `slot_exhausted`.
  if (needed > 0) {
    const evict = candidates.slice(0, Math.min(needed, candidates.length));
    return {
      evict,
      reason: evict.length > 0 ? 'make_room' : 'none',
      projectedFree: policy.limit - used + evict.length,
    };
  }

  // 2. Over the high-water mark: shed down to it so the next parent never waits.
  if (used > threshold) {
    const overBy = used - threshold;
    const evict = candidates.slice(0, Math.min(overBy, candidates.length));
    return {
      evict,
      reason: evict.length > 0 ? 'high_water' : 'none',
      projectedFree: policy.limit - used + evict.length,
    };
  }

  // 3. Below the mark: only reclaim what has genuinely gone cold.
  const idleCutoff = now.getTime() - policy.idleHours * 3_600_000;
  const idle = candidates.filter((binding) => lastUsed(binding) < idleCutoff);
  return {
    evict: idle,
    reason: idle.length > 0 ? 'idle' : 'none',
    projectedFree: policy.limit - used + idle.length,
  };
}

function lastUsed(binding: VoiceBinding): number {
  // Never played beats never created: fall back to creation time, and treat a binding with
  // neither timestamp as maximally stale rather than as brand new.
  return (binding.lastUsedAt ?? binding.createdAt ?? new Date(0)).getTime();
}

/** True when the account is close enough to the ceiling that a create call is likely to fail. */
export function isSlotPressureHigh(
  usage: { used: number; limit: number },
  policy: SlotPolicy,
): boolean {
  const limit = usage.limit > 0 ? usage.limit : policy.limit;
  return usage.used >= Math.floor(limit * policy.highWater);
}

/**
 * Whether a binding can be used for a render right now, or has to be re-created first.
 *
 * `evicted` is deliberately NOT an error state — it is the normal resting state of a voice
 * nobody has played this week (see the file header).
 */
export function bindingUsable(binding: VoiceBinding | undefined): boolean {
  return binding?.state === 'active' && Boolean(binding.providerVoiceId);
}
