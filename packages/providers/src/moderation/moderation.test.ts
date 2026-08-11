/**
 * The moderation adapter, against a RECORDED vendor response.
 *
 * ⚠️ NEVER RUN AGAINST THE LIVE VENDOR (no key, no egress here). The bodies below follow
 * the documented shape of the multimodal moderation endpoint.
 *
 * The interesting behaviour is not "does it parse JSON" — it is the threshold. The vendor's
 * own `flagged` boolean is tuned for a general audience; a bedtime story for a four-year-old
 * is not a general audience, so a high score blocks here even when the vendor said false.
 */

import { describe, expect, it } from 'vitest';

import { OpenAiModerationAdapter } from './openai';
import type { FetchLike, HttpResponseLike } from '../llm/http';

function stub(body: unknown, status = 200): { fetchImpl: FetchLike; calls: unknown[] } {
  const calls: unknown[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    const response: HttpResponseLike = {
      status,
      ok: status < 400,
      headers: { get: () => null },
      text: async () => JSON.stringify(body),
    };
    return response;
  };
  return { fetchImpl, calls };
}

function adapter(fetchImpl: FetchLike) {
  return build(fetchImpl, 'test-key');
}

/** Separate helper rather than a default parameter: `undefined` would re-apply the default. */
function adapterWithoutKey(fetchImpl: FetchLike) {
  return build(fetchImpl, undefined);
}

function build(fetchImpl: FetchLike, apiKey: string | undefined) {
  return new OpenAiModerationAdapter({
    apiKey,
    baseUrl: 'https://vendor.invalid',
    model: 'test-moderation-model',
    blockThreshold: 0.5,
    fetchImpl,
  });
}

const ctx = { requestId: 'req-1', correlationId: 'trace-1' };

function recorded(options: { flagged: boolean; scores: Record<string, number> }) {
  return {
    id: 'modr-1',
    model: 'test-moderation-model',
    results: [
      {
        flagged: options.flagged,
        categories: Object.fromEntries(
          Object.entries(options.scores).map(([key, value]) => [key, options.flagged && value > 0.5]),
        ),
        category_scores: options.scores,
      },
    ],
  };
}

describe('moderation adapter', () => {
  it('passes clean Turkish text', async () => {
    const { fetchImpl, calls } = stub(recorded({ flagged: false, scores: { violence: 0.01 } }));
    const result = await adapter(fetchImpl).check(
      { surface: 'story_text', text: 'Elif mışıl mışıl uyudu.', ageBand: '3-5' },
      ctx,
    );

    expect(result.value.verdict).toBe('pass');
    expect(calls).toHaveLength(1);
    // Free, and still recorded: a call that costs nothing must remain countable.
    expect(result.usage[0]?.costUsd).toBe(0);
    expect(result.usage[0]?.billedUnits).toBe(1);
  });

  it('blocks what the vendor flags', async () => {
    const { fetchImpl } = stub(recorded({ flagged: true, scores: { violence: 0.97 } }));
    const result = await adapter(fetchImpl).check({ surface: 'story_text', text: '…' }, ctx);
    expect(result.value.verdict).toBe('block');
    expect(result.value.categories['violence']).toBe(true);
  });

  it("blocks a high score the vendor did NOT flag — their bar is not a child's bar", async () => {
    const { fetchImpl } = stub(recorded({ flagged: false, scores: { violence: 0.62 } }));
    const result = await adapter(fetchImpl).check({ surface: 'story_text', text: '…' }, ctx);
    expect(result.value.verdict).toBe('block');
  });

  it('flags the middle band for review without failing the story', async () => {
    const { fetchImpl } = stub(recorded({ flagged: false, scores: { violence: 0.3 } }));
    const result = await adapter(fetchImpl).check({ surface: 'story_text', text: '…' }, ctx);
    expect(result.value.verdict).toBe('flag');
  });

  it('sends the configured model and a multimodal input array', async () => {
    const { fetchImpl, calls } = stub(recorded({ flagged: false, scores: {} }));
    await adapter(fetchImpl).check({ surface: 'parent_input', text: 'merhaba' }, ctx);

    const call = calls[0] as { body: { model: string; input: Array<{ type: string }> }; headers: Record<string, string> };
    expect(call.body.model).toBe('test-moderation-model');
    expect(call.body.input[0]).toMatchObject({ type: 'text', text: 'merhaba' });
    expect(call.headers['authorization']).toBe('Bearer test-key');
  });

  it('refuses to run without a key, and says so specifically', async () => {
    const { fetchImpl, calls } = stub(recorded({ flagged: false, scores: {} }));
    await expect(
      adapterWithoutKey(fetchImpl).check({ surface: 'story_text', text: 'x' }, ctx),
    ).rejects.toMatchObject({ kind: 'auth' });
    expect(calls).toHaveLength(0);
  });

  it('rejects a call with neither text nor image instead of sending an empty request', async () => {
    const { fetchImpl } = stub(recorded({ flagged: false, scores: {} }));
    await expect(adapter(fetchImpl).check({ surface: 'story_text' }, ctx)).rejects.toMatchObject({
      kind: 'invalid_request',
    });
  });

  it('maps a 429 to a retryable rate limit', async () => {
    const { fetchImpl } = stub({ error: { type: 'rate_limit_error' } }, 429);
    await expect(
      adapter(fetchImpl).check({ surface: 'story_text', text: 'x' }, ctx),
    ).rejects.toMatchObject({ kind: 'rate_limited', retryable: true });
  });
});
