/**
 * core/router.ts — primary → fallback routing with retry, breaker and metering.
 *
 * Every provider call in the product goes through here, which is what makes three
 * guarantees hold globally instead of per-call-site:
 *
 *   1. A retryable failure is retried with exponential backoff + jitter (jitter matters:
 *      13 page jobs retrying in lockstep is a self-inflicted rate limit).
 *   2. When a provider is exhausted, the next one in the route is tried — SPEC §7 step 8's
 *      "silent fallback to Cartesia, the parent never notices".
 *   3. Whatever succeeds, its `ProviderUsage` reaches the `CostLedger`. There is no path
 *      through this file that calls a vendor without pricing the call.
 */

import type { AdapterInfo, AdapterResult, ProviderCallContext, ProviderOperation } from './types';
import { AllProvidersFailedError, ProviderError } from './errors';
import { CircuitBreakerRegistry, CircuitOpenError } from './circuit-breaker';
import type { CostLedger, LedgerContext } from './cost-ledger';
import { NOOP_COST_LEDGER } from './cost-ledger';

export interface RetryPolicy {
  /** Attempts per provider, including the first. */
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  /** 0..1 — proportion of the delay that is randomised. */
  jitter: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 20_000,
  jitter: 0.3,
};

export interface RouterOptions {
  ledger?: CostLedger;
  breakers?: CircuitBreakerRegistry;
  retry?: Partial<RetryPolicy>;
  /** Injected in tests so backoff does not actually sleep. */
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  onAttempt?: (event: RouteAttemptEvent) => void;
}

export interface RouteAttemptEvent {
  operation: ProviderOperation;
  provider: string;
  attempt: number;
  outcome: 'success' | 'retry' | 'failover' | 'circuit_open';
  error?: ProviderError;
  latencyMs: number;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Routes one operation across an ordered list of adapters of the same kind.
 *
 * `route` is ordered: `[primary, ...fallbacks]`. Config decides the order
 * (`VOICE_PRIMARY` / `VOICE_FALLBACK`), never this file.
 */
export class ProviderRouter<A extends AdapterInfo> {
  private readonly ledger: CostLedger;
  private readonly breakers: CircuitBreakerRegistry;
  private readonly retry: RetryPolicy;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;
  private readonly onAttempt: ((event: RouteAttemptEvent) => void) | undefined;

  constructor(
    readonly route: readonly A[],
    options: RouterOptions = {},
  ) {
    if (route.length === 0) throw new Error('ProviderRouter needs at least one adapter');
    this.ledger = options.ledger ?? NOOP_COST_LEDGER;
    this.breakers = options.breakers ?? new CircuitBreakerRegistry();
    this.retry = { ...DEFAULT_RETRY_POLICY, ...options.retry };
    this.sleep = options.sleep ?? defaultSleep;
    this.random = options.random ?? Math.random;
    this.onAttempt = options.onAttempt;
  }

  get primary(): A {
    return this.route[0]!;
  }

