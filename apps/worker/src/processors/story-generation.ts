/**
 * processors/story-generation.ts — the two-stage story pipeline, end to end.
 *
 * ⏸ GATE 1 lives between the two functions here, and it is enforced by the ABSENCE of a
 * call: `runOutlineStage` parks the job in `waiting_approval`, and nothing calls
 * `runFillStage` until the parent approves. A gate implemented as a check inside stage 2
 * would already have paid for stage 2's tokens.
 *
 * Every model call goes through `runStep`, which gives four properties for free and makes
 * them non-optional:
 *   · level-3 idempotency — an interrupted job resumes at the first unfinished step
 *   · content cache       — an identical prompt returns for $0 with `saved_usd` recorded
 *   · router              — retry, failover, circuit breaker
 *   · ledger              — every attempt priced into `provider_usage`
 *
 * The quality loop is the other half: generate → measure → hand the model its own report →
 * regenerate, at most `STORY_QUALITY_MAX_ATTEMPTS` times. Each attempt is its own step with
 * its own cost row, because an attempt that cost money and was thrown away is still money.
 */

import type { ErrorCode } from '@kendihikayem/contract';
import type { LlmAdapter, LlmMessage } from '@kendihikayem/providers';
import { completeStructuredOn, type StructuredValue } from '@kendihikayem/providers';
import {
  type SafetyViolation,
  auditStoryOutput,
  checkStoryQuality,
  evaluateJudgeVerdict,
  sanitizeChildName,
  sanitizeFreeText,
  violationsFromModeration,
} from '@kendihikayem/safety';
import type { z } from 'zod';

import type { WorkerRuntime } from '../runtime';
import { stepKeys } from '../jobs/hashing';
import { runStep, type RunStepResult } from './run-step';
import {
  PROMPT_VERSION,
  buildFillPrompt,
  buildJudgePrompt,
  buildOutlinePrompt,
  buildPageRewritePrompt,
  buildSystemPrompt,
  fillSchema,
  judgeSchema,
  outlineSchema,
  pageRewriteSchema,
  type SystemPrompt,
} from '../prompts/index';
import {
  type StoredOutline,
  type StoryContext,
  loadStoryContext,
  loadStoryPages,
  recordAudit,
  recordModerationEvent,
  recordViolations,
  savePages,
  saveOutline,
  setStoryStatus,
} from './story-repository';

/* ── errors ────────────────────────────────────────────────────────────────── */

/**
 * A refusal the PARENT is told about, in Turkish, with their credit intact. Distinct from a
 * `ProviderError`: nothing is broken, the content is simply not publishable.
 */
export class StoryGateError extends Error {
  readonly errorCode: ErrorCode;
  readonly messageTr: string;
  readonly violations: SafetyViolation[];

  constructor(init: { errorCode: ErrorCode; messageTr: string; violations: SafetyViolation[] }) {
    super(`${init.errorCode}: ${init.messageTr}`);
    this.name = 'StoryGateError';
    this.errorCode = init.errorCode;
    this.messageTr = init.messageTr;
    this.violations = init.violations;
  }
}

export interface StoryJobContext {
  jobId: string;
  userId: string;
  correlationId: string;
  storyId: string;
}

/* ── stage 1: outline ──────────────────────────────────────────────────────── */

export interface OutlineStageResult {
  outline: StoredOutline;
  attempts: number;
  costUsd: number;
}

