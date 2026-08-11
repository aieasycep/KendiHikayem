/**
 * apps/api — Fastify + ts-rest HTTP layer.
 *
 * Owners: A2 (bootstrap, middleware, jobs/entitlements/estimates), A1–A6 (their routes) —
 * docs/SPEC.md §12. Every unimplemented contract route answers 501 naming its owner, so
 * the server boots complete from day one and each agent fills in one placeholder.
 */

export const SERVICE_NAME = 'kendihikayem-api' as const;

export * from './context';
export * from './errors';
export * from './server';
export * from './sse/hub';
export * from './middleware/auth';
export * from './middleware/idempotency';
export * from './middleware/rate-limit';
export * from './middleware/tracing';
export * from './routes/v1/status';
export * from './routes/v1/jobs';
export * from './routes/v1/entitlements';
export * from './routes/v1/estimates';
