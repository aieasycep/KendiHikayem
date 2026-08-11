/**
 * ⭐ THE WHOLE ILLUSTRATION PIPELINE, END TO END.
 *
 * Real PostgreSQL, real BullMQ fan-out/fan-in, the real prompt builder, the real K5 audit,
 * the real QA gate reading real pixels, real WebP renditions, a real object store (the
 * filesystem driver — there is no MinIO here) and real `assets` rows. The only double is
 * the illustration vendor, which is unreachable and has no key.
 *
 * What each case proves:
 *
 *   1. A book of 13 illustrations fans out, joins, and every page ends `ready` with three
 *      renditions, an `assets` row and a `page.image.ready` event.
 *   2. CHARACTER CONSISTENCY, as far as it can be proven without a model: all 13 prompts
 *      contain the frozen canon byte for byte and carry the same three references in the
 *      same order.
 *   3. THE QA LOOP RECOVERS: a page whose first render contains letterforms is caught by
 *      the real gate, re-rendered with a hardened prompt and ends `ready` at attempt 2.
 *   4. PARTIAL SUCCESS: a page that fails QA on every attempt lands in `manual_review`,
 *      the book still completes as `succeeded`, and the other twelve are readable.
 *   5. The content cache turns a repeat render into a zero-cost skip with `saved_usd`.
 *   6. `COST_CAP_REACHED` stops a render BEFORE the provider is called.
 *
 * Skips itself loudly when Redis is unavailable rather than pretending to pass.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import type { DbHandle } from '@kendihikayem/db';
import {
  createFakeRegistry,
  freezeCharacterDna,
  type AdapterRegistry,
} from '@kendihikayem/providers';
import { ERROR_CODES } from '@kendihikayem/contract';
import { FilesystemObjectStore } from '@kendihikayem/media';

import { QueueRegistry, connectionFromUrl } from '../src/queues';
import { buildRuntime, type WorkerRuntime } from '../src/runtime';
import { createQueueProcessor } from '../src/processors/index';
import { addBookIllustrationFlow } from '../src/flows/book.flow';
import { enqueueJob, transitionJob } from '../src/jobs/repository';
import { requestHash, sha256Hex } from '../src/jobs/hashing';
import { reserveCost } from '../src/cost/reservation';
import { buildImageContext } from '../src/processors/image-context';
import {
  makeCharacterSheetProcessor,
  makeImagePageProcessor,
  makeStylePlateProcessor,
} from '../src/processors/image';
import { assertImageBudget, CostCapReachedError } from '../src/processors/image-budget';
import { RenderingFakeImageAdapter, pageMarker } from './image-fakes';
import {
  TEST_REDIS_URL,
  createTestUser,
  deleteTestUser,
  newIdempotencyKey,
  openDb,
  redisAvailable,
  testEnv,
  waitFor,
} from './helpers';

const hasRedis = await redisAvailable();

let handle: DbHandle;
let mediaRoot: string;
const createdUsers: string[] = [];

beforeAll(async () => {
  handle = openDb(10);
  mediaRoot = await mkdtemp(join(tmpdir(), 'kh-image-e2e-'));
});

afterAll(async () => {
  for (const userId of createdUsers) await deleteTestUser(handle.db, userId);
  await handle.close();
  await rm(mediaRoot, { recursive: true, force: true });
});

/* ── fixtures ──────────────────────────────────────────────────────────────── */

const CANON = freezeCharacterDna(
  {
    name: 'Elif',
    ageYears: 6,
    presentation: 'girl',
    skin: 'warm olive skin',
    hairColour: 'dark brown hair',
    hairType: 'wavy hair',
    hairLength: 'shoulder-length hair',
    eyes: 'warm brown eyes',
    freckles: 'freckles across the nose',
    outfit: 'yellow dungarees over a white tee',
    shoes: 'blue canvas sneakers',
    companion: 'a small worn teddy bear',
  },
  sha256Hex,
);

interface Fixture {
  userId: string;
  storyId: string;
  characterId: string;
}

