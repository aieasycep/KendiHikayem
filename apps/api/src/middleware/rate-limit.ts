/**
 * middleware/rate-limit.ts — the cheap ceiling in front of the expensive one.
 *
 * The cost caps in `apps/worker` are the real defence; this is what stops a client from
 * hammering the reservation path hard enough to make that defence a performance problem.
 * In-process token buckets: correct for a single instance, approximate across a fleet.
 *
 * TODO(A1/ops): move to a Redis token bucket when the API runs more than one replica —
 * per-instance limits multiply by the replica count, which is the classic way a "limit"
 * turns out not to be one.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';

import { HttpError } from '../errors';

export interface RateLimitRule {
  max: number;
  windowMs: number;
}

export interface RateLimitOptions {
  /** Applies to every request not matched by a more specific rule. */
  global?: RateLimitRule;
  /** Money- or credit-spending routes: far tighter than reads. */
  costly?: RateLimitRule;
  now?: () => number;
}

export const DEFAULT_RATE_LIMITS: Required<Omit<RateLimitOptions, 'now'>> = {
  global: { max: 300, windowMs: 60_000 },
  costly: { max: 20, windowMs: 60_000 },
};

interface Bucket {
  count: number;
  resetAt: number;
}

export class TokenBucketLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  /** Returns remaining allowance, or `null` when the caller is over the limit. */
  consume(key: string, rule: RateLimitRule): { remaining: number; resetAt: number } | null {
    const now = this.now();
    const existing = this.buckets.get(key);

    if (!existing || existing.resetAt <= now) {
      const bucket = { count: 1, resetAt: now + rule.windowMs };
      this.buckets.set(key, bucket);
      return { remaining: rule.max - 1, resetAt: bucket.resetAt };
    }

    if (existing.count >= rule.max) return null;
    existing.count += 1;
    return { remaining: rule.max - existing.count, resetAt: existing.resetAt };
  }

  /** Buckets are only reclaimed on access; sweep so an idle process does not grow. */
  sweep(): void {
    const now = this.now();
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }

  reset(): void {
    this.buckets.clear();
  }
}

/** Per user when authenticated, per IP otherwise — an unauthenticated flood still costs. */
export function rateLimitKey(request: FastifyRequest, scope: string): string {
  const identity = request.user?.userId ?? request.ip;
  return `${scope}:${identity}`;
}

export function registerRateLimit(
  app: FastifyInstance,
  limiter: TokenBucketLimiter,
  options: RateLimitOptions = {},
): void {
  const global = options.global ?? DEFAULT_RATE_LIMITS.global;

  app.addHook('onRequest', async (request, reply) => {
    if (request.url === '/health') return;

    const result = limiter.consume(rateLimitKey(request, 'global'), global);
    if (!result) {
      throw new HttpError('RATE_LIMITED', {
        detail: 'global request rate exceeded',
        retryAfterSec: Math.ceil(global.windowMs / 1000),
      });
    }
    void reply.header('x-ratelimit-remaining', String(result.remaining));
  });

  const sweeper = setInterval(() => limiter.sweep(), 60_000);
  sweeper.unref?.();
  app.addHook('onClose', async () => clearInterval(sweeper));
}

/**
 * Extra limit for costly routes, applied inside the handler where the manifest flag is
 * known. Checked BEFORE the cost reservation so an abusive client is refused without
 * taking the entitlements row lock.
 */
export function enforceCostlyLimit(
  limiter: TokenBucketLimiter,
  request: FastifyRequest,
  rule: RateLimitRule = DEFAULT_RATE_LIMITS.costly,
): void {
  const result = limiter.consume(rateLimitKey(request, 'costly'), rule);
  if (!result) {
    throw new HttpError('RATE_LIMITED', {
      detail: 'too many credit-spending requests',
      retryAfterSec: Math.ceil(rule.windowMs / 1000),
    });
  }
}
