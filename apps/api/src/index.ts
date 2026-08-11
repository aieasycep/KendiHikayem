/**
 * apps/api — Fastify + ts-rest HTTP layer.
 *
 * SCAFFOLD ONLY. Owners: A0 (bootstrap), A1–A6 (routes) — docs/SPEC.md §12.
 * The router is written as `satisfies Record<keyof Endpoints, Handler>` so that adding an
 * endpoint to packages/contract breaks the build here until it is implemented.
 */
export const SERVICE_NAME = 'kendihikayem-api' as const;
