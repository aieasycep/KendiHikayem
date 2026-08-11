/**
 * llm/structured.ts — "give me a validated object", not "give me some text".
 *
 * Two things happen here that a raw `complete()` call cannot do on its own:
 *
 *   · The zod schema is converted once and sent as the vendor's structured-output schema,
 *     so the model is CONSTRAINED rather than merely asked nicely.
 *   · When the answer still fails validation — a truncated response, a hallucinated field,
 *     a vendor that ignores the constraint — the validator's own complaint is handed back
 *     to the model as a repair turn. That is far cheaper than regenerating the story, and
 *     it is why `LLM_SCHEMA_REPAIR_ATTEMPTS` exists.
 *
 * Every attempt goes through `ProviderRouter`, so every attempt (including the repairs) is
 * retried, failed over and priced into `provider_usage`. There is no unpriced path.
 */

import type { z } from 'zod';

import type { LlmAdapter, LlmCompleteInput, LlmMessage, LlmPurpose } from '../core/adapters';
import type { ProviderCallContext } from '../core/types';
import type { ProviderRouter } from '../core/router';
import { type SchemaDialect, describeIssues, toJsonSchema } from './schema';
import { SchemaValidationError, type StructuredLlmInput } from './types';

export interface StructuredCompletionInput<T> {
  router: ProviderRouter<LlmAdapter>;
  ctx: ProviderCallContext;
  purpose: LlmPurpose;
  /** System messages first; mark the stable prefix `cacheable` (SPEC §6.2 rule 2). */
  messages: LlmMessage[];
  schema: z.ZodType<T>;
  schemaName?: string;
  maxOutputTokens: number;
  /** Repair turns after the first attempt. 0 = one shot. */
  repairAttempts?: number;
  dialect?: SchemaDialect;
  /** Overrides the adapter's stage default when a specific call needs more or less. */
  effort?: LlmCompleteInput['effort'];
  batch?: boolean;
}

export interface StructuredCompletionResult<T> {
  value: T;
  /** The raw text, kept for the audit trail and for `content_cache`. */
  raw: string;
  provider: string;
  model: string;
  attempts: number;
  tokens: { input: number; output: number; cachedInput: number };
}

export async function completeStructured<T>(
  input: StructuredCompletionInput<T>,
): Promise<StructuredCompletionResult<T>> {
  const jsonSchema = toJsonSchema(input.schema as unknown as z.ZodTypeAny, {
    ...(input.dialect ? { dialect: input.dialect } : {}),
  });
  const maxAttempts = 1 + (input.repairAttempts ?? 0);

  const messages: LlmMessage[] = [...input.messages];
  let lastIssues = '';
  let lastRaw = '';
  let tokens = { input: 0, output: 0, cachedInput: 0 };

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const request: StructuredLlmInput = {
      purpose: input.purpose,
      messages,
      maxOutputTokens: input.maxOutputTokens,
      responseFormat: 'json',
      jsonSchema,
      ...(input.schemaName ? { schemaName: input.schemaName } : {}),
      ...(input.effort ? { effort: input.effort } : {}),
      ...(input.batch !== undefined ? { batch: input.batch } : {}),
    };

    const routed = await input.router.execute('llm.complete', input.ctx, (adapter) =>
      adapter.complete(request, input.ctx),
    );

    lastRaw = routed.value.text;
    // Accumulated, not replaced: a repair turn's tokens were spent too.
    tokens = {
      input: tokens.input + routed.value.tokens.input,
      output: tokens.output + routed.value.tokens.output,
      cachedInput: tokens.cachedInput + routed.value.tokens.cachedInput,
    };

    const parsed = parseJson(lastRaw);
    if (parsed.ok) {
      const validated = input.schema.safeParse(parsed.value);
      if (validated.success) {
        return {
          value: validated.data,
          raw: lastRaw,
          provider: routed.provider,
          model: routed.value.model,
          attempts: attempt,
          tokens,
        };
      }
      lastIssues = describeIssues(validated.error);
    } else {
      lastIssues = `- (kök): geçerli JSON değil (${parsed.error})`;
    }

    if (attempt === maxAttempts) break;

    // The repair turn quotes the model's own output back at it. Truncated on purpose:
    // resending 7k tokens of broken story doubles the input bill of the retry.
    messages.push({ role: 'assistant', content: lastRaw.slice(0, 4_000) });
    messages.push({ role: 'user', content: repairPromptTr(lastIssues, routed.value.finishReason) });
  }

  throw new SchemaValidationError({ attempts: maxAttempts, issues: lastIssues, rawText: lastRaw });
}

/**
 * The repair instruction is Turkish because the whole system prompt is Turkish and mixing
 * languages mid-conversation measurably degrades the output register.
 */
function repairPromptTr(issues: string, finishReason: string): string {
  const truncated =
    finishReason === 'length'
      ? 'Yanıtın uzunluk sınırında kesildi; bu kez daha kısa yaz ve JSON\'u mutlaka kapat.\n'
      : '';
  return (
    `${truncated}Önceki yanıtın şemaya uymadı. Sorunlar:\n${issues}\n\n` +
    'Yalnızca düzeltilmiş JSON nesnesini döndür. Açıklama, özür veya kod bloğu işareti ekleme.'
  );
}

type JsonParse = { ok: true; value: unknown } | { ok: false; error: string };

/**
 * Tolerant JSON extraction. Structured output should return a bare object, but a model
 * that wraps it in a ```json fence or adds a sentence before it has still done the work —
 * throwing that away and paying for a retry would be a self-inflicted cost.
 */
export function parseJson(text: string): JsonParse {
  const trimmed = text.trim();
  const candidates = [trimmed, stripFence(trimmed), sliceOutermostObject(trimmed)];

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return { ok: true, value: JSON.parse(candidate) as unknown };
    } catch {
      continue;
    }
  }
  return { ok: false, error: trimmed === '' ? 'boş yanıt' : 'ayrıştırılamadı' };
}

function stripFence(text: string): string | undefined {
  const match = /^```(?:json)?\s*([\s\S]*?)\s*```$/u.exec(text);
  return match?.[1];
}

function sliceOutermostObject(text: string): string | undefined {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  return start >= 0 && end > start ? text.slice(start, end + 1) : undefined;
}
