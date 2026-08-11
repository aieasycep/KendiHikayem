/**
 * core/fakes/support.ts — the machinery that makes the fake adapters useful rather than
 * merely present.
 *
 * Three properties every fake here has:
 *   · DETERMINISTIC — output is a pure function of the input hash. The same page prompt
 *     always yields the same bytes, so `content_cache` behaviour is testable.
 *   · DELAYED — configurable latency, so fan-out concurrency and queue rate limiters are
 *     exercised rather than assumed.
 *   · INJECTABLE — a `FailurePlan` makes provider #3 fail twice then succeed, which is the
 *     only honest way to test retry, failover and partial success.
 */

import { createHash } from 'node:crypto';

import { ProviderError, type ProviderErrorKind } from '../errors';
import type { ProviderName, ProviderOperation } from '../types';

export function sha256Hex(input: string | Uint8Array): string {
  return createHash('sha256').update(input).digest('hex');
}

/** Deterministic 32-bit PRNG seeded from a string. mulberry32. */
export function seededRandom(seed: string): () => number {
  const hex = sha256Hex(seed).slice(0, 8);
  let state = Number.parseInt(hex, 16) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic pseudo-bytes — stands in for image/audio payloads. */
export function seededBytes(seed: string, length: number): Uint8Array {
  const rand = seededRandom(seed);
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i += 1) out[i] = Math.floor(rand() * 256);
  return out;
}

/** Turkish text runs ~3 characters per token; close enough for a fake's accounting. */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 3));
}

/* ── Failure injection ─────────────────────────────────────────────────────── */

export interface FailureRule {
  /** Match on operation; omit to match all. */
  operation?: ProviderOperation;
  /** Match when the call's dedupe key contains this substring (e.g. 'image:page:07'). */
  requestIdIncludes?: string;
  kind: ProviderErrorKind;
  /** Fail this many times, then let the call through. `Infinity` = always fail. */
  times: number;
  detail?: string;
  retryAfterMs?: number;
}

/**
 * A mutable plan of injected failures. Tests describe a world ("page 7 fails twice, then
 * works"), and the fakes obey it — no monkey-patching, no conditional production code.
 */
export class FailurePlan {
  private readonly rules: FailureRule[] = [];
  private readonly counts = new Map<FailureRule, number>();

  static none(): FailurePlan {
    return new FailurePlan();
  }

  add(rule: FailureRule): this {
    this.rules.push(rule);
    return this;
  }

  /** Convenience: make one step fail permanently — the partial-success path. */
  failForever(requestIdIncludes: string, kind: ProviderErrorKind = 'unavailable'): this {
    return this.add({ requestIdIncludes, kind, times: Number.POSITIVE_INFINITY });
  }

  /** Convenience: flaky step that recovers — the retry path. */
  failTimes(requestIdIncludes: string, times: number, kind: ProviderErrorKind = 'timeout'): this {
    return this.add({ requestIdIncludes, kind, times });
  }

  reset(): void {
    this.counts.clear();
  }

  /** Throws if a rule matches and still has budget. */
  maybeThrow(provider: ProviderName, operation: ProviderOperation, requestId: string): void {
    for (const rule of this.rules) {
      if (rule.operation !== undefined && rule.operation !== operation) continue;
      if (rule.requestIdIncludes !== undefined && !requestId.includes(rule.requestIdIncludes)) {
        continue;
      }
      const used = this.counts.get(rule) ?? 0;
      if (used >= rule.times) continue;
      this.counts.set(rule, used + 1);
      throw new ProviderError({
        kind: rule.kind,
        provider,
        operation,
        detail: rule.detail ?? `injected ${rule.kind} failure (${used + 1}/${rule.times})`,
        ...(rule.retryAfterMs !== undefined ? { retryAfterMs: rule.retryAfterMs } : {}),
      });
    }
  }
}

/* ── Shared fake configuration ─────────────────────────────────────────────── */

export interface FakeAdapterOptions {
  /** Reported as the model id. Comes from config in production; tests pass a stub. */
  model: string;
  /** Base simulated latency. Set to 0 in unit tests. */
  latencyMs?: number;
  /** Latency spread, applied deterministically from the request hash. */
  latencyJitterMs?: number;
  failures?: FailurePlan;
  provider?: ProviderName;
  /** Injected in tests so nothing actually sleeps. */
  sleep?: (ms: number) => Promise<void>;
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export abstract class BaseFakeAdapter {
  readonly provider: ProviderName;
  protected readonly model: string;
  protected readonly failures: FailurePlan;
  private readonly latencyMs: number;
  private readonly latencyJitterMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: FakeAdapterOptions) {
    this.provider = options.provider ?? 'fake';
    this.model = options.model;
    this.latencyMs = options.latencyMs ?? 0;
    this.latencyJitterMs = options.latencyJitterMs ?? 0;
    this.failures = options.failures ?? FailurePlan.none();
    this.sleep = options.sleep ?? realSleep;
  }

  async health(): Promise<{ ok: boolean; latencyMs: number }> {
    return { ok: true, latencyMs: 1 };
  }

  /** Simulate the call: sleep, then honour any injected failure. Returns elapsed ms. */
  protected async simulate(operation: ProviderOperation, requestId: string): Promise<number> {
    const jitter =
      this.latencyJitterMs > 0
        ? Math.floor(seededRandom(requestId)() * this.latencyJitterMs)
        : 0;
    const total = this.latencyMs + jitter;
    if (total > 0) await this.sleep(total);
    this.failures.maybeThrow(this.provider, operation, requestId);
    return total;
  }
}
