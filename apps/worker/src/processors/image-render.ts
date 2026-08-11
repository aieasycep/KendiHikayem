/**
 * processors/image-render.ts — ⭐ the generate → QA → harden → regenerate loop.
 *
 * This is SPEC §8.2 step 5 and §8.3 in one function. The shape matters more than any
 * individual check:
 *
 *   for attempt in 1..N:
 *     prompt  = base prompt + hardening for whatever failed LAST time
 *     K5      = deterministic audit — a bad prompt is refused before it costs $0.067
 *     render  = router (which does its own transport retry / failover / breaker)
 *     QA      = the pixel gate
 *     pass ⇒ done. fail ⇒ record which checks failed, harden, go again.
 *   exhausted ⇒ manual_review, and THE BOOK STILL SHIPS.
 *
 * Two distinctions that are easy to blur and expensive to get wrong:
 *
 *   · A TRANSPORT failure (429, 503, timeout) is the router's business: same prompt, same
 *     expectation, try again. It does not consume a QA attempt, because nothing was judged.
 *   · A QUALITY failure (text in the image, palette drift, the vendor's own refusal) is
 *     this loop's business: the prompt changes, and the attempt counter moves. Letting the
 *     router "retry" a quality failure would re-render the identical prompt and get the
 *     identical picture, three times, for three times the money.
 *
 * The hardened prompt is the SAME prompt with an appended correction — never a rewritten
 * one. Rewriting would change the identity tokens, which is the drift the whole pipeline
 * exists to prevent (see `packages/providers/src/image/prompt/builder.ts`).
 */

import type {
  ImageAdapter,
  ImageGenerateInput,
  ImageReference,
  ProviderCallContext,
  ProviderRouter,
  PromptHardening,
} from '@kendihikayem/providers';
import { AllProvidersFailedError, ProviderError, totalUsageUsd } from '@kendihikayem/providers';
import { runImageQaGate, type QaCheckId, type QaGateResult, type TextSafeZone } from '@kendihikayem/media';

import type { ImageContext } from './image-context';
import { type PromptAuditIssue } from '@kendihikayem/providers';

export interface RenderAttemptRecord {
  attempt: number;
  outcome: 'passed' | 'qa_failed' | 'blocked' | 'prompt_rejected';
  failedChecks: QaCheckId[];
  costUsd: number;
  provider?: string;
}

export type RenderOutcome =
  | {
      status: 'ok';
      image: { bytes: Uint8Array; mimeType: string; width: number; height: number; sha256: string };
      promptEn: string;
      provider: string;
      model: string;
      costUsd: number;
      attempts: RenderAttemptRecord[];
      qa: QaGateResult;
    }
  | {
      /** Every attempt was rendered and judged; none passed. → `manual_review`. */
      status: 'qa_exhausted';
      costUsd: number;
      attempts: RenderAttemptRecord[];
      qa: QaGateResult;
      promptEn: string;
    }
  | {
      /** The prompt never became acceptable. Nothing was rendered, nothing was spent. */
      status: 'prompt_rejected';
      issues: PromptAuditIssue[];
      costUsd: 0;
      attempts: RenderAttemptRecord[];
    }
  | {
      /** The provider could not be reached at all after the router exhausted its route. */
      status: 'provider_failed';
      error: ProviderError;
      costUsd: number;
      attempts: RenderAttemptRecord[];
    };

export interface RenderRequest {
  /** Re-built per attempt so the hardening block can change while the identity block cannot. */
  buildPrompt: (hardening?: PromptHardening) => string;
  /** Runs K5 on the prompt this attempt produced. Return the issues, or an empty array. */
  auditPrompt: (promptEn: string) => PromptAuditIssue[];
  purpose: ImageGenerateInput['purpose'];
  references: ImageReference[];
  resolution: ImageGenerateInput['resolution'];
  aspectRatio: ImageGenerateInput['aspectRatio'];
  negativePromptEn?: string;
  batch?: boolean;
  /** QA inputs. Omit a reference to skip the check that needs it. */
  qa: {
    stylePlate?: Uint8Array;
    faceRef?: Uint8Array;
    textSafeZone?: TextSafeZone;
    expectedAspectRatio?: number;
    minEdgePx?: number;
  };
  callCtx: ProviderCallContext;
  /** Called before each attempt — the caller bumps `story_pages.image_attempts` here. */
  onAttemptStart?: (attempt: number) => Promise<void>;
}

