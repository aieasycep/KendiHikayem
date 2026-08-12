/**
 * google/pacing.ts — spending the free tier's requests-per-minute on purpose.
 *
 * The free tier's scarcest resource is not tokens, it is REQUESTS PER MINUTE. A book is
 * thirteen illustrations and a dozen narration chunks, and `TTS_CHUNK_CONCURRENCY=4` plus
 * the image pipeline will fire them as fast as the queue allows. Against a 10 rpm ceiling
 * that produces a burst of 429s, each of which the router answers with a retry — so the
 * limit is hit again by the retries, and a job that needed 90 seconds takes ten minutes and
 * may still fail.
 *
 * Waiting BEFORE the call is strictly cheaper than being told to wait after it: the vendor
 * counts rejected requests against some limits, our own retry budget is finite, and a 429
 * costs a full round trip to learn something we already knew.
 *
 * This is a client-side pacer, not a distributed one. It bounds ONE process; two workers
 * against one free-tier key will still collide, and the 429 path is what catches that.
 * Recording it here rather than pretending otherwise: the honest fix for multiple workers is
 * one worker, which is what a free tier is sized for anyway.
 */

export interface RequestPacerOptions {
  /** Minimum wall-clock gap between two starts, ms. `0` disables pacing entirely. */
  minIntervalMs: number;
  /** Injected in tests. */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    // Never keep a shutting-down worker alive for the sake of a pacing gap.
    (timer as unknown as { unref?: () => void }).unref?.();
  });

/**
 * Serialises request STARTS to at most one per `minIntervalMs`.
 *
 * Callers queue on a promise chain rather than each computing its own delay: two chunks that
 * both read "the last call was 6 seconds ago" would both start immediately, which is the
 * exact burst the pacer exists to prevent.
 */
export class RequestPacer {
  private readonly minIntervalMs: number;
  private readonly now: () => number;
  private readonly sleepImpl: (ms: number) => Promise<void>;
  /** Tail of the queue. Each waiter chains onto the previous one's completion. */
  private tail: Promise<void> = Promise.resolve();
  private lastStartedAt = 0;

  constructor(options: RequestPacerOptions) {
    this.minIntervalMs = Math.max(0, options.minIntervalMs);
    this.now = options.now ?? Date.now;
    this.sleepImpl = options.sleep ?? defaultSleep;
  }

  get enabled(): boolean {
    return this.minIntervalMs > 0;
  }

  /**
   * Resolves when it is this caller's turn. `signal` aborts the wait — a cancelled job must
   * not sit in a pacing queue for a minute before noticing it was cancelled.
   */
  async acquire(signal?: AbortSignal): Promise<void> {
    if (!this.enabled) return;

    const turn = this.tail.then(async () => {
      const waitMs = this.lastStartedAt + this.minIntervalMs - this.now();
      if (waitMs > 0) await this.sleepImpl(waitMs);
      this.lastStartedAt = this.now();
    });
    // The chain must not break on a rejected waiter, or every later caller inherits the
    // rejection and the pacer becomes a permanent failure.
    this.tail = turn.catch(() => undefined);

    if (!signal) return turn;
    return Promise.race([turn, aborted(signal)]);
  }
}

function aborted(signal: AbortSignal): Promise<never> {
  return new Promise<never>((_resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason ?? new Error('aborted'));
      return;
    }
    signal.addEventListener('abort', () => reject(signal.reason ?? new Error('aborted')), {
      once: true,
    });
  });
}

/** Requests per minute → the gap between two starts. `0` (or less) ⇒ no pacing. */
export function minIntervalMsForRpm(rpm: number): number {
  return rpm > 0 ? Math.ceil(60_000 / rpm) : 0;
}
