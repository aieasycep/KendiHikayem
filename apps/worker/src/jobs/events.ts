/**
 * jobs/events.ts — the SSE replay log and the transactional outbox.
 *
 * TWO DELIVERY CHANNELS, ONE WRITE.
 *
 *   `job_events` is the replay log. Every event gets a per-job monotonic `seq`, which goes
 *   out as the SSE `id:` field; a reconnecting client sends `Last-Event-ID: <seq>` and the
 *   hub replays from there. SSE is an OPTIMISATION — the contract guarantees polling
 *   `GET /v1/jobs/:id` loses nothing (contract/src/events.ts).
 *
 *   `outbox` is the durable notification path. It is written IN THE SAME TRANSACTION as
 *   the state change it announces, which is what makes "the book finished but the push
 *   never went out" structurally impossible: either both rows commit or neither does.
 *   `dedupe_key` is unique, so at-least-once delivery is safe to retry.
 */

import { sql } from 'drizzle-orm';
import type { Database } from '@kendihikayem/db';
import type { ServerEventType } from '@kendihikayem/contract';

/** Anything that can run a query — the db handle or a transaction inside one. */
type Queryable = Pick<Database, 'execute'>;

export type JobEventRow = {
  id: number;
  job_id: string;
  seq: number;
  type: string;
  payload: Record<string, unknown>;
  created_at: Date;
};

/**
 * Appends an event and allocates the next `seq` in one statement. The
 * `UNIQUE(job_id, seq)` index is the arbiter: on a race the loser retries and gets the
 * next number, rather than two events quietly sharing a sequence and breaking replay.
 */
export async function appendJobEvent(
  db: Queryable,
  jobId: string,
  type: ServerEventType,
  payload: Record<string, unknown>,
  attempts = 3,
): Promise<number> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const rows = await db.execute<{ seq: number }>(sql`
        insert into job_events (job_id, seq, type, payload)
        select ${jobId}, coalesce(max(seq), 0) + 1, ${type},
               ${JSON.stringify(payload)}::jsonb
          from job_events where job_id = ${jobId}
        returning seq
      `);
      const seq = rows[0]?.seq;
      if (seq !== undefined) return seq;
    } catch (error) {
      if (attempt === attempts) throw error;
    }
  }
  throw new Error(`could not append job event for ${jobId}`);
}

/** Replay source for `GET /v1/jobs/:id/events` with `Last-Event-ID`. */
export async function readJobEventsSince(
  db: Queryable,
  jobId: string,
  afterSeq = 0,
  limit = 500,
): Promise<JobEventRow[]> {
  const rows = await db.execute<JobEventRow>(sql`
    select * from job_events
     where job_id = ${jobId} and seq > ${afterSeq}
     order by seq
     limit ${limit}
  `);
  return [...rows];
}

/* ── Transactional outbox ──────────────────────────────────────────────────── */

export type OutboxAggregate = 'job' | 'story' | 'order' | 'voice_profile' | 'user';

export interface OutboxMessage {
  aggregate: OutboxAggregate;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  /**
   * Idempotency for delivery. Derive it from the fact being announced
   * (`job.completed:<jobId>`), never from a timestamp — a retry must collide.
   */
  dedupeKey: string;
  availableAt?: Date;
}

/**
 * Writes an outbox row. MUST be called with the same `tx` as the state change, or the
 * guarantee it exists to provide evaporates.
 */
export async function enqueueOutbox(db: Queryable, message: OutboxMessage): Promise<void> {
  await db.execute(sql`
    insert into outbox (aggregate, aggregate_id, event_type, payload, dedupe_key, available_at)
    values (${message.aggregate}, ${message.aggregateId}, ${message.eventType},
            ${JSON.stringify(message.payload)}::jsonb, ${message.dedupeKey},
            coalesce(${message.availableAt ?? null}::timestamptz, now()))
    on conflict (dedupe_key) do nothing
  `);
}

export type OutboxRow = {
  id: number;
  aggregate: string;
  aggregate_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  dedupe_key: string;
  status: string;
  attempts: number;
  available_at: Date;
  created_at: Date;
};

/**
 * Claims a batch for delivery. `FOR UPDATE SKIP LOCKED` lets several outbox workers run
 * without stepping on each other — the classic queue-in-Postgres pattern.
 */
export async function claimOutboxBatch(db: Database, limit = 50): Promise<OutboxRow[]> {
  const rows = await db.execute<OutboxRow>(sql`
    with claimed as (
      select id from outbox
       where status = 'pending' and available_at <= now()
       order by available_at
       limit ${limit}
         for update skip locked
    )
    update outbox o
       set attempts = o.attempts + 1
      from claimed c
     where o.id = c.id
    returning o.*
  `);
  return [...rows];
}

export async function markOutboxSent(db: Database, id: number): Promise<void> {
  await db.execute(sql`update outbox set status = 'sent' where id = ${id}`);
}

/** Exponential backoff, then dead — a poisoned message must not spin forever. */
export async function markOutboxFailed(
  db: Database,
  id: number,
  attempts: number,
  maxAttempts = 8,
): Promise<void> {
  if (attempts >= maxAttempts) {
    await db.execute(sql`update outbox set status = 'dead' where id = ${id}`);
    return;
  }
  const delaySeconds = Math.min(3600, 2 ** attempts * 5);
  await db.execute(sql`
    update outbox
       set status = 'pending',
           available_at = now() + make_interval(secs => ${delaySeconds})
     where id = ${id}
  `);
}
