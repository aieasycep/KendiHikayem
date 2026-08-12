/**
 * image/gemini/protocol.ts — the wire format, isolated from the transport.
 *
 * Everything in this file is a pure function over plain objects: build a request body from
 * an `ImageGenerateInput`, parse a response body into an `ImageGenerateOutput`. That split
 * is what makes the adapter testable with RECORDED RESPONSES while the vendor is
 * unreachable and no API key exists — `fixtures/*.json` are fed straight into `parse*`
 * here and into a stub `fetch` in the adapter test.
 *
 * ⚠️ NO MODEL NAMES. The model id arrives as a value from `packages/config` and is only
 * ever interpolated into the URL path.
 *
 * Shape reference: Gemini `models.generateContent` with an image-capable model —
 * `contents[].parts[]` carries interleaved text and `inlineData` (base64) parts, and the
 * response returns generated images the same way. Deviations the parser tolerates on
 * purpose are marked below; the vendor has changed the envelope before.
 */

import type { ImageGenerateInput, ImageResolution } from '../../core/adapters';
import { retryAfterMsFromEnvelope, retryAfterMsFromHeader } from '../../google/quota';
import type { GoogleErrorEnvelope } from '../../google/quota';

// Re-exported, not redefined: two copies of a retry-delay parser drift, and the one that
// drifts is always the one the failing adapter happens to import.
export { retryAfterMsFromEnvelope, retryAfterMsFromHeader };

/* ── Request ───────────────────────────────────────────────────────────────── */

export interface GeminiInlineData {
  mimeType: string;
  /** base64, no data: prefix. */
  data: string;
}

export type GeminiPart = { text: string } | { inlineData: GeminiInlineData };

export interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

export interface GeminiSafetySetting {
  category: string;
  threshold: string;
}

export interface GeminiImageConfig {
  aspectRatio: string;
  /** `1K` | `2K` | `4K`. */
  imageSize: string;
}

export interface GeminiGenerationConfig {
  /**
   * ⚠️ Must contain IMAGE. An image model asked for TEXT returns a description of the
   * picture it would have drawn, which parses fine and produces a book with no pictures.
   */
  responseModalities: string[];
  imageConfig: GeminiImageConfig;
  candidateCount?: number;
}

export interface GeminiGenerateRequest {
  contents: GeminiContent[];
  generationConfig: GeminiGenerationConfig;
  /** ⚠️ Explicit: the vendor default leaves image safety filtering OFF (SPEC §8.2). */
  safetySettings: GeminiSafetySetting[];
}

/** `ImageResolution` → the vendor's size token. */
export const IMAGE_SIZE_BY_RESOLUTION: Record<ImageResolution, string> = {
  preview_1k: '1K',
  screen_2k: '2K',
  print_4k: '4K',
};

/** Nominal pixel edge per resolution, used when the response omits dimensions. */
export const NOMINAL_EDGE_PX: Record<ImageResolution, number> = {
  preview_1k: 1024,
  screen_2k: 2048,
  print_4k: 4096,
};

/**
 * The four harm categories that matter for a children's product. `BLOCK_MOST` maps to the
 * strictest threshold the API offers: for this product a false positive costs one retry,
 * a false negative costs the company.
 */
export const HARM_CATEGORIES: readonly string[] = [
  'HARM_CATEGORY_HARASSMENT',
  'HARM_CATEGORY_HATE_SPEECH',
  'HARM_CATEGORY_SEXUALLY_EXPLICIT',
  'HARM_CATEGORY_DANGEROUS_CONTENT',
];

const THRESHOLD_BY_BLOCK_LEVEL: Record<
  ImageGenerateInput['safety']['blockLevel'],
  string
> = {
  BLOCK_MOST: 'BLOCK_LOW_AND_ABOVE',
  BLOCK_SOME: 'BLOCK_MEDIUM_AND_ABOVE',
  // Present for completeness only — the adapter refuses this level before it gets here.
  BLOCK_NONE: 'BLOCK_NONE',
};

