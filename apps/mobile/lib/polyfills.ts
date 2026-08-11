/**
 * Guarded polyfills for Hermes.
 *
 * `@kendihikayem/mock` (store.ts, handlers.ts) clones fixture objects with
 * `structuredClone`. Hermes has been slow to ship it, and the mock only ever
 * clones JSON-safe fixture data, so a JSON round-trip is a faithful stand-in.
 * The guard means we never shadow a native implementation when one exists.
 *
 * Import this module ONCE, before anything that may touch the mock server.
 */

type GlobalWithClone = typeof globalThis & {
  structuredClone?: <T>(value: T) => T;
};

const g = globalThis as GlobalWithClone;

if (typeof g.structuredClone !== 'function') {
  g.structuredClone = <T>(value: T): T => {
    if (value === undefined) return value;
    return JSON.parse(JSON.stringify(value)) as T;
  };
}

export {};
