/**
 * @kendihikayem/config — the ONLY place in the repo that reads `process.env`.
 *
 * Boundary rule (docs/SPEC.md §3): client apps (apps/mobile, apps/web, apps/ops) must NOT
 * import this package. Client-side configuration travels through `EXPO_PUBLIC_*` /
 * `NEXT_PUBLIC_*` variables, which are inlined into the bundle and therefore must never
 * touch the secret-bearing schema below.
 */
export * from './env';
export * from './redaction';