/**
 * A story with a cast and twelve pages. Each page's `illustration_prompt_en` carries a
 * `PAGE-NN` marker, which is how the rendering double knows which page it is drawing —
 * the same way a real model would only see the prompt.
 */
async function createStoryFixture(options: { capUsd?: number } = {}): Promise<Fixture> {
  const user = await createTestUser(handle.db, { capUsd: options.capUsd ?? 20 });
  createdUsers.push(user.userId);

  const storyRows = await handle.db.execute<{ id: string }>(sql`
    insert into stories (user_id, age_band, art_style_code, hero_name, page_count, status,
                         request_input)
    values (${user.userId}, '6-8', 'suluboya', 'Elif', 12, 'images_generating', '{}'::jsonb)
    returning id
  `);
  const storyId = storyRows[0]!.id;

  const characterRows = await handle.db.execute<{ id: string }>(sql`
    insert into story_characters (story_id, role, name_tr, canon_en, is_primary)
    values (${storyId}, 'kahraman', 'Elif', ${CANON.canonEn}, true)
    returning id
  `);

  for (let pageNo = 1; pageNo <= 12; pageNo += 1) {
    await handle.db.execute(sql`
      insert into story_pages (story_id, page_no, text_tr, illustration_prompt_en,
                               emotion, time_of_day, camera, text_safe_zone, image_status)
      values (${storyId}, ${pageNo}, ${`Sayfa ${pageNo} metni.`},
              ${`${pageMarker(pageNo)}: the hero explores a quiet corner of the garden.`},
              'merak', 'late afternoon', 'medium shot', 'bottom', 'pending')
    `);
  }

  return { userId: user.userId, storyId, characterId: characterRows[0]!.id };
}

function makeStore(): FilesystemObjectStore {
  return new FilesystemObjectStore({
    root: mediaRoot,
    bucket: 'kh-media',
    signingSecret: 'm'.repeat(48),
    publicBaseUrl: 'https://api.example.test',
  });
}

function makeRuntime(options: {
  image: RenderingFakeImageAdapter;
  queues?: QueueRegistry;
}): WorkerRuntime {
  // The processors build their object store from `runtime.env`, so the temp directory has
  // to be in the parsed config — not in `process.env` after the fact.
  const env = testEnv({ MEDIA_LOCAL_ROOT: mediaRoot });
  const adapters: AdapterRegistry = {
    ...createFakeRegistry({
      models: {
        llm: env.LLM_MODEL_FILL,
        image: env.IMAGE_MODEL_PRIMARY,
        tts: env.TTS_MODEL_QUALITY,
        moderation: env.MODERATION_MODEL,
        align: 'whisperx-tr',
        print: env.PRINT_ADAPTER,
      },
      latencyMs: 0,
    }),
    image: options.image,
  };

  const queues =
    options.queues ??
    new QueueRegistry({
      connection: connectionFromUrl(TEST_REDIS_URL),
      prefix: `khimg_${process.pid}_${Math.random().toString(36).slice(2, 8)}`,
    });

  return buildRuntime({ env, db: handle.db, queues, adapters });
}

/**
 * Runs the two preparation steps a book depends on: the style plate and the character
 * sheet (plus the code-cut face crop). They are separate jobs in production because the
 * parent approves a sheet variant between them and the pages.
 */
