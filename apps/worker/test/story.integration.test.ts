/**
 * The story pipeline end to end: real PostgreSQL, real job steps, real safety layers,
 * mocked vendor.
 *
 * This is the evidence that the text half of the product works before a single API key
 * exists. What it proves, in order:
 *
 *   1. STAGE 1 produces a skeleton and parks at ⏸ GATE 1 — pages exist, page TEXT does not
 *   2. GATE 1 is real: stage 2 refuses to run for a story with no approved outline
 *   3. STAGE 2 fills the pages, and the Turkish quality gate passes on what was written
 *   4. every layer left an audit row in `moderation_events`
 *   5. the cost reservation settles against the ACTUAL ledger cost
 *   6. an interrupted job RESUMES: re-running it reuses the steps and charges nothing
 *   7. a model that writes bad Turkish is REJECTED, the story fails, no pages are saved
 *
 * Redis is deliberately not involved: these are the processors, not BullMQ, and the queue
 * is already covered by pipeline.integration.test.ts.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import type { Job } from 'bullmq';
import type { DbHandle } from '@kendihikayem/db';
import { checkStoryQuality } from '@kendihikayem/safety';
import type {
  AdapterResult,
  LlmAdapter,
  LlmCompleteInput,
  LlmCompleteOutput,
  ProviderCallContext,
} from '@kendihikayem/providers';

import type { JobPayload } from '../src/queues';
import { buildRuntime, fakeAdaptersFromEnv, type WorkerRuntime } from '../src/runtime';
import { PROCESSORS } from '../src/processors/index';
import { runFillStage } from '../src/processors/story-generation';
import { enqueueJob, getJobSteps } from '../src/jobs/repository';
import { requestHash } from '../src/jobs/hashing';
import { reserveCost } from '../src/cost/reservation';
import { createTestUser, deleteTestUser, newIdempotencyKey, openDb, testEnv } from './helpers';

let handle: DbHandle;
const createdUsers: string[] = [];

beforeAll(() => {
  handle = openDb(6);
});

afterAll(async () => {
  for (const userId of createdUsers) await deleteTestUser(handle.db, userId);
  await handle.close();
});

/* ── fixtures ──────────────────────────────────────────────────────────────── */

interface StorySeed {
  storyId: string;
  userId: string;
}

async function seedStory(
  options: { heroName?: string; ageBand?: string; pageCount?: number } = {},
): Promise<StorySeed> {
  const user = await createTestUser(handle.db, { capUsd: 20 });
  createdUsers.push(user.userId);

  const rows = await handle.db.execute<{ id: string }>(sql`
    insert into stories (user_id, hero_name, age_band, art_style_code, theme_code, page_count,
                         status, religious_opt_in, cultural_tags, request_input)
    values (${user.userId}, ${options.heroName ?? 'Elif'}, ${options.ageBand ?? '6-8'},
            'suluboya', 'uyku_oncesi', ${options.pageCount ?? 12}, 'draft', false,
            ARRAY['mahalle']::text[],
            ${JSON.stringify({
              freeIdeaTr: 'Elif karanlıktan korkuyor; korkusunu yenmesini istiyorum.',
              lessonHintTr: 'cesaret',
              characterBuilder: { ten_tonu: 'acik_bugday', sac_rengi: 'koyu_kahve' },
            })}::jsonb)
    returning id
  `);
  return { storyId: rows[0]!.id, userId: user.userId };
}

function fakeJob(data: JobPayload): Job<JobPayload> {
  return { data, name: data.kind } as unknown as Job<JobPayload>;
}

async function runtimeFor(
  adapters?: ReturnType<typeof fakeAdaptersFromEnv>,
): Promise<WorkerRuntime> {
  const env = testEnv();
  return buildRuntime({
    env,
    db: handle.db,
    // No BullMQ in this test: the queue registry is never touched by a processor call.
    queues: { async close() {} } as unknown as WorkerRuntime['queues'],
    ...(adapters ? { adapters } : {}),
  });
}