export async function runOutlineStage(
  runtime: WorkerRuntime,
  job: StoryJobContext,
): Promise<OutlineStageResult> {
  const story = await requireStory(runtime, job.storyId);
  await setStoryStatus(runtime.db, story.id, 'outline_generating');

  /* K1 — deterministic input validation. The API ran this too; running it again here is
   * the difference between "the HTTP layer is trusted" and "the pipeline is safe". */
  const heroName = requireSanitisedName(story.heroName);
  const freeIdeaTr = requireSanitisedFreeText(readString(story.requestInput, 'freeIdeaTr'));

  /* K2 — vendor moderation on what the parent typed. Free, and Turkish-proven. */
  await moderateParentInput(runtime, job, story, [heroName, freeIdeaTr ?? ''].join(' ').trim());

  const prompt = buildOutlinePrompt({
    heroName,
    ageBand: story.ageBand,
    pageCount: story.pageCount,
    religiousOptIn: story.religiousOptIn,
    themeCode: story.themeCode ?? undefined,
    artStyleCode: story.artStyleCode,
    lessonHintTr: readString(story.requestInput, 'lessonHintTr'),
    culturalTags: story.culturalTags,
    freeIdeaTr,
    characterBuilder: readRecord(story.requestInput, 'characterBuilder'),
  });

  const step = await runStructuredStep(runtime, job, {
    stepKey: stepKeys.llmOutline(),
    purpose: 'outline',
    schema: outlineSchema,
    messages: prompt.messages,
    maxOutputTokens: runtime.env.LLM_MAX_OUTPUT_TOKENS_OUTLINE,
    stepInput: {
      storyId: story.id,
      stage: 'outline',
      promptVersion: PROMPT_VERSION,
      pageCount: story.pageCount,
      ageBand: story.ageBand,
    },
    estimatedUsd: runtime.priceBook.llm.outline.outputPerMTokUsd * 0.002,
  });

  const draft = step.value;

  /* K4a — the outline is Turkish text a parent will read on the approval screen, so it
   * gets the same deterministic audit the pages get. */
  const outlineText = [
    draft.kitap_meta.baslik,
    draft.kitap_meta.ogrenilen_ders,
    ...draft.sayfalar.map((scene) => scene.sahne_ozeti),
  ].join('\n');

  const audit = auditStoryOutput({
    ageBand: story.ageBand,
    religiousOptIn: story.religiousOptIn,
    text: outlineText,
    titleTr: draft.kitap_meta.baslik,
    canaryToken: prompt.system.canaryToken,
  });

  await recordViolations(
    runtime.db,
    { userId: job.userId, storyId: story.id, surface: 'story_text', stage: 'post' },
    audit.decision.violations,
    audit.decision.verdict === 'block' ? 'regenerate' : 'none',
  );

  if (audit.injectionSignalled) {
    // The model used the K3 escape hatch: an injection attempt reached it. Flag the
    // account rather than silently regenerating.
    await recordAudit(runtime.db, {
      actorType: 'system',
      actorId: job.userId,
      action: 'safety.injection_signalled',
      entityType: 'story',
      entityId: story.id,
      after: { stage: 'outline' },
      traceId: job.correlationId,
    });
  }

  if (audit.decision.verdict === 'block') {
    await setStoryStatus(runtime.db, story.id, 'failed', {
      safety: { blockedAt: 'outline', code: audit.decision.errorCode },
    });
    throw new StoryGateError({
      errorCode: audit.decision.errorCode ?? 'MODERATION_BLOCKED',
      messageTr: audit.decision.messageTr ?? '',
      violations: audit.decision.violations,
    });
  }

  const outline: StoredOutline = {
    titleTr: draft.kitap_meta.baslik,
    lessonTr: draft.kitap_meta.ogrenilen_ders,
    scenes: draft.sayfalar.map((scene) => ({
      pageNo: scene.sayfa_no,
      summaryTr: scene.sahne_ozeti,
      emotion: scene.duygusal_ton,
    })),
    characters: draft.karakter_kanonu.map((character) => ({
      role: character.rol,
      nameTr: character.ad,
      canonEn: character.gorsel_tarif_en,
    })),
    variants: draft.karakter_varyantlari.map((variant) => ({
      id: variant.varyant_id,
      summaryTr: variant.ozet_tr,
      promptEn: variant.gorsel_tarif_en,
    })),
    cover: { summaryTr: draft.kapak_fikri.ozet_tr, promptEn: draft.kapak_fikri.gorsel_tarif_en },
  };

  await saveOutline(runtime.db, {
    storyId: story.id,
    outline,
    modelMeta: {
      promptVersion: PROMPT_VERSION,
      outlineModel: step.model,
      outlineAttempts: step.attempts,
      outlineTokens: step.tokens,
    },
    characters: draft.karakter_kanonu.map((character, index) => ({
      role: character.rol,
      nameTr: character.ad,
      canonEn: character.gorsel_tarif_en,
      isPrimary: index === 0,
    })),
    variants: outline.variants ?? [],
  });

  return { outline, attempts: step.attempts, costUsd: step.costUsd };
}

