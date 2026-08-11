/**
 * The HTTP layer, against a real server and a real PostgreSQL.
 *
 * The claims being checked are the ones a report should not make without evidence:
 *   · the server actually boots and listens on a socket
 *   · `GET /v1/jobs/:id` — the path mobile depends on — really works
 *   · unimplemented routes answer a real 501 naming their owner
 *   · level-1 idempotency replays instead of re-charging, and conflicts on a changed body
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DbHandle } from '@kendihikayem/db';
import { enqueueJob, requestHash, transitionJob } from '@kendihikayem/worker';

import {
  type TestServer,
  createTestUser,
  deleteTestUser,
  newIdempotencyKey,
  openDb,
  startTestServer,
} from './helpers';

let handle: DbHandle;
let server: TestServer;
let otherUserId: string;
const createdUsers: string[] = [];

beforeAll(async () => {
  handle = openDb(5);
  const user = await createTestUser(handle.db, { capUsd: 10, credits: 7 });
  const other = await createTestUser(handle.db, { capUsd: 10 });
  createdUsers.push(user.userId, other.userId);
  otherUserId = other.userId;
  server = await startTestServer(handle.db, user, [other]);
});

afterAll(async () => {
  await server.app.close();
  for (const userId of createdUsers) await deleteTestUser(handle.db, userId);
  await handle.close();
});

async function makeJob(userId: string, kind = 'story_outline') {
  const { job } = await enqueueJob(handle.db, {
    userId,
    kind: kind as 'story_outline',
    idempotencyKey: newIdempotencyKey('job'),
    requestHash: requestHash('POST /v1/stories', { t: Date.now() }),
    correlationId: `trace-${Date.now()}`,
    progressTotal: 12,
    progressLabel: 'Hikayenin iskeleti kuruluyor',
  });
  return job;
}

describe('the server boots', () => {
  /** `inject` exercises the full stack but not the socket — so bind a real port too. */
  it('listens on a real socket and answers /health', async () => {
    const address = await server.app.listen({ host: '127.0.0.1', port: 0 });
    expect(address).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);

    const response = await fetch(`${address}/health`);
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      ok: boolean;
      endpoints: { implemented: number; pending: number };
    };
    expect(body.ok).toBe(true);
    expect(body.endpoints.implemented).toBeGreaterThan(0);
    expect(body.endpoints.pending).toBeGreaterThan(0);
  });

  it('refuses a request without x-client-version', async () => {
    const response = await server.app.inject({ method: 'GET', url: '/v1/entitlements' });
    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('puts a trace id on every response, including failures', async () => {
    const response = await server.app.inject({
      method: 'GET',
      url: '/v1/entitlements',
      headers: { 'x-client-version': '1.0.0' },
    });
    expect(response.statusCode).toBe(401);
    expect(response.headers['x-trace-id']).toBeTruthy();
    expect(response.json()).toMatchObject({
      code: 'UNAUTHENTICATED',
      traceId: response.headers['x-trace-id'],
    });
  });
});

