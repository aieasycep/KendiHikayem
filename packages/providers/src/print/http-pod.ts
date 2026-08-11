/**
 * print/http-pod.ts — one adapter for every print-on-demand API we might switch to.
 *
 * ⚠️ NOT TESTED AGAINST A LIVE PRINTER. There is no key and no account (SPEC §9: no Turkish
 * printer publishes an API yet). The adapter is complete and is exercised against RECORDED
 * fixtures (`fixtures/`), and it only becomes reachable when `API_MODE=live` and
 * `PRINT_ADAPTER` names an HTTP provider. Until then `manual_tr` is the live path.
 *
 * The shape below is the intersection of Cloudprinter, Gelato and Lulu: quote → order →
 * status → cancel, with a webhook that pushes status changes. Each vendor's wire format is
 * handled by a small `PodDialect`, so switching providers is a dialect, not an adapter.
 *
 * Two decisions that protect money:
 *   · The order `reference` is OUR order id, and a vendor that already has that reference
 *     must return the existing order — that is the idempotency key across a retry storm.
 *   · A quote in a currency other than TRY is REFUSED rather than converted. Silent FX in a
 *     checkout is how a 899 TL book gets charged as 899 EUR.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

import type {
  PrintAdapter,
  PrintQuoteInput,
  PrintQuoteOutput,
  PrintStatusOutput,
  PrintSubmitInput,
  PrintSubmitOutput,
} from '../core/adapters';
import type {
  AdapterResult,
  ProviderCallContext,
  ProviderName,
  ProviderOperation,
  ProviderUsage,
} from '../core/types';
import { ProviderError } from '../core/errors';

export type PodProvider = Extract<ProviderName, 'cloudprinter' | 'gelato' | 'lulu'>;

/** Canonical wire shapes; a dialect maps the vendor's JSON onto these. */
export interface PodQuoteResponse {
  unitPriceMinor: number;
  shippingMinor: number;
  currency: string;
  etaBusinessDays: number;
  quoteRef: string;
}

export interface PodOrderResponse {
  externalId: string;
  status: PrintStatusOutput['status'];
  trackingUrl?: string;
  carrier?: string;
  trackingNumber?: string;
  message?: string;
}

export interface PodDialect {
  provider: PodProvider;
  quotePath: string;
  ordersPath: string;
  orderPath(externalId: string): string;
  cancelPath(externalId: string): string;
  /** `Authorization` (or vendor-specific) headers. */
  authHeaders(apiKey: string): Record<string, string>;
  quoteBody(input: PrintQuoteInput, sku: string): unknown;
  submitBody(input: PrintSubmitInput, sku: string): unknown;
  parseQuote(payload: unknown): PodQuoteResponse;
  parseOrder(payload: unknown): PodOrderResponse;
  /** Vendor status string → our enum. Unknown values map to `queued`, never to `error`. */
  mapStatus(raw: string): PrintStatusOutput['status'];
  /** Vendor error payload → the code kept on `ProviderError.providerCode`. */
  errorCode?(payload: unknown, httpStatus: number): string | undefined;
}

export interface HttpPodOptions {
  dialect: PodDialect;
  baseUrl: string;
  apiKey: string;
  /** `book_formats.code` → the vendor's product/SKU id. */
  skuByFormat: Record<string, string>;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  /** Vendor webhook signing secret; enables `verifyWebhookSignature`. */
  webhookSecret?: string;
}

const usageRow = (
  provider: ProviderName,
  operation: ProviderOperation,
  latencyMs: number,
): ProviderUsage => ({
  provider,
  model: provider,
  operation,
  billingUnit: 'request',
  billedUnits: 1,
  // Print is billed on the supplier invoice, not per API call.
  unitPriceUsd: 0,
  costUsd: 0,
  cacheHit: false,
  latencyMs,
});

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

