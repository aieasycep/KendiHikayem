/**
 * flows/print.flow.ts — build the files, then send them. In that order, always.
 *
 *      print:'print.submit'          ← parent: only runs if the child SUCCEEDED
 *        └── print:'pdf.build'       ← child: layout + preflight + PDF bytes
 *
 * `failParentOnFailure` is ON here, unlike the illustration fan-out. The reasoning is the
 * opposite one: a book missing one of thirteen pictures still ships (partial success), but
 * an order whose PDF did not build must NEVER reach a printer. A missing page is a quality
 * problem; a missing preflight is a rejected job, a refund and a broken promise to a child.
 *
 * Status polling is a separate, repeatable job rather than a flow child: it runs for days
 * after the tree has completed, and a flow that stays open for days is a flow that leaks.
 */

import type { FlowJob } from 'bullmq';

import { DEFAULT_JOB_OPTIONS, type JobPayload, type QueueRegistry } from '../queues';
import { stepKeys } from '../jobs/hashing';
import { queueJobId } from './book.flow';

export interface PrintOrderFlowInput {
  jobId: string;
  userId: string;
  correlationId: string;
  storyId: string;
  buildId: string;
  /** Absent for a build-only run (B01 preview before an order exists). */
  orderId?: string;
  includeQr?: boolean;
  /** "Anne" — printed under each page code. */
  qrRenditionLabelTr?: string;
  /** sha256 of the accepted pre-information document (6502 evidence). */
  documentSha256?: string;
  priority?: number;
}

/** Build-only: what B01 triggers when the parent asks for a preview of the printed book. */
export function buildPdfBuildJob(input: PrintOrderFlowInput): FlowJob {
  return {
    name: 'pdf.build',
    queueName: 'print',
    data: {
      jobId: input.jobId,
      userId: input.userId,
      correlationId: input.correlationId,
      kind: 'book_build',
      stepKey: stepKeys.pdfInterior(),
      ref: {
        storyId: input.storyId,
        buildId: input.buildId,
        includeQr: input.includeQr ?? false,
        ...(input.qrRenditionLabelTr ? { qrRenditionLabelTr: input.qrRenditionLabelTr } : {}),
      },
    } satisfies JobPayload,
    opts: {
      ...DEFAULT_JOB_OPTIONS,
      priority: input.priority ?? 100,
      jobId: queueJobId(input.jobId, stepKeys.pdfInterior()),
    },
  };
}

/** Full order: build → submit, with the submit blocked on a successful build. */
export function buildPrintOrderFlow(input: PrintOrderFlowInput): FlowJob {
  if (!input.orderId) throw new Error('print order flow needs an orderId');

  return {
    name: 'print.submit',
    queueName: 'print',
    data: {
      jobId: input.jobId,
      userId: input.userId,
      correlationId: input.correlationId,
      kind: 'print_submit',
      stepKey: stepKeys.printSubmit(),
      ref: {
        orderId: input.orderId,
        buildId: input.buildId,
        ...(input.documentSha256 ? { documentSha256: input.documentSha256 } : {}),
      },
    } satisfies JobPayload,
    opts: {
      ...DEFAULT_JOB_OPTIONS,
      priority: input.priority ?? 50,
      jobId: queueJobId(input.jobId, stepKeys.printSubmit()),
    },
    children: [
      {
        ...buildPdfBuildJob(input),
        opts: {
          ...DEFAULT_JOB_OPTIONS,
          priority: input.priority ?? 50,
          // ⚠️ ON, unlike the illustration flow: no PDF ⇒ no printer, ever.
          failParentOnFailure: true,
          jobId: queueJobId(input.jobId, stepKeys.pdfInterior()),
        },
      },
    ],
  };
}

export async function addPrintOrderFlow(
  queues: QueueRegistry,
  input: PrintOrderFlowInput,
): Promise<{ parentJobId: string; childCount: number }> {
  const node = await queues.flowProducer.add(buildPrintOrderFlow(input));
  return {
    parentJobId: node.job.id ?? queueJobId(input.jobId, stepKeys.printSubmit()),
    childCount: node.children?.length ?? 0,
  };
}

/**
 * Status follow-up. Repeatable rather than a long-lived flow: the partner may take days,
 * and the job must survive a redeploy. Deterministic id ⇒ re-scheduling is a no-op.
 */
export interface PrintStatusPollInput {
  jobId: string;
  userId: string;
  correlationId: string;
  orderId: string;
  everyMs?: number;
  /** Stop polling after this many attempts; ops takes over from there. */
  limit?: number;
}

export async function schedulePrintStatusPoll(
  queues: QueueRegistry,
  input: PrintStatusPollInput,
): Promise<string> {
  const schedulerId = `print-status-${input.orderId}`;
  await queues.queue('print').upsertJobScheduler(
    schedulerId,
    { every: input.everyMs ?? 3_600_000, limit: input.limit ?? 24 * 14 },
    {
      name: 'print.status',
      data: {
        jobId: input.jobId,
        userId: input.userId,
        correlationId: input.correlationId,
        kind: 'print_status',
        ref: { orderId: input.orderId },
      } satisfies JobPayload,
      opts: DEFAULT_JOB_OPTIONS,
    },
  );
  return schedulerId;
}

/** Stops the poller once the order is delivered, cancelled or handed to ops. */
export async function stopPrintStatusPoll(
  queues: QueueRegistry,
  orderId: string,
): Promise<void> {
  await queues.queue('print').removeJobScheduler(`print-status-${orderId}`);
}
