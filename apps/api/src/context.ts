/**
 * context.ts — what a request handler is allowed to reach.
 *
 * The HTTP layer is THIN (SPEC §3): validate, authenticate, reserve, enqueue, read. The
 * domain operations it performs — placing a cost hold, collapsing a duplicate job, deriving
 * partial success — live in `apps/worker` and are imported, not reimplemented. Two
 * implementations of "reserve then enqueue" is how one of them ends up charging twice.
 */

import type { Database } from '@kendihikayem/db';
import type { Env } from '@kendihikayem/config';
import type { PriceBook } from '@kendihikayem/providers';
import type { CostCaps, QueueRegistry } from '@kendihikayem/worker';

import type { SseHub } from './sse/hub';

/** Filled by the auth hook. A1 replaces the verifier, not this shape. */
export interface AuthenticatedUser {
  userId: string;
  isGuest: boolean;
  sessionId?: string;
}

export interface ApiContext {
  db: Database;
  env: Env;
  caps: CostCaps;
  priceBook: PriceBook;
  /** Absent when the process runs without Redis — every enqueue path checks for it. */
  queues?: QueueRegistry;
  sse: SseHub;
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by the tracing hook on every request, before anything can fail. */
    traceId: string;
    /** Set by the auth hook. Undefined on `auth: 'none' | 'optional'` routes. */
    user?: AuthenticatedUser;
    /** Set by the idempotency hook when the route requires a key. */
    idempotency?: { key: string; requestHash: string; endpoint: string };
  }
}
