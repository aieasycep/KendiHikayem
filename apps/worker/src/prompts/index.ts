/**
 * prompts/ — the versioned prompt pack (SPEC §3: "system prompt'lar, rubrikler,
 * versiyonlu, review'lanır").
 *
 * Everything a model is ever told lives here and nowhere else, for two reasons: a prompt
 * scattered across processors cannot be reviewed, and a prompt that is not versioned cannot
 * be cached safely (see version.ts).
 */

export * from './version';
export * from './age-rules';
export * from './system';
export * from './outline';
export * from './fill';
export * from './judge';