async function prepareReferences(
  runtime: WorkerRuntime,
  fixture: Fixture,
  store: FilesystemObjectStore,
): Promise<void> {
  const contextFor = () =>
    buildImageContext({
      db: handle.db,
      env: runtime.env,
      store,
      adapters: [...runtime.routers.image.route],
      routerOptions: { ledger: runtime.ledger },
    });

  const { job } = await enqueueJob(handle.db, {
    userId: fixture.userId,
    kind: 'image_character_sheet',
    idempotencyKey: newIdempotencyKey('prep'),
    requestHash: requestHash('POST /prep', { storyId: fixture.storyId }),
    correlationId: 'trace-prep',
  });
  await transitionJob(handle.db, job.id, 'running');

  const fakeJob = (ref: Record<string, unknown>) =>
    ({
      data: {
        jobId: job.id,
        userId: fixture.userId,
        correlationId: 'trace-prep',
        kind: 'image_character_sheet',
        ref,
      },
    }) as never;

  await makeStylePlateProcessor(contextFor)(
    runtime,
    fakeJob({ storyId: fixture.storyId, settingEn: 'an empty cosy garden at dusk' }),
  );
  await makeCharacterSheetProcessor(contextFor)(
    runtime,
    fakeJob({ storyId: fixture.storyId, variantCount: 2 }),
  );
}

/* ── preparation steps ─────────────────────────────────────────────────────── */

describe('style plate and character sheet', () => {
  it('renders the plate, three-view sheet variants and a code-cut face crop', async () => {
    const image = new RenderingFakeImageAdapter({ model: 'test-image-model' });
    const runtime = makeRuntime({ image, queues: undefined as never });
    const store = makeStore();
    const fixture = await createStoryFixture();

    await prepareReferences(runtime, fixture, store);

    const assets = await handle.db.execute<{ kind: string; width_px: number }>(sql`
      select kind, width_px from assets where owner_user_id = ${fixture.userId} order by kind
    `);
    const kinds = assets.map((a) => a.kind);
    expect(kinds).toContain('image_style_plate');
    expect(kinds).toContain('image_character_sheet');
    // SPEC §8.2 step 3b: the face reference is CROPPED WITH CODE from the sheet, never
    // asked of the model — a model asked to "zoom in on the face" draws a new face.
    expect(kinds).toContain('image_face_ref');

    const character = await handle.db.execute<{
      character_sheet_asset_id: string | null;
      face_ref_asset_id: string | null;
      sheet_variants: Record<string, unknown> | null;
    }>(sql`
      select character_sheet_asset_id, face_ref_asset_id, sheet_variants
        from story_characters where id = ${fixture.characterId}
    `);
    expect(character[0]!.character_sheet_asset_id).toBeTruthy();
    expect(character[0]!.face_ref_asset_id).toBeTruthy();
    // The parent picks between variants (SPEC §8.1 ④); all of them are kept.
    expect((character[0]!.sheet_variants as { variants: unknown[] }).variants).toHaveLength(2);

    // The sheet is rendered at PRINT resolution because the face crop is taken from it.
    expect(image.calls.some((c) => c.resolution === 'print_4k')).toBe(true);
    await runtime.close();
  }, 90_000);
});

/* ── the book ──────────────────────────────────────────────────────────────── */

