/**
 * processors/image.ts — the three illustration processors.
 *
 *   image.style_plate      once per story: the palette/technique anchor (SPEC §8.2 step 2)
 *   image.character_sheet  once per story: the identity anchor + the face crop (step 3/3b)
 *   image.page / .cover    thirteen times per book, fanned out (step 5)
 *
 * ORDER IS THE PRODUCT. The plate and the sheet are NOT children of the book flow: the
 * parent chooses one of three sheet variants before a single page is drawn (SPEC §8.1 ④),
 * and drawing twelve pages against a character nobody approved is twelve pages of waste.
 *
 * PARTIAL SUCCESS IS THE DEFAULT POSTURE (SPEC §8.4). A page that exhausts its QA budget
 * lands in `manual_review` with its counters and its measurements recorded, the step is
 * marked failed so the fan-in join counts it, and the book completes without it. Nothing
 * in this file can fail a book because one page was hard to draw.
 */

import type { Job } from 'bullmq';
import { sql } from 'drizzle-orm';
import type { Database } from '@kendihikayem/db';
import {
  buildCharacterSheetPrompt,
  buildCoverPrompt,
  buildPagePrompt,
  buildReferences,
  buildStylePlatePrompt,
  composeNegativePrompt,
  auditIllustrationPrompt,
  estimateCost,
  type CharacterDna,
  type ProviderCallContext,
  type PromptAuditIssue,
  type PromptHardening,
  type TextSafeZone,
} from '@kendihikayem/providers';
import { cropToSquare, storageKeys } from '@kendihikayem/media';

import type { JobPayload } from '../queues';
import type { WorkerRuntime } from '../runtime';
import { appendJobEvent } from '../jobs/events';
import { beginStep, completeStep, failStep, getJob, transitionJob } from '../jobs/repository';
import { stepKeys, sha256Hex, stepInputHash } from '../jobs/hashing';
import { lookupContentCache, storeContentCache } from '../cache/content-cache';
import {
  loadStoryImageContext,
  loadStoryPage,
  type ImageContext,
  type StoryImageContext,
} from './image-context';
import {
  setCharacterAssets,
  setPageImageStatus,
  setStylePlateAsset,
  signedMediaFor,
  storeImageAsset,
  storePageRenditions,
} from './image-assets';
import { assertImageBudget, CostCapReachedError } from './image-budget';
import { renderWithQaLoop, type RenderOutcome } from './image-render';

export type ImageProcessor = (runtime: WorkerRuntime, job: Job<JobPayload>) => Promise<unknown>;

/* ── shared helpers ────────────────────────────────────────────────────────── */

async function ensureRunning(runtime: WorkerRuntime, jobId: string): Promise<void> {
  const job = await getJob(runtime.db, jobId);
  if (job && job.status === 'queued') await transitionJob(runtime.db, jobId, 'running');
}

function callContext(job: Job<JobPayload>, stepId: string, requestId: string): ProviderCallContext {
  return {
    requestId,
    correlationId: job.data.correlationId,
    userId: job.data.userId,
    jobStepId: stepId,
  };
}

/** Resolution follows the print flag: 2K on screen, 4K only for an ordered book (SPEC §6.2). */
function resolutionFor(print: boolean): 'screen_2k' | 'print_4k' {
  return print ? 'print_4k' : 'screen_2k';
}

/** Reads reference bytes for the QA gate; a missing reference simply skips its check. */
async function referenceBytes(
  ctx: ImageContext,
  assetId: string | undefined,
): Promise<Uint8Array | undefined> {
  if (!assetId) return undefined;
  try {
    const resolved = await ctx.references.resolve({ kind: 'style_plate', assetId });
    return resolved.bytes;
  } catch {
    // A reference we cannot read must not stop the render — it degrades the QA gate, and
    // that gap is recorded in `image_qa.unavailableChecks`.
    return undefined;
  }
}

/* ── image.style_plate ─────────────────────────────────────────────────────── */

/**
 * One character-free plate per story. It is what every page render is conditioned on for
 * palette and technique, and what the QA gate measures palette drift against — so it is
 * generated first and never regenerated for the same style.
 */
