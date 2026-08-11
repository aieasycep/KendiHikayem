/**
 * middleware/tracing.ts — a trace id on every request, before anything can fail.
 *
 * `jobs.correlation_id` and `ApiError.traceId` are the same value. That is the whole
 * design: a parent reads a Turkish error message, quotes the trace id to support, and the
 * support engineer finds the exact provider call in `provider_usage` — without asking the
 * parent what they were doing.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';

export const TRACE_HEADER = 'x-trace-id';

/** Accepts an upstream trace id (edge, load balancer) or mints one. */
export function resolveTraceId(request: FastifyRequest): string {
  const incoming = request.headers[TRACE_HEADER];
  const candidate = Array.isArray(incoming) ? incoming[0] : incoming;
  if (typeof candidate === 'string' && /^[\w.-]{8,128}$/.test(candidate)) return candidate;
  return randomUUID();
}

export function registerTracing(app: FastifyInstance): void {
  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    request.traceId = resolveTraceId(request);
    void reply.header(TRACE_HEADER, request.traceId);
  });
}
