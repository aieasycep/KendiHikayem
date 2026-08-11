/**
 * image/gemini/adapter.ts — the real illustration adapter.
 *
 * ⚠️ NEVER EXERCISED AGAINST THE LIVE VENDOR. Provider APIs are unreachable in this
 * environment and no key exists. What IS proven: the request body this builds, the
 * response shapes it parses (from recorded fixtures in `../fixtures/`), the HTTP-status →
 * `ProviderErrorKind` mapping, the timeout path, the reference ordering and the cost row.
 * The unproven part is the one only a key can prove: that the vendor accepts this body and
 * returns those shapes today.
 *
 * WHAT TO DO WHEN THE KEY ARRIVES (the whole checklist):
 *   1. `GOOGLE_GENAI_API_KEY=…` and `API_MODE=live` in the environment. Nothing else.
 *   2. Run `pnpm --filter @kendihikayem/providers test` — fixture tests must still pass.
 *   3. Render ONE style plate and read it. If the envelope changed, `protocol.ts` is the
 *      only file that moves; the adapter, the QA gate and the worker do not.
 *
 * No vendor SDK on purpose: `fetch` is in the runtime, the surface used here is one POST,
 * and an SDK we cannot install, run or pin is a dependency we could not have tested either.
 * `packages/providers` is the sanctioned place for an SDK if a later need justifies one
 * (SPEC §3 rule 6) — this is a deliberate "not yet", not an oversight.
 */

import type {
  ImageAdapter,
  ImageGenerateInput,
  ImageGenerateOutput,
  ImageReference,
} from '../../core/adapters';
import type { AdapterResult, ProviderCallContext, ProviderUsage } from '../../core/types';
import { ProviderError } from '../../core/errors';
import { DEFAULT_PRICE_BOOK, priceImageCall, roundUsd, type PriceBook } from '../../core/pricing';
import { assertPhotoFreeReferences } from '../prompt/character-dna';
import type { ImageReferenceResolver } from '../references';
import { mapGeminiHttpError, mapGeminiTransportError } from './errors';
import {
  NOMINAL_EDGE_PX,
  buildGenerateRequest,
  parseGenerateResponse,
  readImageDimensions,
  type GeminiErrorEnvelope,
  type ResolvedReferenceImage,
} from './protocol';

/** Minimal `fetch` shape, so tests inject a stub without a DOM lib dependency. */
export type ImageFetchLike = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal?: AbortSignal;
  },
) => Promise<{
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}>;

export interface GeminiImageAdapterConfig {
  /** From `IMAGE_MODEL_PRIMARY` / `IMAGE_MODEL_FALLBACK`. Never a literal in code. */
  model: string;
  /** From `GOOGLE_GENAI_API_KEY`. Absent = the adapter refuses politely, see `generate`. */
  apiKey?: string | undefined;
  /** From `GOOGLE_GENAI_BASE_URL`. */
  baseUrl: string;
  /** From `GOOGLE_GENAI_API_VERSION`. */
  apiVersion: string;
  /** From `IMAGE_REQUEST_TIMEOUT_MS`. */
  timeoutMs: number;
  /** Turns `assets.id` into bytes. Injected so this package never touches S3 or the db. */
  references: ImageReferenceResolver;
  priceBook?: PriceBook;
  fetchImpl?: ImageFetchLike;
  /** Injected in tests. */
  now?: () => number;
}

/**
 * SHA-256 of the produced bytes. Part of the `content_cache` key and the QA audit trail —
 * two identical renders must be provably identical.
 */
async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(bytes).digest('hex');
}

export class GeminiImageAdapter implements ImageAdapter {
  readonly provider = 'google' as const;
  readonly kind = 'image' as const;

  private readonly config: GeminiImageAdapterConfig;
  private readonly priceBook: PriceBook;
  private readonly fetchImpl: ImageFetchLike;

  constructor(config: GeminiImageAdapterConfig) {
    this.config = config;
    this.priceBook = config.priceBook ?? DEFAULT_PRICE_BOOK;
    this.fetchImpl = config.fetchImpl ?? (globalThis.fetch as unknown as ImageFetchLike);
  }

  /** `{base}/{version}/models/{model}:generateContent` — the model id is a value. */
  get endpoint(): string {
    const base = this.config.baseUrl.replace(/\/+$/u, '');
    return `${base}/${this.config.apiVersion}/models/${encodeURIComponent(this.config.model)}:generateContent`;
  }