/* ── stage 2: fill ─────────────────────────────────────────────────────────── */

export interface FillStageResult {
  pages: Array<{ pageNo: number; textTr: string }>;
  attempts: number;
  costUsd: number;
  /** Findings that did not block — recorded, surfaced to ops, story still shipped. */
  flagged: SafetyViolation[];
}

export async function runFillStage(
  runtime: WorkerRuntime,
  job: StoryJobContext,
): Promise<FillStageResult> {
  const story = await requireStory(runtime, job.storyId);
  const outline = story.outline;
  if (!outline || outline.scenes.length === 0) {
    throw new Error(`story ${story.id} has no approved outline; stage 2 must not run`);
  }
  await setStoryStatus(runtime.db, story.id, 'content_generating');

  const heroName = requireSanitisedName(story.heroName);
  const maxAttempts = runtime.env.STORY_QUALITY_MAX_ATTEMPTS;
  // One system prompt (and one canary) for the whole job: the cacheable prefix must not
  // change between attempts, or every retry re-pays the full input price.
  const system: SystemPrompt = buildSystemPrompt({
    ageBand: story.ageBand,
    religiousOptIn: story.religiousOptIn,
    pageCount: outline.scenes.length,
  });

  let feedbackTr: string | undefined;
  let costUsd = 0;
  let lastViolations: SafetyViolation[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const prompt = buildFillPrompt({
      heroName,
      ageBand: story.ageBand,
      religiousOptIn: story.religiousOptIn,
      titleTr: outline.titleTr,
      lessonTr: outline.lessonTr,
      scenes: outline.scenes.map((scene) => ({
        sayfa_no: scene.pageNo,
        sahne_ozeti: scene.summaryTr,
        duygusal_ton: scene.emotion,
      })),
      characterNames: outline.characters?.map((character) => character.nameTr),
      system,
      previousFeedbackTr: feedbackTr,
    });

    const step = await runStructuredStep(runtime, job, {
      // A retry is a DIFFERENT step, so its cost is visible instead of overwriting the
      // first attempt's row.
      stepKey: attempt === 1 ? stepKeys.llmFill() : `${stepKeys.llmFill()}:r${attempt}`,
      purpose: 'fill',
      schema: fillSchema,
      messages: prompt.messages,
      maxOutputTokens: runtime.env.LLM_MAX_OUTPUT_TOKENS_FILL,
      stepInput: {
        storyId: story.id,
        stage: 'fill',
        attempt,
        promptVersion: PROMPT_VERSION,
        feedback: feedbackTr ?? null,
      },
      estimatedUsd: runtime.priceBook.llm.fill.outputPerMTokUsd * 0.007,
    });
    costUsd += step.costUsd;

    const pages = step.value.sayfalar
      .map((page) => ({ pageNo: page.sayfa_no, textTr: page.metin.trim() }))
      .sort((a, b) => a.pageNo - b.pageNo);

    const violations = await gateGeneratedPages(runtime, job, story, {
      heroName,
      titleTr: outline.titleTr,
      pages,
      canaryToken: system.canaryToken,
      attempt,
    });
    lastViolations = violations.all;

    if (!violations.blocked) {
      await savePages(runtime.db, story.id, pages, { source: 'ai' });
      await setStoryStatus(runtime.db, story.id, 'content_ready');
      return { pages, attempts: attempt, costUsd, flagged: violations.all };
    }

    feedbackTr = violations.feedbackTr;
  }

  /* Out of attempts. The parent is told in Turkish, the story is marked failed, and the
   * job fails — which releases the whole cost reservation (processors/index.ts closeJob),
   * so nobody is charged for a book that does not exist. */
  await setStoryStatus(runtime.db, story.id, 'failed', {
    safety: { blockedAt: 'fill', attempts: maxAttempts },
  });
  const blocking = lastViolations.find((violation) => violation.severity === 'block');
  throw new StoryGateError({
    errorCode: errorCodeFor(blocking),
    messageTr:
      blocking?.messageTr ??
      'Bu tema için farklı bir yaklaşım deneyelim. Krediniz harcanmadı.',
    violations: lastViolations,
  });
}

