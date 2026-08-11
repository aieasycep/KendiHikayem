/**
 * jobs/state-machine.ts — the job status machine, enforced in code.
 *
 * `jobs.status` has a CHECK constraint listing the legal *values*; nothing in the database
 * constrains the legal *transitions*. Without this file a crashed retry could move a
 * `succeeded` job back to `running` and re-charge a parent for a book they already have.
 * Every write goes through `assertTransition`, and an illegal move throws.
 *
 *   queued ──▶ running ──┬─▶ succeeded            (terminal)
 *      │         │       ├─▶ waiting_approval ──▶ running
 *      │         │       └─▶ failed ──┬─▶ queued  (retry)
 *      │         │                    └─▶ dead_letter
 *      └─────────┴──────────────────────▶ cancelled  (any non-terminal)
 *
 * `dead_letter` exists in packages/db but NOT in the contract's `JobStatus`; the API maps
 * it to `failed` (see docs/contract-rfc/001).
 */

export const JOB_STATUSES = [
  'queued',
  'running',
  'waiting_approval',
  'succeeded',
  'failed',
  'cancelled',
  'dead_letter',
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

const TERMINAL: ReadonlySet<JobStatus> = new Set<JobStatus>(['succeeded', 'cancelled']);

/**
 * Adjacency list. Deliberately explicit rather than derived: reading this table is how a
 * reviewer checks the machine, and a clever derivation would hide the one edge that matters.
 */
const TRANSITIONS: Record<JobStatus, readonly JobStatus[]> = {
  queued: ['running', 'cancelled', 'failed'],
  running: ['waiting_approval', 'succeeded', 'failed', 'cancelled'],
  /** Gate 1 (skeleton) and gate 2 (final approval) both park here. */
  waiting_approval: ['running', 'cancelled', 'failed'],
  succeeded: [],
  /** A failed job is retried by going back to `queued`, or retired to `dead_letter`. */
  failed: ['queued', 'dead_letter', 'cancelled'],
  cancelled: [],
  /** Ops can requeue a dead-lettered job by hand after fixing the cause. */
  dead_letter: ['queued'],
};

export class InvalidJobTransitionError extends Error {
  readonly from: JobStatus;
  readonly to: JobStatus;
  readonly jobId: string | undefined;

  constructor(from: JobStatus, to: JobStatus, jobId?: string) {
    super(
      `illegal job transition ${from} → ${to}${jobId ? ` (job ${jobId})` : ''}; ` +
        `allowed: ${TRANSITIONS[from].join(', ') || '(terminal)'}`,
    );
    this.name = 'InvalidJobTransitionError';
    this.from = from;
    this.to = to;
    this.jobId = jobId;
  }
}

export function isJobStatus(value: string): value is JobStatus {
  return (JOB_STATUSES as readonly string[]).includes(value);
}

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: JobStatus, to: JobStatus, jobId?: string): void {
  if (!canTransition(from, to)) throw new InvalidJobTransitionError(from, to, jobId);
}

export function isTerminal(status: JobStatus): boolean {
  return TERMINAL.has(status) || status === 'dead_letter';
}

/**
 * Cancellable window. `POST /v1/jobs/:id/cancel` returns `409 JOB_NOT_CANCELLABLE`
 * outside it — a job that already finished cannot be un-charged.
 */
export function isCancellable(status: JobStatus): boolean {
  return canTransition(status, 'cancelled');
}

/* ── Step statuses ─────────────────────────────────────────────────────────── */

export const JOB_STEP_STATUSES = ['pending', 'running', 'succeeded', 'failed', 'skipped'] as const;
export type JobStepStatus = (typeof JOB_STEP_STATUSES)[number];

const STEP_TRANSITIONS: Record<JobStepStatus, readonly JobStepStatus[]> = {
  pending: ['running', 'skipped', 'failed'],
  /** `running → running` is legal: it is what a retry of the same step looks like. */
  running: ['succeeded', 'failed', 'running'],
  /** A permanently failed page can be retried by the parent from the reader (SPEC §8.2). */
  failed: ['running'],
  /**
   * `succeeded → running` is legal ONLY because `beginStep` checks the input hash first:
   * an unchanged input is reused and never reaches here. What does reach here is the
   * regeneration path — the parent edits page 3's text, that step's `input_hash` changes,
   * and it must rerun while the other eleven come back from `content_cache`
   * (SPEC §6.2 rule 4). Making this terminal would make editing a page impossible.
   */
  succeeded: ['running'],
  /** Same reasoning: `skipped` was a cache hit, and the cache key can stop matching. */
  skipped: ['running'],
};

export function canTransitionStep(from: JobStepStatus, to: JobStepStatus): boolean {
  return STEP_TRANSITIONS[from].includes(to);
}

export class InvalidStepTransitionError extends Error {
  constructor(from: JobStepStatus, to: JobStepStatus, stepKey: string) {
    super(`illegal step transition ${from} → ${to} for ${stepKey}`);
    this.name = 'InvalidStepTransitionError';
  }
}

export function assertStepTransition(
  from: JobStepStatus,
  to: JobStepStatus,
  stepKey: string,
): void {
  if (!canTransitionStep(from, to)) throw new InvalidStepTransitionError(from, to, stepKey);
}

/* ── Outcome derivation ────────────────────────────────────────────────────── */

export interface StepOutcomeCounts {
  total: number;
  succeeded: number;
  skipped: number;
  failed: number;
}

export type JobOutcome = 'succeeded' | 'partial' | 'failed';

/**
 * PARTIAL SUCCESS IS FIRST CLASS (SPEC §8.4). Nine of twelve illustrated pages is a book
 * the parent can read tonight with three placeholders and a "retry" button — not a failure.
 *
 * The contract has no `partial` *status* (only `Job.partial`), so a partial job reports
 * `succeeded` with `partial: {completed, total, failedPageNos}` populated. See
 * docs/contract-rfc/001.
 */
export function deriveOutcome(
  counts: StepOutcomeCounts,
  options: { minimumSuccessRatio?: number } = {},
): JobOutcome {
  const minimum = options.minimumSuccessRatio ?? 0.5;
  if (counts.total === 0) return 'succeeded';
  const done = counts.succeeded + counts.skipped;
  if (counts.failed === 0) return 'succeeded';
  if (done === 0) return 'failed';
  return done / counts.total >= minimum ? 'partial' : 'failed';
}

/** A partial job is stored as `succeeded`; only `failed` is a real failure. */
export function outcomeToStatus(outcome: JobOutcome): JobStatus {
  return outcome === 'failed' ? 'failed' : 'succeeded';
}