describe.skipIf(!hasRedis)('a whole book of illustrations', () => {
  it('fans out 13 pages, judges every one, and delivers them all', async () => {
    const image = new RenderingFakeImageAdapter({ model: 'test-image-model' });
    const queues = new QueueRegistry({
      connection: connectionFromUrl(TEST_REDIS_URL),
      prefix: `khimg_ok_${process.pid}_${Math.random().toString(36).slice(2, 8)}`,
    });
    const runtime = makeRuntime({ image, queues });
    const store = makeStore();
    const fixture = await createStoryFixture();

    await prepareReferences(runtime, fixture, store);

    for (const name of ['image', 'media'] as const) {
      queues.startWorker(name, createQueueProcessor(runtime, name));
    }

    const held = await reserveCost(handle.db, {
      userId: fixture.userId,
      estimateUsd: 3,
      caps: { maxCostUsdPerRequest: 6, dailyGlobalUsdCap: 1_000_000 },
    });
    if (!held.ok) throw new Error('reservation should have succeeded');

    const { job } = await enqueueJob(handle.db, {
      userId: fixture.userId,
      kind: 'image_book',
      idempotencyKey: newIdempotencyKey('book-ok'),
      requestHash: requestHash('POST /illustrate', { storyId: fixture.storyId }),
      correlationId: 'trace-book-ok',
      progressTotal: 13,
      estimatedCostUsd: 3,
      reservationId: held.reservationId,
    });

    await addBookIllustrationFlow(queues, {
      jobId: job.id,
      userId: fixture.userId,
      correlationId: 'trace-book-ok',
      storyId: fixture.storyId,
      pageNos: Array.from({ length: 12 }, (_, i) => i + 1),
      refs: { stylePlateAssetId: '', characterSheetAssetId: '', faceRefAssetId: '' },
    });

    await waitFor(
      async () => {
        const rows = await handle.db.execute<{ status: string }>(sql`
          select status from jobs where id = ${job.id}
        `);
        return rows[0]?.status === 'succeeded' || rows[0]?.status === 'failed';
      },
      { timeoutMs: 180_000 },
    );

    /* Every page is readable. */
    const pages = await handle.db.execute<{ image_status: string; image_asset_id: string | null }>(sql`
      select image_status, image_asset_id from story_pages
       where story_id = ${fixture.storyId} order by page_no
    `);
    expect(pages).toHaveLength(12);
    expect(pages.every((p) => p.image_status === 'ready')).toBe(true);
    expect(pages.every((p) => p.image_asset_id !== null)).toBe(true);

    /* Three screen renditions plus a JPEG fallback per page (SPEC §8.2 step 5). */
    const screenAssets = await handle.db.execute<{ count: string }>(sql`
      select count(*)::text as count from assets
       where owner_user_id = ${fixture.userId} and kind = 'image_page_screen'
    `);
    // 13 images × (thumb + reader + fallback); retina is skipped because the double
    // renders at 1024 and the pipeline REFUSES to upscale.
    expect(Number(screenAssets[0]!.count)).toBe(39);

    /* Progressive delivery: one event per page, as it became ready. */
    const events = await handle.db.execute<{ count: string }>(sql`
      select count(*)::text as count from job_events
       where job_id = ${job.id} and type = 'page.image.ready'
    `);
    expect(Number(events[0]!.count)).toBe(12);

    /* ⭐ CHARACTER CONSISTENCY: the canon is verbatim in all 13 prompts, and the reference
     * slots are identical and in the fixed order on every one. */
    const pagePrompts = image.calls.filter(
      (c) => c.purpose === 'page' || c.purpose === 'cover',
    );
    expect(pagePrompts).toHaveLength(13);
    expect(pagePrompts.every((c) => c.promptEn.includes(CANON.canonEn))).toBe(true);
    expect(
      pagePrompts.every(
        (c) => JSON.stringify(c.references) === JSON.stringify(pagePrompts[0]!.references),
      ),
    ).toBe(true);
    expect(pagePrompts[0]!.references).toEqual(['character_sheet', 'face_ref', 'style_plate']);

    /* Cost was measured per image and the hold was settled with the ACTUAL number. */
    const jobRow = await handle.db.execute<{ status: string; actual_cost_usd: string }>(sql`
      select status, actual_cost_usd from jobs where id = ${job.id}
    `);
    expect(jobRow[0]!.status).toBe('succeeded');

    /**
     * `closeJob` writes the job's terminal STATUS first and its settled COST a moment
     * later, so waiting on the status alone races the cost write. Wait for the number the
     * assertion is about, not for a proxy of it.
     */
    await waitFor(async () => {
      const rows = await handle.db.execute<{ actual_cost_usd: string }>(sql`
        select actual_cost_usd from jobs where id = ${job.id}
      `);
      return Number(rows[0]?.actual_cost_usd ?? 0) > 0;
    });
    const settled = await handle.db.execute<{ actual_cost_usd: string }>(sql`
      select actual_cost_usd from jobs where id = ${job.id}
    `);
    // 13 images at the 2K screen rate, priced per image into `provider_usage`.
    expect(Number(settled[0]!.actual_cost_usd)).toBeCloseTo(13 * 0.067, 2);

    const reservation = await handle.db.execute<{ state: string }>(sql`
      select state from cost_reservations where id = ${held.reservationId}
    `);
    expect(reservation[0]!.state).toBe('committed');

    const usage = await handle.db.execute<{ count: string }>(sql`
      select count(*)::text as count from provider_usage pu
        join job_steps js on js.id = pu.job_step_id
       where js.job_id = ${job.id} and pu.operation = 'image.generate'
    `);
    expect(Number(usage[0]!.count)).toBe(13);

    await queues.obliterate().catch(() => undefined);
    await runtime.close();
  }, 300_000);

  /* ── ⭐ the QA loop and partial success ─────────────────────────────────── */

  it('retries a page the QA gate rejects, and abandons one to manual_review while the book ships', async () => {
    /**
     * Page 5 renders with text on its FIRST attempt only — the retry, with a hardened
     * prompt, comes back clean. Page 9 renders with text every time and can never pass.
     * Both are judged by the real QA gate reading real pixels; nothing is stubbed.
     */
    const image = new RenderingFakeImageAdapter({
      model: 'test-image-model',
      drawText: (promptEn, attempt) => {
        if (promptEn.includes(pageMarker(9))) return true;
        if (promptEn.includes(pageMarker(5))) return attempt === 1;
        return false;
      },
    });

    const queues = new QueueRegistry({
      connection: connectionFromUrl(TEST_REDIS_URL),
      prefix: `khimg_partial_${process.pid}_${Math.random().toString(36).slice(2, 8)}`,
    });
    const runtime = makeRuntime({ image, queues });
    const store = makeStore();
    const fixture = await createStoryFixture();

    await prepareReferences(runtime, fixture, store);
    for (const name of ['image', 'media'] as const) {
      queues.startWorker(name, createQueueProcessor(runtime, name));
    }

    const { job } = await enqueueJob(handle.db, {
      userId: fixture.userId,
      kind: 'image_book',
      idempotencyKey: newIdempotencyKey('book-partial'),
      requestHash: requestHash('POST /illustrate', { storyId: fixture.storyId }),
      correlationId: 'trace-book-partial',
      progressTotal: 12,
    });

    await addBookIllustrationFlow(queues, {
      jobId: job.id,
      userId: fixture.userId,
      correlationId: 'trace-book-partial',
      storyId: fixture.storyId,
      pageNos: Array.from({ length: 12 }, (_, i) => i + 1),
      includeCover: false,
      refs: { stylePlateAssetId: '', characterSheetAssetId: '', faceRefAssetId: '' },
    });

    await waitFor(
      async () => {
        const rows = await handle.db.execute<{ status: string }>(sql`
          select status from jobs where id = ${job.id}
        `);
        return rows[0]?.status === 'succeeded' || rows[0]?.status === 'failed';
      },
      { timeoutMs: 240_000 },
    );

    const pages = await handle.db.execute<{
      page_no: number;
      image_status: string;
      image_attempts: number;
      image_qa: Record<string, unknown> | null;
    }>(sql`
      select page_no, image_status, image_attempts, image_qa
        from story_pages where story_id = ${fixture.storyId} order by page_no
    `);

    const byPage = new Map(pages.map((p) => [p.page_no, p]));

    /* Page 5: failed once, hardened, passed. The loop RECOVERED. */
    const page5 = byPage.get(5)!;
    expect(page5.image_status).toBe('ready');
    expect(page5.image_attempts).toBe(2);

    /* Page 9: never passed. Two facts matter — where it ended up, and what it recorded. */
    const page9 = byPage.get(9)!;
    expect(page9.image_status).toBe('manual_review');
    expect(page9.image_attempts).toBe(3);
    expect((page9.image_qa as { failedChecks?: string[] }).failedChecks).toContain('text_leak');

    /* The step's recorded error code is one the frozen contract knows how to speak.
     * An invented code reaches a parent as a blank message. */
    const failedStep = await handle.db.execute<{ error: Record<string, unknown> }>(sql`
      select error from job_steps where job_id = ${job.id} and step_key = 'image:page:09'
    `);
    expect(ERROR_CODES).toContain(failedStep[0]!.error['code']);
    expect(failedStep[0]!.error['reason']).toBe('image_qa_exhausted');

    /* Everything else is readable. */
    const ready = pages.filter((p) => p.image_status === 'ready');
    expect(ready).toHaveLength(11);

    /* ⭐ THE BOOK IS NOT FAILED. Eleven readable pages is a book to read tonight. */
    const jobRow = await handle.db.execute<{
      status: string;
      output: Record<string, unknown> | null;
    }>(sql`select status, output from jobs where id = ${job.id}`);
    expect(jobRow[0]!.status).toBe('succeeded');
    expect(jobRow[0]!.output).toMatchObject({
      partial: { completed: 11, total: 12, failedPageNos: [9] },
    });

    /* ⭐ THE RETRY BUDGET WAS RESPECTED, AND ONLY ONCE.
     * 12 pages + 1 extra for page 5 + 2 extra for page 9 = 15 renders. Not 27: a page
     * this loop gave up on is NOT re-thrown into BullMQ's own `attempts: 3`, which would
     * have re-rendered it three more times for nothing (see `image.ts`). */
    const pageCalls = image.calls.filter((c) => /PAGE-\d{2}/u.test(c.promptEn));
    expect(pageCalls).toHaveLength(15);

    /* The hardened retry kept the identity block and added a correction. */
    const page5Calls = image.calls.filter((c) => c.promptEn.includes(pageMarker(5)));
    expect(page5Calls).toHaveLength(2);
    expect(page5Calls[1]!.promptEn.startsWith(page5Calls[0]!.promptEn)).toBe(true);
    expect(page5Calls[1]!.promptEn).toContain('the previous attempt contained letterforms');
    expect(page5Calls[1]!.promptEn).toContain(CANON.canonEn);

    await queues.obliterate().catch(() => undefined);
    await runtime.close();
  }, 300_000);
});

