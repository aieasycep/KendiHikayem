/**
 * tts/elevenlabs/fixtures.ts — recorded vendor responses.
 *
 * These are the API's documented response shapes, written down as data so the adapter can
 * be exercised end to end with no key and no egress. They are the substitute for a VCR
 * cassette: the environment cannot record real traffic, so the payloads are transcribed
 * from the vendor's published schemas and error catalogue.
 *
 * ⚠️ THEREFORE: a green test here means "we handle the shapes the vendor documents", not
 * "we handle what the vendor actually sends". The first live call may still surprise us,
 * and the mapping in `adapter.ts` is where that surprise gets absorbed. Re-record these
 * from real traffic the day a key exists — that is a one-hour job and worth doing before
 * the first paying parent.
 */

import type { HttpResponse } from '../http';

export function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): HttpResponse {
  return {
    status,
    headers: { 'content-type': 'application/json', ...headers },
    bytes: new TextEncoder().encode(JSON.stringify(body)),
  };
}

/**
 * Character-level alignment for a Turkish sentence with an apostrophe-suffixed proper noun.
 *
 * The text is chosen for exactly that: "Elif'in" must survive as ONE karaoke token, and
 * "ağacın" exercises the soft g. Timings are ~55 ms per character, which is a realistic
 * Turkish narration pace.
 */
export function alignmentFor(text: string, msPerChar = 55, startMs = 0) {
  const characters = [...text];
  const starts: number[] = [];
  const ends: number[] = [];
  let cursor = startMs / 1000;
  for (const character of characters) {
    // Spaces and punctuation are quicker than voiced characters, as the vendor reports them.
    const span = (/\s|[.,!?;:]/u.test(character) ? msPerChar * 0.45 : msPerChar) / 1000;
    starts.push(Number(cursor.toFixed(3)));
    cursor += span;
    ends.push(Number(cursor.toFixed(3)));
  }
  return {
    characters,
    character_start_times_seconds: starts,
    character_end_times_seconds: ends,
  };
}

/** A successful `/with-timestamps` synthesis. `audio_base64` is a short PCM burst. */
export function synthesisSuccess(text: string, options: { characterCost?: number } = {}) {
  const alignment = alignmentFor(text);
  const durationSeconds = alignment.character_end_times_seconds.at(-1) ?? 1;
  const samples = Math.round(durationSeconds * 48_000);
  const pcm = new Uint8Array(samples * 2); // 16-bit mono silence: only the length matters

  return jsonResponse(
    200,
    {
      audio_base64: Buffer.from(pcm).toString('base64'),
      alignment,
      normalized_alignment: alignment,
    },
    options.characterCost !== undefined
      ? { 'character-cost': String(options.characterCost) }
      : {},
  );
}

/** Synthesis that returned audio but no timings — the `sentence_estimate` path. */
export function synthesisWithoutAlignment(durationSeconds: number) {
  const pcm = new Uint8Array(Math.round(durationSeconds * 48_000) * 2);
  return jsonResponse(200, {
    audio_base64: Buffer.from(pcm).toString('base64'),
    alignment: null,
    normalized_alignment: null,
  });
}

export const VOICE_CREATED = jsonResponse(200, {
  voice_id: 'v0iCe1DfRoMeLeVeN',
  requires_verification: false,
});

/** The 660-slot ceiling (SPEC §14 R5). Note the 400 — it is NOT a 429. */
export const SLOT_LIMIT_REACHED = jsonResponse(400, {
  detail: {
    status: 'voice_limit_reached',
    message: 'You have reached your limit of custom voices. Delete a voice to add a new one.',
  },
});

export const QUOTA_EXCEEDED = jsonResponse(401, {
  detail: {
    status: 'quota_exceeded',
    message: 'You have exceeded your character quota for this month.',
  },
});

export const RATE_LIMITED = jsonResponse(
  429,
  { detail: { status: 'too_many_concurrent_requests', message: 'Too many requests' } },
  { 'retry-after': '3' },
);

export const INVALID_API_KEY = jsonResponse(401, {
  detail: { status: 'invalid_api_key', message: 'Invalid API key' },
});

export const VOICE_NOT_FOUND = jsonResponse(404, {
  detail: { status: 'voice_not_found', message: 'A voice with voice_id was not found.' },
});

export const SERVER_ERROR = jsonResponse(503, {
  detail: { status: 'service_unavailable', message: 'Service temporarily unavailable' },
});

export const VALIDATION_ERROR = jsonResponse(422, {
  detail: [{ loc: ['body', 'text'], msg: 'field required', type: 'value_error.missing' }],
});

export const SUBSCRIPTION = jsonResponse(200, {
  tier: 'creator',
  character_count: 128_400,
  character_limit: 500_000,
  voice_limit: 660,
  voice_slots_used: 651,
});