/* ── single-page rewrite (P02) ─────────────────────────────────────────────── */

export interface PageRewriteResult {
  pageNo: number;
  textTr: string;
  costUsd: number;
  attempts: number;
}

/**
 * ONE page, not the book (SPEC §6.2 rule 4). The other pages' text hashes do not change,
 * so their audio chunks and illustrations stay cache hits — which is the entire reason a
 * parent can fix page 5 without paying for a second book.
 */
export async function runPageRewrite(
  runtime: WorkerRuntime,
  job: StoryJobContext,
  input: { pageNo: number; instructionTr?: string | undefined },
): Promise<PageRewriteResult> {
  const story = await requireStory(runtime, job.storyId);
  const heroName = requireSanitisedName(story.heroName);
  const pages = await loadStoryPages(runtime.db, story.id);
  const target = pages.find((page) => page.pageNo === input.pageNo);
  if (!target) throw new Error(`story ${story.id} has no page ${input.pageNo}`);

  const instructionTr = requireSanitisedFreeText(input.instructionTr);
  const maxAttempts = runtime.env.STORY_QUALITY_MAX_ATTEMPTS;
  const system = buildSystemPrompt({
    ageBand: story.ageBand,
    religiousOptIn: story.religiousOptIn,
    pageCount: 1,
  });

  let feedbackTr: string | undefined;
  let costUsd = 0;
  let lastViolations: SafetyViolation[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const prompt = buildPageRewritePrompt({
      heroName,
      ageBand: story.ageBand,
      religiousOptIn: story.religiousOptIn,
      pageNo: input.pageNo,
      sceneSummaryTr: target.summaryTr ?? '',
      currentTextTr: target.textTr ?? undefined,
      previousPageTextTr: pages.find((page) => page.pageNo === input.pageNo - 1)?.textTr ?? undefined,
      nextPageTextTr: pages.find((page) => page.pageNo === input.pageNo + 1)?.textTr ?? undefined,
      instructionTr,
      previousFeedbackTr: feedbackTr,
      system,
    });

    const step = await runStructuredStep(runtime, job, {
      stepKey:
        attempt === 1
          ? `llm:page_rewrite:${String(input.pageNo).padStart(2, '0')}`
          : `llm:page_rewrite:${String(input.pageNo).padStart(2, '0')}:r${attempt}`,
      purpose: 'page_rewrite',
      schema: pageRewriteSchema,
      messages: prompt.messages,
      maxOutputTokens: runtime.env.LLM_MAX_OUTPUT_TOKENS_OUTLINE,
      stepInput: {
        storyId: story.id,
        pageNo: input.pageNo,
        attempt,
        promptVersion: PROMPT_VERSION,
        instruction: instructionTr ?? null,
        feedback: feedbackTr ?? null,
      },
      estimatedUsd: runtime.priceBook.llm.page_rewrite.outputPerMTokUsd * 0.0004,
    });
    costUsd += step.costUsd;

    const textTr = step.value.metin.trim();
    const violations = await gateGeneratedPages(runtime, job, story, {
      heroName,
      titleTr: story.titleTr ?? '',
      // The page is graded IN CONTEXT: a refrain or a warm close is a property of the book,
      // not of page 7 on its own.
      pages: pages.map((page) =>
        page.pageNo === input.pageNo
          ? { pageNo: page.pageNo, textTr }
          : { pageNo: page.pageNo, textTr: page.textTr ?? '' },
      ),
      canaryToken: system.canaryToken,
      attempt,
      focusPageNo: input.pageNo,
    });
    lastViolations = violations.all;

    if (!violations.blocked) {
      await savePages(runtime.db, story.id, [{ pageNo: input.pageNo, textTr }], {
        source: 'ai_rewrite',
      });
      return { pageNo: input.pageNo, textTr, costUsd, attempts: attempt };
    }
    feedbackTr = violations.feedbackTr;
  }

  const blocking = lastViolations.find((violation) => violation.severity === 'block');
  throw new StoryGateError({
    errorCode: errorCodeFor(blocking),
    messageTr: blocking?.messageTr ?? 'Bu sayfayı yeniden yazamadık. Krediniz harcanmadı.',
    violations: lastViolations,
  });
}