export function makeStylePlateProcessor(contextFor: ContextFactory): ImageProcessor {
  return async (runtime, job) => {
    const { jobId, userId } = job.data;
    await ensureRunning(runtime, jobId);

    const ctx = contextFor(runtime);
    const storyId = String(job.data.ref?.['storyId'] ?? '');
    const story = await loadStoryImageContext(runtime.db, storyId);
    const settingEn = String(job.data.ref?.['settingEn'] ?? 'a warm, cosy interior at dusk');

    const claim = await beginStep(runtime.db, {
      jobId,
      stepKey: stepKeys.stylePlate(),
      kind: 'image',
      inputHash: stepInputHash({ storyId, style: story.artStyleCode, settingEn }),
    });
    if (claim.reuse) return { status: 'reused', assetId: claim.output?.['assetId'] };

    const estimate = estimateCost('page_reillustrate', {}, runtime.priceBook);
    await assertImageBudget(runtime.db, {
      userId,
      jobId,
      estimateUsd: estimate.breakdownUsd.image,
      caps: runtime.caps,
    });

    const buildPrompt = (hardening?: PromptHardening) => {
      const base = buildStylePlatePrompt({ style: story.style, settingEn });
      return hardening && hardening.failedChecks.length > 0
        ? `${base}\nCRITICAL: render the environment only, with no characters and no text.`
        : base;
    };

    const outcome = await renderWithQaLoop(ctx, {
      buildPrompt,
      auditPrompt: (promptEn) =>
        auditIllustrationPrompt({
          promptEn,
          artStyleCode: story.artStyleCode,
          knownArtStyleCodes: story.knownArtStyleCodes,
        }).issues,
      purpose: 'style_plate',
      references: [],
      resolution: 'screen_2k',
      aspectRatio: '1:1',
      negativePromptEn: composeNegativePrompt(story.style, 'people, characters, animals, faces'),
      // No style plate to compare against — this IS the style plate.
      qa: { expectedAspectRatio: 1 },
      callCtx: callContext(job, claim.step.id, claim.step.provider_request_id ?? claim.step.id),
    });

    if (outcome.status !== 'ok') {
      await failStep(runtime.db, claim.step.id, describeFailure(outcome));
      throw failureError(outcome, 'style plate');
    }

    const asset = await storeImageAsset({
      db: runtime.db,
      store: ctx.store,
      userId,
      kind: 'image_style_plate',
      key: storageKeys.stylePlate(storyId),
      bytes: outcome.image.bytes,
      mimeType: outcome.image.mimeType,
      width: outcome.image.width,
      height: outcome.image.height,
      sha256: outcome.image.sha256,
      provider: outcome.provider,
    });

    await setStylePlateAsset(runtime.db, story.artStyleCode, asset.assetId);
    await completeStep(runtime.db, claim.step.id, {
      status: 'succeeded',
      output: { assetId: asset.assetId, attempts: outcome.attempts.length },
      provider: outcome.provider,
      providerModel: outcome.model,
      costUsd: outcome.costUsd,
    });

    await appendJobEvent(runtime.db, jobId, 'image.ready', {
      storyId,
      target: 'style_plate',
      image: await signedMediaFor(ctx.store, asset.key, ctx.config.signedUrlTtlSec, asset),
    });

    return { status: 'succeeded', assetId: asset.assetId };
  };
}

/* ── image.character_sheet ─────────────────────────────────────────────────── */

/**
 * The identity anchor, plus the face crop cut from it IN CODE (SPEC §8.2 step 3b — "sharp,
 * kod — API değil"). Asking a model to "zoom in on the face" produces a NEW face, which
 * would make the reference that guards consistency the first thing to break it.
 *
 * SPEC §8.1 ④ wants three variants for the parent to choose between; `variantCount` drives
 * that, and each variant is its own step so a failed variant does not lose the others.
 */
