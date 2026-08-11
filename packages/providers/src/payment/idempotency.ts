/**
 * payment/idempotency.ts — ⭐ THE PARENT IS CHARGED ONCE.
 *
 * Double charging is the failure this whole file exists to make impossible. It happens in
 * three ordinary ways, and each has an answer here:
 *
 *   1. The parent taps "Öde" twice, 40 ms apart.
 *        → `begin()` is a compare-and-set: the second caller sees `in_flight` and waits for
 *          the first result instead of starting a second checkout.
 *   2. The worker retries after a timeout, not knowing whether the vendor got the request.
 *        → the SAME `idempotencyKey` is replayed, so the vendor (and our store) dedupe it.
 *          The key is derived, never random: `key(orderId, attempt, amount)`.
 *   3. A bug sends a different amount under a key that was already used.
 *        → `PaymentIdempotencyConflictError`. We refuse rather than guess which amount was
 *          meant; a refused payment is recoverable, a wrong charge is a chargeback.
 *
 * This mirrors the reservation protocol in `apps/worker/src/cost/reservation.ts`: check and
 * claim happen in ONE atomic step in the store, and the store — not this module — is where
 * the transaction lives (Postgres in production, a Map in tests).
 */

import { createHash } from 'node:crypto';

export type IdempotencyState = 'in_flight' | 'succeeded' | 'failed';

export interface IdempotencyRecord<T> {
  key: string;
  state: IdempotencyState;
  /** sha256 of the canonical request — a different one under the same key is a conflict. */
  requestHash: string;
  result?: T;
  failure?: { messageTr: string; retryable: boolean };
  createdAt: Date;
  updatedAt: Date;
}

export interface IdempotencyStore<T> {
  /**
   * Atomically claims `key`. Returns the EXISTING record when there is one, otherwise
   * creates an `in_flight` record and returns undefined. Must be a single statement
   * (`INSERT … ON CONFLICT DO NOTHING RETURNING`) or the protocol is decorative.
   */
  claim(key: string, requestHash: string): Promise<IdempotencyRecord<T> | undefined>;
  succeed(key: string, result: T): Promise<void>;
  fail(key: string, failure: { messageTr: string; retryable: boolean }): Promise<void>;
  get(key: string): Promise<IdempotencyRecord<T> | undefined>;
}

export class InMemoryIdempotencyStore<T> implements IdempotencyStore<T> {
  private readonly records = new Map<string, IdempotencyRecord<T>>();

  async claim(key: string, requestHash: string): Promise<IdempotencyRecord<T> | undefined> {
    const existing = this.records.get(key);
    if (existing) return existing;
    const now = new Date();
    this.records.set(key, { key, state: 'in_flight', requestHash, createdAt: now, updatedAt: now });
    return undefined;
  }

  async succeed(key: string, result: T): Promise<void> {
    const record = this.records.get(key);
    if (!record) return;
    this.records.set(key, { ...record, state: 'succeeded', result, updatedAt: new Date() });
  }

  async fail(key: string, failure: { messageTr: string; retryable: boolean }): Promise<void> {
    const record = this.records.get(key);
    if (!record) return;
    // A retryable failure releases the key so the next attempt can claim it again; a
    // permanent failure keeps it, so the same request cannot be replayed forever.
    if (failure.retryable) {
      this.records.delete(key);
      return;
    }
    this.records.set(key, { ...record, state: 'failed', failure, updatedAt: new Date() });
  }

  async get(key: string): Promise<IdempotencyRecord<T> | undefined> {
    return this.records.get(key);
  }
}

export class PaymentIdempotencyConflictError extends Error {
  readonly messageTr =
    'Bu sipariş için farklı tutarlı bir ödeme isteği görüldü. Güvenlik için işlem durduruldu; ' +
    'sipariş ekranını yenileyip yeniden deneyin.';

  constructor(readonly key: string) {
    super(`idempotency key ${key} reused with a different request`);
    this.name = 'PaymentIdempotencyConflictError';
  }
}

export class PaymentInFlightError extends Error {
  readonly messageTr = 'Ödemeniz zaten işleniyor. Lütfen bu ekranı kapatmayın.';

  constructor(readonly key: string) {
    super(`payment ${key} is already in flight`);
    this.name = 'PaymentInFlightError';
  }
}

/**
 * Deterministic key. The amount is INSIDE the key on purpose: changing the basket produces a
 * different key (a genuinely new payment) instead of silently reusing the old one.
 */
export function paymentIdempotencyKey(input: {
  orderId: string;
  amountKurus: number;
  installment: number;
  /** Bumped by the API when the parent deliberately restarts a failed payment. */
  attempt?: number;
}): string {
  const canonical = [
    input.orderId,
    String(input.amountKurus),
    String(input.installment),
    String(input.attempt ?? 1),
  ].join('|');
  return `pay_${createHash('sha256').update(canonical).digest('hex').slice(0, 32)}`;
}

/** Canonical hash of a request payload; order-independent over object keys. */
export function requestHash(payload: unknown): string {
  return createHash('sha256').update(stableStringify(payload)).digest('hex');
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`);
  return `{${entries.join(',')}}`;
}

/**
 * Runs `operation` at most once for `key`.
 *
 * - existing `succeeded` record → returns the stored result, does NOT call the vendor;
 * - existing `in_flight` record → throws `PaymentInFlightError` (the caller shows "işleniyor");
 * - existing record with a different request → `PaymentIdempotencyConflictError`;
 * - fresh key → claims, runs, stores the outcome.
 */
export async function runIdempotent<T>(
  store: IdempotencyStore<T>,
  key: string,
  payload: unknown,
  operation: () => Promise<T>,
): Promise<T> {
  const hash = requestHash(payload);
  const existing = await store.claim(key, hash);

  if (existing) {
    if (existing.requestHash !== hash) throw new PaymentIdempotencyConflictError(key);
    if (existing.state === 'succeeded' && existing.result !== undefined) return existing.result;
    if (existing.state === 'in_flight') throw new PaymentInFlightError(key);
    // `failed` and permanent: replaying it would just fail again with the same message.
    throw new Error(existing.failure?.messageTr ?? 'Ödeme daha önce başarısız oldu.');
  }

  try {
    const result = await operation();
    await store.succeed(key, result);
    return result;
  } catch (error) {
    const retryable = isRetryable(error);
    await store.fail(key, {
      messageTr:
        error instanceof Error && 'messageTr' in error
          ? String((error as { messageTr: unknown }).messageTr)
          : 'Ödeme tamamlanamadı.',
      retryable,
    });
    throw error;
  }
}

function isRetryable(error: unknown): boolean {
  if (error && typeof error === 'object' && 'retryable' in error) {
    return Boolean((error as { retryable: unknown }).retryable);
  }
  return false;
}