/* ── the gate ──────────────────────────────────────────────────────────────── */

interface GateInput {
  heroName: string;
  titleTr: string;
  pages: Array<{ pageNo: number; textTr: string }>;
  canaryToken: string;
  attempt: number;
  /** Only this page's own findings block, when rewriting a single page. */
  focusPageNo?: number;
}

interface GateResult {
  blocked: boolean;
  all: SafetyViolation[];
  feedbackTr: string;
}

/**
 * K4a + the Turkish quality gate + K4b + K4c, in cost order: everything free runs before
 * anything paid, and the paid judge does not run at all on text the free layers rejected.
 */
async function gateGeneratedPages(
  runtime: WorkerRuntime,
  job: StoryJobContext,
  story: StoryContext,
  input: GateInput,
): Promise<GateResult> {
  const joined = input.pages.map((page) => page.textTr).join('\n');

  // 1 ── deterministic audit: canary, sentinel, denylist (free)
  const audit = auditStoryOutput({
    ageBand: story.ageBand,
    religiousOptIn: story.religiousOptIn,
    text: joined,
    titleTr: input.titleTr,
    canaryToken: input.canaryToken,
  });

  // 2 ── Turkish quality gate (free)
  const quality = checkStoryQuality({
    heroName: input.heroName,
    ageBand: story.ageBand,
    religiousOptIn: story.religiousOptIn,
    titleTr: input.titleTr,
    pages: input.pages,
  });

  let violations = [...audit.decision.violations, ...quality.decision.violations];
  if (input.focusPageNo !== undefined) {
    // Rewriting page 5 must not fail on page 9's pre-existing flaw.
    violations = violations.filter(
      (violation) => violation.pageNo === undefined || violation.pageNo === input.focusPageNo,
    );
  }
  if (!runtime.env.STORY_QUALITY_GATE_ENFORCED) {
    violations = violations.map((violation) =>
      violation.engine === 'age_rubric' || violation.code === 'TRANSLATIONESE'
        ? { ...violation, severity: 'flag' as const }
        : violation,
    );
  }

  // 3 ── vendor moderation on the generated text (free, but a network call)
  if (!violations.some((violation) => violation.severity === 'block')) {
    violations.push(...(await moderateStoryText(runtime, job, story, joined, input.attempt)));
  }

  // 4 ── the age-rubric judge (~$0.002) — last, and only on text that got this far
  if (!violations.some((violation) => violation.severity === 'block')) {
    violations.push(...(await judgeStoryText(runtime, job, story, input)));
  }

  const blocked = violations.some((violation) => violation.severity === 'block');
  await recordViolations(
    runtime.db,
    { userId: job.userId, storyId: story.id, surface: 'story_text', stage: 'post' },
    violations,
    blocked ? 'regenerate' : 'none',
  );

  return {
    blocked,
    all: violations,
    feedbackTr: [quality.feedbackTr, ...violations.map((v) => `- ${v.detail ?? v.messageTr}`)]
      .filter((line) => line.trim() !== '')
      .slice(0, 10)
      .join('\n'),
  };
}

