/**
 * @kendihikayem/safety — the six-layer content defence (SPEC §10.4) and the Turkish
 * quality gate that is the product's only real differentiator (SPEC §14 R2).
 *
 *   K1  sanitize.ts        deterministic input validation, before any model
 *   K2  (providers)        vendor moderation on parent input — free, Turkish-proven
 *   K3  spotlight.ts       parent input travels as DATA, never as instructions
 *   K4a output-audit.ts    deterministic output audit: canary, denylist, sentinel
 *   K4b (providers)        vendor moderation on the generated text
 *   K4c rubric.ts          age-band rubric, graded by a cheap judge model
 *   K5  (A4)               illustration-prompt audit — a separate attack surface
 *   K6  (contract)         the two parent approval gates
 *
 * Everything here is pure and synchronous: no network, no database, no clock. That is what
 * makes the whole gate testable with plain strings — see the tests beside these files.
 */

export * from './types';
export * from './messages.tr';
export * from './sanitize';
export * from './injection';
export * from './spotlight';
export * from './banlists.tr';
export * from './rubric';
export * from './output-audit';
export * from './quality/index';