export function makeCharacterSheetProcessor(contextFor: ContextFactory): ImageProcessor {
  return async (runtime, job) => {
    const { jobId, userId } = job.data;
    await ensureRunning(runtime, jobId);

    const ctx = contextFor(runtime);
    const storyId = String(job.data.ref?.['storyId'] ?? '');
    const variantCount = Number(job.data.ref?.['variantCount'] ?? 3);
    const story = await loadStoryImageContext(runtime.db, storyId);

    if (!story.character || !story.characterId) {
      throw new Error(`story ${storyId} has no character canon; run the cast stage first`);
    }
    const character: CharacterDna = story.character;

    const stylePlate = await referenceBytes(ctx, story.stylePlateAssetId);
    const variants: Array<{ variant: number; assetId: string; key: string }> = [];
    let firstFailure: RenderOutcome | undefined;

    for (let variant = 1; variant <= variantCount; variant += 1) {
      const claim = await beginStep(runtime.db, {
        jobId,
        stepKey: stepKeys.characterSheet(variant),
        kind: 'image',
        inputHash: stepInputHash({ storyId, canon: character.sha256, variant }),
      });
      if (claim.reuse) continue;

      const estimate = estimateCost('page_reillustrate', { print: true }, runtime.priceBook);
      await assertImageBudget(runtime.db, {
        userId,
        jobId,
        estimateUsd: estimate.breakdownUsd.image,
        caps: runtime.caps,
      });

      const outcome = await renderWithQaLoop(ctx, {
        buildPrompt: (hardening) => {
          const base = buildCharacterSheetPrompt({ character, style: story.style, variant });
          return hardening && hardening.failedChecks.length > 0
            ? `${base}\nCRITICAL: keep every view of the character identical and render no text.`
            : base;
        },
        auditPrompt: (promptEn) =>
          auditIllustrationPrompt({
            promptEn,
            character,
            artStyleCode: story.artStyleCode,
            knownArtStyleCodes: story.knownArtStyleCodes,
          }).issues,
        purpose: 'character_sheet',
        // The plate goes in so the sheet is drawn in the book's technique from the start.
        references: buildReferences({ stylePlateAssetId: story.stylePlateAssetId }),
        // Sheets are rendered at print resolution: the face crop is taken from them, and a
        // 2K crop would be too soft to condition anything (SPEC §6.1 prices them at 4K).
        resolution: 'print_4k',
        aspectRatio: '1:1',
        negativePromptEn: composeNegativePrompt(story.style, 'background scenery, props'),
        qa: {
          ...(stylePlate ? { stylePlate } : {}),
          expectedAspectRatio: 1,
        },
        callCtx: callContext(job, claim.step.id, claim.step.provider_request_id ?? claim.step.id),
      });

      if (outcome.status !== 'ok') {
        await failStep(runtime.db, claim.step.id, describeFailure(outcome));
        firstFailure ??= outcome;
        continue;
      }

      const asset = await storeImageAsset({
        db: runtime.db,
        store: ctx.store,
        userId,
        kind: 'image_character_sheet',
        key: storageKeys.characterSheet(storyId, story.characterId, variant),
        bytes: outcome.image.bytes,
        mimeType: outcome.image.mimeType,
        width: outcome.image.width,
        height: outcome.image.height,
        sha256: outcome.image.sha256,
        provider: outcome.provider,
      });

      await completeStep(runtime.db, claim.step.id, {
        status: 'succeeded',
        output: { assetId: asset.assetId, variant },
        provider: outcome.provider,
        providerModel: outcome.model,
        costUsd: outcome.costUsd,
      });
      variants.push({ variant, assetId: asset.assetId, key: asset.key });

      await appendJobEvent(runtime.db, jobId, 'image.ready', {
        storyId,
        target: 'character_sheet',
        characterId: story.characterId,
        image: await signedMediaFor(ctx.store, asset.key, ctx.config.signedUrlTtlSec, asset),
      });
    }

    if (variants.length === 0) {
      // No sheet means no consistent character. This one genuinely cannot degrade
      // gracefully: pages drawn without a sheet would each invent their own child.
      throw failureError(firstFailure, 'character sheet');
    }

    /* The face crop, cut from the chosen sheet with code. Default selection is variant 1;
     * the parent's choice replaces it through the approval endpoint. */
    const chosen = variants[0]!;
    const sheetBytes = await ctx.store.get(chosen.key);
    const faceRef = await cropFaceRef(sheetBytes);
    const faceAsset = await storeImageAsset({
      db: runtime.db,
      store: ctx.store,
      userId,
      kind: 'image_face_ref',
      key: storageKeys.faceRef(storyId, story.characterId),
      bytes: faceRef.bytes,
      mimeType: 'image/png',
      width: faceRef.width,
      height: faceRef.height,
    });

    await setCharacterAssets(runtime.db, story.characterId, {
      characterSheetAssetId: chosen.assetId,
      faceRefAssetId: faceAsset.assetId,
      sheetVariants: { variants: variants.map((v) => ({ variant: v.variant, assetId: v.assetId })) },
    });

    return {
      status: 'succeeded',
      variants: variants.length,
      characterSheetAssetId: chosen.assetId,
      faceRefAssetId: faceAsset.assetId,
    };
  };
}

