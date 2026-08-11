/**
 * processors/audio-render.ts — the narration pipeline, wired to the real adapter.
 *
 * Two processors, one per queue node of `flows/audio.flow.ts`:
 *
 *   voice:'tts.chunk'    one chunk of text → audio + word timings, cached per chunk
 *   media:'audio.concat' the fan-in: join, normalise, align, write the reader manifest data
 *
 * ⭐ THE CACHE LEVER (SPEC §6.2 rule 4). The chunk is the cache unit, and its key contains
 * the chunk's TEXT — so when a parent edits page 3 of a twelve-page book, exactly one chunk
 * has a new key. The other eleven are served from `content_cache` at zero cost and zero
 * wait, and `saved_usd` records what each one would have cost. That number is the business
 * case for caching, and it is measured rather than asserted:
 * `audio.integration.test.ts` renders a book, edits one page, re-renders and reads it back.
 */

import type { Job } from 'bullmq';
import { sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';

import type { Database } from '@kendihikayem/db';
import {
  assembleNarration,
  chunkCacheParams,
  chunkStory,
  decodeWav,
  encodeWav,
  enforceMonotonic,
  estimateWordTimings,
  floatToPcm16,
  pcm16ToFloat,
  tokenizePage,
  type TextChunk,
  type TtsSettings,
  type WordTiming,
} from '@kendihikayem/providers';
import { estimateCost } from '@kendihikayem/providers';

import type { JobPayload } from '../queues';
import type { WorkerRuntime } from '../runtime';
import { runStep } from './run-step';
import { stepKeys } from '../jobs/hashing';
import { getJobSteps } from '../jobs/repository';
import { appendJobEvent } from '../jobs/events';
import { audioKeys, readAudioAsset, writeAudioAsset } from './audio-storage';
import { touchBinding } from './audio-bindings';
import { cacheKeyFor, type CacheLookupInput } from '../cache/content-cache';

/** What one finished chunk records on its step, and therefore in `content_cache`. */
interface ChunkOutput extends Record<string, unknown> {
  assetId: string;
  durationMs: number;
  billedCharacters: number;
  /** Chunk-local word timings; shifted into whole-file time at concat. */
  timings: WordTiming[];
  alignmentSource: 'provider' | 'sentence_estimate';
  sampleRate: number;
}

export interface AudioRenderContext {
  settings: TtsSettings;
}

/* ── Page loading ──────────────────────────────────────────────────────────── */

/** `db.execute<T>` hands back whatever postgres.js parsed, so rows carry an index signature. */
export interface StoryPageRow {
  [key: string]: unknown;
  page_no: number;
  text_tr: string | null;
  id: string;
}

export async function loadStoryPages(db: Database, storyId: string): Promise<StoryPageRow[]> {
  const rows = await db.execute<StoryPageRow>(sql`
    select id, page_no, text_tr from story_pages
     where story_id = ${storyId} and text_tr is not null
     order by page_no
  `);
  return [...rows];
}

/**
 * Re-derives the chunk plan from the database.
 *
 * The queue carries only pointers — a chunk index and a text hash, never the text (see
 * `queues.ts`). Recomputing the split here from `story_pages` keeps that property and makes
 * the plan self-healing: if the text changed after the job was enqueued, the recomputed
 * chunk hashes change with it, so `job_steps.input_hash` changes and the step re-runs
 * instead of narrating a stale page.
 */
export async function chunkPlanFor(
  db: Database,
  storyId: string,
  settings: TtsSettings,
): Promise<TextChunk[]> {
  const pages = await loadStoryPages(db, storyId);
  return chunkStory(
    pages.map((page) => ({ pageNo: page.page_no, textTr: page.text_tr ?? '' })),
    { maxChars: settings.chunking.maxChars },
  );
}

export function chunkTextHash(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Drops a `content_cache` row whose audio has since disappeared.
 *
 * Cheap (one indexed lookup per chunk) and worth it: the alternative is a rendition that
 * joins eleven chunks and a gap.
 */
async function pruneStaleChunkCache(
  runtime: WorkerRuntime,
  input: CacheLookupInput,
): Promise<void> {
  const cacheKey = cacheKeyFor(input);
  const rows = await runtime.db.execute<{ payload: { assetId?: string } | null }>(sql`
    select payload from content_cache where cache_key = ${cacheKey}
  `);
  const assetId = rows[0]?.payload?.assetId;
  if (!assetId) return;

  const stored = await readAudioAsset(runtime.db, runtime.objectStore, assetId);
  if (stored) return;

  await runtime.db.execute(sql`delete from content_cache where cache_key = ${cacheKey}`);
}

/* ── voice:'tts.chunk' ─────────────────────────────────────────────────────── */

export function createTtsChunkProcessor(context: AudioRenderContext) {
  return async function ttsChunk(runtime: WorkerRuntime, job: Job<JobPayload>) {
    const { jobId, userId, correlationId, stepKey, pageNo } = job.data;
    const ref = job.data.ref ?? {};
    const chunkIndex = Number(ref['chunkIndex'] ?? 0);
    const storyId = String(ref['storyId'] ?? '');
    const renditionId = String(ref['renditionId'] ?? '');
    const tier = (ref['tier'] as 'draft' | 'quality') ?? 'quality';
    const voice = ref['voice'] as { kind: 'cloned' | 'system'; providerVoiceId: string };
    const bindingId = ref['bindingId'] as string | undefined;

    const plan = await chunkPlanFor(runtime.db, storyId, context.settings);
    const chunk = plan[chunkIndex];
    if (!chunk) throw new Error(`chunk ${chunkIndex} does not exist for story ${storyId}`);

    const textHash = chunkTextHash(chunk.text);
    const model =
      tier === 'draft'
        ? context.settings.models.elevenlabs.draft
        : context.settings.models.elevenlabs.quality;
    const cacheParams = chunkCacheParams({
      tier,
      providerVoiceId: voice?.providerVoiceId ?? 'system',
      model,
      outputFormat: context.settings.outputFormat,
    });

    // ⚠️ A cache entry outlives the object it points at. Assets are purged (erasure, an S3
    // lifecycle rule, a lost dev store), and a hit that resolves to bytes which no longer
    // exist would put a silent hole in the middle of a story — the worst possible way to
    // discover it. Checking before the lookup makes the cache self-healing: a dangling
    // entry is dropped and the chunk is simply re-rendered.
    await pruneStaleChunkCache(runtime, {
      provider: runtime.adapters.tts.provider,
      model,
      operation: 'tts.synth',
      params: cacheParams,
      prompt: chunk.text,
    });

    const estimate = estimateCost(
      'audio_render',
      { characters: chunk.text.length, tier },
      runtime.priceBook,
    );

    const result = await runStep<(typeof runtime.adapters)['tts'], ChunkOutput>({
      db: runtime.db,
      jobId,
      userId,
      correlationId,
      stepKey: stepKey ?? stepKeys.ttsChunk(chunkIndex),
      stepKind: 'tts',
      operation: 'tts.synth',
      // The text hash IS the identity: editing page 3 changes this and only this.
      stepInput: { chunkIndex, textHash, tier, voice },
      router: runtime.routers.tts,
      invoke: async (adapter, ctx) => {
        const synthesized = await adapter.synthesize(
          {
            text: chunk.text,
            voice,
            tier,
            languageCode: 'tr',
            outputFormat: context.settings.outputFormat,
            ...(chunk.previousText ? { previousText: chunk.previousText } : {}),
            ...(chunk.nextText ? { nextText: chunk.nextText } : {}),
          },
          ctx,
        );

        const sampleRate = 48_000;
        const assetId = await writeAudioAsset({
          db: runtime.db,
          store: runtime.objectStore,
          userId,
          bucket: runtime.buckets.media,
          key: audioKeys.narrationChunk(renditionId, chunkIndex),
          bytes: synthesized.value.audio,
          mimeType: synthesized.value.mimeType,
          kind: 'tts_chunk',
          durationMs: synthesized.value.durationMs,
          sampleRateHz: sampleRate,
          channels: 1,
          provider: adapter.provider,
        });

        // Provider timings when we were given them; a syllable-weighted estimate otherwise.
        // The estimate is honest about itself — `alignmentSource` propagates to the manifest
        // and the client switches word highlighting off rather than showing a drifting one.
        const timings =
          synthesized.value.alignment && synthesized.value.alignment.length > 0
            ? synthesized.value.alignment
            : estimateWordTimings(chunk.text, synthesized.value.durationMs);

        return {
          value: {
            assetId,
            durationMs: synthesized.value.durationMs,
            billedCharacters: synthesized.value.billedCharacters,
            timings,
            alignmentSource: synthesized.value.alignment?.length
              ? ('provider' as const)
              : ('sentence_estimate' as const),
            sampleRate,
          },
          usage: synthesized.usage,
        };
      },
      toOutput: (value) => ({ ...value }),
      cache: {
        kind: 'tts_chunk',
        provider: runtime.adapters.tts.provider,
        model,
        params: cacheParams,
        // The chunk TEXT, not its page number: two pages with identical text share a render,
        // and a page whose text changed does not.
        prompt: chunk.text,
        estimatedUsd: estimate.breakdownUsd.tts,
      },
    });

    if (result.status === 'failed') throw result.error;

    // LRU order is maintained on every render, not only on creation — a voice used daily
    // must never be the one evicted (SPEC §14 R5).
    if (bindingId) await touchBinding(runtime.db, bindingId);

    await appendJobEvent(runtime.db, jobId, 'audio.chunk.ready', {
      storyId,
      renditionId,
      pageNo: pageNo ?? chunk.pageNo,
      chunkIndex,
      cached: result.status === 'skipped',
    });

    return { status: result.status, chunkIndex };
  };
}

/* ── media:'audio.concat' ──────────────────────────────────────────────────── */

export interface ConcatResult {
  renditionId: string;
  totalDurationMs: number;
  measuredLufs: number;
  alignmentSource: 'provider' | 'forced_alignment' | 'sentence_estimate' | 'none';
  pageCount: number;
  costUsd: number;
}

/**
 * Joins the chunks into one narration and writes everything the player needs.
 *
 * The word timings are shifted into whole-file time HERE, not in the chunk step, because
 * only here is it known where each chunk landed — and a chunk is routinely served from
 * cache, having originally been rendered at a completely different offset in a completely
 * different book.
 */
export function createAudioConcatProcessor(context: AudioRenderContext) {
  return async function audioConcat(
    runtime: WorkerRuntime,
    job: Job<JobPayload>,
  ): Promise<ConcatResult> {
    const { jobId, userId } = job.data;
    const ref = job.data.ref ?? {};
    const storyId = String(ref['storyId'] ?? '');
    const renditionId = String(ref['renditionId'] ?? '');

    const steps = await getJobSteps(runtime.db, jobId);
    const chunkSteps = steps
      .filter((step) => step.step_key.startsWith('tts:chunk:'))
      .sort((a, b) => a.step_key.localeCompare(b.step_key));

    const plan = await chunkPlanFor(runtime.db, storyId, context.settings);
    const pages = await loadStoryPages(runtime.db, storyId);

    const assembleChunks = [];
    const outputs: ChunkOutput[] = [];
    let costUsd = 0;

    for (const [index, step] of chunkSteps.entries()) {
      const output = step.output as unknown as ChunkOutput | null;
      if (!output?.assetId) continue;
      costUsd += Number(step.cost_usd ?? 0);

      const stored = await readAudioAsset(runtime.db, runtime.objectStore, output.assetId);
      if (!stored) continue;

      const samples = chunkSamples({
        bytes: stored.bytes,
        mimeType: stored.mimeType,
        durationMs: output.durationMs,
        sampleRate: output.sampleRate,
        provider: runtime.adapters.tts.provider,
        settings: context.settings,
      });

      outputs.push(output);
      assembleChunks.push({
        samples,
        pageNo: plan[index]?.pageNo ?? index + 1,
        chunkIndex: index,
      });
    }

    if (assembleChunks.length === 0) {
      throw new Error(`rendition ${renditionId} has no rendered chunks to join`);
    }

    const sampleRate = outputs[0]?.sampleRate ?? 48_000;
    const assembled = assembleNarration(assembleChunks, {
      sampleRate,
      gapMs: context.settings.chunking.gapMs,
      targetLufs: context.settings.loudness.targetLufs,
      peakCeilingDb: context.settings.loudness.peakCeilingDb,
    });

    const wav = encodeWav(assembled.audio.channels, { sampleRate, bitDepth: 16 });
    const fullAssetId = await writeAudioAsset({
      db: runtime.db,
      store: runtime.objectStore,
      userId,
      bucket: runtime.buckets.media,
      key: audioKeys.narrationFull(renditionId),
      bytes: wav,
      mimeType: 'audio/wav',
      kind: 'tts_full',
      durationMs: assembled.totalDurationMs,
      sampleRateHz: sampleRate,
      channels: 1,
    });

    // Per-page tokens and sentence ranges: the two arrays `PlayerPage` is made of.
    const alignmentSource = outputs.every((output) => output.alignmentSource === 'provider')
      ? ('provider' as const)
      : ('sentence_estimate' as const);

    const pageTokens: Record<number, ReturnType<typeof tokenizePage>> = {};
    let tokenIndex = 0;
    for (const [index, mark] of assembled.marks.entries()) {
      const output = outputs[index];
      const chunk = plan[index];
      if (!output || !chunk) continue;

      const shifted = output.timings.map((timing) => ({
        ...timing,
        startMs: timing.startMs + mark.startMs,
        endMs: timing.endMs + mark.startMs,
      }));

      const page = pages.find((candidate) => candidate.page_no === chunk.pageNo);
      const tokenized = tokenizePage(page?.text_tr ?? chunk.text, shifted, {
        indexOffset: tokenIndex,
      });
      tokenIndex += tokenized.tokens.length;
      pageTokens[chunk.pageNo] = tokenized;
    }

    for (const tokenized of Object.values(pageTokens)) enforceMonotonic(tokenized.tokens);

    const alignmentJson = new TextEncoder().encode(
      JSON.stringify({
        renditionId,
        source: alignmentSource,
        pages: Object.entries(pageTokens).map(([pageNo, tokenized]) => ({
          pageNo: Number(pageNo),
          tokens: tokenized.tokens,
          sentences: tokenized.sentences,
        })),
      }),
    );
    const alignmentAssetId = await writeAudioAsset({
      db: runtime.db,
      store: runtime.objectStore,
      userId,
      bucket: runtime.buckets.media,
      key: audioKeys.alignment(renditionId),
      bytes: alignmentJson,
      mimeType: 'application/json',
      kind: 'tts_alignment_json',
    });

    // Page marks: ~24 rows the reader seeks by. Word timings stay in the JSON blob above —
    // a thousand words × N renditions is millions of rows nobody ever queries one at a time.
    await runtime.db.execute(sql`delete from audio_page_marks where rendition_id = ${renditionId}`);
    const byPage = new Map<number, { startMs: number; endMs: number; chunkAssetId: string }>();
    for (const [index, mark] of assembled.marks.entries()) {
      const existing = byPage.get(mark.pageNo);
      const output = outputs[index];
      byPage.set(mark.pageNo, {
        startMs: existing ? Math.min(existing.startMs, mark.startMs) : mark.startMs,
        endMs: existing ? Math.max(existing.endMs, mark.endMs) : mark.endMs,
        chunkAssetId: existing?.chunkAssetId ?? output?.assetId ?? '',
      });
    }
    for (const [pageNo, mark] of byPage) {
      const page = pages.find((candidate) => candidate.page_no === pageNo);
      if (!page) continue;
      await runtime.db.execute(sql`
        insert into audio_page_marks (rendition_id, page_id, page_no, start_ms, end_ms, chunk_asset_id)
        values (${renditionId}, ${page.id}, ${pageNo}, ${mark.startMs}, ${mark.endMs},
                ${mark.chunkAssetId || null})
      `);
    }

    const billedCharacters = outputs.reduce((sum, output) => sum + output.billedCharacters, 0);
    await runtime.db.execute(sql`
      update audio_renditions
         set status = 'succeeded',
             full_asset_id = ${fullAssetId},
             alignment_asset_id = ${alignmentAssetId},
             alignment_source = ${alignmentSource},
             duration_ms = ${assembled.totalDurationMs},
             billed_units = ${billedCharacters},
             billing_unit = 'character',
             cost_usd = ${costUsd.toFixed(5)}::numeric,
             completed_at = now()
       where id = ${renditionId}
    `);

    await appendJobEvent(runtime.db, jobId, 'audio.ready', {
      storyId,
      renditionId,
      durationMs: assembled.totalDurationMs,
    });

    return {
      renditionId,
      totalDurationMs: assembled.totalDurationMs,
      measuredLufs: assembled.measuredLufs,
      alignmentSource,
      pageCount: byPage.size,
      costUsd,
    };
  };
}

/**
 * One chunk's bytes → float samples ready to be joined.
 *
 * The joiner works on raw samples, which is exactly why `TTS_OUTPUT_FORMAT` defaults to PCM:
 * nothing is decoded or re-encoded between the vendor and the finished file, so twelve
 * chunks do not stack twelve generations of MP3 loss.
 *
 * A COMPRESSED format is therefore refused with a message naming both knobs involved,
 * rather than silently producing a broken or silent narration — the failure mode that would
 * only be discovered by a parent at bedtime.
 */
export function chunkSamples(input: {
  bytes: Uint8Array;
  mimeType: string;
  durationMs: number;
  sampleRate: number;
  provider: string;
  settings: TtsSettings;
}): Float32Array {
  if (input.mimeType.startsWith('audio/L') || input.mimeType === 'audio/pcm') {
    return pcm16ToFloat(input.bytes);
  }
  if (input.mimeType === 'audio/wav' || input.mimeType === 'audio/x-wav') {
    return decodeWav(input.bytes).channels[0] ?? new Float32Array(0);
  }

  // The deterministic double returns opaque bytes with a plausible duration rather than real
  // audio. Mock mode still has to produce a playable file — that is how the whole pipeline
  // (page marks, timings, the player) is exercised without a vendor — so the chunk becomes
  // silence of the right length. Never reachable with a real provider: see below.
  if (input.provider === 'fake') {
    return new Float32Array(Math.max(0, Math.round((input.durationMs / 1000) * input.sampleRate)));
  }

  throw new Error(
    `cannot join a ${input.mimeType} chunk: set TTS_OUTPUT_FORMAT=pcm_48000 (current: ` +
      `${input.settings.outputFormat}), or provide AUDIO_FFMPEG_PATH for compressed formats`,
  );
}

/** Raw PCM bytes → float samples. Re-exported so the concat step reads one helper. */
export { pcm16ToFloat, floatToPcm16 };
