/**
 * image/gemini/errors.ts — the illustration adapter's view of a vendor failure.
 *
 * The mapping itself moved to `../../google/errors.ts` when text and narration joined
 * illustration on the same API: all three now receive the same 429 envelopes, and a
 * free-tier quota fix that only lands in one of three copies is a fix that does not land.
 *
 * ⭐ WHAT CHANGED FOR THE FREE TIER. The old copy here classified any 429 whose message
 * mentioned "free tier" or "quota" as `quota_exhausted`, i.e. NON-retryable. On the free
 * tier that is backwards: Google answers a PER-MINUTE throttle with the very same "You
 * exceeded your current quota, please check your plan and billing details" sentence it uses
 * for a spent daily allowance, so every 60-second throttle abandoned a book that would have
 * rendered fine a minute later. The shared classifier reads the structured
 * `QuotaFailure.quotaId` first (`…PerMinute…` vs `…PerDay…`) and only falls back to prose.
 *
 * This file stays as the adapter's import surface — renaming it would touch A4's code for
 * no benefit — and adds the one thing that is genuinely image-specific: nothing, so far.
 */

import type { ProviderError } from '../../core/errors';
import type { ProviderName, ProviderOperation } from '../../core/types';
import { mapGoogleHttpError, mapGoogleTransportError } from '../../google/errors';
import type { GoogleErrorEnvelope } from '../../google/quota';

export interface MapImageErrorInput {
  provider: ProviderName;
  operation: ProviderOperation;
  httpStatus: number;
  /** Parsed JSON body, when the response had one. */
  envelope?: GoogleErrorEnvelope;
  /** Raw body text, for the cases where the vendor returned HTML from a proxy. */
  rawBody?: string;
  retryAfterHeader?: string | null;
}

export function mapGeminiHttpError(input: MapImageErrorInput): ProviderError {
  return mapGoogleHttpError(input);
}

/** Transport-level failure: DNS, TLS, connection reset, or our own abort. */
export function mapGeminiTransportError(
  error: unknown,
  context: { provider: ProviderName; operation: ProviderOperation; timedOut: boolean },
): ProviderError {
  return mapGoogleTransportError(error, { ...context, timeoutVar: 'IMAGE_REQUEST_TIMEOUT_MS' });
}
