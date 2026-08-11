/**
 * middleware/audit.ts — who did what, kept out of the request path.
 *
 * Writes to `audit_log` after the response is sent (`onResponse`), so an audit write can
 * never add latency to a parent's request or fail one. An audit trail that can break the
 * product gets disabled the first time it does.
 *
 * Reads are not audited — only writes and anything touching money, consent or deletion.
 * Auditing every GET produces a table nobody can read and a bill nobody wants.
 */

import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Database } from '@kendihikayem/db';

export interface AuditOptions {
  /** Paths never audited even when they are writes (health, metrics). */
  skipPaths?: readonly string[];
  onError?: (error: unknown) => void;
}

const AUDITED_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

export function registerAudit(
  app: FastifyInstance,
  db: Database,
  options: AuditOptions = {},
): void {
  const skip = new Set(options.skipPaths ?? ['/health']);

  app.addHook('onResponse', async (request, reply) => {
    if (!AUDITED_METHODS.has(request.method)) return;
    if (skip.has(request.url)) return;

    const actorType = request.user ? 'user' : 'system';
    const route = request.routeOptions?.url ?? request.url;

    try {
      await db.execute(sql`
        insert into audit_log (actor_type, actor_id, action, entity_type, entity_id,
                               after, ip, user_agent, trace_id)
        values (
          ${actorType},
          ${request.user?.userId ?? null},
          ${`${request.method} ${route}`},
          'http_request',
          null,
          ${JSON.stringify({
            status: reply.statusCode,
            idempotencyKey: request.idempotency?.key ?? null,
          })}::jsonb,
          ${request.ip}::inet,
          ${String(request.headers['user-agent'] ?? '').slice(0, 500)},
          ${request.traceId}
        )
      `);
    } catch (error) {
      // Never rethrow: the response has already been sent, and a failed audit write must
      // not become a 500 the parent sees.
      options.onError?.(error);
    }
  });
}