async function enqueueStoryJob(
  seed: StorySeed,
  kind: 'story_outline' | 'story_fill',
  label: string,
): Promise<{ jobId: string; reservationId: string | null }> {
  const held = await reserveCost(handle.db, {
    userId: seed.userId,
    estimateUsd: kind === 'story_outline' ? 0.05 : 0.4,
    caps: { maxCostUsdPerRequest: 6, dailyGlobalUsdCap: 1_000_000 },
  });
  if (!held.ok) throw new Error('reservation failed');

  const { job } = await enqueueJob(handle.db, {
    userId: seed.userId,
    kind,
    idempotencyKey: newIdempotencyKey(label),
    requestHash: requestHash(`POST /v1/stories/${seed.storyId}`, { kind }),
    correlationId: `trace-${label}`,
    storyId: seed.storyId,
    reservationId: held.reservationId,
    estimatedCostUsd: kind === 'story_outline' ? 0.05 : 0.4,
  });
  return { jobId: job.id, reservationId: held.reservationId };
}

/* ── 1-6: the happy path ───────────────────────────────────────────────────── */

describe('story pipeline (mock vendor, real database)', () => {
  it('runs stage 1 → GATE 1 → stage 2 and passes the Turkish quality gate', async () => {
    const runtime = await runtimeFor();
    const seed = await seedStory({ heroName: 'Elif', ageBand: '6-8', pageCount: 12 });

    /* ── stage 1 ───────────────────────────────────────────────────────── */
    const outlineJob = await enqueueStoryJob(seed, 'story_outline', 'outline');
    const outlineResult = await PROCESSORS.llm['story.outline']!(
      runtime,
      fakeJob({
        jobId: outlineJob.jobId,
        userId: seed.userId,
        correlationId: 'trace-outline',
        kind: 'story_outline',
        ref: { storyId: seed.storyId },
      }),
    );
    expect(outlineResult).toMatchObject({ status: 'waiting_approval', scenes: 12 });

    const afterOutline = await handle.db.execute<{
      status: string;
      title: string | null;
      outline: { scenes: unknown[] } | null;
    }>(sql`select status, title, outline from stories where id = ${seed.storyId}`);
    expect(afterOutline[0]?.status).toBe('outline_ready');
    expect(afterOutline[0]?.title).toBeTruthy();
    expect(afterOutline[0]?.outline?.scenes).toHaveLength(12);

    // ⏸ GATE 1: the pages exist as scene summaries, and NOT as text. That difference is
    // the $0.03-instead-of-$4 lever.
    const pagesBeforeApproval = await handle.db.execute<{
      page_no: number;
      text_tr: string | null;
      scene_summary_tr: string | null;
    }>(sql`select page_no, text_tr, scene_summary_tr from story_pages where story_id = ${seed.storyId} order by page_no`);
    expect(pagesBeforeApproval).toHaveLength(12);
    expect(pagesBeforeApproval.every((page) => page.text_tr === null)).toBe(true);
    expect(pagesBeforeApproval.every((page) => (page.scene_summary_tr ?? '').length > 0)).toBe(true);

    // Three character variants for S09, and the cast that the illustrator will lock onto.
    const characters = await handle.db.execute<{ is_primary: boolean; sheet_variants: unknown }>(sql`
      select is_primary, sheet_variants from story_characters where story_id = ${seed.storyId}
    `);
    expect(characters.length).toBeGreaterThanOrEqual(1);
    const primary = characters.find((character) => character.is_primary);
    expect((primary?.sheet_variants as { variants: unknown[] }).variants).toHaveLength(3);

    const outlineJobRow = await handle.db.execute<{ status: string }>(
      sql`select status from jobs where id = ${outlineJob.jobId}`,
    );
    expect(outlineJobRow[0]?.status).toBe('waiting_approval');

    /* ── GATE 1 is enforced by the absence of an enqueue ───────────────── */
    const unapproved = await seedStory({ heroName: 'Ayşe' });
    await expect(
      runFillStage(runtime, {
        jobId: outlineJob.jobId,
        userId: unapproved.userId,
        correlationId: 'trace-gate',
        storyId: unapproved.storyId,
      }),
    ).rejects.toThrow(/no approved outline/u);

    /* ── stage 2 ───────────────────────────────────────────────────────── */
    const fillJob = await enqueueStoryJob(seed, 'story_fill', 'fill');
    const fillResult = (await PROCESSORS.llm['story.fill']!(
      runtime,
      fakeJob({
        jobId: fillJob.jobId,
        userId: seed.userId,
        correlationId: 'trace-fill',
        kind: 'story_fill',
        ref: { storyId: seed.storyId, pageCount: 12 },
      }),
    )) as { pages: number; attempts: number; costUsd: number };

    expect(fillResult.pages).toBe(12);
    expect(fillResult.attempts).toBe(1);
    expect(fillResult.costUsd).toBeGreaterThan(0);

    const pages = await handle.db.execute<{
      page_no: number;
      text_tr: string;
      word_count: number;
      text_sha256: string;
    }>(sql`
      select page_no, text_tr, word_count, text_sha256 from story_pages
       where story_id = ${seed.storyId} order by page_no
    `);
    expect(pages).toHaveLength(12);
    expect(pages.every((page) => (page.text_tr ?? '').length > 0)).toBe(true);
    // The TTS cache key: a page written without it silently disables audio caching.
    expect(pages.every((page) => (page.text_sha256 ?? '').length === 64)).toBe(true);
    expect(pages.every((page) => page.word_count >= 40 && page.word_count <= 70)).toBe(true);

    /* ── the gate agrees with what was stored ──────────────────────────── */
    const report = checkStoryQuality({
      heroName: 'Elif',
      ageBand: '6-8',
      religiousOptIn: false,
      titleTr: afterOutline[0]?.title ?? '',
      pages: pages.map((page) => ({ pageNo: page.page_no, textTr: page.text_tr })),
    });
    expect(report.decision.violations.filter((v) => v.severity === 'block')).toEqual([]);

    /* ── the audit trail exists ────────────────────────────────────────── */
    const events = await handle.db.execute<{ surface: string; stage: string; verdict: string }>(sql`
      select surface, stage, verdict from moderation_events where story_id = ${seed.storyId}
    `);
    expect(events.some((event) => event.surface === 'parent_input' && event.stage === 'pre')).toBe(true);
    expect(events.some((event) => event.surface === 'story_text' && event.stage === 'post')).toBe(true);

    /* ── cost: reservation settled with the real ledger total ──────────── */
    const jobRow = await handle.db.execute<{ status: string; actual_cost_usd: string }>(
      sql`select status, actual_cost_usd from jobs where id = ${fillJob.jobId}`,
    );
    expect(jobRow[0]?.status).toBe('succeeded');
    expect(Number(jobRow[0]?.actual_cost_usd)).toBeGreaterThan(0);

    const reservation = await handle.db.execute<{ state: string }>(
      sql`select state from cost_reservations where id = ${fillJob.reservationId}`,
    );
    expect(reservation[0]?.state).toBe('committed');

    const usage = await handle.db.execute<{ count: string }>(sql`
      select count(*)::text as count from provider_usage pu
        join job_steps js on js.id = pu.job_step_id
       where js.job_id = ${fillJob.jobId}
    `);
    // fill + moderation + judge, at least.
    expect(Number(usage[0]?.count)).toBeGreaterThanOrEqual(3);

    /* ── 6a. LEVEL-3 IDEMPOTENCY: the same job re-run reuses its steps ─── */
    const stepsBefore = await getJobSteps(handle.db, fillJob.jobId);
    const costBefore = stepsBefore.reduce((total, step) => total + Number(step.cost_usd), 0);

    // Calling the stage again with the same job id is what an interrupted worker does when
    // BullMQ redelivers the job. Not the processor: that would try to close a closed job.
    await runFillStage(runtime, {
      jobId: fillJob.jobId,
      userId: seed.userId,
      correlationId: 'trace-fill',
      storyId: seed.storyId,
    });

    const stepsAfter = await getJobSteps(handle.db, fillJob.jobId);
    const costAfter = stepsAfter.reduce((total, step) => total + Number(step.cost_usd), 0);
    expect(stepsAfter.length).toBe(stepsBefore.length);
    // Not one extra cent: every step was reused from its stored output.
    expect(costAfter).toBeCloseTo(costBefore, 5);

    /* ── 6b. CONTENT CACHE: a brand-new job for the same story is free ─── */
    const rerunJob = await enqueueStoryJob(seed, 'story_fill', 'fill-again');
    await runFillStage(runtime, {
      jobId: rerunJob.jobId,
      userId: seed.userId,
      correlationId: 'trace-fill-again',
      storyId: seed.storyId,
    });

    const rerunSteps = await getJobSteps(handle.db, rerunJob.jobId);
    const rerunLlmStep = rerunSteps.find((step) => step.step_key === 'llm:fill');
    expect(rerunLlmStep?.status).toBe('skipped');
    expect(Number(rerunLlmStep?.cost_usd)).toBe(0);

    // …and the saving is recorded in dollars rather than asserted in a comment.
    const saved = await handle.db.execute<{ saved_usd: string; hit_count: number }>(sql`
      select saved_usd, hit_count from content_cache
       where kind = 'llm' order by last_hit_at desc nulls last limit 1
    `);
    expect(Number(saved[0]?.saved_usd)).toBeGreaterThan(0);
  }, 60_000);

  it('rewrites ONE page and leaves the other eleven — text hashes included', async () => {
    const runtime = await runtimeFor();
    const seed = await seedStory({ heroName: 'Elif', ageBand: '6-8', pageCount: 12 });

    const outlineJob = await enqueueStoryJob(seed, 'story_outline', 'rw-outline');
    await PROCESSORS.llm['story.outline']!(
      runtime,
      fakeJob({
        jobId: outlineJob.jobId,
        userId: seed.userId,
        correlationId: 'trace-rw',
        kind: 'story_outline',
        ref: { storyId: seed.storyId },
      }),
    );
    const fillJob = await enqueueStoryJob(seed, 'story_fill', 'rw-fill');
    await PROCESSORS.llm['story.fill']!(
      runtime,
      fakeJob({
        jobId: fillJob.jobId,
        userId: seed.userId,
        correlationId: 'trace-rw-fill',
        kind: 'story_fill',
        ref: { storyId: seed.storyId, pageCount: 12 },
      }),
    );

    const before = await handle.db.execute<{ page_no: number; text_sha256: string }>(sql`
      select page_no, text_sha256 from story_pages where story_id = ${seed.storyId} order by page_no
    `);

    // "5. sayfa çok korkutucu" — the fix a parent actually asks for.
    const rewriteJob = await enqueueStoryJob(seed, 'story_fill', 'rw-page');
    await PROCESSORS.llm['story.page_rewrite']!(
      runtime,
      fakeJob({
        jobId: rewriteJob.jobId,
        userId: seed.userId,
        correlationId: 'trace-rw-page',
        kind: 'story_page_rewrite',
        pageNo: 5,
        ref: { storyId: seed.storyId, pageNo: 5, instructionTr: 'biraz daha neşeli olsun' },
      }),
    );

    const after = await handle.db.execute<{ page_no: number; text_sha256: string }>(sql`
      select page_no, text_sha256 from story_pages where story_id = ${seed.storyId} order by page_no
    `);

    // Eleven hashes unchanged ⇒ eleven audio chunks and eleven illustrations stay cached.
    const changed = after.filter(
      (page) => page.text_sha256 !== before.find((row) => row.page_no === page.page_no)?.text_sha256,
    );
    expect(changed.map((page) => page.page_no)).toEqual([5]);

    // The rewrite is reversible: the old text is still in the revision history.
    const revisions = await handle.db.execute<{ revision: number; source: string }>(sql`
      select r.revision, r.source from story_page_revisions r
        join story_pages p on p.id = r.page_id
       where p.story_id = ${seed.storyId} and p.page_no = 5 order by r.revision
    `);
    expect(revisions.map((row) => row.source)).toEqual(['ai', 'ai_rewrite']);

    // Only ONE page was sent to the model.
    const steps = await getJobSteps(handle.db, rewriteJob.jobId);
    expect(steps.filter((step) => step.step_key.startsWith('llm:page_rewrite:'))).toHaveLength(1);
  }, 60_000);

  it('produces a 0-2 book that is a lullaby, not a shortened storybook', async () => {
    const runtime = await runtimeFor();
    const seed = await seedStory({ heroName: 'Deniz', ageBand: '0-2', pageCount: 8 });

    const outlineJob = await enqueueStoryJob(seed, 'story_outline', 'baby-outline');
    await PROCESSORS.llm['story.outline']!(
      runtime,
      fakeJob({
        jobId: outlineJob.jobId,
        userId: seed.userId,
        correlationId: 'trace-baby',
        kind: 'story_outline',
        ref: { storyId: seed.storyId },
      }),
    );

    const fillJob = await enqueueStoryJob(seed, 'story_fill', 'baby-fill');
    await PROCESSORS.llm['story.fill']!(
      runtime,
      fakeJob({
        jobId: fillJob.jobId,
        userId: seed.userId,
        correlationId: 'trace-baby-fill',
        kind: 'story_fill',
        ref: { storyId: seed.storyId, pageCount: 8 },
      }),
    );

    const pages = await handle.db.execute<{ page_no: number; text_tr: string; word_count: number }>(sql`
      select page_no, text_tr, word_count from story_pages where story_id = ${seed.storyId} order by page_no
    `);
    expect(pages).toHaveLength(8);
    // 6-14 words per page — a 0-2 page is one sentence, not a paragraph.
    expect(pages.every((page) => page.word_count >= 6 && page.word_count <= 14)).toBe(true);

    const report = checkStoryQuality({
      heroName: 'Deniz',
      ageBand: '0-2',
      religiousOptIn: false,
      pages: pages.map((page) => ({ pageNo: page.page_no, textTr: page.text_tr })),
    });
    expect(report.decision.violations.filter((v) => v.severity === 'block')).toEqual([]);
    // The refrain is the spine of the band.
    expect(report.metrics.refrain).toBeTruthy();
  }, 60_000);
});

