/**
 * processors/run-step.ts — the harness every provider-touching step goes through.
 *
 * One function, because these five things must happen together or the cost core leaks:
 *
 *   1. LEVEL-3 IDEMPOTENCY — claim the step. Unchanged input + already succeeded ⇒ reuse
 *      the stored output and return. This is what makes an interrupted job resume.
 *   2. CONTENT CACHE — same content hash ⇒ `status='skipped'`, cost 0, and `saved_usd`
 *      credited so the saving is measured rather than claimed (SPEC §6.2 rule 4).
 *   3. ROUTER — primary → fallback, retry with backoff, circuit breaker.
 *   4. LEDGER — every call priced into `provider_usage`, cache hits included.
 *   5. STEP CLOSE — succeeded/skipped/failed written, with the cost on the row.
 *
 * A processor that wants to call a provider without this harness is a processor that will
 * eventually charge someone twice.
 */

import type { Database } from '@kendihikayem/db';
import type { AdapterInfo, AdapterResult, ProviderCallContext, ProviderOperation } from '@kendihikayem/providers';
import {
  AllProvidersFailedError,
  ProviderError,
  type ProviderRouter,
  totalUsageUsd,
} from '@kendihikayem/providers';

import { lookupContentCache, storeContentCache, type ContentCacheKind } from '../cache/content-cache';
import { beginStep, completeStep, failStep, type JobStepRow } from '../jobs/repository';
import { stepInputHash } from '../jobs/hashing';

export interface RunStepInput<A extends AdapterInfo, T> {
  db: Database;
  jobId: string;
  userId: string;
  correlationId: string;
  stepKey: string;
  /** `job_steps.kind` — coarse label, e.g. 'llm', 'image', 'tts'. */
  stepKind: string;
  operation: ProviderOperation;
  /** Everything that changes the result. Its hash is the level-3 identity. */
  stepInput: unknown;
  /** Concrete type, not structural: it is what lets `T` infer from `invoke`. */
  router: ProviderRouter<A>;
  invoke: (adapter: A, ctx: ProviderCallContext) => Promise<AdapterResult<T>>;
  /** Projects the provider value into the JSONB stored on the step. */
  toOutput: (value: T) => Record<string, unknown>;
  /** Omit to skip content caching (e.g. calls that must always run). */
  cache?: {
    kind: ContentCacheKind;
    provider: string;
    model: string;
    params: unknown;
    prompt: string;
    /** What a miss would have cost — credited to `saved_usd` on a hit. */
    estimatedUsd: number;
  };
}

export type RunStepResult<T> =
  | { status: 'succeeded'; step: JobStepRow; value: T; costUsd: number; provider: string }
  | { status: 'reused'; step: JobStepRow; output: Record<string, unknown> | null }
  | { status: 'skipped'; step: JobStepRow; output: Record<string, unknown> | null; savedUsd: number }
  | { status: 'failed'; step: JobStepRow; error: ProviderError };

export async function runStep<A extends AdapterInfo, T>(
  input: RunStepInput<A, T>,
): Promise<RunStepResult<T>> {
  const inputHash = stepInputHash(input.stepInput);

  // 1 ── level-3 idempotency
  const claim = await beginStep(input.db, {
    jobId: input.jobId,
    stepKey: input.stepKey,
    kind: input.stepKind,
    inputHash,
  });
  if (claim.reuse) {
    return { status: 'reused', step: claim.step, output: claim.output };
  }
  const step = claim.step;

  // 2 ── content cache
  if (input.cache) {
    const hit = await lookupContentCache<Record<string, unknown>>(
      input.db,
      {
        provider: input.cache.provider,
        model: input.cache.model,
        operation: input.operation,
        params: input.cache.params,
        prompt: input.cache.prompt,
      },
      input.cache.estimatedUsd,
    );
    if (hit.hit) {
      await completeStep(input.db, step.id, {
        status: 'skipped',
        output: hit.payload,
        costUsd: 0,
      });
      return { status: 'skipped', step, output: hit.payload, savedUsd: hit.savedUsd };
    }
  }

  const ctx: ProviderCallContext = {
    // Stable across retries so the vendor can dedupe as well (schema/jobs.ts level 3).
    requestId: step.provider_request_id ?? step.id,
    correlationId: input.correlationId,
    userId: input.userId,
    jobStepId: step.id,
  };

  // 3 + 4 ── router (retry, failover, breaker) and ledger
  try {
    let usageUsd = 0;
    let usedModel: string | undefined;

    const routed = await input.router.execute(input.operation, ctx, async (adapter) => {
      const result = await input.invoke(adapter, ctx);
      usageUsd = totalUsageUsd(result.usage);
      usedModel = result.usage[0]?.model;
      return result;
    });

    const output = input.toOutput(routed.value);

    // 5 ── close the step
    await completeStep(input.db, step.id, {
      status: 'succeeded',
      output,
      provider: routed.provider,
      ...(usedModel ? { providerModel: usedModel } : {}),
      costUsd: usageUsd,
    });

    if (input.cache) {
      await storeContentCache(
        input.db,
        {
          provider: input.cache.provider,
          model: input.cache.model,
          operation: input.operation,
          params: input.cache.params,
          prompt: input.cache.prompt,
        },
        { kind: input.cache.kind, payload: output },
      );
    }

    return {
      status: 'succeeded',
      step,
      value: routed.value,
      costUsd: usageUsd,
      provider: routed.provider,
    };
  } catch (error) {
    const providerError = toProviderError(error, input.operation);
    await failStep(input.db, step.id, providerError.toJobError());
    return { status: 'failed', step, error: providerError };
  }
}

function toProviderError(error: unknown, operation: ProviderOperation): ProviderError {
  if (error instanceof AllProvidersFailedError) {
    return (
      error.last ??
      new ProviderError({ kind: 'unknown', provider: 'fake', operation, detail: error.message })
    );
  }
  return ProviderError.from(error, { provider: 'fake', operation });
}