export class HttpPodPrintAdapter implements PrintAdapter {
  readonly provider: PodProvider;
  readonly kind = 'print' as const;

  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: HttpPodOptions) {
    this.provider = options.dialect.provider;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private sku(formatCode: string, operation: ProviderOperation): string {
    const sku = this.options.skuByFormat[formatCode];
    if (!sku) {
      throw new ProviderError({
        kind: 'invalid_request',
        provider: this.provider,
        operation,
        providerCode: 'unknown_format',
        detail: `no SKU mapped for format ${formatCode}`,
      });
    }
    return sku;
  }

  private async call(
    path: string,
    init: { method: 'GET' | 'POST'; body?: unknown },
    operation: ProviderOperation,
    ctx: ProviderCallContext,
  ): Promise<{ payload: unknown; latencyMs: number }> {
    const url = `${this.options.baseUrl.replace(/\/+$/, '')}${path}`;
    const controller = new AbortController();
    const timeoutMs = ctx.timeoutMs ?? this.options.timeoutMs ?? 20_000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    if (ctx.signal) ctx.signal.addEventListener('abort', () => controller.abort(), { once: true });

    const startedAt = Date.now();
    try {
      const response = await this.fetchImpl(url, {
        method: init.method,
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          // Stable across retries (uuidv5 of the job step) — a vendor that dedupes on it
          // cannot charge us twice for one submit.
          'idempotency-key': ctx.requestId,
          'x-correlation-id': ctx.correlationId,
          ...this.options.dialect.authHeaders(this.options.apiKey),
        },
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
        signal: controller.signal,
      });

      const latencyMs = Date.now() - startedAt;
      const text = await response.text();
      const payload: unknown = text.length > 0 ? safeJson(text) : {};

      if (!response.ok) {
        throw new ProviderError({
          kind: httpKind(response.status),
          provider: this.provider,
          operation,
          httpStatus: response.status,
          ...(this.options.dialect.errorCode?.(payload, response.status)
            ? { providerCode: this.options.dialect.errorCode(payload, response.status) as string }
            : {}),
          detail: `${response.status} ${text.slice(0, 400)}`,
          ...(response.headers.get('retry-after')
            ? { retryAfterMs: Number(response.headers.get('retry-after')) * 1000 }
            : {}),
        });
      }

      return { payload, latencyMs };
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      const aborted = error instanceof Error && error.name === 'AbortError';
      throw new ProviderError({
        kind: aborted ? 'timeout' : 'unavailable',
        provider: this.provider,
        operation,
        detail: error instanceof Error ? error.message : String(error),
        cause: error,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  async quote(
    input: PrintQuoteInput,
    ctx: ProviderCallContext,
  ): Promise<AdapterResult<PrintQuoteOutput>> {
    const sku = this.sku(input.formatCode, 'print.quote');
    const { payload, latencyMs } = await this.call(
      this.options.dialect.quotePath,
      { method: 'POST', body: this.options.dialect.quoteBody(input, sku) },
      'print.quote',
      ctx,
    );

    const quote = this.options.dialect.parseQuote(payload);
    if (quote.currency.toUpperCase() !== 'TRY') {
      // No silent FX in a checkout. Ever.
      throw new ProviderError({
        kind: 'invalid_request',
        provider: this.provider,
        operation: 'print.quote',
        providerCode: 'currency_mismatch',
        detail: `quote returned ${quote.currency}, expected TRY`,
      });
    }

    return {
      value: {
        unitPriceKurus: quote.unitPriceMinor,
        shippingKurus: quote.shippingMinor,
        totalKurus: quote.unitPriceMinor * input.quantity + quote.shippingMinor,
        etaBusinessDays: quote.etaBusinessDays,
        quoteRef: quote.quoteRef,
        provider: this.provider,
      },
      usage: [usageRow(this.provider, 'print.quote', latencyMs)],
    };
  }

  async submit(
    input: PrintSubmitInput,
    ctx: ProviderCallContext,
  ): Promise<AdapterResult<PrintSubmitOutput>> {
    const sku = this.sku(input.formatCode, 'print.submit');
    const { payload, latencyMs } = await this.call(
      this.options.dialect.ordersPath,
      { method: 'POST', body: this.options.dialect.submitBody(input, sku) },
      'print.submit',
      ctx,
    );

    const order = this.options.dialect.parseOrder(payload);
    return {
      value: {
        externalId: order.externalId,
        status: order.status === 'accepted' ? 'accepted' : 'submitted',
      },
      usage: [usageRow(this.provider, 'print.submit', latencyMs)],
    };
  }

  async status(
    externalId: string,
    ctx: ProviderCallContext,
  ): Promise<AdapterResult<PrintStatusOutput>> {
    const { payload, latencyMs } = await this.call(
      this.options.dialect.orderPath(externalId),
      { method: 'GET' },
      'print.status',
      ctx,
    );
    const order = this.options.dialect.parseOrder(payload);
    return {
      value: {
        externalId: order.externalId || externalId,
        status: order.status,
        ...(order.trackingUrl ? { trackingUrl: order.trackingUrl } : {}),
        ...(order.carrier ? { carrier: order.carrier } : {}),
        ...(order.message ? { message: order.message } : {}),
      },
      usage: [usageRow(this.provider, 'print.status', latencyMs)],
    };
  }

  async cancel(
    externalId: string,
    ctx: ProviderCallContext,
  ): Promise<AdapterResult<{ ok: boolean }>> {
    const { latencyMs } = await this.call(
      this.options.dialect.cancelPath(externalId),
      { method: 'POST' },
      'print.cancel',
      ctx,
    );
    return { value: { ok: true }, usage: [usageRow(this.provider, 'print.cancel', latencyMs)] };
  }

  /**
   * Webhook signature check. Constant-time, and it refuses when no secret is configured
   * rather than passing everything through — an unauthenticated status webhook can move an
   * order to `shipped` and stop a refund.
   */
  verifyWebhookSignature(rawBody: string, signature: string | undefined): boolean {
    const secret = this.options.webhookSecret;
    if (!secret || !signature) return false;
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    const provided = signature.replace(/^sha256=/, '');
    if (provided.length !== expected.length) return false;
    return timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(provided, 'utf8'));
  }

  /** Parses a webhook body into the same shape polling returns. */
  parseWebhook(payload: unknown): PrintStatusOutput {
    const order = this.options.dialect.parseOrder(payload);
    return {
      externalId: order.externalId,
      status: order.status,
      ...(order.trackingUrl ? { trackingUrl: order.trackingUrl } : {}),
      ...(order.carrier ? { carrier: order.carrier } : {}),
      ...(order.message ? { message: order.message } : {}),
    };
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function httpKind(status: number): ProviderError['kind'] {
  if (status === 401 || status === 403) return 'auth';
  if (status === 404) return 'not_found';
  if (status === 409 || status === 422 || status === 400) return 'invalid_request';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'unavailable';
  return 'unknown';
}

/* ── Cloudprinter-shaped dialect ───────────────────────────────────────────── */

const CLOUDPRINTER_STATUS: Record<string, PrintStatusOutput['status']> = {
  received: 'submitted',
  validated: 'accepted',
  accepted: 'accepted',
  inproduction: 'printing',
  in_production: 'printing',
  printing: 'printing',
  shipped: 'shipped',
  dispatched: 'shipped',
  cancelled: 'cancelled',
  canceled: 'cancelled',
  error: 'error',
  rejected: 'error',
};

/**
 * Cloudprinter is the first candidate with Turkish production (SPEC §9 partner list), so it
 * is the dialect that ships. Gelato and Lulu differ only in field names.
 */
export const cloudprinterDialect: PodDialect = {
  provider: 'cloudprinter',
  quotePath: '/api/v1/orders/quote',
  ordersPath: '/api/v1/orders/add',
  orderPath: (externalId) => `/api/v1/orders/${encodeURIComponent(externalId)}`,
  cancelPath: (externalId) => `/api/v1/orders/${encodeURIComponent(externalId)}/cancel`,
  authHeaders: (apiKey) => ({ authorization: `Bearer ${apiKey}` }),
  quoteBody: (input, sku) => ({
    products: [{ reference: sku, count: input.quantity }],
    destination: {
      country: input.destination.country,
      city: input.destination.city,
      ...(input.destination.postalCode ? { zip: input.destination.postalCode } : {}),
    },
    currency: 'TRY',
  }),
  submitBody: (input, sku) => ({
    // OUR order id: a retry with the same reference must return the same order.
    reference: input.orderId,
    currency: 'TRY',
    products: [
      {
        reference: sku,
        count: input.quantity,
        files: [
          { type: 'book_block', url: input.files.interiorPdfUrl },
          { type: 'cover', url: input.files.coverPdfUrl },
        ],
      },
    ],
    addresses: [
      {
        type: 'delivery',
        firstname: input.shipTo.fullName,
        street: [input.shipTo.line1, input.shipTo.line2].filter(Boolean).join(' '),
        city: input.shipTo.city,
        ...(input.shipTo.district ? { state: input.shipTo.district } : {}),
        ...(input.shipTo.postalCode ? { zip: input.shipTo.postalCode } : {}),
        country: input.shipTo.country,
        phone: input.shipTo.phone,
      },
    ],
  }),
  parseQuote: (payload) => {
    const root = asRecord(payload);
    const price = asRecord(root['price']);
    return {
      unitPriceMinor: Math.round(Number(price['product'] ?? 0) * 100),
      shippingMinor: Math.round(Number(price['shipping'] ?? 0) * 100),
      currency: String(price['currency'] ?? root['currency'] ?? 'TRY'),
      etaBusinessDays: Number(root['shipping_days'] ?? root['eta_business_days'] ?? 7),
      quoteRef: String(root['quote_reference'] ?? root['reference'] ?? ''),
    };
  },
  parseOrder: (payload) => {
    const root = asRecord(payload);
    const order = asRecord(root['order'] ?? root);
    const tracking = asRecord(order['tracking'] ?? root['tracking']);
    const rawStatus = String(order['status'] ?? root['status'] ?? 'received').toLowerCase();
    return {
      externalId: String(order['reference'] ?? order['id'] ?? root['reference'] ?? ''),
      status: CLOUDPRINTER_STATUS[rawStatus] ?? 'queued',
      ...(tracking['url'] ? { trackingUrl: String(tracking['url']) } : {}),
      ...(tracking['carrier'] ? { carrier: String(tracking['carrier']) } : {}),
      ...(tracking['number'] ? { trackingNumber: String(tracking['number']) } : {}),
      ...(order['message'] ? { message: String(order['message']) } : {}),
    };
  },
  mapStatus: (raw) => CLOUDPRINTER_STATUS[raw.toLowerCase()] ?? 'queued',
  errorCode: (payload) => {
    const root = asRecord(payload);
    const error = asRecord(root['error']);
    const code = error['code'] ?? root['code'] ?? root['error_code'];
    return code === undefined ? undefined : String(code);
  },
};