export function buildSafetySettings(
  blockLevel: ImageGenerateInput['safety']['blockLevel'],
): GeminiSafetySetting[] {
  const threshold = THRESHOLD_BY_BLOCK_LEVEL[blockLevel];
  return HARM_CATEGORIES.map((category) => ({ category, threshold }));
}

export interface ResolvedReferenceImage {
  bytes: Uint8Array;
  mimeType: string;
  /** For logs and for the deterministic part ordering assertion in tests. */
  kind: string;
}

export interface BuildRequestInput {
  input: ImageGenerateInput;
  /** Already resolved to bytes, IN THE ORDER THEY MUST BE SENT (SPEC §8.1 ③). */
  references: readonly ResolvedReferenceImage[];
}

/**
 * Builds the request body.
 *
 * PART ORDER IS DELIBERATE: reference images first, prompt text last. Conditioning images
 * that precede the instruction are treated as context for it; the same three references in
 * the same order on every page is half of what keeps the child looking like the child.
 *
 * The negative prompt is folded into the text part — this API has no negative-prompt
 * field, and silently dropping it would remove the "no text, no letters" guarantee that
 * SPEC §8.4 makes non-negotiable.
 */
export function buildGenerateRequest(input: BuildRequestInput): GeminiGenerateRequest {
  const parts: GeminiPart[] = [];

  for (const reference of input.references) {
    parts.push({
      inlineData: {
        mimeType: reference.mimeType,
        data: toBase64(reference.bytes),
      },
    });
  }

  const text = input.input.negativePromptEn
    ? `${input.input.promptEn}\nAVOID: ${input.input.negativePromptEn}`
    : input.input.promptEn;
  parts.push({ text });

  return {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseModalities: ['IMAGE'],
      imageConfig: {
        aspectRatio: input.input.aspectRatio,
        imageSize: IMAGE_SIZE_BY_RESOLUTION[input.input.resolution],
      },
      candidateCount: 1,
    },
    safetySettings: buildSafetySettings(input.input.safety.blockLevel),
  };
}

export function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

export function fromBase64(data: string): Uint8Array {
  return new Uint8Array(Buffer.from(data, 'base64'));
}

/* ── Response ──────────────────────────────────────────────────────────────── */

export interface GeminiSafetyRating {
  category?: string;
  probability?: string;
  blocked?: boolean;
}

export interface GeminiCandidate {
  content?: { parts?: GeminiPart[]; role?: string };
  finishReason?: string;
  safetyRatings?: GeminiSafetyRating[];
}

export interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}

export interface GeminiGenerateResponse {
  candidates?: GeminiCandidate[];
  promptFeedback?: { blockReason?: string; safetyRatings?: GeminiSafetyRating[] };
  usageMetadata?: GeminiUsageMetadata;
  modelVersion?: string;
}

/**
 * The `google.rpc.Status` error body. Defined once in `../../google/quota.ts` — text,
 * illustration and narration all receive the identical envelope — and aliased here so the
 * name this file has always used keeps working.
 */
export type GeminiErrorEnvelope = GoogleErrorEnvelope;

/**
 * Finish reasons that mean "the safety filter fired", not "the request was wrong".
 * They are reported as `blockedReason` rather than thrown: the caller sanitises the
 * prompt and retries once, and only then escalates to a human (SPEC §8.3, last row).
 */
export const BLOCKING_FINISH_REASONS: readonly string[] = [
  'SAFETY',
  'IMAGE_SAFETY',
  'PROHIBITED_CONTENT',
  'BLOCKLIST',
  'SPII',
  'RECITATION',
];

export interface ParsedImage {
  bytes: Uint8Array;
  mimeType: string;
}

export interface ParsedGenerateResponse {
  image?: ParsedImage;
  /** Set when the vendor refused. Mutually exclusive with `image` in practice. */
  blockedReason?: string;
  /** `modelVersion` when the vendor reports it — the id that actually served the call. */
  modelVersion?: string;
  usage?: GeminiUsageMetadata;
}

