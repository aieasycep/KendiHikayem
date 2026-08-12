/**
 * tts/google/wire.ts — the Gemini TTS wire format, isolated from the transport.
 *
 * Pure functions over plain objects, for the same reason every other adapter in this package
 * has a `wire.ts`: the vendor is unreachable here and no key exists, so the only way to prove
 * request building and response parsing is to feed recorded bodies straight through these
 * functions (see `google.test.ts`).
 *
 * ⚠️ NO MODEL, VOICE OR LANGUAGE LITERALS. Every one of them arrives as a value from
 * `packages/config` (SPEC §3 rule 6) and is only interpolated here.
 */

/* ── Request ───────────────────────────────────────────────────────────────── */

export interface GoogleTtsRequest {
  contents: Array<{ parts: Array<{ text: string }> }>;
  generationConfig: {
    /** ⚠️ Must be exactly `['AUDIO']`. A TTS model asked for TEXT answers in prose. */
    responseModalities: string[];
    speechConfig: {
      languageCode?: string;
      voiceConfig: { prebuiltVoiceConfig: { voiceName: string } };
    };
  };
}

export interface BuildSynthesizeInput {
  text: string;
  voiceName: string;
  languageCode: string;
  /**
   * Turkish style directive prefixed to the text. This API takes prosody as natural
   * language ("say it warmly and slowly") rather than as numeric knobs, which is why the
   * vendor-neutral `TTS_VOICE_*` timbre settings have no equivalent here — they describe
   * a CLONE's similarity, and there is no clone.
   */
  stylePromptTr?: string | undefined;
}

/**
 * Builds the request body.
 *
 * The style directive and the story go in ONE text part, separated by a newline, because
 * that is the shape the vendor documents. ⚠️ It is also the reason `GOOGLE_TTS_STYLE_PROMPT_TR`
 * is configurable down to the empty string: if the model ever reads the directive aloud
 * instead of obeying it, a child hears an instruction manual at bedtime, and the fix has to
 * be an env edit rather than a release.
 */
export function buildSynthesizeRequest(input: BuildSynthesizeInput): GoogleTtsRequest {
  const style = input.stylePromptTr?.trim();
  const text = style ? `${style}\n${input.text}` : input.text;

  return {
    contents: [{ parts: [{ text }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        ...(input.languageCode ? { languageCode: input.languageCode } : {}),
        voiceConfig: { prebuiltVoiceConfig: { voiceName: input.voiceName } },
      },
    },
  };
}

/* ── Response ──────────────────────────────────────────────────────────────── */

export interface GoogleTtsResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> };
    finishReason?: string;
    safetyRatings?: Array<{ category?: string; blocked?: boolean }>;
  }>;
  promptFeedback?: { blockReason?: string };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
  modelVersion?: string;
}

export interface ParsedSynthesis {
  /** Raw 16-bit little-endian PCM, mono, at `sampleRate`. */
  pcm: Uint8Array;
  /** Read from the response's own `mimeType` when it says so; the config value otherwise. */
  sampleRate: number;
  modelVersion?: string;
  tokens: number;
  finishReason: string;
}

/** A 200 whose body does not mean what the contract says it means. */
export class GoogleTtsProtocolError extends Error {
  constructor(detail: string) {
    super(`unexpected TTS response: ${detail}`);
    this.name = 'GoogleTtsProtocolError';
  }
}

/** Safety refusals. Narration is our OWN already-moderated story text, so this is rare —
 *  and when it does fire it is a content decision, never something to retry elsewhere. */
export const BLOCKING_FINISH_REASONS: ReadonlySet<string> = new Set([
  'SAFETY',
  'PROHIBITED_CONTENT',
  'BLOCKLIST',
  'SPII',
  'RECITATION',
]);

/**
 * `audio/L16;codec=pcm;rate=24000` → 24000.
 *
 * Read rather than assumed: the pipeline assembles at 48 kHz and the adapter resamples to
 * get there. A vendor that quietly starts returning 16 kHz while we keep dividing by 24000
 * produces a story played at the wrong speed and pitch — audible immediately, but only to
 * whoever is listening, which at that point is a child.
 */
export function sampleRateFromMimeType(mimeType: string | undefined): number | undefined {
  const match = /rate=(\d+)/u.exec(mimeType ?? '');
  if (!match?.[1]) return undefined;
  const rate = Number.parseInt(match[1], 10);
  return Number.isFinite(rate) && rate > 0 ? rate : undefined;
}

export function parseSynthesizeResponse(
  body: unknown,
  fallbackSampleRate: number,
): ParsedSynthesis {
  if (typeof body !== 'object' || body === null) {
    throw new GoogleTtsProtocolError('response body is not an object');
  }
  const response = body as GoogleTtsResponse;

  const promptBlock = response.promptFeedback?.blockReason;
  if (promptBlock) {
    throw new GoogleTtsProtocolError(`prompt blocked: ${promptBlock}`);
  }

  const candidate = response.candidates?.[0];
  if (!candidate) throw new GoogleTtsProtocolError('response contained no candidates');

  const finishReason = candidate.finishReason ?? 'STOP';
  const part = (candidate.content?.parts ?? []).find(
    (entry) => typeof entry.inlineData?.data === 'string',
  );

  if (!part?.inlineData?.data) {
    if (BLOCKING_FINISH_REASONS.has(finishReason)) {
      throw new GoogleTtsProtocolError(`blocked by the safety filter (${finishReason})`);
    }
    throw new GoogleTtsProtocolError(
      `candidate carried no audio data (finishReason=${finishReason})`,
    );
  }

  const pcm = new Uint8Array(Buffer.from(part.inlineData.data, 'base64'));
  if (pcm.byteLength === 0) throw new GoogleTtsProtocolError('inlineData decoded to zero bytes');

  return {
    pcm,
    sampleRate: sampleRateFromMimeType(part.inlineData.mimeType) ?? fallbackSampleRate,
    ...(response.modelVersion ? { modelVersion: response.modelVersion } : {}),
    tokens: response.usageMetadata?.totalTokenCount ?? 0,
    finishReason,
  };
}

/**
 * Parses `GOOGLE_TTS_VOICE_MAP`.
 *
 * A malformed map is NOT fatal: a JSON typo in an env var must not take the narrator
 * offline, and the default voice is a working fallback. It is worth knowing about, so the
 * caller receives `undefined` and logs it rather than this function throwing into a render.
 */
export function parseVoiceMap(raw: string | undefined): Record<string, string> | undefined {
  if (!raw || raw.trim() === '') return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined;
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string' && value !== '') out[key] = value;
    }
    return out;
  } catch {
    return undefined;
  }
}
