/**
 * sse/hub.ts — Server-Sent Events with `Last-Event-ID` replay.
 *
 * ⚠️ READ THE CONTRACT RULE FIRST (packages/contract/src/events.ts): SSE IS AN
 * OPTIMISATION, NOT A DELIVERY GUARANTEE. The client can always fall back to polling
 * `GET /v1/jobs/:id` and lose nothing. React Native does not support EventSource at all,
 * so mobile — the primary platform — never opens one of these. The real delivery channel
 * is push + e-mail, driven by the transactional outbox.
 *
 * That is why this hub is deliberately simple: replay from `job_events` (Postgres, not an
 * in-memory ring buffer), a heartbeat every 15 s, and no attempt to be a message broker.
 * The durable path is elsewhere; this only makes the web experience feel live.
 */

import type { ServerResponse } from 'node:http';

import type { Database } from '@kendihikayem/db';
import { SSE_HEARTBEAT_MS, serializeServerEvent } from '@kendihikayem/contract';
import { readJobEventsSince } from '@kendihikayem/worker';

/**
 * The slice of `FastifyReply` an SSE stream needs. Structural on purpose: ts-rest hands
 * handlers a `FastifyReply` whose generic parameters are ordered differently from
 * Fastify's own declaration, so the nominal type is not assignable across that boundary.
 */
export interface SseReply {
  raw: ServerResponse;
}

export interface SseConnection {
  id: string;
  userId: string;
  jobId?: string;
  reply: SseReply;
  close(): void;
}

export interface SseHubOptions {
  heartbeatMs?: number;
  /** How often a job-scoped stream re-reads `job_events`. */
  pollMs?: number;
}

/**
 * Tracks open streams and pumps events. Polls Postgres rather than subscribing to Redis
 * pub/sub on purpose: `job_events` is the same table the polling endpoint replays from, so
 * SSE and polling cannot disagree about what happened.
 */
export class SseHub {
  private readonly connections = new Map<string, SseConnection>();
  private readonly heartbeatMs: number;
  private readonly pollMs: number;
  private heartbeat?: NodeJS.Timeout;

  constructor(
    private readonly db: Database,
    options: SseHubOptions = {},
  ) {
    this.heartbeatMs = options.heartbeatMs ?? SSE_HEARTBEAT_MS;
    this.pollMs = options.pollMs ?? 1000;
  }

  get openConnections(): number {
    return this.connections.size;
  }

  start(): void {
    if (this.heartbeat) return;
    this.heartbeat = setInterval(() => {
      const at = new Date().toISOString();
      for (const connection of this.connections.values()) {
        // A client that sees no heartbeat for 2× the interval treats the link as dead and
        // reconnects; without it a half-open TCP connection looks like a stalled job.
        this.writeRaw(connection, `event: heartbeat\ndata: ${JSON.stringify({ at })}\n\n`);
      }
    }, this.heartbeatMs);
    this.heartbeat.unref?.();
  }

  stop(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = undefined;
    for (const connection of this.connections.values()) connection.close();
    this.connections.clear();
  }

  /**
   * Attaches a job-scoped stream, replaying everything after `lastEventId` first.
   *
   * The replay is what makes a dropped connection harmless: the client reconnects with the
   * last `seq` it saw and receives the gap before any live event.
   */
  async attachJobStream(
    reply: SseReply,
    input: { connectionId: string; userId: string; jobId: string; lastEventId?: string },
  ): Promise<void> {
    const connection = this.open(reply, {
      id: input.connectionId,
      userId: input.userId,
      jobId: input.jobId,
    });

    let cursor = parseLastEventId(input.lastEventId);

    const pump = async () => {
      if (!this.connections.has(connection.id)) return;
      try {
        const events = await readJobEventsSince(this.db, input.jobId, cursor);
        for (const event of events) {
          cursor = event.seq;
          this.writeRaw(
            connection,
            serializeServerEvent({
              seq: event.seq,
              type: event.type,
              at: event.created_at.toISOString(),
              ...event.payload,
            } as Parameters<typeof serializeServerEvent>[0]),
          );
        }
      } catch {
        // A read failure must not kill the stream: the client is still free to poll, and
        // the next tick may succeed.
      }
    };

    await pump();
    const timer = setInterval(() => void pump(), this.pollMs);
    timer.unref?.();
    reply.raw.on('close', () => clearInterval(timer));
  }

  /** Opens the stream: headers, keep-alive and registration. */
  open(
    reply: SseReply,
    meta: { id: string; userId: string; jobId?: string },
  ): SseConnection {
    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      // Nginx buffers text/event-stream by default, which turns a live stream into a
      // batch delivered at the end. This header is not optional in production.
      'x-accel-buffering': 'no',
    });
    reply.raw.write(': connected\n\n');

    const connection: SseConnection = {
      id: meta.id,
      userId: meta.userId,
      ...(meta.jobId !== undefined ? { jobId: meta.jobId } : {}),
      reply,
      close: () => {
        this.connections.delete(meta.id);
        try {
          reply.raw.end();
        } catch {
          /* already closed */
        }
      },
    };

    this.connections.set(meta.id, connection);
    reply.raw.on('close', () => this.connections.delete(meta.id));
    return connection;
  }

  private writeRaw(connection: SseConnection, chunk: string): void {
    try {
      if (!connection.reply.raw.writableEnded) connection.reply.raw.write(chunk);
    } catch {
      connection.close();
    }
  }
}

/** `Last-Event-ID` is the last `seq` the client rendered. Garbage means "from the start". */
export function parseLastEventId(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}
