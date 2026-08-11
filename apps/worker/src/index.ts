/**
 * apps/worker — long-running BullMQ processors and schedulers.
 *
 * Owner: A2 (flows, cost core, schedulers), A3–A6 (processor bodies) — docs/SPEC.md §12.
 *
 * `apps/api` imports from here: enqueueing a job, reserving budget and reading job state
 * are domain operations, and duplicating them in the HTTP layer is how the two drift until
 * one of them charges twice. The eslint `boundaries` policy permits app-server → app-server
 * exactly so this can be one implementation.
 */
export const SERVICE_NAME = 'kendihikayem-worker' as const;

export * from './queues';
export * from './runtime';
export * from './jobs/state-machine';
export * from './jobs/hashing';
export * from './jobs/repository';
export * from './jobs/events';
export * from './cost/reservation';
export * from './cost/ledger.pg';
export * from './cache/content-cache';
export * from './flows/story.flow';
export * from './flows/book.flow';
export * from './flows/audio.flow';
export * from './processors/run-step';
export * from './processors/index';
export * from './schedulers/index';