/* ── 7: the gate actually stops a bad model ────────────────────────────────── */

/**
 * A model that writes schema-valid Turkish with the defects the gate exists to catch:
 * a wrong case suffix ("Elif'a"), discipline-by-fear ("öcü"), a translated idiom and a
 * cliffhanger ending. Everything else about the pipeline stays real.
 */
class BadTurkishLlmAdapter implements LlmAdapter {
  readonly kind = 'llm' as const;
  readonly provider = 'fake' as const;

  async complete(
    input: LlmCompleteInput,
    _ctx: ProviderCallContext,
  ): Promise<AdapterResult<LlmCompleteOutput>> {
    const text = this.render(input);
    return {
      value: {
        text,
        finishReason: 'stop',
        tokens: { input: 100, output: 200, cachedInput: 50 },
        model: 'test-bad-model',
      },
      usage: [
        {
          provider: 'fake',
          model: 'test-bad-model',
          operation: 'llm.complete',
          billingUnit: 'token',
          billedUnits: 350,
          unitPriceUsd: 0.000001,
          costUsd: 0.00035,
          cacheHit: false,
          latencyMs: 1,
        },
      ],
    };
  }

  private render(input: LlmCompleteInput): string {
    if (input.purpose === 'outline') {
      return JSON.stringify({
        kitap_meta: {
          baslik: 'Elif ve Gece',
          ogrenilen_ders: 'Cesaret öğrenilir.',
          duygusal_yay: 'Korkudan güvene.',
        },
        karakter_kanonu: [
          { rol: 'kahraman', ad: 'Elif', gorsel_tarif_en: 'a small child with dark hair' },
        ],
        karakter_varyantlari: [
          { varyant_id: 'v1', ozet_tr: 'Sarı kazak.', gorsel_tarif_en: 'yellow jumper' },
          { varyant_id: 'v2', ozet_tr: 'Yeşil tulum.', gorsel_tarif_en: 'green dungarees' },
          { varyant_id: 'v3', ozet_tr: 'Mavi mont.', gorsel_tarif_en: 'blue coat' },
        ],
        kapak_fikri: { ozet_tr: 'Elif kapıda.', gorsel_tarif_en: 'child at a door' },
        sayfalar: Array.from({ length: 12 }, (_, index) => ({
          sayfa_no: index + 1,
          sahne_ozeti: `Elif için ${index + 1}. sahne.`,
          duygusal_ton: index === 11 ? 'sicak_kapanis' : 'merak',
        })),
      });
    }
    if (input.purpose === 'judge') {
      return JSON.stringify({ uygun: true, ihlaller: [], not: 'uygun' });
    }
    return JSON.stringify({
      sayfalar: Array.from({ length: 12 }, (_, index) => ({
        sayfa_no: index + 1,
        metin:
          "Elif'a annesi seslendi ve o korktu ve odaya girdi. " +
          'Yaramazlık yaparsan öcü gelir dedi. ' +
          'Günün sonunda onun annesi geldi. Peki ya sonra ne olacaktı?',
        kelime_sayisi: 30,
      })),
    });
  }
}

