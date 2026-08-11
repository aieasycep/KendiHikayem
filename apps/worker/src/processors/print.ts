/**
 * processors/print.ts — the print queue: build the files, then send them.
 *
 * Two processors, and the gate between them is the whole point:
 *
 *     pdf.build ──(preflight ok?)──▶ order may be placed ──▶ print.submit ──▶ print.status
 *          │                                                      │
 *          └── not ok: build stays `failed` with Turkish           └── legal gate: no
 *              warnings and the order CANNOT be opened                 waiver, no submit
 *
 * Nothing here talks to a printer or a PDF library directly: `@kendihikayem/pdf` produces
 * the bytes, `PrintAdapter` (through the router, so retries and the circuit breaker apply)
 * talks to the partner, and `PrintGateway` owns the rows. That keeps this file about
 * ORDER — which is what a processor should be about.
 *
 * ⚠️ The expensive part (4K re-render) happens upstream in the image flow. This step is
 * pure CPU, so it is safe to retry; the QR tokens are the exception and are minted ONCE
 * (`existingQrTokens`), because a reprint must not invalidate codes already on paper.
 */

import { createHash } from 'node:crypto';

import {
  MediaPrintImageSource,
  buildPrintFiles,
  calculateSpine,
  getBookFormat,
  mintQrToken,
  type BookBuildInput,
  type PrintImageSource,
  type StoryPageInput,
} from '@kendihikayem/pdf';
import {
  assertWithdrawalEvidence,
  classifyPrintError,
  evaluateCancellation,
  orderStatusForPrintJob,
  type PrintJobStatus,
} from '@kendihikayem/providers';

import type { JobPayload } from '../queues';
import type { WorkerRuntime } from '../runtime';
import type { WorkerProcessor } from './index';
import type { PrintGateway, PrintBuildContext } from './print-gateway';
import { PgPrintGateway } from './print-gateway';
import { stepKeys } from '../jobs/hashing';
import { appendJobEvent } from '../jobs/events';
import { beginStep, completeStep, failStep } from '../jobs/repository';

/** Injected in tests; production builds it from the runtime. */
export interface PrintPipelineDeps {
  gateway: PrintGateway;
  images: PrintImageSource;
  /** Signed-URL builder the printer can fetch from (TTL is the media default). */
  fileUrl(bucket: string, key: string): string;
  now?: () => Date;
}

let cachedDeps: PrintPipelineDeps | undefined;

/**
 * Default wiring. The image source is A4's `buildPrintRendition` behind the PDF package's
 * port; until `packages/media` is wired into the runtime the source throws a clear error
 * rather than silently producing a book with holes in it.
 */
export function printDepsFrom(runtime: WorkerRuntime): PrintPipelineDeps {
  cachedDeps ??= {
    gateway: new PgPrintGateway(runtime.db),
    images: new MediaPrintImageSource({
      fetchAsset: async (assetId) => runtime.objectStore.get(runtime.buckets.media, assetId),
      buildRendition: async () => {
        throw new Error(
          'print image pipeline not wired: pass a PrintImageSource (packages/media buildPrintRendition)',
        );
      },
    }),
    fileUrl: (bucket, key) => `${runtime.env.PUBLIC_BASE_URL}/internal/files/${bucket}/${key}`,
  };
  return cachedDeps;
}

/** Test seam: replaces the memoised dependencies. */
export function setPrintDeps(deps: PrintPipelineDeps | undefined): void {
  cachedDeps = deps;
}

