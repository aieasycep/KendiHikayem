/**
 * sse.test.ts — olay akışının gerçekten olay ürettiğini kanıtlar.
 * (React Native'de akış gövdesi desteklenmez; bu test Node yolu içindir.)
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { parseServerEvent } from '@kendihikayem/contract';

import { configureMock, resetMockConfig } from './scenarios';
import { resetStore } from './store';
import { setupMockServer } from './node';

const server = setupMockServer();
const BASE = 'https://api.kendihikayem.com';
const HEADERS = { 'x-client-version': '1.0.0', 'content-type': 'application/json' };

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  resetStore();
  resetMockConfig();
});
afterAll(() => server.close());

describe('SSE', () => {
  it('iş akışı ilerleme olayları ve kapanış olayı üretir', async () => {
    configureMock({ latencyMs: 0, jobSpeed: 4_000, sseEnabled: true });

    const created = await fetch(`${BASE}/v1/stories`, {
      method: 'POST',
      headers: { ...HEADERS, 'idempotency-key': 'sse-test-1' },
      body: JSON.stringify({
        hero: { name: 'Çağla' },
        ageBand: '6-8',
        artStyleCode: 'suluboya',
        pageCount: 12,
        characterBuilder: {},
      }),
    });
    const { job } = (await created.json()) as { job: { jobId: string } };

    const res = await fetch(`${BASE}/v1/jobs/${job.jobId}/events`, { headers: HEADERS });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const types: string[] = [];

    for (let i = 0; i < 12; i += 1) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      for (const frame of buffer.split('\n\n')) {
        const dataLine = frame.split('\n').find((line) => line.startsWith('data: '));
        if (!dataLine) continue;
        const event = parseServerEvent(dataLine.slice(6));
        if (event && !types.includes(event.type)) types.push(event.type);
      }
      if (types.includes('job.awaiting_approval')) break;
    }
    await reader.cancel();

    expect(types).toContain('job.progress');
    expect(types).toContain('job.awaiting_approval');
  }, 20_000);
});