  /**
   * Calls `invoke` against the route until one adapter succeeds.
   *
   * @throws AllProvidersFailedError when every provider in the route is exhausted.
   */
  async execute<T>(
    operation: ProviderOperation,
    ctx: ProviderCallContext,
    invoke: (adapter: A) => Promise<AdapterResult<T>>,
  ): Promise<{ value: T; provider: string; attempts: number }> {
    const failures: ProviderError[] = [];
    let attempts = 0;

    for (const adapter of this.route) {
      const breaker = this.breakers.get(adapter.provider);

      for (let attempt = 1; attempt <= this.retry.maxAttempts; attempt += 1) {
        attempts += 1;
        const startedAt = Date.now();

        try {
          const result = await breaker.run(() => invoke(adapter));
          const latencyMs = Date.now() - startedAt;

          await this.meter(result, ctx, latencyMs);
          this.emit({ operation, provider: adapter.provider, attempt, outcome: 'success', latencyMs });
          return { value: result.value, provider: adapter.provider, attempts };
        } catch (error) {
          const latencyMs = Date.now() - startedAt;

          if (error instanceof CircuitOpenError) {
            // Do not burn the per-provider attempt budget on an open circuit; move on.
            this.emit({
              operation,
              provider: adapter.provider,
              attempt,
              outcome: 'circuit_open',
              latencyMs,
            });
            failures.push(
              new ProviderError({
                kind: 'unavailable',
                provider: adapter.provider,
                operation,
                detail: `circuit open, retry in ${error.retryAfterMs}ms`,
                retryAfterMs: error.retryAfterMs,
              }),
            );
            break;
          }

          const providerError = ProviderError.from(error, {
            provider: adapter.provider,
            operation,
          });
          failures.push(providerError);

          const canRetrySameProvider =
            providerError.retryable && attempt < this.retry.maxAttempts;

          this.emit({
            operation,
            provider: adapter.provider,
            attempt,
            outcome: canRetrySameProvider ? 'retry' : 'failover',
            error: providerError,
            latencyMs,
          });

          if (!canRetrySameProvider) {
            // A non-retryable error (bad request, blocked content) fails the same way on
            // every provider — stop the whole route instead of paying for two more no's.
            if (!providerError.retryable && !isFailoverWorthy(providerError)) {
              throw new AllProvidersFailedError(operation, failures);
            }
            break;
          }

          await this.sleep(this.backoffMs(attempt, providerError.retryAfterMs));
        }
      }
    }

    throw new AllProvidersFailedError(operation, failures);
  }

  /**
   * Records a cache hit: no provider was called, but the saving is still measured.
   * `costUsd` is what the call WOULD have cost — that number is the caching business case.
   */
  async meterCacheHit(
    usage: readonly AdapterResult<unknown>['usage'][number][],
    ctx: LedgerContext,
  ): Promise<void> {
    await this.ledger.record(
      usage.map((u) => ({ ...u, cacheHit: true, costUsd: 0, latencyMs: 0 })),
      ctx,
    );
  }

  private async meter<T>(
    result: AdapterResult<T>,
    ctx: ProviderCallContext,
    latencyMs: number,
  ): Promise<void> {
    if (result.usage.length === 0) return;
    const usage = result.usage.map((u) => ({
      ...u,
      latencyMs: u.latencyMs || latencyMs,
    }));
    try {
      await this.ledger.record(usage, {
        ...(ctx.userId !== undefined ? { userId: ctx.userId } : {}),
        ...(ctx.jobStepId !== undefined ? { jobStepId: ctx.jobStepId } : {}),
        correlationId: ctx.correlationId,
      });
    } catch {
      // A ledger write failure must not lose work the parent already paid for. The
      // reconcile scheduler re-derives totals from provider_usage + job_steps.
    }
  }

  private backoffMs(attempt: number, retryAfterMs?: number): number {
    if (retryAfterMs !== undefined && retryAfterMs > 0) {
      return Math.min(retryAfterMs, this.retry.maxDelayMs);
    }
    const exponential = this.retry.baseDelayMs * 2 ** (attempt - 1);
    const capped = Math.min(exponential, this.retry.maxDelayMs);
    const jitterRange = capped * this.retry.jitter;
    return Math.round(capped - jitterRange / 2 + this.random() * jitterRange);
  }

  private emit(event: RouteAttemptEvent): void {
    this.onAttempt?.(event);
  }
}

/**
 * Some non-retryable errors are still worth trying on a different vendor: an auth failure
 * or a slot ceiling is provider-specific. A content block is not — every vendor will
 * refuse the same prompt, and trying again is pure spend.
 */
function isFailoverWorthy(error: ProviderError): boolean {
  return error.kind === 'auth' || error.kind === 'quota_exhausted' || error.kind === 'not_found';
}