async function moderateParentInput(
  runtime: WorkerRuntime,
  job: StoryJobContext,
  story: StoryContext,
  text: string,
): Promise<void> {
  if (text.trim() === '') return;

  const result = await runStep({
    db: runtime.db,
    jobId: job.jobId,
    userId: job.userId,
    correlationId: job.correlationId,
    stepKey: stepKeys.moderation('parent_input'),
    stepKind: 'moderation',
    operation: 'moderation.check',
    stepInput: { storyId: story.id, surface: 'parent_input' },
    router: runtime.routers.moderation,
    invoke: (adapter, ctx) =>
      adapter.check({ surface: 'parent_input', text, ageBand: story.ageBand }, ctx),
    toOutput: (value) => ({ verdict: value.verdict, categories: value.categories }),
  });

  if (result.status === 'failed') {
    // Moderation is free and fast; if it is down we do NOT quietly skip it.
    throw result.error;
  }
  const verdict = readVerdict(result);
  await recordModerationEvent(runtime.db, {
    userId: job.userId,
    storyId: story.id,
    surface: 'parent_input',
    stage: 'pre',
    engine: 'openai_moderation',
    verdict,
    excerpt: text.slice(0, 160),
  });

  if (verdict === 'block') {
    throw new StoryGateError({
      errorCode: 'CONTENT_BLOCKED',
      messageTr:
        'Bu fikir çocuklar için uygun bulunmadı. Korku, şiddet veya yetişkin temalarını çıkarıp yeniden yazın.',
      violations: [],
    });
  }
}

async function moderateStoryText(
  runtime: WorkerRuntime,
  job: StoryJobContext,
  story: StoryContext,
  text: string,
  attempt: number,
): Promise<SafetyViolation[]> {
  const result = await runStep({
    db: runtime.db,
    jobId: job.jobId,
    userId: job.userId,
    correlationId: job.correlationId,
    stepKey: stepKeys.moderation('story_text', attempt),
    stepKind: 'moderation',
    operation: 'moderation.check',
    stepInput: { storyId: story.id, surface: 'story_text', attempt },
    router: runtime.routers.moderation,
    invoke: (adapter, ctx) =>
      adapter.check({ surface: 'story_text', text, ageBand: story.ageBand }, ctx),
    toOutput: (value) => ({
      verdict: value.verdict,
      categories: value.categories,
      scores: value.scores,
    }),
  });

  if (result.status === 'failed') throw result.error;

  const output = outputOf(result);
  return violationsFromModeration(
    readVerdict(result),
    (output?.['categories'] as Record<string, boolean>) ?? {},
    (output?.['scores'] as Record<string, number>) ?? {},
  );
}

