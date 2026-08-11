/**
 * @kendihikayem/shared — Turkish language helpers used by every layer of the product.
 *
 * Client-safe on purpose: apps/mobile, apps/web and apps/ops are allowed to import this
 * package (docs/SPEC.md §3 boundary rule 1), so it must stay free of Node built-ins,
 * provider SDKs and secrets.
 */

export * from './turkish/alphabet';
export * from './turkish/inflect';
export * from './turkish/syllable';
export * from './turkish/readability';
export * from './turkish/name';