/**
 * Crops the head close-up out of a model sheet.
 *
 * The sheet's layout is fixed by the prompt (full-body row on top, four head close-ups
 * below), so the first close-up sits in the lower-left quadrant. A geometric crop is
 * approximate, and deliberately so: it is deterministic, free and cannot redraw the face.
 * A face detector would place it better and is the natural upgrade — the crop rectangle is
 * the only thing that would change.
 */
async function cropFaceRef(
  sheet: Uint8Array,
): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const { readInfo } = await import('@kendihikayem/media');
  const info = await readInfo(sheet);
  const size = Math.floor(Math.min(info.width, info.height) * 0.25);
  const region = {
    left: Math.floor(info.width * 0.04),
    top: Math.floor(info.height * 0.62),
    width: size,
    height: size,
  };
  const edge = Math.min(1024, size);
  const cropped = await cropToSquare(sheet, region, edge);
  return { bytes: cropped.bytes, width: cropped.info.width, height: cropped.info.height };
}

/* ── image.page / image.cover ──────────────────────────────────────────────── */

/**
 * ⭐ One page. Runs thirteen times per book, in parallel, rate-limited by the `image` queue.
 *
 * The whole partial-success contract is in the tail of this function: an exhausted QA
 * budget writes `manual_review` and fails the STEP, never the JOB. `book.assemble` counts
 * the steps and closes the job as `succeeded` with a `partial` summary.
 */
