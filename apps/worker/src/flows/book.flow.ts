/**
 * flows/book.flow.ts — ⭐ 1 book → 13 illustrations → 1 join.
 *
 * BullMQ flow trees run LEAVES FIRST and the parent only when every child has completed.
 * That is exactly the fan-out/fan-in the book needs:
 *
 *      media:'book.assemble'            ← fan-in join, runs last
 *        ├── image:'image.page' (1)     ┐
 *        ├── image:'image.page' (2)     │ fan-out, rate-limited to the vendor quota,
 *        │   …                          │ concurrency 4–5 (SPEC §8.2 step 5)
 *        └── image:'image.page' (13)    ┘
 *
 * The preparation steps (style plate, character sheet, face-ref crop) are NOT children
 * here. They belong to the preceding `image_character_sheet` job, because the parent picks
 * one of three variants (S09) before a single page is drawn — the approval gate sits
 * between the two flows, and putting them in one tree would draw 13 pages against a
 * character the parent had not chosen yet.
 *
 * The join runs even when children failed: `failParentOnFailure` is deliberately OFF.
 * A failed page must not cancel the other twelve (SPEC §8.4).
 */

import type { FlowJob } from 'bullmq';

import { DEFAULT_JOB_OPTIONS, type JobPayload, type QueueRegistry } from '../queues';
import { stepKeys } from '../jobs/hashing';

/**
 * BullMQ 6 refuses a custom job id containing `:` — it is the Redis key separator. The ids
 * still have to be DETERMINISTIC (re-adding the same flow must be a no-op rather than a
 * second book), so the step key is flattened rather than dropped.
 */
export function queueJobId(jobId: string, suffix: string): string {
  return `${jobId}__${suffix}`.replace(/:/g, '-');
}


export interface BookIllustrationFlowInput {
  jobId: string;
  userId: string;
  correlationId: string;
  storyId: string;
  /** 12/14/16 interior pages; the cover is added on top. */
  pageNos: number[];
  includeCover?: boolean;
  /** Asset pointers the pages need. Resolved before the flow is built. */
  refs: {
    stylePlateAssetId: string;
    characterSheetAssetId: string;
    faceRefAssetId: string;
  };
  print?: boolean;
  priority?: number;
}

/**
 * Builds the tree. Returns the FlowJob description so it can be asserted in tests without
 * a live Redis, then handed to the producer.
 */
export function buildBookIllustrationFlow(input: BookIllustrationFlowInput): FlowJob {
  const priority = input.priority ?? 100;
  const base: Omit<JobPayload, 'stepKey' | 'pageNo'> = {
    jobId: input.jobId,
    userId: input.userId,
    correlationId: input.correlationId,
    kind: 'image_book',
  };

  const children: FlowJob[] = input.pageNos.map((pageNo) => ({
    name: 'image.page',
    queueName: 'image',
    data: {
      ...base,
      kind: 'image_page',
      stepKey: stepKeys.imagePage(pageNo),
      pageNo,
      ref: { storyId: input.storyId, print: input.print ?? false, ...input.refs },
    } satisfies JobPayload,
    opts: {
      ...DEFAULT_JOB_OPTIONS,
      priority,
      // A page that exhausts its retries goes to manual_review; the book still ships.
      failParentOnFailure: false,
      jobId: queueJobId(input.jobId, stepKeys.imagePage(pageNo)),
    },
  }));

  if (input.includeCover ?? true) {
    children.push({
      name: 'image.cover',
      queueName: 'image',
      data: {
        ...base,
        kind: 'image_page',
        stepKey: stepKeys.imageCover(),
        ref: { storyId: input.storyId, print: input.print ?? false, ...input.refs },
      } satisfies JobPayload,
      opts: {
        ...DEFAULT_JOB_OPTIONS,
        priority,
        failParentOnFailure: false,
        jobId: queueJobId(input.jobId, stepKeys.imageCover()),
      },
    });
  }

  return {
    name: 'book.assemble',
    queueName: 'media',
    data: {
      ...base,
      ref: { storyId: input.storyId, expectedChildren: children.length },
    } satisfies JobPayload,
    opts: {
      ...DEFAULT_JOB_OPTIONS,
      priority,
      // Deterministic id = level-2 idempotency at the queue: re-adding the same flow is
      // a no-op rather than a second book.
      jobId: queueJobId(input.jobId, 'assemble'),
    },
    children,
  };
}

export async function addBookIllustrationFlow(
  queues: QueueRegistry,
  input: BookIllustrationFlowInput,
): Promise<{ parentJobId: string; childCount: number }> {
  const flow = buildBookIllustrationFlow(input);
  const node = await queues.flowProducer.add(flow);
  return {
    parentJobId: node.job.id ?? queueJobId(input.jobId, 'assemble'),
    childCount: node.children?.length ?? 0,
  };
}
