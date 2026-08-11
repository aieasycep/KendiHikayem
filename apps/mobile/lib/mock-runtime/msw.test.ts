/**
 * Proves the phone's mock transport actually works.
 *
 * `msw` is aliased to lib/mock-runtime/msw.ts here exactly as Metro aliases it
 * on the device (see vitest.config.ts and metro.config.js), so this file
 * exercises the real thing end to end:
 *
 *   typed ts-rest client  →  patched global fetch  →  our path matcher
 *   →  packages/mock's policy layer  →  packages/mock's resolvers  →  fixtures
 *
 * Every link except the JS engine is the one that ships in the APK. If the
 * shim were missing an MSW API, matching paths wrongly, or dropping the
 * idempotency/header policy, these assertions fail.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { API_BASE_URL_PROD, createApiClient, newIdempotencyKey } from '@kendihikayem/contract';
import { configureMock, handlers, resetMockConfig, resetStore } from '@kendihikayem/mock';

import { setupServer, type RequestHandler } from './msw';

/**
 * `handlers` is typed against real MSW because that is what `packages/mock`
 * compiles against — TypeScript follows the real package, only the two
 * *bundlers* (Metro, Vitest) redirect the specifier. At runtime these are
 * literally the objects our `http.*` factories produced, so the cast asserts
 * what the aliases already guarantee.
 */
const server = setupServer(...(handlers as unknown as RequestHandler[]));
const api = createApiClient({ baseUrl: API_BASE_URL_PROD, clientVersion: '0.1.0' });

beforeAll(() => {
  server.listen();
});

afterAll(() => {
  server.close();
});

beforeEach(() => {
  resetStore();
  resetMockConfig();
  // Latency is the one non-deterministic knob; the app sets its own values.
  configureMock({ latencyMs: 0, sseEnabled: false });
});

describe('mock transport', () => {
  it('serves a POST endpoint through the typed client', async () => {
    const res = await api.auth.guest({
      body: { deviceId: 'cihaz-test-0001' },
      headers: { 'idempotency-key': newIdempotencyKey('test') },
    });

    expect(res.status).toBe(200);
    if (res.status !== 200) return;
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.user.isGuest).toBe(true);
  });

  it('serves a GET endpoint and returns the Turkish fixtures', async () => {
    const res = await api.catalog.themes();

    expect(res.status).toBe(200);
    if (res.status !== 200) return;
    expect(res.body.items.length).toBeGreaterThan(0);
  });

  it('extracts :path params instead of matching the wrong handler', async () => {
    const created = await api.children.create({
      body: { givenName: 'Zeynep', ageBand: '3-5' },
      headers: { 'idempotency-key': newIdempotencyKey('test') },
    });
    expect(created.status).toBe(201);
    if (created.status !== 201) return;

    const updated = await api.children.update({
      params: { childId: created.body.id },
      body: { givenName: 'Zeynep Naz' },
      headers: { 'idempotency-key': newIdempotencyKey('test') },
    });

    expect(updated.status).toBe(200);
    if (updated.status !== 200) return;
    expect(updated.body.id).toBe(created.body.id);
    expect(updated.body.givenName).toBe('Zeynep Naz');
  });

  it('does not let a shorter path swallow a longer sibling route', async () => {
    // '/v1/me' and '/v1/me/reading-preferences' must stay distinct.
    const me = await api.auth.me();
    expect(me.status).toBe(200);

    const prefs = await api.audio.readingPreferences();
    expect(prefs.status).toBe(200);
    if (prefs.status !== 200 || me.status !== 200) return;
    expect(prefs.body).not.toHaveProperty('isGuest');
  });

  it('keeps packages/mock’s policy layer in force (missing Idempotency-Key)', async () => {
    const res = await api.auth.guest({
      body: { deviceId: 'cihaz-test-0002' },
      // Deliberately no idempotency-key. The contract makes it mandatory at the
      // type level, which is why this has to be forced — the point of the test
      // is that the mock ALSO enforces it at runtime.
      headers: {} as { 'idempotency-key': string },
    });

    // VALIDATION_FAILED — the policy layer rejected the write before the
    // resolver ran, exactly as it does under real MSW.
    expect(res.status).toBe(422);
  });

  it('replays an identical idempotent write instead of running it twice', async () => {
    const key = newIdempotencyKey('test');
    const body = { deviceId: 'cihaz-test-0003' } as const;

    const first = await api.auth.guest({ body, headers: { 'idempotency-key': key } });
    const second = await api.auth.guest({ body, headers: { 'idempotency-key': key } });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect((second.headers as Headers).get('x-mock-replayed')).toBe('true');
  });

  it('falls through to the real network for an unmatched path', async () => {
    // Uninstall first, then put a spy where the real fetch was, then reinstall —
    // so the interceptor's fall-through target is the spy.
    server.close();
    const realFetch = globalThis.fetch;
    let bypassed = false;
    globalThis.fetch = (async () => {
      bypassed = true;
      return new Response('{}', { status: 200 });
    }) as typeof fetch;
    server.listen();

    try {
      await fetch('https://example.com/not-a-contract-endpoint');
    } finally {
      server.close();
      globalThis.fetch = realFetch;
      server.listen();
    }

    expect(bypassed).toBe(true);
  });
});