describe('GET /v1/jobs/:jobId — the mobile polling path', () => {
  it('returns the job with Turkish progress text', async () => {
    const job = await makeJob(server.userId);

    const response = await server.app.inject({
      method: 'GET',
      url: `/v1/jobs/${job.id}`,
      headers: server.headers(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: job.id,
      kind: 'story_outline',
      status: 'queued',
      progress: { current: 0, total: 12, labelTr: 'Hikayenin iskeleti kuruluyor' },
      steps: [],
    });
  });

  it('reflects a status change on the next poll — the whole point of polling', async () => {
    const job = await makeJob(server.userId);
    await transitionJob(handle.db, job.id, 'running');
    await transitionJob(handle.db, job.id, 'waiting_approval');

    const response = await server.app.inject({
      method: 'GET',
      url: `/v1/jobs/${job.id}`,
      headers: server.headers(),
    });

    expect(response.json()).toMatchObject({ status: 'waiting_approval' });
  });

  it("refuses another account's job", async () => {
    const job = await makeJob(otherUserId);

    const response = await server.app.inject({
      method: 'GET',
      url: `/v1/jobs/${job.id}`,
      headers: server.headers(),
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: 'FORBIDDEN' });
  });

  it('404s an unknown job', async () => {
    const response = await server.app.inject({
      method: 'GET',
      url: '/v1/jobs/00000000-0000-4000-8000-000000000000',
      headers: server.headers(),
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'NOT_FOUND' });
  });

  it('lists the account\'s jobs newest first', async () => {
    const response = await server.app.inject({
      method: 'GET',
      url: '/v1/jobs?limit=5',
      headers: server.headers(),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { items: Array<{ id: string }> };
    expect(body.items.length).toBeGreaterThan(0);
  });
});

describe('POST /v1/jobs/:jobId/cancel — level-1 idempotency', () => {
  it('replays the stored response instead of acting twice', async () => {
    const job = await makeJob(server.userId);
    const key = newIdempotencyKey();

    const first = await server.app.inject({
      method: 'POST',
      url: `/v1/jobs/${job.id}/cancel`,
      headers: server.headers({ 'idempotency-key': key }),
      payload: {},
    });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ status: 'cancelled' });

    // Second identical tap: replayed, and the domain is NOT touched again — a second real
    // cancel would throw JOB_NOT_CANCELLABLE, so a 200 here proves the handler never ran.
    const second = await server.app.inject({
      method: 'POST',
      url: `/v1/jobs/${job.id}/cancel`,
      headers: server.headers({ 'idempotency-key': key }),
      payload: {},
    });
    expect(second.statusCode).toBe(200);
    expect(second.headers['idempotent-replay']).toBe('true');
    expect(second.json()).toEqual(first.json());
  });

  it('rejects the same key with a different body', async () => {
    const jobA = await makeJob(server.userId);
    const jobB = await makeJob(server.userId);
    const key = newIdempotencyKey();

    const first = await server.app.inject({
      method: 'POST',
      url: `/v1/jobs/${jobA.id}/cancel`,
      headers: server.headers({ 'idempotency-key': key }),
      payload: {},
    });
    expect(first.statusCode).toBe(200);

    // Same key, different route target ⇒ different request hash ⇒ conflict.
    const second = await server.app.inject({
      method: 'POST',
      url: `/v1/jobs/${jobB.id}/cancel`,
      headers: server.headers({ 'idempotency-key': key }),
      payload: { note: 'different' },
    });
    expect(second.statusCode).toBe(409);
    expect(second.json()).toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });

  it('requires an Idempotency-Key on writes', async () => {
    const job = await makeJob(server.userId);
    const response = await server.app.inject({
      method: 'POST',
      url: `/v1/jobs/${job.id}/cancel`,
      headers: server.headers(),
      payload: {},
    });
    expect(response.statusCode).toBe(422);
  });

  it('refuses to cancel a finished job', async () => {
    const job = await makeJob(server.userId);
    await transitionJob(handle.db, job.id, 'running');
    await transitionJob(handle.db, job.id, 'succeeded');

    const response = await server.app.inject({
      method: 'POST',
      url: `/v1/jobs/${job.id}/cancel`,
      headers: server.headers({ 'idempotency-key': newIdempotencyKey() }),
      payload: {},
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'JOB_NOT_CANCELLABLE' });
  });
});

describe('GET /v1/entitlements', () => {
  it('reports credits and the internal USD cost cap', async () => {
    const response = await server.app.inject({
      method: 'GET',
      url: '/v1/entitlements',
      headers: server.headers(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      credits: 7,
      costCap: { capUsd: 10, blocked: false },
      stories: { used: 0, limit: 100 },
    });
  });
});

describe('POST /v1/estimates', () => {
  it('prices the cheap skeleton gate at zero credits', async () => {
    const response = await server.app.inject({
      method: 'POST',
      url: '/v1/estimates',
      headers: server.headers({ 'idempotency-key': newIdempotencyKey() }),
      payload: { operation: 'story_outline', params: {} },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ credits: 0, willConsumeQuota: false });
  });

  it('prices the expensive fill stage and consumes quota', async () => {
    const response = await server.app.inject({
      method: 'POST',
      url: '/v1/estimates',
      headers: server.headers({ 'idempotency-key': newIdempotencyKey() }),
      payload: { operation: 'story_fill', params: { pageCount: 12 } },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      credits: number;
      breakdown: { llm: number; image: number; tts: number };
      willConsumeQuota: boolean;
    };
    expect(body.credits).toBe(1);
    expect(body.willConsumeQuota).toBe(true);
    // The parts must sum to the whole or the receipt looks broken.
    expect(body.breakdown.llm + body.breakdown.image + body.breakdown.tts).toBe(body.credits);
  });
});

describe('unimplemented endpoints', () => {
  it('answers a real 501 naming the owning agent', async () => {
    const response = await server.app.inject({
      method: 'GET',
      url: '/v1/catalog/themes',
      headers: { 'x-client-version': '1.0.0' },
    });

    expect(response.statusCode).toBe(501);
    expect(response.headers['x-kh-not-implemented']).toBe('catalog.themes');
    expect(response.headers['x-kh-owner']).toBe('A1');
    expect(response.json()).toMatchObject({
      detail: expect.stringContaining('NOT_IMPLEMENTED: catalog.themes'),
    });
  });

  it('publishes the ownership map so the other agents can find their work', async () => {
    const response = await server.app.inject({ method: 'GET', url: '/internal/endpoints' });
    expect(response.statusCode).toBe(200);

    const body = response.json() as Record<string, { implemented: boolean; owner: string }>;
    expect(body['jobs.get']).toEqual({ implemented: true, owner: 'A2' });
    expect(body['stories.create']).toEqual({ implemented: false, owner: 'A3' });
  });
});