async function judgeStoryText(
  runtime: WorkerRuntime,
  job: StoryJobContext,
  story: StoryContext,
  input: GateInput,
): Promise<SafetyViolation[]> {
  const messages = buildJudgePrompt({
    ageBand: story.ageBand,
    religiousOptIn: story.religiousOptIn,
    titleTr: input.titleTr,
    pages: input.pages,
  });

  let step: StructuredStepResult<z.infer<typeof judgeSchema>>;
  try {
    step = await runStructuredStep(runtime, job, {
      stepKey: `llm:judge:${String(input.attempt).padStart(2, '0')}`,
      purpose: 'judge',
      schema: judgeSchema,
      messages,
      maxOutputTokens: runtime.env.LLM_MAX_OUTPUT_TOKENS_JUDGE,
      stepInput: {
        storyId: story.id,
        attempt: input.attempt,
        promptVersion: PROMPT_VERSION,
        textLength: input.pages.reduce((total, page) => total + page.textTr.length, 0),
      },
      estimatedUsd: 0.002,
    });
  } catch (error) {
    /**
     * The judge is the last of six layers and the only one that can fail for a reason
     * unrelated to the content (a cheap-tier model that returned prose instead of JSON).
     * Failing the book on that would refuse a story the other five layers cleared — so it
     * is recorded as a FLAG for ops instead of swallowed and instead of blocking.
     */
    await recordModerationEvent(runtime.db, {
      userId: job.userId,
      storyId: story.id,
      surface: 'story_text',
      stage: 'post',
      engine: 'llm_judge',
      verdict: 'flag',
      excerpt: error instanceof Error ? error.message.slice(0, 160) : 'judge failed',
      actionTaken: 'manual_review',
    });
    return [];
  }

  return evaluateJudgeVerdict(
    {
      uygun: step.value.uygun,
      ihlaller: step.value.ihlaller.map((finding) => ({
        boyut: finding.boyut,
        kanit: finding.kanit,
        ...(finding.sayfa_no > 0 ? { sayfa_no: finding.sayfa_no } : {}),
      })),
      not: step.value.not,
    },
    story.ageBand,
  );
}

/* ── step plumbing ─────────────────────────────────────────────────────────── */

interface StructuredStepInput<T> {
  stepKey: string;
  purpose: 'outline' | 'fill' | 'judge' | 'page_rewrite';
  schema: z.ZodType<T>;
  messages: LlmMessage[];
  maxOutputTokens: number;
  stepInput: Record<string, unknown>;
  /** What a cache miss would have cost — credited to `saved_usd` on a hit. */
  estimatedUsd: number;
}

interface StructuredStepResult<T> {
  value: T;
  model: string;
  attempts: number;
  costUsd: number;
  tokens: { input: number; output: number; cachedInput: number };
}

/**
 * One structured model call as a job step: idempotent, cached, routed, priced.
 *
 * The `reused` and `skipped` branches matter more than they look: they are what makes an
 * interrupted job resume instead of re-paying. The stored `raw` text is re-validated rather
 * than trusted, so a cached row written by an older prompt version cannot smuggle a shape
 * the current code does not expect.
 */
async function runStructuredStep<T>(
  runtime: WorkerRuntime,
  job: StoryJobContext,
  input: StructuredStepInput<T>,
): Promise<StructuredStepResult<T>> {
  /**
   * The cache identity is the USER turns only. The system turns carry a per-generation
   * canary token (spotlight.ts), so including them would change the key on every single
   * request and the content cache would never hit — while the *rules* the system prompt
   * encodes are already in the key through `model: purpose@PROMPT_VERSION` below.
   */
  const cachePrompt = input.messages
    .filter((message) => message.role !== 'system')
    .map((message) => message.content)
    .join('\n');

  const result = await runStep({
    db: runtime.db,
    jobId: job.jobId,
    userId: job.userId,
    correlationId: job.correlationId,
    stepKey: input.stepKey,
    stepKind: 'llm',
    operation: 'llm.complete',
    stepInput: input.stepInput,
    router: runtime.routers.llm,
    invoke: (adapter: LlmAdapter, ctx) =>
      completeStructuredOn(
        adapter,
        {
          purpose: input.purpose,
          messages: input.messages,
          schema: input.schema,
          maxOutputTokens: input.maxOutputTokens,
          repairAttempts: runtime.env.LLM_SCHEMA_REPAIR_ATTEMPTS,
        },
        ctx,
      ),
    toOutput: (value: StructuredValue<T>) => ({
      raw: value.raw,
      model: value.model,
      attempts: value.attempts,
      tokens: value.tokens,
    }),
    cache: {
      kind: 'llm',
      provider: runtime.adapters.llm.provider,
      model: `${input.purpose}@${PROMPT_VERSION}`,
      params: { purpose: input.purpose, ...input.stepInput },
      prompt: cachePrompt,
      estimatedUsd: input.estimatedUsd,
    },
  });

  if (result.status === 'succeeded') {
    return {
      value: result.value.value,
      model: result.value.model,
      attempts: result.value.attempts,
      costUsd: result.costUsd,
      tokens: result.value.tokens,
    };
  }

  if (result.status === 'failed') throw result.error;

  // reused (level-3 idempotency) or skipped (content cache): re-validate the stored text.
  const output = result.output ?? {};
  const raw = typeof output['raw'] === 'string' ? output['raw'] : '';
  const parsed = input.schema.safeParse(safeJson(raw));
  if (!parsed.success) {
    throw new Error(`stored output for step ${input.stepKey} no longer matches its schema`);
  }

  return {
    value: parsed.data,
    model: typeof output['model'] === 'string' ? output['model'] : 'cached',
    attempts: 0,
    costUsd: 0,
    tokens: { input: 0, output: 0, cachedInput: 0 },
  };
}