/* ── content cache ─────────────────────────────────────────────────────────── */

describe('content cache', () => {
  it('serves an identical re-render from cache at zero cost, and measures the saving', async () => {
    /**
     * SPEC §6.2 rule 4, in its literal form: a parent edits page 3's text, so page 3 is
     * re-illustrated and NOTHING ELSE IS. Here the same page is rendered twice with an
     * unchanged prompt — the second run must not call the provider at all.
     */
    const image = new RenderingFakeImageAdapter({ model: 'test-image-model' });
    const runtime = makeRuntime({ image });
    const store = makeStore();
    const fixture = await createStoryFixture();
    await prepareReferences(runtime, fixture, store);

    const rendersAfterPrep = image.calls.length;
    const contextFor = () =>
      buildImageContext({
        db: handle.db,
        env: runtime.env,
        store,
        adapters: [...runtime.routers.image.route],
        routerOptions: { ledger: runtime.ledger },
      });
    const renderPage = makeImagePageProcessor(contextFor);

    const runOnce = async (label: string) => {
      const { job } = await enqueueJob(handle.db, {
        userId: fixture.userId,
        kind: 'image_page',
        idempotencyKey: newIdempotencyKey(label),
        requestHash: requestHash('POST /reillustrate', { label }),
        correlationId: `trace-${label}`,
      });
      await transitionJob(handle.db, job.id, 'running');

      const result = await renderPage(runtime, {
        data: {
          jobId: job.id,
          userId: fixture.userId,
          correlationId: `trace-${label}`,
          kind: 'image_page',
          pageNo: 3,
          ref: { storyId: fixture.storyId, print: false },
        },
      } as never);
      return result as { status: string };
    };

    const first = await runOnce('cache-a');
    expect(first.status).toBe('succeeded');
    expect(image.calls.length).toBe(rendersAfterPrep + 1);

    const second = await runOnce('cache-b');
    // Zero provider calls, zero dollars, and the page is still `ready`.
    expect(second.status).toBe('skipped');
    expect(image.calls.length).toBe(rendersAfterPrep + 1);

    const saved = await handle.db.execute<{ saved_usd: string; hit_count: number }>(sql`
      select saved_usd, hit_count from content_cache
       where kind = 'image' order by last_hit_at desc nulls last limit 1
    `);
    // The saving is MEASURED, not claimed — this number is the caching business case.
    expect(Number(saved[0]!.saved_usd)).toBeGreaterThan(0);
    expect(saved[0]!.hit_count).toBeGreaterThan(0);

    const page = await handle.db.execute<{ image_status: string }>(sql`
      select image_status from story_pages where story_id = ${fixture.storyId} and page_no = 3
    `);
    expect(page[0]!.image_status).toBe('ready');

    await runtime.close();
  }, 120_000);
});

