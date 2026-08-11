/**
 * core/circuit-breaker.ts
 *
 * A provider that is down does not fail fast on its own — it fails slowly, one 30-second
 * timeout at a time, while 13 page jobs queue behind it. The breaker turns that into an
 * immediate failure so `ProviderRouter` can reach the fallback before the parent notices.
 *
 * States mirror `provider_health.circuit_state` (closed | half_open | open) so the API and
 * the worker can share one view: the breaker is per-process, but `CircuitStateStore` lets
 * that state be published to Postgres and read back after a restart.
 */

import type { ProviderName } from './types';

export type CircuitState = 'closed' | 'half_open' | 'open';

export interface CircuitBreakerOptions {
  /** Error rate (0..1) above which the circuit opens. */
  failureRateThreshold?: number;
  /** Below this many samples in the window, the rate is not trusted and stays closed. */
  minimumSamples?: number;
  /** Rolling window for rate calculation. */
  windowMs?: number;
  /** How long to stay open before allowing a probe. */
  openMs?: number;
  /** Concurrent probes permitted in half-open. */
  halfOpenMaxCalls?: number;
  now?: () => number;
}

/** Optional persistence so `provider_health` reflects reality across processes. */
export interface CircuitStateStore {
  publish(provider: ProviderName, state: CircuitState, errorRate: number): Promise<void>;
}

export class CircuitOpenError extends Error {
  readonly provider: ProviderName;
  readonly retryAfterMs: number;

  constructor(provider: ProviderName, retryAfterMs: number) {
    super(`circuit open for ${provider}`);
    this.name = 'CircuitOpenError';
    this.provider = provider;
    this.retryAfterMs = retryAfterMs;
  }
}

interface Sample {
  at: number;
  ok: boolean;
}

export class CircuitBreaker {
  readonly provider: ProviderName;

  private readonly failureRateThreshold: number;
  private readonly minimumSamples: number;
  private readonly windowMs: number;
  private readonly openMs: number;
  private readonly halfOpenMaxCalls: number;
  private readonly now: () => number;
  private readonly store: CircuitStateStore | undefined;

  private samples: Sample[] = [];
  private state: CircuitState = 'closed';
  private openedAt = 0;
  private halfOpenInFlight = 0;

  constructor(
    provider: ProviderName,
    options: CircuitBreakerOptions = {},
    store?: CircuitStateStore,
  ) {
    this.provider = provider;
    this.failureRateThreshold = options.failureRateThreshold ?? 0.5;
    this.minimumSamples = options.minimumSamples ?? 5;
    this.windowMs = options.windowMs ?? 60_000;
    this.openMs = options.openMs ?? 30_000;
    this.halfOpenMaxCalls = options.halfOpenMaxCalls ?? 1;
    this.now = options.now ?? Date.now;
    this.store = store;
  }

  get currentState(): CircuitState {
    this.refresh();
    return this.state;
  }

  get errorRate(): number {
    this.prune();
    if (this.samples.length === 0) return 0;
    const failures = this.samples.filter((s) => !s.ok).length;
    return failures / this.samples.length;
  }

  /** True when a call may proceed. Transitions open → half_open once `openMs` has passed. */
  canAttempt(): boolean {
    this.refresh();
    if (this.state === 'open') return false;
    if (this.state === 'half_open') return this.halfOpenInFlight < this.halfOpenMaxCalls;
    return true;
  }

  retryAfterMs(): number {
    if (this.state !== 'open') return 0;
    return Math.max(0, this.openedAt + this.openMs - this.now());
  }

  /**
   * Runs `fn` under the breaker. Throws `CircuitOpenError` without calling `fn` when the
   * circuit is open — that is the entire point: fail in microseconds, not in timeouts.
   */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.canAttempt()) {
      throw new CircuitOpenError(this.provider, this.retryAfterMs());
    }
    if (this.state === 'half_open') this.halfOpenInFlight += 1;

    try {
      const value = await fn();
      this.onSuccess();
      return value;
    } catch (error) {
      this.onFailure();
      throw error;
    } finally {
      if (this.halfOpenInFlight > 0) this.halfOpenInFlight -= 1;
    }
  }

  onSuccess(): void {
    this.record(true);
    if (this.state === 'half_open') {
      // One good probe closes it. Being conservative here means staying down longer than
      // the provider actually is, which costs more than an occasional extra failure.
      this.transition('closed');
      this.samples = [];
    }
  }

  onFailure(): void {
    this.record(false);
    if (this.state === 'half_open') {
      this.openedAt = this.now();
      this.transition('open');
      return;
    }
    if (
      this.state === 'closed' &&
      this.samples.length >= this.minimumSamples &&
      this.errorRate >= this.failureRateThreshold
    ) {
      this.openedAt = this.now();
      this.transition('open');
    }
  }

  /** Ops kill switch: force the circuit open (e.g. a vendor incident). */
  forceOpen(): void {
    this.openedAt = this.now();
    this.transition('open');
  }

  reset(): void {
    this.samples = [];
    this.halfOpenInFlight = 0;
    this.transition('closed');
  }

  private refresh(): void {
    if (this.state === 'open' && this.now() - this.openedAt >= this.openMs) {
      this.transition('half_open');
    }
  }

  private record(ok: boolean): void {
    this.samples.push({ at: this.now(), ok });
    this.prune();
  }

  private prune(): void {
    const cutoff = this.now() - this.windowMs;
    if (this.samples.length > 0 && this.samples[0]!.at < cutoff) {
      this.samples = this.samples.filter((s) => s.at >= cutoff);
    }
  }

  private transition(next: CircuitState): void {
    if (this.state === next) return;
    this.state = next;
    void this.store?.publish(this.provider, next, this.errorRate).catch(() => {
      /* Publishing health is best-effort; never fail a request because of it. */
    });
  }
}

/** One breaker per provider, created lazily. */
export class CircuitBreakerRegistry {
  private readonly breakers = new Map<ProviderName, CircuitBreaker>();

  constructor(
    private readonly options: CircuitBreakerOptions = {},
    private readonly store?: CircuitStateStore,
  ) {}

  get(provider: ProviderName): CircuitBreaker {
    let breaker = this.breakers.get(provider);
    if (!breaker) {
      breaker = new CircuitBreaker(provider, this.options, this.store);
      this.breakers.set(provider, breaker);
    }
    return breaker;
  }

  snapshot(): Array<{ provider: ProviderName; state: CircuitState; errorRate: number }> {
    return [...this.breakers.values()].map((b) => ({
      provider: b.provider,
      state: b.currentState,
      errorRate: b.errorRate,
    }));
  }
}
