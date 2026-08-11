/**
 * flows/audio.flow.ts — narration fan-out/fan-in.
 *
 *      media:'audio.concat'            ← ffmpeg concat + 350 ms gaps + loudnorm −16 LUFS
 *        ├── voice:'tts.chunk' (0)
 *        │   …                          rate-limited to the vendor's TTS quota, 4 at a time
 *        └── voice:'tts.chunk' (n)
 *
 * Chunks split on paragraph/page boundaries, NEVER mid-sentence (SPEC §7 step 10) — the
 * boundary is decided by the caller and passed in; this file only fans it out.
 *
 * The cache lever lives on these chunks: when a parent edits page 3, only chunk 3's
 * `input_hash` changes, so eleven of twelve steps resolve from `content_cache` at zero
 * cost and the reservation for the re-render is a fraction of a full narration.
 */

import type { FlowJob } from 'bullmq';

import { DEFAULT_JOB_OPTIONS, type JobPayload, type QueueRegistry } from '../queues';
import { stepKeys } from '../jobs/hashing';

export interface AudioChunk {
  index: number;
  /** Page this chunk belongs to — drives `audio.chunk.ready` progressive playback. */
  pageNo: number;
  /** sha256 of the chunk text; the actual text is read from Postgres by the processor. */
  textHash: string;
}

export interface AudioRenderFlowInput {
  jobId: string;
  userId: string;
  correlationId: string;
  storyId: string;
  renditionId: string;
  chunks: AudioChunk[];
  voice: { kind: 'cloned' | 'system'; providerVoiceId: string };
  tier: 'draft' | 'quality';
  priority?: number;
}

export function buildAudioRenderFlow(input: AudioRenderFlowInput): FlowJob {
  const priority = input.priority ?? 100;
  const base: Omit<JobPayload, 'stepKey' | 'pageNo'> = {
    jobId: input.jobId,
    userId: input.userId,
    correlationId: input.correlationId,
    kind: 'audio_render',
  };

  const children: FlowJob[] = input.chunks.map((chunk) => ({
    name: 'tts.chunk',
    queueName: 'voice',
    data: {
      ...base,
      stepKey: stepKeys.ttsChunk(chunk.index),
      pageNo: chunk.pageNo,
      ref: {
        storyId: input.storyId,
        renditionId: input.renditionId,
        chunkIndex: chunk.index,
        textHash: chunk.textHash,
        voice: input.voice,
        tier: input.tier,
      },
    } satisfies JobPayload,
    opts: {
      ...DEFAULT_JOB_OPTIONS,
      priority,
      // Audio is different from illustration: a missing chunk is a hole in the middle of
      // the story, not a placeholder the parent can live with. Fail the parent.
      failParentOnFailure: true,
      jobId: `${input.jobId}:${stepKeys.ttsChunk(chunk.index)}`,
    },
  }));

  return {
    name: 'audio.concat',
    queueName: 'media',
    data: {
      ...base,
      stepKey: stepKeys.audioConcat(),
      ref: {
        storyId: input.storyId,
        renditionId: input.renditionId,
        chunkCount: children.length,
      },
    } satisfies JobPayload,
    opts: { ...DEFAULT_JOB_OPTIONS, priority, jobId: `${input.jobId}:concat` },
    children,
  };
}

export async function addAudioRenderFlow(
  queues: QueueRegistry,
  input: AudioRenderFlowInput,
): Promise<{ parentJobId: string; childCount: number }> {
  const node = await queues.flowProducer.add(buildAudioRenderFlow(input));
  return {
    parentJobId: node.job.id ?? `${input.jobId}:concat`,
    childCount: node.children?.length ?? 0,
  };
}