/* ── cost ──────────────────────────────────────────────────────────────────── */

describe('cost controls', () => {
  it('refuses to start a render when the per-request cap would be exceeded', async () => {
    const fixture = await createStoryFixture();
    const { job } = await enqueueJob(handle.db, {
      userId: fixture.userId,
      kind: 'image_page',
      idempotencyKey: newIdempotencyKey('cap'),
      requestHash: requestHash('x', {}),
      correlationId: 'trace-cap',
    });

    const error = await assertImageBudget(handle.db, {
      userId: fixture.userId,
      jobId: job.id,
      estimateUsd: 5,
      caps: { maxCostUsdPerRequest: 0.5, dailyGlobalUsdCap: 1_000_000 },
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CostCapReachedError);
    // The contract code the API turns this into — the job never starts (SPEC §6.2 rule 5).
    expect((error as CostCapReachedError).code).toBe('COST_CAP_REACHED');
    expect((error as CostCapReachedError).reason).toBe('per_request_cap');
  });

  it('refuses when the global daily kill switch has been reached', async () => {
    const fixture = await createStoryFixture();
    const { job } = await enqueueJob(handle.db, {
      userId: fixture.userId,
      kind: 'image_page',
      idempotencyKey: newIdempotencyKey('cap-global'),
      requestHash: requestHash('x', {}),
      correlationId: 'trace-cap-global',
    });

    await expect(
      assertImageBudget(handle.db, {
        userId: fixture.userId,
        jobId: job.id,
        estimateUsd: 0.1,
        caps: { maxCostUsdPerRequest: 6, dailyGlobalUsdCap: 0 },
      }),
    ).rejects.toMatchObject({ reason: 'daily_global_cap' });
  });

  it('lets a reserved job through its own hold', async () => {
    // The reservation already set this budget aside under a row lock; re-checking the
    // monthly cap here would make the hold block the work it exists to fund.
    const fixture = await createStoryFixture({ capUsd: 1 });
    const held = await reserveCost(handle.db, {
      userId: fixture.userId,
      estimateUsd: 0.9,
      caps: { maxCostUsdPerRequest: 6, dailyGlobalUsdCap: 1_000_000 },
    });
    if (!held.ok) throw new Error('reservation should have succeeded');

    const { job } = await enqueueJob(handle.db, {
      userId: fixture.userId,
      kind: 'image_page',
      idempotencyKey: newIdempotencyKey('cap-reserved'),
      requestHash: requestHash('x', {}),
      correlationId: 'trace-cap-reserved',
      reservationId: held.reservationId,
    });

    await expect(
      assertImageBudget(handle.db, {
        userId: fixture.userId,
        jobId: job.id,
        estimateUsd: 0.5,
        caps: { maxCostUsdPerRequest: 6, dailyGlobalUsdCap: 1_000_000 },
      }),
    ).resolves.toBeUndefined();
  });
});

/* ── honest reporting ──────────────────────────────────────────────────────── */

describe.skipIf(hasRedis)('redis unavailable', () => {
  it('reports that the queue-backed illustration tests did not run', () => {
    console.warn(
      `[test] Redis unreachable at ${TEST_REDIS_URL}; the end-to-end illustration tests were SKIPPED, not passed.`,
    );
    expect(hasRedis).toBe(false);
  });
});
