/**
 * print/manual-tr.ts — the MVP printer: a human, an e-mail and an ops panel.
 *
 * SPEC §2/§9: there is no print shop in Turkey with a public API, so the MVP submits jobs
 * by generating a work order that an operator forwards to the partner, and status moves
 * when the operator (or the partner's reply) says it moved. ~10 orders a day is a person's
 * job, not a system's.
 *
 * What matters is that this is a REAL `PrintAdapter`, not a stub: the same interface the
 * Cloudprinter/Gelato/Lulu adapter implements. When a partner with an API appears, the only
 * change is `PRINT_ADAPTER=cloudprinter` — the worker, the order state machine and the
 * ops panel do not move at all.
 *
 * State lives behind `ManualPrintStore` so the adapter itself stays free of Postgres; the
 * worker passes a store backed by `print_jobs`, tests pass the in-memory one.
 */

import type {
  PrintAdapter,
  PrintQuoteInput,
  PrintQuoteOutput,
  PrintStatusOutput,
  PrintSubmitInput,
  PrintSubmitOutput,
} from '../core/adapters';
import type { AdapterResult, ProviderCallContext, ProviderOperation, ProviderUsage } from '../core/types';
import { ProviderError } from '../core/errors';
import { DEFAULT_PRICE_LIST, quotePrint, type PrintPriceRow } from './pricing';
import { renderWorkOrderTextTr, type WorkOrder } from './work-order';

export type ManualJobStatus = PrintStatusOutput['status'];

export interface ManualPrintJob {
  externalId: string;
  orderId: string;
  status: ManualJobStatus;
  workOrder: WorkOrder;
  workOrderTextTr: string;
  carrier?: string;
  trackingNo?: string;
  trackingUrl?: string;
  /** Operator note or partner reply, kept verbatim for the dispute trail. */
  message?: string;
  updatedAt: Date;
}

export interface ManualPrintStore {
  put(job: ManualPrintJob): Promise<void>;
  get(externalId: string): Promise<ManualPrintJob | undefined>;
  patch(
    externalId: string,
    patch: Partial<Pick<ManualPrintJob, 'status' | 'carrier' | 'trackingNo' | 'trackingUrl' | 'message'>>,
  ): Promise<ManualPrintJob | undefined>;
}

export class InMemoryManualPrintStore implements ManualPrintStore {
  private readonly jobs = new Map<string, ManualPrintJob>();

  async put(job: ManualPrintJob): Promise<void> {
    this.jobs.set(job.externalId, job);
  }

  async get(externalId: string): Promise<ManualPrintJob | undefined> {
    return this.jobs.get(externalId);
  }

  async patch(
    externalId: string,
    patch: Partial<ManualPrintJob>,
  ): Promise<ManualPrintJob | undefined> {
    const job = this.jobs.get(externalId);
    if (!job) return undefined;
    const next = { ...job, ...patch, updatedAt: new Date() };
    this.jobs.set(externalId, next);
    return next;
  }

  /** Test/ops helper: everything the operator queue would show. */
  list(): ManualPrintJob[] {
    return [...this.jobs.values()];
  }
}

/** Physical facts the work order needs and the adapter cannot know on its own. */
export interface ManualFormatSpec {
  titleTr: string;
  pageCount: number;
  trimMm: [number, number];
  bleedMm: number;
  paperTr: string;
  bindingTr: string;
}

export interface ManualTrOptions {
  store: ManualPrintStore;
  /** Physical spec per `book_formats.code`. */
  formats: Record<string, ManualFormatSpec>;
  /** Spine per order, computed by `packages/pdf` from the same numbers as the cover. */
  spineMmFor(input: { formatCode: string; pageCount: number }): number;
  priceList?: readonly PrintPriceRow[];
  colorProfileTr?: string;
  /** Notes printed on every work order (e.g. the physical-proof rule for the first orders). */
  standingNotesTr?: string[];
  now?: () => Date;
}

const freeUsage = (operation: ProviderOperation, latencyMs = 0): ProviderUsage => ({
  provider: 'manual_tr',
  model: 'manual_tr',
  operation,
  billingUnit: 'request',
  billedUnits: 1,
  // The print cost is a supplier invoice, not an API charge — it is booked on the order,
  // not in `provider_usage`, so this row stays at zero on purpose.
  unitPriceUsd: 0,
  costUsd: 0,
  cacheHit: false,
  latencyMs,
});

export class ManualTrPrintAdapter implements PrintAdapter {
  readonly provider = 'manual_tr' as const;
  readonly kind = 'print' as const;

  constructor(private readonly options: ManualTrOptions) {}

