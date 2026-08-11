/**
 * core/types.ts — the vocabulary every adapter shares.
 *
 * Nothing here talks to a network. These are the shapes that `packages/providers/{llm,
 * image,tts,moderation,align,print}` implement (A3–A6) and that `apps/worker` consumes.
 *
 * ⚠️ NO MODEL NAMES. A model id is a *value* that arrives from `packages/config`
 * (`LLM_MODEL_FILL`, `IMAGE_MODEL_PRIMARY`, …) and is carried through `model` fields.
 * `eslint.config.mjs` turns a hardcoded one into a build error on purpose (SPEC §3 rule 6).
 */

/** Vendors we route to. `fake` is the in-repo deterministic double (see core/fakes). */
export type ProviderName =
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'elevenlabs'
  | 'cartesia'
  | 'azure'
  | 'selfhost'
  | 'manual_tr'
  | 'cloudprinter'
  | 'gelato'
  | 'lulu'
  | 'fake';

export type AdapterKind = 'llm' | 'image' | 'tts' | 'moderation' | 'align' | 'print';

/**
 * `provider_usage.operation`. Coarse on purpose: the invoice is reconciled per operation,
 * not per prompt variant.
 */
export type ProviderOperation =
  | 'llm.complete'
  | 'image.generate'
  | 'tts.synth'
  | 'tts.voice.create'
  | 'tts.voice.delete'
  | 'moderation.check'
  | 'align.transcribe'
  | 'print.quote'
  | 'print.submit'
  | 'print.status'
  | 'print.cancel';

/** Mirrors `USAGE_BILLING_UNIT` in packages/db/src/schema/types.ts. */
export type BillingUnit =
  | 'character'
  | 'utf8_byte'
  | 'second'
  | 'token'
  | 'image'
  | 'megapixel'
  | 'request';

/**
 * One provider call, priced. This is the row that lands in `provider_usage` — the ground
 * truth the "USD per completed story" metric is computed from. A cache hit is still
 * recorded (`cacheHit: true`, `costUsd: 0`) so the saving is visible instead of invisible.
 */
export interface ProviderUsage {
  provider: ProviderName;
  /** Model id as configured — never a literal in code. */
  model: string;
  operation: ProviderOperation;
  billingUnit: BillingUnit;
  billedUnits: number;
  unitPriceUsd: number;
  costUsd: number;
  cacheHit: boolean;
  latencyMs: number;
}

/**
 * Per-call context. `requestId` is `uuidv5(job_step.id)` (schema/jobs.ts level-3
 * idempotency): the same step retried sends the same id, so a provider that dedupes
 * server-side does not charge twice.
 */
export interface ProviderCallContext {
  requestId: string;
  correlationId: string;
  userId?: string;
  jobStepId?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

/** Every adapter returns its value together with what it cost. Never one without the other. */
export interface AdapterResult<T> {
  value: T;
  usage: ProviderUsage[];
}

export interface AdapterInfo {
  readonly provider: ProviderName;
  readonly kind: AdapterKind;
  /** Cheap liveness probe. Routers use it for half-open circuit checks; never billed. */
  health?(): Promise<{ ok: boolean; latencyMs: number }>;
}

/** Sums the USD of a usage list. Used by the router, the ledger and the tests alike. */
export function totalUsageUsd(usage: readonly ProviderUsage[]): number {
  return usage.reduce((sum, u) => sum + u.costUsd, 0);
}