/**
 * Parses a 200 response. Tolerant where tolerance is safe (extra parts, missing
 * `usageMetadata`, an unexpected `role`), strict where it is not: a response with no image
 * bytes and no block reason is a protocol violation, not an empty picture.
 */
export function parseGenerateResponse(body: unknown): ParsedGenerateResponse {
  if (typeof body !== 'object' || body === null) {
    throw new ImageProtocolError('response body is not an object');
  }
  const response = body as GeminiGenerateResponse;

  const promptBlock = response.promptFeedback?.blockReason;
  if (promptBlock) {
    return { blockedReason: `prompt_feedback:${promptBlock}` };
  }

  const candidate = response.candidates?.[0];
  if (!candidate) {
    throw new ImageProtocolError('response contained no candidates');
  }

  const finishReason = candidate.finishReason;
  const imagePart = (candidate.content?.parts ?? []).find(
    (part): part is { inlineData: GeminiInlineData } =>
      typeof part === 'object' &&
      part !== null &&
      'inlineData' in part &&
      typeof (part as { inlineData?: GeminiInlineData }).inlineData?.data === 'string',
  );

  if (!imagePart) {
    if (finishReason && BLOCKING_FINISH_REASONS.includes(finishReason)) {
      return {
        blockedReason: `finish_reason:${finishReason}`,
        ...(response.usageMetadata ? { usage: response.usageMetadata } : {}),
      };
    }
    const blockedRating = candidate.safetyRatings?.find((rating) => rating.blocked === true);
    if (blockedRating) {
      return {
        blockedReason: `safety_rating:${blockedRating.category ?? 'unknown'}`,
        ...(response.usageMetadata ? { usage: response.usageMetadata } : {}),
      };
    }
    throw new ImageProtocolError(
      `candidate carried no image data (finishReason=${finishReason ?? 'none'})`,
    );
  }

  const data = imagePart.inlineData.data;
  const bytes = fromBase64(data);
  if (bytes.byteLength === 0) {
    throw new ImageProtocolError('inlineData decoded to zero bytes');
  }

  return {
    image: { bytes, mimeType: imagePart.inlineData.mimeType || 'image/png' },
    ...(response.modelVersion ? { modelVersion: response.modelVersion } : {}),
    ...(response.usageMetadata ? { usage: response.usageMetadata } : {}),
  };
}

/** A 200 that does not mean what the contract says it means. */
export class ImageProtocolError extends Error {
  constructor(detail: string) {
    super(`unexpected image response: ${detail}`);
    this.name = 'ImageProtocolError';
  }
}

/** Extracts image dimensions from a PNG/JPEG/WebP header without decoding the pixels. */
export function readImageDimensions(
  bytes: Uint8Array,
): { width: number; height: number } | undefined {
  const view = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // PNG: 8-byte signature, then IHDR with width/height as big-endian uint32.
  if (
    view.length >= 24 &&
    view[0] === 0x89 &&
    view[1] === 0x50 &&
    view[2] === 0x4e &&
    view[3] === 0x47
  ) {
    return { width: view.readUInt32BE(16), height: view.readUInt32BE(20) };
  }

  // JPEG: walk the segment chain to the first SOFn frame header.
  if (view.length >= 4 && view[0] === 0xff && view[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < view.length) {
      if (view[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = view[offset + 1]!;
      const length = view.readUInt16BE(offset + 2);
      // SOF0..SOF15 except the DHT/DAC/DNL markers interleaved in that range.
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: view.readUInt16BE(offset + 5), width: view.readUInt16BE(offset + 7) };
      }
      offset += 2 + length;
    }
    return undefined;
  }

  // WebP (VP8X extended form carries the canvas size directly).
  if (
    view.length >= 30 &&
    view.toString('ascii', 0, 4) === 'RIFF' &&
    view.toString('ascii', 8, 12) === 'WEBP' &&
    view.toString('ascii', 12, 16) === 'VP8X'
  ) {
    const width = 1 + (view[24]! | (view[25]! << 8) | (view[26]! << 16));
    const height = 1 + (view[27]! | (view[28]! << 8) | (view[29]! << 16));
    return { width, height };
  }

  return undefined;
}