  async quote(
    input: PrintQuoteInput,
    _ctx: ProviderCallContext,
  ): Promise<AdapterResult<PrintQuoteOutput>> {
    const breakdown = quotePrint(
      { formatCode: input.formatCode, quantity: input.quantity, city: input.destination.city },
      this.options.priceList ?? DEFAULT_PRICE_LIST,
    );

    return {
      value: {
        unitPriceKurus: breakdown.unitPriceKurus,
        shippingKurus: breakdown.shippingKurus,
        totalKurus: breakdown.totalKurus,
        // The contract carries a single number; the range lives on the quote response.
        etaBusinessDays: breakdown.etaBusinessDays[1],
        quoteRef: `manual:${input.formatCode}:${input.quantity}`,
        provider: this.provider,
      },
      usage: [freeUsage('print.quote')],
    };
  }

  async submit(
    input: PrintSubmitInput,
    _ctx: ProviderCallContext,
  ): Promise<AdapterResult<PrintSubmitOutput>> {
    const format = this.options.formats[input.formatCode];
    if (!format) {
      throw new ProviderError({
        kind: 'invalid_request',
        provider: this.provider,
        operation: 'print.submit',
        providerCode: 'unknown_format',
        detail: `no physical spec for format ${input.formatCode}`,
      });
    }

    const now = this.options.now?.() ?? new Date();
    // Deterministic id: re-submitting the same order updates the same job instead of
    // creating a second one. Level-2 idempotency at the provider boundary.
    const externalId = `manual-${input.orderId}`;

    const existing = await this.options.store.get(externalId);
    if (existing) {
      return {
        value: { externalId, status: existing.status === 'queued' ? 'queued' : 'submitted' },
        usage: [freeUsage('print.submit')],
      };
    }

    const workOrder: WorkOrder = {
      orderNo: input.orderId,
      formatCode: input.formatCode,
      titleTr: format.titleTr,
      quantity: input.quantity,
      pageCount: format.pageCount,
      trimMm: format.trimMm,
      bleedMm: format.bleedMm,
      spineMm: this.options.spineMmFor({
        formatCode: input.formatCode,
        pageCount: format.pageCount,
      }),
      paperTr: format.paperTr,
      bindingTr: format.bindingTr,
      colorProfileTr: this.options.colorProfileTr ?? 'sRGB (matbaa CMYK’ye kendi çeviriyor)',
      files: input.files,
      shipTo: input.shipTo,
      ...(this.options.standingNotesTr?.length ? { notesTr: this.options.standingNotesTr } : {}),
      createdAt: now.toISOString(),
    };

    await this.options.store.put({
      externalId,
      orderId: input.orderId,
      // `queued` and not `submitted`: nothing has been sent until a human sends it. Saying
      // otherwise would make the ops panel lie about where the order is.
      status: 'queued',
      workOrder,
      workOrderTextTr: renderWorkOrderTextTr(workOrder),
      updatedAt: now,
    });

    return { value: { externalId, status: 'queued' }, usage: [freeUsage('print.submit')] };
  }

  async status(
    externalId: string,
    _ctx: ProviderCallContext,
  ): Promise<AdapterResult<PrintStatusOutput>> {
    const job = await this.options.store.get(externalId);
    if (!job) {
      throw new ProviderError({
        kind: 'not_found',
        provider: this.provider,
        operation: 'print.status',
        detail: `unknown manual print job ${externalId}`,
      });
    }
    return {
      value: {
        externalId,
        status: job.status,
        ...(job.carrier ? { carrier: job.carrier } : {}),
        ...(job.trackingUrl ? { trackingUrl: job.trackingUrl } : {}),
        ...(job.message ? { message: job.message } : {}),
      },
      usage: [freeUsage('print.status')],
    };
  }

  async cancel(
    externalId: string,
    _ctx: ProviderCallContext,
  ): Promise<AdapterResult<{ ok: boolean }>> {
    const job = await this.options.store.get(externalId);
    if (!job) {
      throw new ProviderError({
        kind: 'not_found',
        provider: this.provider,
        operation: 'print.cancel',
        detail: `unknown manual print job ${externalId}`,
      });
    }
    // Once the sheets are on the press there is nothing to cancel — the paper exists.
    if (job.status === 'printing' || job.status === 'shipped') {
      throw new ProviderError({
        kind: 'invalid_request',
        provider: this.provider,
        operation: 'print.cancel',
        providerCode: 'order_already_in_production',
        detail: `manual print job ${externalId} is ${job.status}`,
      });
    }
    await this.options.store.patch(externalId, { status: 'cancelled' });
    return { value: { ok: true }, usage: [freeUsage('print.cancel')] };
  }

  /** Ops action: the operator moves the job forward after talking to the partner. */
  async recordOperatorUpdate(
    externalId: string,
    update: {
      status: ManualJobStatus;
      carrier?: string;
      trackingNo?: string;
      trackingUrl?: string;
      messageTr?: string;
    },
  ): Promise<ManualPrintJob | undefined> {
    return this.options.store.patch(externalId, {
      status: update.status,
      ...(update.carrier ? { carrier: update.carrier } : {}),
      ...(update.trackingNo ? { trackingNo: update.trackingNo } : {}),
      ...(update.trackingUrl ? { trackingUrl: update.trackingUrl } : {}),
      ...(update.messageTr ? { message: update.messageTr } : {}),
    });
  }
}
