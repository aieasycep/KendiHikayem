/**
 * flows/story.flow.ts — the two-stage story pipeline and its two approval gates.
 *
 * This is the file that keeps the average cost near $0.03 instead of $4 (SPEC §6.2 rule 1,
 * contract/src/story.ts). Stage 1 is a single cheap LLM job. Stage 2 — the expensive one —
 * is not enqueued at all until the parent has approved the skeleton.
 *
 *   POST /v1/stories                → story_outline (llm)     ~$0.03
 *        status: outline_generating → outline_ready
 *   ⏸ GATE 1  POST /stories/:id/outline/approve
 *                                   → story_fill (llm) + character sheet + book flow  ~$2.4
 *   ⏸ GATE 2  POST /stories/:id/approve
 *        `approvedAt` null ⇒ narration and print refuse with STORY_NOT_APPROVED
 *
 * Neither gate is enforced here — they are enforced by the ABSENCE of an enqueue. A gate
 * implemented as a runtime check inside a job has already paid for the tokens.
 */

import type { FlowJob } from 'bullmq';

import { DEFAULT_JOB_OPTIONS, type JobPayload, type QueueRegistry } from '../queues';
import { stepKeys } from '../jobs/hashing';
import { queueJobId } from './book.flow';

export interface StoryOutlineFlowInput {
  jobId: string;
  userId: string;
  correlationId: string;
  storyId: string;
  priority?: number;
}

/**
 * Stage 1. A single job, no fan-out: one skeleton call, one age-rubric judge, one
 * CHARACTER_DNA generation. Cheap enough that abandoning here costs nothing worth tracking.
 */
export function buildStoryOutlineFlow(input: StoryOutlineFlowInput): FlowJob {
  return {
    name: 'story.outline',
    queueName: 'llm',
    data: {
      jobId: input.jobId,
      userId: input.userId,
      correlationId: input.correlationId,
      kind: 'story_outline',
      stepKey: stepKeys.llmOutline(),
      ref: { storyId: input.storyId },
    } satisfies JobPayload,
    opts: {
      ...DEFAULT_JOB_OPTIONS,
      priority: input.priority ?? 100,
      jobId: queueJobId(input.jobId, 'outline'),
    },
  };
}

export interface StoryFillFlowInput {
  jobId: string;
  userId: string;
  correlationId: string;
  storyId: string;
  pageNos: number[];
  priority?: number;
}

/**
 * Stage 2, text only: fill the pages, judge them, then produce one illustration prompt per
 * page. The illustration prompts are children so the fill completes (and `page.ready` fires
 * for each page's TEXT) before any image is drawn — the reader shows text first, which is
 * what makes the wait feel short.
 *
 * Images are a SEPARATE flow (`book.flow.ts`) started after the parent picks a character
 * variant on S09.
 */
export function buildStoryFillFlow(input: StoryFillFlowInput): FlowJob {
  const priority = input.priority ?? 100;
  const base: Omit<JobPayload, 'stepKey' | 'pageNo'> = {
    jobId: input.jobId,
    userId: input.userId,
    correlationId: input.correlationId,
    kind: 'story_fill',
  };

  const promptChildren: FlowJob[] = input.pageNos.map((pageNo) => ({
    name: 'llm.illustration_prompt',
    queueName: 'llm',
    data: {
      ...base,
      stepKey: stepKeys.illustrationPrompt(pageNo),
      pageNo,
      ref: { storyId: input.storyId },
    } satisfies JobPayload,
    opts: {
      ...DEFAULT_JOB_OPTIONS,
      priority,
      failParentOnFailure: false,
      jobId: queueJobId(input.jobId, stepKeys.illustrationPrompt(pageNo)),
    },
  }));

  return {
    name: 'story.fill',
    queueName: 'llm',
    data: {
      ...base,
      stepKey: stepKeys.llmFill(),
      ref: { storyId: input.storyId, pageCount: input.pageNos.length },
    } satisfies JobPayload,
    opts: { ...DEFAULT_JOB_OPTIONS, priority, jobId: queueJobId(input.jobId, 'fill') },
    children: promptChildren,
  };
}

export async function addStoryOutlineFlow(
  queues: QueueRegistry,
  input: StoryOutlineFlowInput,
): Promise<string> {
  const node = await queues.flowProducer.add(buildStoryOutlineFlow(input));
  return node.job.id ?? queueJobId(input.jobId, 'outline');
}

export async function addStoryFillFlow(
  queues: QueueRegistry,
  input: StoryFillFlowInput,
): Promise<{ parentJobId: string; childCount: number }> {
  const node = await queues.flowProducer.add(buildStoryFillFlow(input));
  return {
    parentJobId: node.job.id ?? queueJobId(input.jobId, 'fill'),
    childCount: node.children?.length ?? 0,
  };
}