export function makeImagePageProcessor(contextFor: ContextFactory): ImageProcessor {
  return async (runtime, job) => {
    const { jobId, userId, pageNo } = job.data;
    await ensureRunning(runtime, jobId);

    const ctx = contextFor(runtime);
    const storyId = String(job.data.ref?.['storyId'] ?? '');
    const print = Boolean(job.data.ref?.['print']);
    const resolution = resolutionFor(print);
    const isCover = pageNo === undefined;

    const story = await loadStoryImageContext(runtime.db, storyId);
    const page = isCover ? undefined : await loadStoryPage(runtime.db, storyId, pageNo);

    const scene = sceneFor(page, job, isCover);
    const references = buildReferences({
      ...(story.characterSheetAssetId ? { characterSheetAssetId: story.characterSheetAssetId } : {}),
      ...(story.faceRefAssetId ? { faceRefAssetId: story.faceRefAssetId } : {}),
      ...(story.stylePlateAssetId ? { stylePlateAssetId: story.stylePlateAssetId } : {}),
    });

    const buildPrompt = promptBuilderFor(story, scene, isCover);
    const basePrompt = buildPrompt();
    const promptSha = sha256Hex(basePrompt);

    const stepKey = job.data.stepKey ?? (isCover ? stepKeys.imageCover() : stepKeys.imagePage(pageNo));
    const claim = await beginStep(runtime.db, {
      jobId,
      stepKey,
      kind: 'image',
      inputHash: stepInputHash({ storyId, pageNo, resolution, promptSha }),
    });
    if (claim.reuse) return { status: 'reused' };

    /* ── content cache: the same scene, already drawn, costs nothing ────────── */
    const estimate = estimateCost('page_reillustrate', { print }, runtime.priceBook);
    const cacheKey = {
      provider: ctx.router.primary.provider,
      model: resolution,
      operation: 'image.generate',
      params: { resolution, references: references.map((r) => r.assetId) },
      prompt: basePrompt,
    };
    const cached = await lookupContentCache<{ assetId?: string; key?: string; width?: number; height?: number; sizeBytes?: number; mimeType?: string }>(
      runtime.db,
      cacheKey,
      estimate.breakdownUsd.image,
    );
    if (cached.hit && cached.payload?.assetId) {
      await completeStep(runtime.db, claim.step.id, {
        status: 'skipped',
        output: { ...cached.payload, cached: true },
        costUsd: 0,
      });
      if (!isCover) {
        await setPageImageStatus(runtime.db, {
          storyId,
          pageNo,
          status: 'ready',
          imageAssetId: cached.payload.assetId,
          promptSha256: promptSha,
        });
        await emitPageReady(runtime, ctx, {
          jobId,
          storyId,
          pageNo,
          key: cached.payload.key ?? '',
          width: cached.payload.width ?? 0,
          height: cached.payload.height ?? 0,
          sizeBytes: cached.payload.sizeBytes ?? 0,
          mimeType: cached.payload.mimeType ?? 'image/webp',
          cached: true,
        });
      }
      return { status: 'skipped', savedUsd: cached.savedUsd };
    }

    /* ── the cap check, BEFORE anything is spent ───────────────────────────── */
    try {
      await assertImageBudget(runtime.db, {
        userId,
        jobId,
        estimateUsd: estimate.breakdownUsd.image,
        caps: runtime.caps,
      });
    } catch (error) {
      if (error instanceof CostCapReachedError) {
        await failStep(runtime.db, claim.step.id, {
          code: error.code,
          reason: error.reason,
          retryable: false,
          detail: error.message,
        });
        if (!isCover) {
          await setPageImageStatus(runtime.db, { storyId, pageNo, status: 'failed' });
        }
      }
      throw error;
    }

    if (!isCover) {
      await setPageImageStatus(runtime.db, { storyId, pageNo, status: 'generating' });
    }

    /* ── generate → QA → harden → regenerate ───────────────────────────────── */
    const stylePlate = await referenceBytes(ctx, story.stylePlateAssetId);
    const faceRef = await referenceBytes(ctx, story.faceRefAssetId);

    const outcome = await renderWithQaLoop(ctx, {
      buildPrompt,
      auditPrompt: (promptEn) =>
        auditIllustrationPrompt({
          promptEn,
          ...(story.character ? { character: story.character } : {}),
          artStyleCode: story.artStyleCode,
          knownArtStyleCodes: story.knownArtStyleCodes,
        }).issues,
      purpose: isCover ? 'cover' : 'page',
      references,
      resolution,
      aspectRatio: '1:1',
      negativePromptEn: composeNegativePrompt(story.style),
      qa: {
        ...(stylePlate ? { stylePlate } : {}),
        ...(faceRef ? { faceRef } : {}),
        ...(isCover ? {} : { textSafeZone: scene.textSafeZone }),
        expectedAspectRatio: 1,
      },
      callCtx: callContext(job, claim.step.id, claim.step.provider_request_id ?? claim.step.id),
      onAttemptStart: async (attempt) => {
        // `image_attempts` is what the reader turns into "2 denemeden sonra kontrolde",
        // and what ops sorts the review queue by.
        if (!isCover && attempt >= 1) {
          await setPageImageStatus(runtime.db, {
            storyId,
            pageNo,
            status: 'generating',
            incrementAttempts: true,
          });
        }
      },
    });

    /* ── failure paths, all of them survivable for the book ────────────────── */
    if (outcome.status !== 'ok') {
      const status = outcome.status === 'prompt_rejected' ? 'failed' : 'manual_review';
      if (!isCover) {
        await setPageImageStatus(runtime.db, {
          storyId,
          pageNo,
          status,
          imageQa: {
            ...(outcome.status === 'qa_exhausted' ? outcome.qa.imageQa : {}),
            failedChecks:
              outcome.status === 'qa_exhausted' ? outcome.qa.failedChecks : undefined,
            attempts: outcome.attempts.length,
            lastFailure: outcome.status,
          },
          promptSha256: promptSha,
        });
      }
      await failStep(runtime.db, claim.step.id, describeFailure(outcome));

      /**
       * ⭐ WHO OWNS THE RETRY BUDGET.
       *
       * A quality failure has already been retried — this loop rendered it
       * `IMAGE_QA_MAX_ATTEMPTS` times with a hardened prompt each time. Throwing here
       * would hand it to BullMQ's own `attempts: 3`, which re-enters this processor and
       * renders it three more times: nine paid renders for a page we decided after three
       * that a human should look at. So a QA-exhausted or prompt-rejected page RESOLVES.
       * The STEP is failed, which is what `book.assemble` counts, so the book is still
       * partial — it just costs what it was budgeted to cost.
       *
       * A transport failure is different: the vendor may simply be down, and a delayed
       * queue-level retry is exactly the right response. That one throws.
       */
      if (outcome.status === 'provider_failed') {
        throw failureError(outcome, isCover ? 'cover' : `page ${pageNo}`);
      }
      return {
        status,
        pageNo,
        attempts: outcome.attempts.length,
        costUsd: outcome.costUsd,
        failedChecks: outcome.status === 'qa_exhausted' ? outcome.qa.failedChecks : [],
      };
    }

    /* ── success: renditions → store → assets → story_pages → event ────────── */
    const renditions = await storePageRenditions({
      db: runtime.db,
      store: ctx.store,
      userId,
      storyId,
      ...(isCover ? {} : { pageNo }),
      image: outcome.image.bytes,
      provider: outcome.provider,
    });

    await storeContentCache(
      runtime.db,
      cacheKey,
      {
        kind: 'image',
        assetId: renditions.primary.assetId,
        payload: {
          assetId: renditions.primary.assetId,
          key: renditions.primary.key,
          width: renditions.primary.width,
          height: renditions.primary.height,
          sizeBytes: renditions.primary.sizeBytes,
          mimeType: renditions.primary.mimeType,
        },
      },
    );

    await completeStep(runtime.db, claim.step.id, {
      status: 'succeeded',
      output: {
        assetId: renditions.primary.assetId,
        attempts: outcome.attempts.length,
        qa: outcome.qa.imageQa,
        // The exact prompt that produced these pixels — provenance for ops and for
        // reproducing a render, kept on the step rather than on the story row.
        promptEn: outcome.promptEn,
      },
      provider: outcome.provider,
      providerModel: outcome.model,
      costUsd: outcome.costUsd,
    });

    if (isCover) {
      await appendJobEvent(runtime.db, jobId, 'image.ready', {
        storyId,
        target: 'cover',
        image: await signedMediaFor(
          ctx.store,
          renditions.primary.key,
          ctx.config.signedUrlTtlSec,
          renditions.primary,
        ),
      });
    } else {
      await setPageImageStatus(runtime.db, {
        storyId,
        pageNo,
        status: 'ready',
        imageAssetId: renditions.primary.assetId,
        imageQa: outcome.qa.imageQa,
        promptSha256: promptSha,
      });
      await emitPageReady(runtime, ctx, {
        jobId,
        storyId,
        pageNo,
        key: renditions.primary.key,
        width: renditions.primary.width,
        height: renditions.primary.height,
        sizeBytes: renditions.primary.sizeBytes,
        mimeType: renditions.primary.mimeType,
        cached: false,
      });
    }

    return {
      status: 'succeeded',
      attempts: outcome.attempts.length,
      costUsd: outcome.costUsd,
    };
  };
}

