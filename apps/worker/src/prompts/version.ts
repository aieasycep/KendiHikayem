/**
 * prompts/version.ts — the prompt pack's version.
 *
 * Written to `stories.model_meta.promptVersion` and folded into the `content_cache` key.
 * Changing a prompt without bumping this would serve a parent a cached page produced by a
 * different set of rules than the one their book was generated under — which is exactly the
 * failure the cache key exists to prevent.
 *
 * Bump on any change to system.ts, age-rules.ts, or the schemas in outline.ts / fill.ts.
 */
export const PROMPT_VERSION = '2026-08-11.1';