const sha256 = (bytes: Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex');

function storageKey(buildId: string, revision: number, name: string): string {
  return `book-builds/${buildId}/r${revision}/${name}.pdf`;
}

/** DB context → the pure input `@kendihikayem/pdf` understands. */
export function toBookBuildInput(
  context: PrintBuildContext,
  options: { includeQr: boolean; baseUrl: string; renditionLabelTr?: string; orderNo?: string },
): BookBuildInput {
  const pages: StoryPageInput[] = context.pages.map((page) => ({
    pageNo: page.pageNo,
    textTr: page.textTr,
    ...(page.imageAssetId
      ? {
          image: {
            ref: page.imageAssetId,
            widthPx: page.widthPx ?? 0,
            heightPx: page.heightPx ?? 0,
            mimeType: 'image/jpeg' as const,
            colorSpace: 'srgb' as const,
            // `manual_review` and `failed` both stop the book: the preflight turns them
            // into a Turkish sentence instead of printing a page nobody approved.
            status:
              page.imageStatus === 'ready'
                ? ('ready' as const)
                : page.imageStatus === 'manual_review'
                  ? ('manual_review' as const)
                  : ('missing' as const),
          },
        }
      : {}),
  }));

  return {
    formatCode: context.formatCode,
    story: {
      titleTr: context.titleTr,
      heroName: context.heroName,
      ageBand: context.ageBand,
      ...(context.lessonTr ? { lessonTr: context.lessonTr } : {}),
      ...(context.blurbTr ? { blurbTr: context.blurbTr } : {}),
    },
    pages,
    ...(context.coverAssetId
      ? {
          coverImage: {
            ref: context.coverAssetId,
            widthPx: context.coverWidthPx ?? 0,
            heightPx: context.coverHeightPx ?? 0,
            mimeType: 'image/jpeg' as const,
            colorSpace: 'srgb' as const,
            status: 'ready' as const,
          },
        }
      : {}),
    ...(context.dedicationTr ? { dedicationTr: context.dedicationTr } : {}),
    imprint: {
      ...(options.orderNo ? { orderNo: options.orderNo } : {}),
      buildId: context.buildId,
      revision: context.revision,
    },
    ...(options.includeQr
      ? {
          qr: {
            enabled: true,
            baseUrl: options.baseUrl,
            tokens: context.existingQrTokens,
            ...(options.renditionLabelTr ? { renditionLabelTr: options.renditionLabelTr } : {}),
          },
        }
      : {}),
  };
}

/* ── pdf.build ─────────────────────────────────────────────────────────────── */

/**
 * Builds interior + cover + preview and writes the preflight result. A failed preflight is
 * NOT a job failure: the files are simply not produced, the build is marked `failed` with
 * `warningsTr`, and the app shows the parent exactly which page to fix (B02).
 */
export const pdfBuild: WorkerProcessor = async (runtime, job) => {
  const { jobId, userId, correlationId } = job.data;
  const deps = printDepsFrom(runtime);
  const buildId = String(job.data.ref?.['buildId'] ?? '');
  const includeQr = Boolean(job.data.ref?.['includeQr']);
  const renditionLabelTr = job.data.ref?.['qrRenditionLabelTr'] as string | undefined;

  const claim = await beginStep(runtime.db, {
    jobId,
    stepKey: stepKeys.pdfInterior(),
    kind: 'pdf',
    inputHash: buildId,
  });
  if (claim.reuse) return { status: 'reused' };

  const context = await deps.gateway.loadBuildContext(buildId);
  if (!context) {
    await failStep(runtime.db, claim.step.id, {
      code: 'NOT_FOUND',
      detail: `book build ${buildId} not found`,
    });
    throw new Error(`book build ${buildId} not found`);
  }

  const format = getBookFormat(context.formatCode);
  const spine = calculateSpine(format);

  // Tokens are minted here and only here: a rebuild reuses whatever is already printed.
  const tokens: Record<number, string> = { ...context.existingQrTokens };
  if (includeQr) {
    for (const page of context.pages) {
      tokens[page.pageNo] ??= mintQrToken();
    }
  }

  const input = toBookBuildInput(context, {
    includeQr,
    baseUrl: runtime.env.PUBLIC_BASE_URL,
    ...(renditionLabelTr ? { renditionLabelTr } : {}),
    ...(context.orderNo ? { orderNo: context.orderNo } : {}),
  });
  if (includeQr && input.qr) input.qr.tokens = tokens;

  const result = await buildPrintFiles(input, {
    images: deps.images,
    metadata: { producedAt: deps.now?.() ?? new Date() },
  });

  if (!result.preflight.ok) {
    await deps.gateway.saveBuild({
      buildId,
      spineMm: spine.spineMm,
      checks: result.preflight.checks,
      warningsTr: result.preflight.warningsTr,
      status: 'failed',
      error: {
        code: 'PREFLIGHT_FAILED',
        messageTr:
          result.preflight.warningsTr[0] ??
          'Baskı ön kontrolü geçilemedi; kitabınız baskıya gönderilemiyor.',
      },
    });
    await completeStep(runtime.db, claim.step.id, {
      status: 'succeeded',
      output: { preflight: 'failed', issues: result.preflight.issues.length },
    });
    await appendJobEvent(runtime.db, jobId, 'job.progress', {
      jobId,
      userId,
      correlationId,
      labelTr: 'Baskı ön kontrolü geçilemedi',
    });
    return { status: 'preflight_failed', warnings: result.preflight.warningsTr };
  }

  const artifacts: Record<'interior' | 'cover' | 'preview', Uint8Array | undefined> = {
    interior: result.interiorPdf,
    cover: result.coverPdf,
    preview: result.previewPdf,
  };
  const kindByName = {
    interior: 'pdf_interior',
    cover: 'pdf_cover',
    preview: 'pdf_preview',
  } as const;

  const saved: Partial<Record<'interior' | 'cover' | 'preview', {
    assetId: string;
    bucket: string;
    key: string;
    bytes: number;
    sha256: string;
  }>> = {};

  for (const name of ['interior', 'cover', 'preview'] as const) {
    const bytes = artifacts[name];
    if (!bytes) continue;
    const key = storageKey(buildId, context.revision, name);
    await runtime.objectStore.put({
      bucket: runtime.buckets.media,
      key,
      bytes,
      contentType: 'application/pdf',
    });
    const digest = sha256(bytes);
    const assetId = await deps.gateway.storeArtifact({
      kind: kindByName[name],
      bucket: runtime.buckets.media,
      key,
      bytes: bytes.byteLength,
      sha256: digest,
      // Order documents outlive the account: ten-year legal hold (SPEC §12).
      retentionClass: 'legal_hold_10y',
    });
    saved[name] = {
      assetId,
      bucket: runtime.buckets.media,
      key,
      bytes: bytes.byteLength,
      sha256: digest,
    };
  }

  if (includeQr && context.qrRenditionId) {
    await deps.gateway.savePageAudioLinks(buildId, context.qrRenditionId, tokens);
  }

  await deps.gateway.saveBuild({
    buildId,
    spineMm: result.layout.spine.spineMm,
    checks: result.preflight.checks,
    warningsTr: result.preflight.warningsTr,
    status: 'ready',
    ...(saved.interior ? { interior: saved.interior } : {}),
    ...(saved.cover ? { cover: saved.cover } : {}),
    ...(saved.preview ? { preview: saved.preview } : {}),
  });

  await completeStep(runtime.db, claim.step.id, {
    status: 'succeeded',
    output: {
      spineMm: result.layout.spine.spineMm,
      pages: result.layout.interior.length,
      interiorBytes: saved.interior?.bytes ?? 0,
      qrTokens: Object.keys(tokens).length,
    },
  });

  return {
    status: 'succeeded',
    spineMm: result.layout.spine.spineMm,
    pages: result.layout.interior.length,
  };
};

/* ── print.submit ──────────────────────────────────────────────────────────── */

export class OrderNotPrintableError extends Error {
  constructor(readonly messageTr: string) {
    super(messageTr);
    this.name = 'OrderNotPrintableError';
  }
}

/**
 * Sends a paid order to the printer.
 *
 * The legal gate runs BEFORE the adapter is touched: an order without a recorded,
 * timely-accepted withdrawal waiver never reaches a press. That is deliberately redundant
 * with the contract's literal type and the table CHECK — three layers, because the failure
 * mode is a legal one, not a crash.
 */
export const printSubmit: WorkerProcessor = async (runtime, job: { data: JobPayload }) => {
  const { jobId, userId, correlationId } = job.data;
  const deps = printDepsFrom(runtime);
  const orderId = String(job.data.ref?.['orderId'] ?? '');

  const order = await deps.gateway.loadOrder(orderId);
  if (!order) throw new Error(`order ${orderId} not found`);

  // 6502: the waiver is a precondition of production, not a checkbox we log.
  assertWithdrawalEvidence({
    withdrawalDocId: order.withdrawalWaiverDocId ?? '',
    distanceContractDocId: order.distanceContractDocId ?? '',
    documentSha256: String(job.data.ref?.['documentSha256'] ?? ''),
    shownAt: order.withdrawalWaiverShownAt ?? order.createdAt,
    acceptedAt: order.withdrawalWaiverShownAt ?? order.createdAt,
    accepted: order.withdrawalWaiverAccepted,
    orderCreatedAt: order.createdAt,
  });

  if (order.status !== 'paid' && order.status !== 'in_production') {
    throw new OrderNotPrintableError(
      'Bu sipariş ödenmediği için baskıya gönderilemez. Ödemeniz alındıysa birkaç dakika içinde otomatik başlar.',
    );
  }
  if (!order.files) {
    throw new OrderNotPrintableError(
      'Baskı dosyaları henüz hazır değil; kitabınız hazırlanır hazırlanmaz matbaaya iletilecek.',
    );
  }

  const result = await runtime.routers.print.execute(
    'print.submit',
    { requestId: `${orderId}:submit`, correlationId, userId },
    async (adapter) =>
      adapter.submit(
        {
          orderId: order.orderId,
          formatCode: order.formatCode,
          quantity: order.quantity,
          files: order.files as { interiorPdfUrl: string; coverPdfUrl: string },
          shipTo: order.shipTo,
        },
        { requestId: `${orderId}:submit`, correlationId, userId },
      ),
  );

  const submitted = result.value;
  await deps.gateway.upsertPrintJob({
    orderId: order.orderId,
    provider: runtime.env.PRINT_ADAPTER,
    providerOrderId: submitted.externalId,
    status: submitted.status,
    files: { interiorUrl: order.files.interiorPdfUrl, coverUrl: order.files.coverPdfUrl },
    event: { at: new Date().toISOString(), type: 'submit', status: submitted.status },
  });

  const nextOrderStatus = orderStatusForPrintJob(submitted.status as PrintJobStatus);
  if (nextOrderStatus && nextOrderStatus !== order.status) {
    await deps.gateway.setOrderStatus(order.orderId, nextOrderStatus);
  }

  await appendJobEvent(runtime.db, jobId, 'job.progress', {
    jobId,
    userId,
    correlationId,
    labelTr: 'Kitabınız matbaaya iletildi',
  });

  return { status: 'succeeded', externalId: submitted.externalId };
};

/* ── print.status ──────────────────────────────────────────────────────────── */

/**
 * Polls the partner (or replays a webhook payload) and moves the order.
 *
 * Printer errors are translated to Turkish here — `classifyPrintError` decides whether the
 * parent is asked to do something (address) or told we are handling it (file rejection).
 */
export const printStatus: WorkerProcessor = async (runtime, job: { data: JobPayload }) => {
  const { jobId, userId, correlationId } = job.data;
  const deps = printDepsFrom(runtime);
  const orderId = String(job.data.ref?.['orderId'] ?? '');

  const order = await deps.gateway.loadOrder(orderId);
  if (!order?.printJob?.providerOrderId) return { status: 'skipped' };

  try {
    const result = await runtime.routers.print.execute(
      'print.status',
      { requestId: `${orderId}:status`, correlationId, userId },
      async (adapter) =>
        adapter.status(order.printJob?.providerOrderId as string, {
          requestId: `${orderId}:status`,
          correlationId,
          userId,
        }),
    );

    const status = result.value;
    await deps.gateway.upsertPrintJob({
      orderId: order.orderId,
      provider: runtime.env.PRINT_ADAPTER,
      status: status.status,
      ...(status.carrier ? { trackingCarrier: status.carrier } : {}),
      event: { at: new Date().toISOString(), type: 'status', status: status.status },
    });

    const next = orderStatusForPrintJob(status.status as PrintJobStatus);
    if (next && next !== order.status) {
      await deps.gateway.setOrderStatus(order.orderId, next);
      await appendJobEvent(runtime.db, jobId, 'job.progress', {
        jobId,
        userId,
        correlationId,
        labelTr:
          next === 'shipped' ? 'Kitabınız kargoya verildi' : 'Kitabınızın durumu güncellendi',
      });
    }
    return { status: 'succeeded', printStatus: status.status };
  } catch (error) {
    const failure = classifyPrintError(error);
    await deps.gateway.upsertPrintJob({
      orderId: order.orderId,
      provider: runtime.env.PRINT_ADAPTER,
      status: failure.retryable ? (order.printJob.status ?? 'submitted') : 'error',
      operatorNote: `${failure.messageTr} ${failure.actionTr}`,
      event: { at: new Date().toISOString(), type: 'error', code: failure.code },
    });
    if (!failure.retryable) throw error;
    return { status: 'retrying', reason: failure.code };
  }
};

/* ── cancellation ──────────────────────────────────────────────────────────── */

/**
 * The cancel path, enforced server-side. The verdict comes from
 * `evaluateCancellation` — the same function the app calls to decide whether to even show
 * the button — so the two can never disagree.
 */
export async function cancelPrintOrder(
  runtime: WorkerRuntime,
  orderId: string,
  options: { correlationId: string; userId?: string } = { correlationId: 'ops' },
): Promise<{ cancelled: boolean; messageTr: string; refund: 'full' | 'none' }> {
  const deps = printDepsFrom(runtime);
  const order = await deps.gateway.loadOrder(orderId);
  if (!order) throw new Error(`order ${orderId} not found`);

  const verdict = evaluateCancellation({
    status: order.status as Parameters<typeof evaluateCancellation>[0]['status'],
    ...(order.printJob ? { printJobStatus: order.printJob.status as PrintJobStatus } : {}),
  });
  if (!verdict.allowed) {
    return { cancelled: false, messageTr: verdict.reasonTr, refund: verdict.refund };
  }

  if (order.printJob?.providerOrderId) {
    await runtime.routers.print
      .execute(
        'print.cancel',
        { requestId: `${orderId}:cancel`, correlationId: options.correlationId },
        async (adapter) =>
          adapter.cancel(order.printJob?.providerOrderId as string, {
            requestId: `${orderId}:cancel`,
            correlationId: options.correlationId,
          }),
      )
      // The partner refusing does not un-cancel our order; ops picks it up from the note.
      .catch(async (error: unknown) => {
        const failure = classifyPrintError(error);
        await deps.gateway.upsertPrintJob({
          orderId: order.orderId,
          provider: runtime.env.PRINT_ADAPTER,
          status: 'error',
          operatorNote: `İptal matbaaya iletilemedi: ${failure.messageTr}`,
          event: { at: new Date().toISOString(), type: 'cancel_failed', code: failure.code },
        });
        return undefined;
      });
  }

  await deps.gateway.setOrderStatus(order.orderId, 'cancelled');
  return { cancelled: true, messageTr: verdict.reasonTr, refund: verdict.refund };
}