  /**
   * Liveness probe for the half-open circuit. Deliberately NOT a generation call: probing
   * a broken provider must not cost $0.067 a try.
   */
  async health(): Promise<{ ok: boolean; latencyMs: number }> {
    if (!this.config.apiKey) return { ok: false, latencyMs: 0 };
    const startedAt = Date.now();
    try {
      const base = this.config.baseUrl.replace(/\/+$/u, '');
      const response = await this.fetchImpl(
        `${base}/${this.config.apiVersion}/models/${encodeURIComponent(this.config.model)}`,
        { method: 'GET', headers: this.headers(), body: '' },
      );
      return { ok: response.ok, latencyMs: Date.now() - startedAt };
    } catch {
      return { ok: false, latencyMs: Date.now() - startedAt };
    }
  }

  async generate(
    input: ImageGenerateInput,
    ctx: ProviderCallContext,
  ): Promise<AdapterResult<ImageGenerateOutput>> {
    /* ── Guards that must fire before a single byte goes out ──────────────── */

    if (input.safety.blockLevel === 'BLOCK_NONE') {
      // Not configurable. A children's product does not ship an off switch for the
      // safety filter, and the vendor's default is off (SPEC §8.2 step 5).
      throw new ProviderError({
        kind: 'invalid_request',
        provider: this.provider,
        operation: 'image.generate',
        detail: 'BLOCK_NONE is not permitted for a children product',
      });
    }

    // The photo ban, one call before the network call.
    assertPhotoFreeReferences(input.references);

    if (!this.config.apiKey) {
      // Healthy, specific refusal rather than a crash or a 401 round trip. `auth` is
      // non-retryable, so the router fails over to the next adapter immediately.
      throw new ProviderError({
        kind: 'auth',
        provider: this.provider,
        operation: 'image.generate',
        detail:
          'GOOGLE_GENAI_API_KEY is not set. Set it and API_MODE=live, or set ' +
          'IMAGE_PROVIDER_PRIMARY=fake to run on the deterministic double.',
      });
    }

    const references = await this.resolveReferences(input.references);
    const body = JSON.stringify(buildGenerateRequest({ input, references }));

    /* ── The call ─────────────────────────────────────────────────────────── */

    const startedAt = Date.now();
    const { signal, cancel, timedOut } = withTimeout(this.config.timeoutMs, ctx.signal);

    let response: Awaited<ReturnType<ImageFetchLike>>;
    try {
      response = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: this.headers(ctx),
        body,
        signal,
      });
    } catch (error) {
      throw mapGeminiTransportError(error, {
        provider: this.provider,
        operation: 'image.generate',
        timedOut: timedOut(),
      });
    } finally {
      cancel();
    }

    const text = await response.text();

    if (!response.ok) {
      throw mapGeminiHttpError({
        provider: this.provider,
        operation: 'image.generate',
        httpStatus: response.status,
        ...(safeJson<GeminiErrorEnvelope>(text) ? { envelope: safeJson<GeminiErrorEnvelope>(text)! } : {}),
        rawBody: text.slice(0, 2000),
        retryAfterHeader: response.headers.get('retry-after'),
      });
    }

    const parsed = (() => {
      const json = safeJson<unknown>(text);
      if (json === undefined) {
        throw new ProviderError({
          kind: 'unavailable',
          provider: this.provider,
          operation: 'image.generate',
          detail: `200 response was not JSON: ${text.slice(0, 200)}`,
        });
      }
      try {
        return parseGenerateResponse(json);
      } catch (error) {
        // A 200 we cannot read is a vendor-side change. `unavailable` is retryable, which
        // is right: an envelope change is usually a rollout, and the next attempt may hit
        // an older instance. Repeated failures open the circuit and page an operator.
        throw ProviderError.from(error, {
          provider: this.provider,
          operation: 'image.generate',
          kind: 'unavailable',
        });
      }
    })();

    const latencyMs = Date.now() - startedAt;
    const model = parsed.modelVersion ?? this.config.model;

    /* ── Vendor refused ───────────────────────────────────────────────────── */

    if (!parsed.image) {
      // A block is NOT thrown: the caller sanitises the prompt and retries once, then
      // escalates to a human (SPEC §8.3). It is still billed if the vendor billed it —
      // usageMetadata decides, not our optimism.
      return {
        value: {
          image: { bytes: new Uint8Array(0), mimeType: 'application/octet-stream', width: 0, height: 0, sha256: '' },
          model,
          blockedReason: parsed.blockedReason ?? 'unknown',
        },
        usage: [
          this.usageRow({
            input,
            latencyMs,
            billed: (parsed.usage?.candidatesTokenCount ?? 0) > 0,
            model,
          }),
        ],
      };
    }

    /* ── Success ──────────────────────────────────────────────────────────── */

    const dimensions = readImageDimensions(parsed.image.bytes) ?? {
      width: NOMINAL_EDGE_PX[input.resolution],
      height: NOMINAL_EDGE_PX[input.resolution],
    };

    return {
      value: {
        image: {
          bytes: parsed.image.bytes,
          mimeType: parsed.image.mimeType,
          width: dimensions.width,
          height: dimensions.height,
          sha256: await sha256Hex(parsed.image.bytes),
        },
        model,
      },
      usage: [this.usageRow({ input, latencyMs, billed: true, model })],
    };
  }

  /* ── internals ──────────────────────────────────────────────────────────── */

  private headers(ctx?: ProviderCallContext): Record<string, string> {
    return {
      'content-type': 'application/json',
      'x-goog-api-key': this.config.apiKey ?? '',
      // Stable across retries (uuidv5 of the job step): a vendor that dedupes
      // server-side must not bill the same page twice.
      ...(ctx ? { 'x-goog-request-params': `request_id=${ctx.requestId}` } : {}),
    };
  }

  private async resolveReferences(
    references: readonly ImageReference[],
  ): Promise<ResolvedReferenceImage[]> {
    const resolved: ResolvedReferenceImage[] = [];
    for (const reference of references) {
      // Sequential on purpose: the ORDER of the parts is the consistency contract
      // (SPEC §8.1 ③), and `Promise.all` would only save milliseconds against a call
      // that takes tens of seconds.
      const bytes = await this.config.references.resolve(reference);
      resolved.push({ bytes: bytes.bytes, mimeType: bytes.mimeType, kind: reference.kind });
    }
    return resolved;
  }

  /**
   * The `provider_usage` row.
   *
   * ⚠️ HONEST PRICING. `batch: true` on the input asks for the vendor's 50% batch
   * discount; this adapter uses the interactive endpoint, so it does NOT claim one. The
   * ledger records what a synchronous call costs. When the batch endpoint is implemented,
   * the discount appears here and in the invoice at the same time — never before.
   */
  private usageRow(args: {
    input: ImageGenerateInput;
    latencyMs: number;
    billed: boolean;
    model: string;
  }): ProviderUsage {
    const costUsd = args.billed
      ? roundUsd(priceImageCall(this.priceBook, args.input.resolution, 1, false))
      : 0;
    return {
      provider: this.provider,
      model: args.model,
      operation: 'image.generate',
      billingUnit: 'image',
      billedUnits: args.billed ? 1 : 0,
      unitPriceUsd: costUsd,
      costUsd,
      cacheHit: false,
      latencyMs: args.latencyMs,
    };
  }
}

function safeJson<T>(text: string): T | undefined {
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
}

/**
 * Wall-clock budget for one call, composed with any caller-supplied abort signal.
 *
 * Hand-rolled rather than `AbortSignal.timeout()` composed with `AbortSignal.any()`
 * because the caller needs to know WHICH fired: an abort we caused reports as `timeout`
 * (retryable), an abort the caller caused must not be mislabelled as a vendor fault.
 */
function withTimeout(
  timeoutMs: number,
  external?: AbortSignal,
): { signal: AbortSignal; cancel: () => void; timedOut: () => boolean } {
  const controller = new AbortController();
  let fired = false;

  const timer = setTimeout(() => {
    fired = true;
    controller.abort();
  }, timeoutMs);
  // `unref` keeps a pending timer from holding the worker process open at shutdown.
  (timer as unknown as { unref?: () => void }).unref?.();

  const onExternalAbort = () => controller.abort();
  external?.addEventListener('abort', onExternalAbort, { once: true });

  return {
    signal: controller.signal,
    cancel: () => {
      clearTimeout(timer);
      external?.removeEventListener('abort', onExternalAbort);
    },
    timedOut: () => fired,
  };
}
