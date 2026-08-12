/**
 * queues.ts — the six BullMQ queues and their rate limiters.
 *
 * A queue per PROVIDER CLASS, not per job kind: the limiter is the point. `image` is
 * throttled because Gemini has a request quota; `voice` is throttled because ElevenLabs
 * rents 660 concurrent voice slots (SPEC §14 R5). Modelling the vendor quota as a queue
 * limiter means backpressure is applied where the constraint actually is, instead of being
 * discovered as a 429 storm halfway through a parent's book.
 *
 * Queues hold POINTERS (jobId, stepKey). The payload lives in Postgres, so a lost Redis is
 * a re-enqueue, not a data loss (see `jobs/repository.ts` → `recoverableJobs`).
 */

import { FlowProducer, Queue, QueueEvents, Worker } from 'bullmq';
import type { ConnectionOptions, JobsOptions, Processor, WorkerOptions } from 'bullmq';

export const QUEUE_NAMES = ['llm', 'image', 'voice', 'media', 'print', 'ops'] as const;
export type QueueName = (typeof QUEUE_NAMES)[number];

export interface RateLimit {
  /** Jobs per `durationMs`. Straight from the vendor's published quota. */
  max: number;
  durationMs: number;
  /** Worker concurrency for this queue. */
  concurrency: number;
}

/**
 * Defaults sized against SPEC §6/§8: 13 page images at concurrency 4–5, TTS chunks at 4.
 * Every number here is a vendor quota, so it is config, not architecture — override at
 * boot from `packages/config` when the real quotas are known.
 */
export const DEFAULT_RATE_LIMITS: Record<QueueName, RateLimit> = {
  llm: { max: 60, durationMs: 60_000, concurrency: 8 },
  /** SPEC §8.2 step 5: fan-out concurrency 4–5, rate-limited queue. */
  image: { max: 120, durationMs: 60_000, concurrency: 5 },
  /** SPEC §7 step 10: 4 concurrent TTS chunks. */
  voice: { max: 60, durationMs: 60_000, concurrency: 4 },
  media: { max: 240, durationMs: 60_000, concurrency: 4 },
  print: { max: 30, durationMs: 60_000, concurrency: 2 },
  ops: { max: 600, durationMs: 60_000, concurrency: 4 },
};

/** What every queued job carries. Never the prompt — that is read from Postgres. */
export interface JobPayload {
  jobId: string;
  userId: string;
  correlationId: string;
  kind: string;
  /** Set on fan-out children (`image:page:07`). */
  stepKey?: string;
  pageNo?: number;
  /** Free-form pointer data; still no user content. */
  ref?: Record<string, unknown>;
}

/**
 * Retry/backoff. Postgres remains the source of truth for `attempt`, but BullMQ needs its
 * own budget so a queue-level crash (OOM, redeploy) also backs off instead of hot-looping.
 */
export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2_000 },
  removeOnComplete: { age: 3600, count: 1000 },
  removeOnFail: { age: 86_400 },
};

export interface QueueSetupOptions {
  connection: ConnectionOptions;
  prefix?: string;
  rateLimits?: Partial<Record<QueueName, RateLimit>>;
}

export class QueueRegistry {
  readonly queues: Record<QueueName, Queue<JobPayload>>;
  readonly flowProducer: FlowProducer;

  private readonly workers: Worker[] = [];
  private readonly queueEvents: QueueEvents[] = [];
  private readonly connection: ConnectionOptions;
  private readonly prefix: string;
  private readonly rateLimits: Record<QueueName, RateLimit>;

  constructor(options: QueueSetupOptions) {
    this.connection = options.connection;
    this.prefix = options.prefix ?? 'kh';
    this.rateLimits = { ...DEFAULT_RATE_LIMITS, ...options.rateLimits };

    this.queues = Object.fromEntries(
      QUEUE_NAMES.map((name) => [
        name,
        new Queue<JobPayload>(name, {
          connection: this.connection,
          prefix: this.prefix,
          defaultJobOptions: DEFAULT_JOB_OPTIONS,
        }),
      ]),
    ) as Record<QueueName, Queue<JobPayload>>;

    // One FlowProducer for the whole process: it is what turns "1 book → 13 images →
    // 1 join" into a single atomic tree instead of 15 independent enqueues.
    this.flowProducer = new FlowProducer({
      connection: this.connection,
      prefix: this.prefix,
    });
  }

  queue(name: QueueName): Queue<JobPayload> {
    return this.queues[name];
  }

  /** Registers a processor with this queue's vendor-derived limiter and concurrency. */
  startWorker(
    name: QueueName,
    processor: Processor<JobPayload>,
    overrides: Partial<WorkerOptions> = {},
  ): Worker<JobPayload> {
    const limit = this.rateLimits[name];
    const worker = new Worker<JobPayload>(name, processor, {
      connection: this.connection,
      prefix: this.prefix,
      concurrency: limit.concurrency,
      limiter: { max: limit.max, duration: limit.durationMs },
      ...overrides,
    });
    this.workers.push(worker);
    return worker;
  }

  events(name: QueueName): QueueEvents {
    const events = new QueueEvents(name, { connection: this.connection, prefix: this.prefix });
    this.queueEvents.push(events);
    return events;
  }

  async close(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.close()));
    await Promise.all(this.queueEvents.map((e) => e.close()));
    await Promise.all(Object.values(this.queues).map((q) => q.close()));
    await this.flowProducer.close();
  }

  /** Test helper: wipe every queue. Never call this against a real Redis. */
  async obliterate(): Promise<void> {
    for (const queue of Object.values(this.queues)) {
      await queue.obliterate({ force: true });
    }
  }
}

/**
 * Parses `REDIS_URL` into BullMQ's connection options.
 *
 * `rediss://` is how every managed provider (Upstash, Redis Cloud, Aiven) publishes its
 * endpoint, and ioredis will not infer TLS from a URL it never sees — it sees the parsed
 * options. Without the `tls` block the socket opens in plaintext against a TLS listener and
 * the connection fails with a timeout rather than with anything that names the cause, which
 * is why the scheme is honoured here rather than left to each caller.
 */
export function connectionFromUrl(url: string, options: { tls?: boolean } = {}): ConnectionOptions {
  const parsed = new URL(url);
  const tls = options.tls ?? parsed.protocol === 'rediss:';
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}),
    ...(parsed.username ? { username: decodeURIComponent(parsed.username) } : {}),
    ...(tls ? { tls: { servername: parsed.hostname } } : {}),
    // BullMQ requires this: with a retry cap, a reconnect storm silently drops jobs.
    maxRetriesPerRequest: null,
  };
}
