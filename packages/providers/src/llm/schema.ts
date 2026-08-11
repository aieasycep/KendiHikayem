/**
 * llm/schema.ts — one schema, two consumers.
 *
 * The story pipeline needs the SAME shape twice: as a JSON Schema the model is constrained
 * by, and as a zod schema the response is validated against. Writing both by hand
 * guarantees they drift, and the drift shows up as "the model returned exactly what we
 * asked for and we rejected it".
 *
 * So the zod schema is the source and the JSON Schema is derived. The converter covers only
 * the constructs the prompts actually use and THROWS on anything else — a silent fallback
 * to `{}` would ship an unconstrained model call that costs real money.
 *
 * Three vendor rules are baked in on purpose:
 *
 *   1. `additionalProperties: false` + a complete `required` list on every object. Both
 *      Anthropic's structured outputs and OpenAI's `strict: true` demand it, and it is what
 *      makes "the model omitted a field" impossible rather than merely unlikely.
 *   2. NO value constraints on the wire. `minLength`, `maxLength`, `minimum`, `minItems`
 *      and friends are documented as NOT enforced by the structured-output engines; the
 *      strict dialects reject the request outright rather than ignoring them. Length and
 *      range rules therefore live in two places that do work: the zod schema (which
 *      validates the response) and the field `description` (which the model actually
 *      reads).
 *   3. `propertyOrdering` only in the `gemini` dialect. Gemini sorts properties
 *      alphabetically otherwise, which makes it describe a page's illustration before
 *      writing the page (docs/research/03-story.md §2). Anthropic and OpenAI preserve
 *      declaration order and reject unknown keywords, so it must not be sent there.
 */

import { z } from 'zod';

export interface JsonSchema {
  type?: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean';
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
  /** Gemini dialect only — see rule 3 above. */
  propertyOrdering?: string[];
  items?: JsonSchema;
  enum?: string[];
  const?: string | number | boolean;
}

/** Which vendor's structured-output engine the schema is going to. */
export type SchemaDialect = 'strict' | 'gemini';

export interface ToJsonSchemaOptions {
  /** Default `strict`: Anthropic + OpenAI. `gemini` adds `propertyOrdering`. */
  dialect?: SchemaDialect;
}

export class UnsupportedSchemaError extends Error {
  constructor(typeName: string, path: string) {
    super(`zod → JSON Schema: unsupported node ${typeName || 'unknown'} at ${path || '(root)'}`);
    this.name = 'UnsupportedSchemaError';
  }
}

/** Converts a zod schema into the JSON Schema dialect the target vendor accepts. */
export function toJsonSchema(
  schema: z.ZodTypeAny,
  options: ToJsonSchemaOptions = {},
  path = '',
): JsonSchema {
  const dialect = options.dialect ?? 'strict';
  const def = schema._def as { typeName?: string } & Record<string, unknown>;
  const typeName = def.typeName ?? '';
  const describe = (out: JsonSchema): JsonSchema =>
    schema.description === undefined ? out : { ...out, description: schema.description };

  switch (typeName) {
    case 'ZodObject': {
      const shape = (schema as z.ZodObject<z.ZodRawShape>).shape;
      const properties: Record<string, JsonSchema> = {};
      const required: string[] = [];
      // Declaration order, deliberately: it is the generation order (see file header).
      for (const key of Object.keys(shape)) {
        const child = shape[key] as z.ZodTypeAny;
        properties[key] = toJsonSchema(unwrap(child), options, `${path}.${key}`);
        required.push(key);
      }
      return describe({
        type: 'object',
        properties,
        required,
        additionalProperties: false,
        ...(dialect === 'gemini' ? { propertyOrdering: [...required] } : {}),
      });
    }

    case 'ZodArray':
      return describe({
        type: 'array',
        items: toJsonSchema((schema as z.ZodArray<z.ZodTypeAny>).element, options, `${path}[]`),
      });

    case 'ZodString':
      return describe({ type: 'string' });

    case 'ZodNumber': {
      const checks = (def['checks'] ?? []) as Array<{ kind: string }>;
      return describe({ type: checks.some((c) => c.kind === 'int') ? 'integer' : 'number' });
    }

    case 'ZodBoolean':
      return describe({ type: 'boolean' });

    case 'ZodEnum':
      return describe({ type: 'string', enum: [...((def['values'] ?? []) as string[])] });

    case 'ZodLiteral': {
      const value = def['value'];
      if (typeof value === 'string') return describe({ type: 'string', const: value });
      if (typeof value === 'number') return describe({ type: 'number', const: value });
      if (typeof value === 'boolean') return describe({ type: 'boolean', const: value });
      throw new UnsupportedSchemaError('ZodLiteral(non-primitive)', path);
    }

    case 'ZodOptional':
    case 'ZodNullable':
    case 'ZodDefault':
      return toJsonSchema(unwrap(schema), options, path);

    default:
      throw new UnsupportedSchemaError(typeName, path);
  }
}

/**
 * Unwraps optional/nullable/default. Structured output has no concept of "sometimes
 * present": every field is required, and the model is told in the description what to put
 * there when it has nothing. An optional field in a strict schema is a field the model
 * omits whenever it feels like it — and then the parse fails on a technicality.
 */
function unwrap(schema: z.ZodTypeAny): z.ZodTypeAny {
  const def = schema._def as { typeName?: string; innerType?: z.ZodTypeAny };
  if (
    def.typeName === 'ZodOptional' ||
    def.typeName === 'ZodNullable' ||
    def.typeName === 'ZodDefault'
  ) {
    return unwrap(def.innerType as z.ZodTypeAny);
  }
  return schema;
}

/**
 * Human-readable zod issues for the repair turn. The model is handed exactly this text, so
 * it names paths ("sayfalar.3.metin") instead of receiving a serialised zod error object.
 */
export function describeIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 12)
    .map((issue) => `- ${issue.path.join('.') || '(kök)'}: ${issue.message}`)
    .join('\n');
}
