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
export * from './types';

export * from './identity';
export * from './assets';
export * from './consents';
export * from './children';
export * from './catalog';
export * from './voice';
export * from './stories';
export * from './audio';
export * from './jobs';
export * from './billing';
export * from './orders';
export * from './ops';
export * from './audit';