describe('the quality gate stops a bad model', () => {
  it('refuses the book, fails the story, and saves no pages', async () => {
    const env = testEnv();
    const adapters = fakeAdaptersFromEnv(env, 0);
    const runtime = await runtimeFor({ ...adapters, llm: new BadTurkishLlmAdapter() });
    const seed = await seedStory({ heroName: 'Elif', ageBand: '6-8', pageCount: 12 });

    const outlineJob = await enqueueStoryJob(seed, 'story_outline', 'bad-outline');
    await PROCESSORS.llm['story.outline']!(
      runtime,
      fakeJob({
        jobId: outlineJob.jobId,
        userId: seed.userId,
        correlationId: 'trace-bad',
        kind: 'story_outline',
        ref: { storyId: seed.storyId },
      }),
    );

    const fillJob = await enqueueStoryJob(seed, 'story_fill', 'bad-fill');
    await expect(
      PROCESSORS.llm['story.fill']!(
        runtime,
        fakeJob({
          jobId: fillJob.jobId,
          userId: seed.userId,
          correlationId: 'trace-bad-fill',
          kind: 'story_fill',
          ref: { storyId: seed.storyId, pageCount: 12 },
        }),
      ),
    ).rejects.toThrow(/MODERATION_BLOCKED|AGE_POLICY_VIOLATION|CONTENT_BLOCKED/u);

    const story = await handle.db.execute<{ status: string }>(
      sql`select status from stories where id = ${seed.storyId}`,
    );
    expect(story[0]?.status).toBe('failed');

    // Not a single page of that text reached the book.
    const pages = await handle.db.execute<{ text_tr: string | null }>(
      sql`select text_tr from story_pages where story_id = ${seed.storyId}`,
    );
    expect(pages.every((page) => page.text_tr === null)).toBe(true);

    // …and the refusal is auditable: which rule, on which surface, with an excerpt.
    const blocks = await handle.db.execute<{ engine: string; categories: { code?: string } }>(sql`
      select engine, categories from moderation_events
       where story_id = ${seed.storyId} and verdict = 'block'
    `);
    const codes = blocks.map((row) => row.categories?.code);
    expect(codes).toContain('NAME_INFLECTION_WRONG');
    expect(codes).toContain('BANNED_TERM');
    expect(codes).toContain('TRANSLATIONESE');

    // The model was asked again before we gave up (SPEC §10.4: max 2 regenerations).
    const steps = await getJobSteps(handle.db, fillJob.jobId);
    expect(steps.filter((step) => step.step_key.startsWith('llm:fill')).length).toBeGreaterThan(1);
  }, 60_000);
});