/**
 * Progressive delivery (SPEC §8.2 step 5): the reader shows a page THE MOMENT it exists,
 * rather than after all thirteen. On a 90-second book that is the difference between a
 * parent watching a spinner and a parent watching their child's story appear.
 */
async function emitPageReady(
  runtime: WorkerRuntime,
  ctx: ImageContext,
  input: {
    jobId: string;
    storyId: string;
    pageNo: number;
    key: string;
    width: number;
    height: number;
    sizeBytes: number;
    mimeType: string;
    cached: boolean;
  },
): Promise<void> {
  await appendJobEvent(runtime.db, input.jobId, 'page.image.ready', {
    storyId: input.storyId,
    pageNo: input.pageNo,
    cached: input.cached,
    image: await signedMediaFor(ctx.store, input.key, ctx.config.signedUrlTtlSec, {
      width: input.width,
      height: input.height,
      sizeBytes: input.sizeBytes,
      mimeType: input.mimeType,
    }),
  });
}

/* ── prompt assembly ───────────────────────────────────────────────────────── */

interface SceneInput {
  pageNo: number;
  sceneEn: string;
  emotion?: string;
  timeOfDay?: string;
  camera?: string;
  textSafeZone: TextSafeZone;
}

/**
 * ⚠️ `story_pages.illustration_prompt_en` is READ HERE AND NEVER WRITTEN BACK.
 *
 * The story stage owns that column: it holds the per-page English scene beat. This
 * pipeline composes the FULL prompt around it (style + canon + scene + composition +
 * negative). Writing the composed result back would make the column its own input on the
 * next run — a feedback loop that changes the prompt, changes its hash, and silently
 * misses the content cache on every regeneration. The composed prompt's provenance lives
 * in `job_steps.output.promptEn`, and its hash in `story_pages.prompt_sha256`.
 */
