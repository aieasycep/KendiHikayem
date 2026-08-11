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
 * Layering, deliberately: the REPAIR loop runs on ONE adapter, and the ROUTER decides which
 * adapter. A repair is "you answered in the wrong shape, try again"; a failover is "this
 * vendor is down". Nesting them the other way round would re-ask a healthy vendor's
 * question of a second vendor that never saw the first answer.
 */

import type { z } from 'zod';

import type { LlmAdapter, LlmCompleteInput, LlmMessage, LlmPurpose } from '../core/adapters';
import type { AdapterResult, ProviderCallContext, ProviderUsage } from '../core/types';
import type { ProviderRouter } from '../core/router';
import { type SchemaDialect, describeIssues, toJsonSchema } from './schema';
import { SchemaValidationError, type StructuredLlmInput } from './types';

export interface StructuredRequest<T> {
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

export interface StructuredValue<T> {
  value: T;
  /** The raw text, kept for the audit trail and for `content_cache`. */
  raw: string;
  model: string;
  /** How many model calls this took, repairs included. */
  attempts: number;
  tokens: { input: number; output: number; cachedInput: number };
}

/**
 * Runs the schema-constrained call (plus repairs) against ONE adapter and returns the
 * validated value together with the usage of EVERY attempt — so a story that needed two
 * repairs shows two extra priced rows in `provider_usage` instead of hiding them.
 *
 * Shaped as an `AdapterResult` so it drops straight into `runStep`'s `invoke`.
 */
export async function completeStructuredOn<T>(
  adapter: LlmAdapter,
  request: StructuredRequest<T>,
  ctx: ProviderCallContext,
): Promise<AdapterResult<StructuredValue<T>>> {
  const jsonSchema = toJsonSchema(request.schema as unknown as z.ZodTypeAny, {
    ...(request.dialect ? { dialect: request.dialect } : {}),
  });
  const maxAttempts = 1 + (request.repairAttempts ?? 0);

  const messages: LlmMessage[] = [...request.messages];
  const usage: ProviderUsage[] = [];
  const tokens = { input: 0, output: 0, cachedInput: 0 };
  let lastIssues = '';
  let lastRaw = '';

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const input: StructuredLlmInput = {
      purpose: request.purpose,
      messages,
      maxOutputTokens: request.maxOutputTokens,
      responseFormat: 'json',
      jsonSchema,
      ...(request.schemaName ? { schemaName: request.schemaName } : {}),
      ...(request.effort ? { effort: request.effort } : {}),
      ...(request.batch !== undefined ? { batch: request.batch } : {}),
    };

    const result = await adapter.complete(input, ctx);
    usage.push(...result.usage);
    tokens.input += result.value.tokens.input;
    tokens.output += result.value.tokens.output;
    tokens.cachedInput += result.value.tokens.cachedInput;
    lastRaw = result.value.text;

    const parsed = parseJson(lastRaw);
    if (parsed.ok) {
      const validated = request.schema.safeParse(parsed.value);
      if (validated.success) {
        return {
          value: {
            value: validated.data,
            raw: lastRaw,
            model: result.value.model,
            attempts: attempt,
            tokens: { ...tokens },
          },
          usage,
        };
      }
      lastIssues = describeIssues(validated.error);
    } else {
      lastIssues = `- (kök): geçerli JSON değil (${parsed.error})`;
    }

    if (attempt === maxAttempts) break;

    // The repair turn quotes the model's own output back at it, truncated: resending 7k
    // tokens of broken story would double the input bill of the retry.
    messages.push({ role: 'assistant', content: lastRaw.slice(0, 4_000) });
    messages.push({ role: 'user', content: repairPromptTr(lastIssues, result.value.finishReason) });
  }

  throw new SchemaValidationError({ attempts: maxAttempts, issues: lastIssues, rawText: lastRaw });
}

/**
 * Router-level convenience for callers outside the job harness. Inside a job, prefer
 * `runStep({ invoke: (adapter, ctx) => completeStructuredOn(adapter, …) })` so the step
 * bookkeeping and the cost ledger stay on the harness's path.
 */
export async function completeStructured<T>(
  router: ProviderRouter<LlmAdapter>,
  request: StructuredRequest<T>,
  ctx: ProviderCallContext,
): Promise<StructuredValue<T> & { provider: string }> {
  const routed = await router.execute('llm.complete', ctx, (adapter) =>
    completeStructuredOn(adapter, request, ctx),
  );
  return { ...routed.value, provider: routed.provider };
}

/**
 * The repair instruction is Turkish because the whole system prompt is Turkish, and mixing
 * languages mid-conversation degrades the register of what comes back.
 */
function repairPromptTr(issues: string, finishReason: string): string {
  const truncated =
    finishReason === 'length'
      ? "Yanıtın uzunluk sınırında kesildi; bu kez daha kısa yaz ve JSON'u mutlaka kapat.\n"
      : '';
  return (
    `${truncated}Önceki yanıtın şemaya uymadı. Sorunlar:\n${issues}\n\n` +
    'Yalnızca düzeltilmiş JSON nesnesini döndür. Açıklama, özür veya kod bloğu işareti ekleme.'
  );
}

type JsonParse = { ok: true; value: unknown } | { ok: false; error: string };

/**
 * Tolerant JSON extraction. Structured output should return a bare object, but a model that
 * wraps it in a ```json fence or writes a sentence first has still done the work — throwing
 * that away and paying for a retry would be a self-inflicted cost.
 */
export function parseJson(text: string): JsonParse {
  const trimmed = text.trim();
  const candidates = [trimmed, stripFence(trimmed), sliceOutermostObject(trimmed)];

  for (const candidate of candidates) {
    if (candidate === undefined || candidate === '') continue;
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
