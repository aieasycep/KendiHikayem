/**
 * The whole schema, in one namespace.
 *
 * Module order below follows the dependency order of docs/SPEC-DATA-MODEL.md §4, not the
 * alphabet: `assets` must exist before anything that stores a binary, and `legal_documents`
 * before anything that must prove what a user agreed to.
 *
 * Three foreign keys are genuinely circular and are declared with a lazy
 * `references((): AnyPgColumn => …)` so the ES module graph can still be evaluated:
 *   consents.child_id            → children.id
 *   children.default_character_id → story_characters.id
 *   jobs.order_id                → orders.id
 */
export * from './types.ts';

export * from './identity.ts';
export * from './assets.ts';
export * from './consents.ts';
export * from './children.ts';
export * from './catalog.ts';
export * from './voice.ts';
export * from './stories.ts';
export * from './audio.ts';
export * from './jobs.ts';
export * from './billing.ts';
export * from './orders.ts';
export * from './ops.ts';
export * from './audit.ts';
