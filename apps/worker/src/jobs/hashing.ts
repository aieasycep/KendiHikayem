/**
 * jobs/hashing.ts — the identity functions the three idempotency levels are built on.
 *
 * Everything here must be STABLE ACROSS PROCESSES AND RESTARTS. A hash that changes when
 * an object's keys are inserted in a different order turns level-2 idempotency into a
 * coin flip, and a parent gets charged twice for one tap.
 */

import { createHash } from 'node:crypto';

/**
 * Canonical JSON: object keys sorted at every depth, `undefined` dropped, arrays kept in
 * order (array order is meaningful — page 1 then page 2). `JSON.stringify` alone is not
 * enough: it preserves insertion order, and two equal request bodies parsed from different
 * client versions can differ in key order.
 */
export function canonicalize(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

function canonicalValue(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return typeof value === 'number' && !Number.isFinite(value) ? String(value) : value;
  }
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value instanceof Date) return value.toISOString();

  const source = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) {
    if (source[key] === undefined) continue;
    out[key] = canonicalValue(source[key]);
  }
  return out;
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/**
 * Level-1 and level-2 request hash. Includes the endpoint so the same `Idempotency-Key`
 * replayed against a different route is a conflict rather than a silent no-op.
 */
export function requestHash(endpoint: string, body: unknown): string {
  return sha256Hex(`${endpoint}\n${canonicalize(body)}`);
}

/** Level-3 step input hash: unchanged input ⇒ reuse `job_steps.output`, do not rerun. */
export function stepInputHash(input: unknown): string {
  return sha256Hex(canonicalize(input));
}

/**
 * `content_cache.cache_key` — sha256(provider|model|op|params|prompt) exactly as
 * documented in packages/db/src/schema/jobs.ts. The largest single lever on unit cost, so
 * the key shape is fixed here and nowhere else.
 */
export function contentCacheKey(parts: {
  provider: string;
  model: string;
  operation: string;
  params: unknown;
  prompt: string;
}): string {
  return sha256Hex(
    [parts.provider, parts.model, parts.operation, canonicalize(parts.params), parts.prompt].join(
      '|',
    ),
  );
}

/* ── uuidv5 ────────────────────────────────────────────────────────────────── */

/** Fixed namespace for provider request ids. Any constant works; it must never change. */
export const PROVIDER_REQUEST_NAMESPACE = '9f1a7c9a-2b7d-5a2e-9c6f-3b1d8e4a7c05';

/**
 * RFC 4122 v5 (SHA-1, name-based). `job_steps.provider_request_id = uuidv5(step.id)`:
 * a retry of the same step sends the provider the same id, so a vendor that dedupes
 * server-side does not bill twice. Node ships no uuidv5, and pulling a dependency for
 * 20 lines of well-specified bit twiddling is not worth the supply-chain surface.
 */
export function uuidv5(name: string, namespace: string = PROVIDER_REQUEST_NAMESPACE): string {
  const namespaceBytes = parseUuid(namespace);
  const hash = createHash('sha1')
    .update(namespaceBytes)
    .update(Buffer.from(name, 'utf8'))
    .digest();

  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // RFC 4122 variant

  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

function parseUuid(uuid: string): Buffer {
  const hex = uuid.replace(/-/g, '');
  if (hex.length !== 32 || !/^[0-9a-f]{32}$/i.test(hex)) {
    throw new Error(`not a uuid: ${uuid}`);
  }
  return Buffer.from(hex, 'hex');
}

/** Stable, human-readable step keys. `job_steps UNIQUE(job_id, step_key)` depends on them. */
export const stepKeys = {
  llmOutline: () => 'llm:outline',
  llmFill: () => 'llm:fill',
  characterDna: (characterIndex: number) => `llm:character_dna:${pad(characterIndex)}`,
  illustrationPrompt: (pageNo: number) => `llm:illustration_prompt:${pad(pageNo)}`,
  moderation: (surface: string, index = 0) => `moderation:${surface}:${pad(index)}`,
  stylePlate: () => 'image:style_plate',
  characterSheet: (variant: number) => `image:character_sheet:${pad(variant)}`,
  imagePage: (pageNo: number) => `image:page:${pad(pageNo)}`,
  imageCover: () => 'image:cover',
  ttsChunk: (index: number) => `tts:chunk:${pad(index)}`,
  audioConcat: () => 'media:audio_concat',
  align: () => 'media:align',
  pdfInterior: () => 'pdf:interior',
  pdfCover: () => 'pdf:cover',
  printSubmit: () => 'print:submit',
  voiceCreate: () => 'voice:create',
  voiceDelete: () => 'voice:delete',
} as const;

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

/** Extracts the page number from an `image:page:NN` step key; null for other steps. */
export function pageNoFromStepKey(stepKey: string): number | null {
  const match = /^image:page:(\d+)$/u.exec(stepKey);
  return match ? Number.parseInt(match[1]!, 10) : null;
}