export async function renderWithQaLoop(
  ctx: ImageContext,
  request: RenderRequest,
): Promise<RenderOutcome> {
  const attempts: RenderAttemptRecord[] = [];
  let hardening: PromptHardening | undefined;
  let totalCostUsd = 0;
  let lastQa: QaGateResult | undefined;
  let lastPrompt = '';

  for (let attempt = 1; attempt <= ctx.config.maxAttempts; attempt += 1) {
    const promptEn = request.buildPrompt(hardening);
    lastPrompt = promptEn;

    /* ── K5: the free gate. Runs every attempt, because the hardening text is new text. */
    const issues = request.auditPrompt(promptEn);
    if (issues.length > 0) {
      attempts.push({ attempt, outcome: 'prompt_rejected', failedChecks: [], costUsd: 0 });
      return { status: 'prompt_rejected', issues, costUsd: 0, attempts };
    }

    await request.onAttemptStart?.(attempt);

    /* ── Render. The router owns transport retry, failover and the circuit breaker. */
    let attemptCostUsd = 0;
    let routed: Awaited<ReturnType<ProviderRouter<ImageAdapter>['execute']>> extends never
      ? never
      : { value: Awaited<ReturnType<ImageAdapter['generate']>>['value']; provider: string };

    try {
      routed = await ctx.router.execute('image.generate', request.callCtx, async (adapter) => {
        const result = await adapter.generate(
          {
            purpose: request.purpose,
            promptEn,
            ...(request.negativePromptEn ? { negativePromptEn: request.negativePromptEn } : {}),
            references: request.references,
            aspectRatio: request.aspectRatio,
            resolution: request.resolution,
            batch: request.batch ?? true,
            // ⚠️ Explicit on every call: the vendor default is OFF (SPEC §8.2 step 5).
            safety: { blockLevel: 'BLOCK_MOST' },
          },
          request.callCtx,
        );
        attemptCostUsd = totalUsageUsd(result.usage);
        return result;
      });
    } catch (error) {
      totalCostUsd += attemptCostUsd;
      attempts.push({
        attempt,
        outcome: 'qa_failed',
        failedChecks: [],
        costUsd: attemptCostUsd,
      });
      return {
        status: 'provider_failed',
        error: toProviderError(error),
        costUsd: totalCostUsd,
        attempts,
      };
    }

    totalCostUsd += attemptCostUsd;

    /* ── Judge. A vendor refusal enters the gate as `provider_block` rather than as an
     *    exception: it is a quality outcome with a prompt-level remedy, and it must
     *    consume a QA attempt so a persistently refused scene reaches a human. */
    const qa = await runImageQaGate({
      image: routed.value.image.bytes,
      ...(routed.value.blockedReason ? { providerBlockedReason: routed.value.blockedReason } : {}),
      ...(request.qa.stylePlate ? { stylePlate: request.qa.stylePlate } : {}),
      ...(request.qa.faceRef ? { faceRef: request.qa.faceRef } : {}),
      ...(request.qa.textSafeZone ? { textSafeZone: request.qa.textSafeZone } : {}),
      ...(request.qa.expectedAspectRatio !== undefined
        ? { expectedAspectRatio: request.qa.expectedAspectRatio }
        : {}),
      ...(request.qa.minEdgePx !== undefined ? { minEdgePx: request.qa.minEdgePx } : {}),
      thresholds: ctx.config.qa,
      ...(ctx.identityScorer ? { identityScorer: ctx.identityScorer } : {}),
    });
    lastQa = qa;

    if (qa.passed) {
      attempts.push({
        attempt,
        outcome: 'passed',
        failedChecks: [],
        costUsd: attemptCostUsd,
        provider: routed.provider,
      });
      return {
        status: 'ok',
        image: routed.value.image,
        promptEn,
        provider: routed.provider,
        model: routed.value.model,
        costUsd: totalCostUsd,
        attempts,
        qa,
      };
    }

    attempts.push({
      attempt,
      outcome: routed.value.blockedReason ? 'blocked' : 'qa_failed',
      failedChecks: qa.failedChecks,
      costUsd: attemptCostUsd,
      provider: routed.provider,
    });

    // Same prompt, plus a correction naming exactly what failed.
    hardening = { attempt: attempt + 1, failedChecks: qa.failedChecks };
  }

  return {
    status: 'qa_exhausted',
    costUsd: totalCostUsd,
    attempts,
    qa: lastQa ?? { passed: false, checks: [], failedChecks: [], imageQa: {} },
    promptEn: lastPrompt,
  };
}

function toProviderError(error: unknown): ProviderError {
  if (error instanceof AllProvidersFailedError) {
    return (
      error.last ??
      new ProviderError({
        kind: 'unknown',
        provider: 'fake',
        operation: 'image.generate',
        detail: error.message,
      })
    );
  }
  return ProviderError.from(error, { provider: 'fake', operation: 'image.generate' });
}
