/**
 * middleware/idempotency.ts — ⭐ LEVEL 1 of three.
 *
 * The scenario: a parent on a slow connection taps "Oluştur" twice. Without this, that is
 * two jobs, two cost holds and two charges for one book.
 *
 *   same key + same body  → replay the STORED RESPONSE, no second job, no second charge
 *   same key + diff body  → 409 IDEMPOTENCY_CONFLICT
 *   same key, still running → 409 IDEMPOTENCY_KEY_REUSED, retryable, with Retry-After
 *
 * `idempotency_keys(user_id, key)` is the primary key, so the INSERT is the lock: the
 * winner proceeds, the loser reads what the winner stored. A SELECT-then-INSERT would race
 * exactly in the double-tap window this exists to close.
 *
 * Level 2 (`jobs UNIQUE(user_id, idempotency_key)`) and level 3 (`job_steps`) sit behind
 * this in `apps/worker`. All three are needed: level 1 stops the duplicate REQUEST, level 2
 * stops the duplicate JOB, level 3 stops the duplicate PROVIDER CALL.
 */

import { sql } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import type { Database } from '@kendihikayem/db';
import { requestHash } from '@kendihikayem/worker';

import { HttpError } from '../errors';

export const IDEMPOTENCY_HEADER = 'idempotency-key';

export interface StoredResponse {
  status: number;
  body: Record<string, unknown>;
}

export type IdempotencyOutcome =
  /** First time: proceed, then call `finishIdempotentRequest` with the response. */
  | { kind: 'proceed'; key: string; requestHash: string }
  /** Replay: return this response verbatim without touching the domain. */
  | { kind: 'replay'; response: StoredResponse };

function readKey(request: FastifyRequest): string {
  const raw = request.headers[IDEMPOTENCY_HEADER];
  const key = Array.isArray(raw) ? raw[0] : raw;
  if (typeof key !== 'string' || key.length < 8 || key.length > 128) {
    throw new HttpError('VALIDATION_FAILED', {
      detail: 'Idempotency-Key header is required (8-128 chars) on every write endpoint',
      field: 'idempotency-key',
    });
  }
  return key;
}

/**
 * Claims the key. Returns `replay` when this exact request already produced a response.
 *
 * `expires_at` defaults to +24h in the schema: a key is not a permanent record, and a
 * parent retrying a week later genuinely wants a new book.
 */
export async function beginIdempotentRequest(
  db: Database,
  request: FastifyRequest,
  endpoint: string,
): Promise<IdempotencyOutcome> {
  const userId = request.user?.userId;
  if (!userId) {
    // Unauthenticated writes cannot be de-duplicated per user; the auth hook runs first,
    // so reaching here means a route was misconfigured in the manifest.
    throw new HttpError('UNAUTHENTICATED', {
      detail: 'idempotency requires an authenticated user',
    });
  }

  const key = readKey(request);
  const hash = requestHash(endpoint, request.body ?? {});

  const inserted = await db.execute<{ key: string }>(sql`
    insert into idempotency_keys (user_id, key, endpoint, request_hash, locked_at)
    values (${userId}, ${key}, ${endpoint}, ${hash}, now())
    on conflict (user_id, key) do nothing
    returning key
  `);

  if (inserted[0]) {
    request.idempotency = { key, requestHash: hash, endpoint };
    return { kind: 'proceed', key, requestHash: hash };
  }

  const existingRows = await db.execute<{
    endpoint: string;
    request_hash: string;
    response_status: number | null;
    response_body: Record<string, unknown> | null;
  }>(sql`
    select endpoint, request_hash, response_status, response_body
      from idempotency_keys
     where user_id = ${userId} and key = ${key}
  `);
  const existing = existingRows[0];
  if (!existing) {
    // The row was reaped between the insert and the read (24h expiry). Treat it as new.
    request.idempotency = { key, requestHash: hash, endpoint };
    return { kind: 'proceed', key, requestHash: hash };
  }

  // The same key against a different route is as much a client bug as a different body.
  if (existing.endpoint !== endpoint || existing.request_hash !== hash) {
    throw new HttpError('IDEMPOTENCY_CONFLICT', {
      detail: `key reused for ${existing.endpoint} with a different payload`,
    });
  }

  if (existing.response_status === null) {
    // The first request is still in flight. Retryable on purpose: the client should poll
    // rather than believe the work was rejected.
    throw new HttpError('IDEMPOTENCY_KEY_REUSED', {
      detail: 'an identical request is still being processed',
      retryable: true,
      retryAfterSec: 2,
    });
  }

  return {
    kind: 'replay',
    response: { status: existing.response_status, body: existing.response_body ?? {} },
  };
}

/**
 * Stores the response so a later replay returns it verbatim.
 *
 * Only 2xx responses are stored. Storing a 5xx would make a transient outage permanent for
 * that key — the parent retries, gets the cached failure, and can never succeed.
 */
export async function finishIdempotentRequest(
  db: Database,
  request: FastifyRequest,
  response: StoredResponse,
  jobId?: string,
): Promise<void> {
  const userId = request.user?.userId;
  const idempotency = request.idempotency;
  if (!userId || !idempotency) return;
  if (response.status >= 300) {
    await db.execute(sql`
      delete from idempotency_keys where user_id = ${userId} and key = ${idempotency.key}
    `);
    return;
  }

  await db.execute(sql`
    update idempotency_keys
       set response_status = ${response.status},
           response_body = ${JSON.stringify(response.body)}::jsonb,
           job_id = ${jobId ?? null},
           locked_at = null
     where user_id = ${userId} and key = ${idempotency.key}
  `);
}

/**
 * Wraps a write handler in the full protocol. Handlers stay unaware of idempotency: they
 * are called once, and the replay path never reaches them.
 */
export async function withIdempotency<T extends StoredResponse>(
  db: Database,
  request: FastifyRequest,
  /**
   * Structural, not `FastifyReply`: ts-rest and Fastify order that type's generics
   * differently, so the nominal type does not line up at the handler boundary. Only
   * `header` is used here.
   */
  reply: { header(name: string, value: string): unknown },
  endpoint: string,
  handler: () => Promise<T & { jobId?: string }>,
): Promise<StoredResponse> {
  const outcome = await beginIdempotentRequest(db, request, endpoint);
  if (outcome.kind === 'replay') {
    void reply.header('idempotent-replay', 'true');
    return outcome.response;
  }

  const result = await handler();
  await finishIdempotentRequest(
    db,
    request,
    { status: result.status, body: result.body },
    result.jobId,
  );
  return { status: result.status, body: result.body };
}
