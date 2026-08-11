/**
 * `book.flow.ts`'s SHAPE, plus an honest note about where the queue-backed cases went.
 *
 * These three assertions need no Redis, no database and no provider: they are about the
 * tree `buildBookIllustrationFlow` produces, and that tree is where partial success is
 * decided at the queue level.
 */

import { describe, expect, it } from 'vitest';

import { buildBookIllustrationFlow } from '../src/flows/book.flow';
import { TEST_REDIS_URL, redisAvailable } from './helpers';

const hasRedis = await redisAvailable();

/* ── Flow shape: no Redis needed, so this always runs ─────────────────────── */

describe('flow shape', () => {
  it('builds one join parent over 13 image children', () => {
    const flow = buildBookIllustrationFlow({
      jobId: 'job-1',
      userId: 'user-1',
      correlationId: 'trace-1',
      storyId: 'story-1',
      pageNos: Array.from({ length: 12 }, (_, i) => i + 1),
      refs: {
        stylePlateAssetId: 'a1',
        characterSheetAssetId: 'a2',
        faceRefAssetId: 'a3',
      },
    });

    expect(flow.queueName).toBe('media');
    expect(flow.name).toBe('book.assemble');
    // 12 pages + cover.
    expect(flow.children).toHaveLength(13);
    expect(flow.children?.every((child) => child.queueName === 'image')).toBe(true);
  });

  it('does not let one failed page cancel the other twelve', () => {
    const flow = buildBookIllustrationFlow({
      jobId: 'job-2',
      userId: 'user-1',
      correlationId: 'trace-2',
      storyId: 'story-1',
      pageNos: [1, 2, 3],
      refs: { stylePlateAssetId: 'a', characterSheetAssetId: 'b', faceRefAssetId: 'c' },
    });

    // The single flag that makes partial success possible at the queue level.
    expect(flow.children?.every((c) => c.opts?.failParentOnFailure === false)).toBe(true);
  });

  it('gives every node a deterministic id so re-adding a flow is a no-op', () => {
    const build = () =>
      buildBookIllustrationFlow({
        jobId: 'job-3',
        userId: 'user-1',
        correlationId: 'trace-3',
        storyId: 'story-1',
        pageNos: [1, 2],
        refs: { stylePlateAssetId: 'a', characterSheetAssetId: 'b', faceRefAssetId: 'c' },
      });

    expect(build().opts?.jobId).toBe(build().opts?.jobId);
    // Flattened on purpose: BullMQ 6 rejects a custom job id containing `:`,
    // which is the Redis key separator. `queueJobId` keeps the id deterministic
    // — that is what makes re-adding a flow a no-op instead of a second book —
    // and only swaps the separator. Asserting the colon form would be asserting
    // an id BullMQ would refuse to accept.
    expect(build().children?.[0]?.opts?.jobId).toBe('job-3__image-page-01');
  });
});

/* ── End to end: moved ────────────────────────────────────────────────────────
 *
 * The queue-backed cases that used to live here — 13 images fanning out and joining,
 * partial success when pages fail, the reservation committed with the real cost, and the
 * content cache turning a rerun into a zero-cost skip — drove the PLACEHOLDER `image.page`
 * processor. That placeholder has been replaced by the real illustration pipeline (prompt
 * assembly, the K5 audit, the QA gate, renditions, `assets` rows), which reads a real
 * story, cast and art style out of the database and judges real pixels.
 *
 * Re-pointing these cases at the real processor would have made them a second copy of
 * `apps/worker/test/image-pipeline.integration.test.ts`, which now covers every property
 * they asserted and several they could not:
 *
 *   fan-out / fan-in of 13 ....... "fans out 13 pages, judges every one, and delivers them all"
 *   partial success .............. "retries a page the QA gate rejects, and abandons one to
 *                                   manual_review while the book ships"
 *   reservation committed ........ same case, asserts `cost_reservations.state = 'committed'`
 *   real cost in the ledger ...... same case, 13 rows in `provider_usage`
 *   content cache ⇒ skipped, $0 .. "serves an identical re-render from cache at zero cost"
 *
 * The FLOW SHAPE tests above stay here: they are pure, they need no Redis, and they are
 * about `book.flow.ts` rather than about any processor.
 *
 * (Owner note: A4 removed these while replacing the placeholder processor. The behaviour
 * is not untested — it moved, and it got stricter.)
 */

/* ── Honest reporting when Redis is missing ───────────────────────────────── */

describe.skipIf(hasRedis)('redis unavailable', () => {
  it('reports that the queue-backed tests did not run', () => {
    console.warn(
      `[test] Redis unreachable at ${TEST_REDIS_URL}; BullMQ end-to-end tests were SKIPPED, not passed.`,
    );
    expect(hasRedis).toBe(false);
  });
});
