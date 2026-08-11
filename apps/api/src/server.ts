/**
 * server.ts — Fastify 5 + ts-rest, assembled.
 *
 * Hook order matters and is the security model:
 *   tracing → client-version gate → rate limit → auth → (handler) → audit
 *
 * Tracing first so any failure after it still carries a trace id. Auth before the handler
 * so `request.user` is either set or the request is already refused. Audit last, on
 * `onResponse`, so it can never add latency or fail a parent's request.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import { initServer } from '@ts-rest/fastify';
import type { Database } from '@kendihikayem/db';
import type { Env } from '@kendihikayem/config';
import { type ApiError, type EndpointKey, endpoints } from '@kendihikayem/contract';
import { type CostCaps, type QueueRegistry, capsFromEnv } from '@kendihikayem/worker';
import { DEFAULT_PRICE_BOOK, type PriceBook } from '@kendihikayem/providers';

import type { ApiContext } from './context';
import { HttpError, buildApiError } from './errors';
import { registerTracing } from './middleware/tracing';
import {
  SessionTokenVerifier,
  type TokenVerifier,
  authenticate,
  registerClientVersionGate,
} from './middleware/auth';
import { TokenBucketLimiter, registerRateLimit } from './middleware/rate-limit';
import { registerAudit } from './middleware/audit';
import { SseHub } from './sse/hub';
import { createRouter } from './routes/v1/index';
import { ENDPOINT_STATUS, IMPLEMENTED_ENDPOINTS, PENDING_ENDPOINTS } from './routes/v1/status';

export interface BuildServerOptions {
  db: Database;
  env: Env;
  queues?: QueueRegistry;
  /** A1 swaps this for real token verification; tests pass a static map. */
  verifier?: TokenVerifier;
  caps?: CostCaps;
  priceBook?: PriceBook;
  logger?: boolean;
  minimumClientVersion?: string;
}

export interface BuiltServer {
  app: FastifyInstance;
  ctx: ApiContext;
  limiter: TokenBucketLimiter;
}

/** Route path → contract key, so a hook can read the manifest for the route it is on. */
function buildRouteIndex(): Map<string, EndpointKey> {
  const index = new Map<string, EndpointKey>();
  for (const key of Object.keys(endpoints) as EndpointKey[]) {
    const meta = endpoints[key];
    index.set(`${meta.method} ${meta.path}`, key);
  }
  return index;
}

export function buildServer(options: BuildServerOptions): BuiltServer {
  const app = Fastify({
    logger: options.logger ?? false,
    // Fastify's default 100 MB body limit is far too generous for a JSON API; the only
    // large uploads in this product are presigned straight to S3 and never touch us.
    bodyLimit: 1_048_576,
    disableRequestLogging: true,
  });

  const sse = new SseHub(options.db);
  sse.start();

  const ctx: ApiContext = {
    db: options.db,
    env: options.env,
    caps: options.caps ?? capsFromEnv(options.env),
    priceBook: options.priceBook ?? DEFAULT_PRICE_BOOK,
    ...(options.queues ? { queues: options.queues } : {}),
    sse,
  };

  const limiter = new TokenBucketLimiter();
  const verifier = options.verifier ?? new SessionTokenVerifier(options.db);
  const routeIndex = buildRouteIndex();

  registerTracing(app);
  registerClientVersionGate(
    app,
    options.minimumClientVersion !== undefined
      ? { minimumVersion: options.minimumClientVersion }
      : {},
  );
  registerRateLimit(app, limiter);

  /**
   * Authentication, driven by the contract manifest. The requirement is not repeated here —
   * it is read from `endpoints[key].auth`, so an endpoint cannot ship with a different auth
   * rule than the one the manifest (and therefore the client) believes.
   */
  app.addHook('preHandler', async (request) => {
    const routeUrl = request.routeOptions?.url;
    if (!routeUrl) return;
    const key = routeIndex.get(`${request.method} ${routeUrl}`);
    if (!key) return;
    await authenticate(request, verifier, endpoints[key].auth);
  });

  registerAudit(app, options.db);

  /**
   * Single error shape (contract rule 1). Nothing else in this service may write an error
   * body, which is why domain errors are translated HERE rather than caught in handlers —
   * a handler that forgets is still correct.
   */
  app.setErrorHandler((error: unknown, request, reply) => {
    const traceId = request.traceId ?? 'trace-yok';
    const message = error instanceof Error ? error.message : String(error);
    const name = error instanceof Error ? error.name : 'UnknownError';

    if (error instanceof HttpError) {
      void reply.status(error.status).send(error.toBody(traceId));
      return;
    }

    // ts-rest / Fastify request-schema validation.
    const statusCode = (error as { statusCode?: number } | null)?.statusCode;
    if (statusCode === 400 || (typeof error === 'object' && error !== null && 'validation' in error)) {
      void reply
        .status(422)
        .send(buildApiError('VALIDATION_FAILED', traceId, { detail: message }));
      return;
    }

    // Domain errors from apps/worker, mapped onto contract codes by NAME so this file does
    // not need to import the whole worker error hierarchy.
    const mapped: Record<string, { status: number; body: ApiError } | undefined> = {
      JobNotFoundError: {
        status: 404,
        body: buildApiError('NOT_FOUND', traceId, { detail: message }),
      },
      JobNotCancellableError: {
        status: 409,
        body: buildApiError('JOB_NOT_CANCELLABLE', traceId, { detail: message }),
      },
      JobIdempotencyConflictError: {
        status: 409,
        body: buildApiError('IDEMPOTENCY_CONFLICT', traceId, { detail: message }),
      },
      InvalidJobTransitionError: {
        status: 409,
        body: buildApiError('CONFLICT', traceId, { detail: message }),
      },
    };

    const match = mapped[name];
    if (match) {
      void reply.status(match.status).send(match.body);
      return;
    }

    request.log.error({ err: error, traceId }, 'unhandled error');
    void reply.status(500).send(buildApiError('INTERNAL', traceId, { detail: message }));
  });

  /** Liveness. Outside the contract on purpose — infrastructure, not product surface. */
  app.get('/health', async () => ({
    ok: true,
    service: 'kendihikayem-api',
    endpoints: {
      implemented: IMPLEMENTED_ENDPOINTS.length,
      pending: PENDING_ENDPOINTS.length,
    },
    sseConnections: sse.openConnections,
  }));

  /** Which endpoints are real, for the other agents and for ops. */
  app.get('/internal/endpoints', async () => ENDPOINT_STATUS);

  const server = initServer();
  void app.register(server.plugin(createRouter(ctx)), {
    // ts-rest validates requests against the contract; response validation stays off in
    // production (it doubles serialisation cost) and is enabled in tests.
    responseValidation: false,
  });

  app.addHook('onClose', async () => sse.stop());

  return { app, ctx, limiter };
}