function sceneFor(
  page: Awaited<ReturnType<typeof loadStoryPage>>,
  job: Job<JobPayload>,
  isCover: boolean,
): SceneInput {
  const fallback = String(
    job.data.ref?.['sceneEn'] ??
      (isCover
        ? 'The hero stands at the threshold of the story, looking towards the reader.'
        : 'The hero explores a quiet, warm corner of the story world.'),
  );
  return {
    pageNo: page?.page_no ?? 0,
    sceneEn: page?.illustration_prompt_en ?? page?.scene_summary_tr ?? fallback,
    ...(page?.emotion ? { emotion: page.emotion } : {}),
    ...(page?.time_of_day ? { timeOfDay: page.time_of_day } : {}),
    ...(page?.camera ? { camera: page.camera } : {}),
    textSafeZone: (page?.text_safe_zone as TextSafeZone) ?? 'bottom',
  };
}

function promptBuilderFor(
  story: StoryImageContext,
  scene: SceneInput,
  isCover: boolean,
): (hardening?: PromptHardening) => string {
  const character = story.character;
  if (!character) {
    // Without a frozen canon there is no consistency to preserve, and a page drawn now
    // would not match the pages drawn after the cast is created.
    throw new Error(`story ${story.storyId} has no CHARACTER_DNA; run the cast stage first`);
  }

  return (hardening) =>
    isCover
      ? buildCoverPrompt({
          character,
          style: story.style,
          scene: { sceneEn: scene.sceneEn, textSafeZone: scene.textSafeZone },
          ...(hardening ? { hardening } : {}),
        })
      : buildPagePrompt({
          character,
          style: story.style,
          scene,
          ...(hardening ? { hardening } : {}),
        });
}

/* ── failure description ───────────────────────────────────────────────────── */

function describeFailure(outcome: RenderOutcome | undefined): Record<string, unknown> {
  if (!outcome) return { code: 'INTERNAL', retryable: false, detail: 'no attempt was made' };
  switch (outcome.status) {
    case 'qa_exhausted':
      return {
        code: 'IMAGE_QA_FAILED',
        retryable: false,
        attempts: outcome.attempts.length,
        failedChecks: outcome.qa.failedChecks,
        qa: outcome.qa.imageQa,
        detail: `QA failed on every attempt: ${outcome.qa.failedChecks.join(', ')}`,
      };
    case 'prompt_rejected':
      return {
        code: 'MODERATION_BLOCKED',
        retryable: false,
        issues: outcome.issues.map((issue: PromptAuditIssue) => issue.finding),
        detail: 'illustration prompt failed the K5 audit',
      };
    case 'provider_failed':
      return outcome.error.toJobError();
    default:
      return { code: 'INTERNAL', retryable: false };
  }
}

function failureError(outcome: RenderOutcome | undefined, what: string): Error {
  if (outcome?.status === 'provider_failed') return outcome.error;
  const detail = outcome ? String(describeFailure(outcome)['detail'] ?? outcome.status) : 'unknown';
  return new Error(`${what} could not be produced: ${detail}`);
}

/* ── wiring ────────────────────────────────────────────────────────────────── */

export type ContextFactory = (runtime: WorkerRuntime) => ImageContext;

/** Per-runtime context cache: the reference resolver's cache is what makes it worth reusing. */
export function memoiseContext(build: ContextFactory): ContextFactory {
  const cache = new WeakMap<WorkerRuntime, ImageContext>();
  return (runtime) => {
    let ctx = cache.get(runtime);
    if (!ctx) {
      ctx = build(runtime);
      cache.set(runtime, ctx);
    }
    return ctx;
  };
}

export async function countPagesByStatus(
  db: Database,
  storyId: string,
): Promise<Record<string, number>> {
  const rows = await db.execute<{ image_status: string; count: string }>(sql`
    select image_status, count(*)::text as count
      from story_pages where story_id = ${storyId}
     group by image_status
  `);
  return Object.fromEntries(rows.map((row) => [row.image_status, Number(row.count)]));
}