function outputOf(result: RunStepResult<unknown>): Record<string, unknown> | null {
  if (result.status === 'succeeded') return null;
  if (result.status === 'reused' || result.status === 'skipped') return result.output;
  return null;
}

function readVerdict(result: RunStepResult<{ verdict: 'pass' | 'flag' | 'block' }>): 'pass' | 'flag' | 'block' {
  if (result.status === 'succeeded') return result.value.verdict;
  const stored = outputOf(result)?.['verdict'];
  return stored === 'block' || stored === 'flag' ? stored : 'pass';
}

/* ── helpers ───────────────────────────────────────────────────────────────── */

async function requireStory(runtime: WorkerRuntime, storyId: string): Promise<StoryContext> {
  const story = await loadStoryContext(runtime.db, storyId);
  if (!story) throw new Error(`story ${storyId} not found`);
  return story;
}

function requireSanitisedName(raw: string): string {
  const result = sanitizeChildName(raw);
  if (!result.ok) {
    throw new StoryGateError({
      errorCode: result.decision.errorCode ?? 'INVALID_NAME',
      messageTr: result.decision.messageTr ?? '',
      violations: result.decision.violations,
    });
  }
  return result.value;
}

function requireSanitisedFreeText(raw: string | undefined): string | undefined {
  if (raw === undefined || raw.trim() === '') return undefined;
  const result = sanitizeFreeText(raw);
  if (!result.ok) {
    throw new StoryGateError({
      errorCode: result.decision.errorCode ?? 'VALIDATION_FAILED',
      messageTr: result.decision.messageTr ?? '',
      violations: result.decision.violations,
    });
  }
  return result.value === '' ? undefined : result.value;
}

function errorCodeFor(violation: SafetyViolation | undefined): ErrorCode {
  if (!violation) return 'MODERATION_BLOCKED';
  if (violation.engine === 'age_rubric' || violation.engine === 'llm_judge') {
    return 'AGE_POLICY_VIOLATION';
  }
  if (violation.code === 'BRAND_OR_COPYRIGHT' || violation.code === 'RELIGIOUS_NOT_OPTED_IN') {
    return 'CONTENT_BLOCKED';
  }
  if (violation.code === 'INJECTION_PATTERN') return 'INJECTION_DETECTED';
  return 'MODERATION_BLOCKED';
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function readRecord(
  record: Record<string, unknown>,
  key: string,
): Record<string, string> | undefined {
  const value = record[key];
  if (typeof value !== 'object' || value === null) return undefined;
  const out: Record<string, string> = {};
  for (const [entryKey, entryValue] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entryValue === 'string') out[entryKey] = entryValue;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}
