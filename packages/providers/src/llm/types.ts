/**
 * llm/types.ts — the vocabulary the LLM adapters add on top of `core/adapters.ts`.
 *
 * `LlmCompleteInput` is A2's frozen interface and stays untouched. Structured output needs
 * one more thing than it carries — the JSON Schema the response must match — so it is
 * passed as an optional extra property on the same object: TypeScript's structural typing
 * lets a `StructuredLlmInput` flow through every `LlmAdapter.complete` signature unchanged,
 * and an adapter that does not understand the field simply ignores it.
 */

import type { LlmCompleteInput } from '../core/adapters';
import type { JsonSchema } from './schema';

/**
 * Reasoning effort. `none` means OMIT the parameter, which is not the same as `low`:
 * cheap-tier models reject an effort hint with a 400 rather than downgrading it.
 */
export type LlmEffort = 'none' | 'low' | 'medium' | 'high';

/**
 * `adaptive` is the only thinking mode current flagship models accept; the older
 * fixed-token-budget form is rejected by them. `off` sends no thinking field at all.
 */
export type LlmThinkingMode = 'off' | 'adaptive';

/** Per-stage request shaping, resolved from `packages/config` at boot. */
export interface PurposeProfile {
  thinking: LlmThinkingMode;
  effort: LlmEffort;
}

/** `LlmCompleteInput` plus the schema the vendor should constrain the response to. */
export interface StructuredLlmInput extends LlmCompleteInput {
  jsonSchema?: JsonSchema;
  /** Names the schema for vendors that require one (OpenAI). Defaults to the purpose. */
  schemaName?: string;
}

/** Reads the optional schema off an input that may or may not be a `StructuredLlmInput`. */
export function jsonSchemaOf(input: LlmCompleteInput): JsonSchema | undefined {
  const candidate = (input as StructuredLlmInput).jsonSchema;
  return candidate && typeof candidate === 'object' ? candidate : undefined;
}

export function schemaNameOf(input: LlmCompleteInput): string {
  return (input as StructuredLlmInput).schemaName ?? input.purpose;
}

/**
 * The model answered, but not in the shape we asked for, and the repair turns were used up.
 * Distinct from `ProviderError`: the provider did its job, the CONTENT is unusable — the
 * caller regenerates or refunds rather than failing over to a second vendor.
 */
export class SchemaValidationError extends Error {
  readonly attempts: number;
  readonly issues: string;
  readonly rawText: string;

  constructor(init: { attempts: number; issues: string; rawText: string }) {
    super(`model output failed schema validation after ${init.attempts} attempt(s)`);
    this.name = 'SchemaValidationError';
    this.attempts = init.attempts;
    this.issues = init.issues;
    // Truncated: the raw body can be 7k tokens of story text and this lands in a log.
    this.rawText = init.rawText.slice(0, 2_000);
  }
}
