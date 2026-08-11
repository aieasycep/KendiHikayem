/**
 * sanitize.ts — LAYER K1 (SPEC §10.4): deterministic input validation, before any model.
 *
 * Highest return of the six layers and it costs nothing: the syntax a prompt injection
 * needs — punctuation, brackets, newlines, digits — is syntax a Turkish given name never
 * contains. An allowlist on the name field kills the overwhelming majority of attacks
 * without a single token spent.
 *
 * Order matters and is not negotiable:
 *   1. NFKC normalise      — collapses homoglyph and full-width dodges into plain letters
 *   2. strip invisibles    — the most commonly skipped step; zero-width and bidi controls
 *                            hide an instruction inside what looks like a normal name
 *   3. reject control chars — multi-line payloads die here
 *   4. allowlist / length  — what survives is a name or free text, and nothing else
 */

import { HUMAN_NAME_PATTERN, type ErrorCode } from '@kendihikayem/contract';

import { SAFETY_MESSAGES_TR } from './messages.tr';
import { detectInjection } from './injection';
import { type SafetyDecision, type SafetyViolation, decide } from './types';

/** Zero-width, bidi override, word-joiner, BOM — SPEC §10.4 K1, verbatim. */
const INVISIBLE_CHARS =
  /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/gu;

/** Anything that lets a payload span lines or fake a terminal/serialisation boundary. */
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/u;

export const MAX_NAME_LENGTH = 30;
export const MAX_FREE_TEXT_LENGTH = 200;

/** NFKC + invisible-character removal. Every user string passes through this first. */
export function normalizeInput(raw: string): string {
  return raw.normalize('NFKC').replace(INVISIBLE_CHARS, '');
}

export type SanitizeResult =
  | { ok: true; value: string; violations: SafetyViolation[] }
  | { ok: false; decision: SafetyDecision };

const NAME_ERROR_CODE: ErrorCode = 'INVALID_NAME';
const TEXT_ERROR_CODE: ErrorCode = 'VALIDATION_FAILED';

function violation(
  code: SafetyViolation['code'],
  detail?: string,
): SafetyViolation {
  return {
    code,
    engine: 'deterministic',
    severity: 'block',
    messageTr: SAFETY_MESSAGES_TR[code],
    ...(detail ? { detail } : {}),
  };
}

/**
 * Child / hero name. Allowlist, not denylist: at most three words of Turkish letters,
 * separated by a space, an apostrophe or a hyphen. Same pattern as the contract's
 * `humanNameSchema`, so the API and this layer cannot drift apart.
 */
export function sanitizeChildName(raw: string): SanitizeResult {
  const normalized = normalizeInput(raw).trim();

  if (normalized === '') {
    return fail(violation('NAME_EMPTY'), NAME_ERROR_CODE);
  }
  if (CONTROL_CHARS.test(normalized)) {
    return fail(violation('NAME_CONTROL_CHARS'), NAME_ERROR_CODE);
  }
  if ([...normalized].length > MAX_NAME_LENGTH) {
    return fail(violation('NAME_TOO_LONG', `${[...normalized].length} karakter`), NAME_ERROR_CODE);
  }
  if (!HUMAN_NAME_PATTERN.test(normalized)) {
    return fail(violation('NAME_INVALID_CHARS', redact(normalized)), NAME_ERROR_CODE);
  }

  return { ok: true, value: normalized, violations: [] };
}

/**
 * Free-form parent idea. An allowlist is impossible here — it is prose — so the defence is
 * length + control characters + injection detection, and then the text is passed to the
 * model as DATA rather than instructions (spotlight.ts, layer K3).
 */
export function sanitizeFreeText(raw: string): SanitizeResult {
  const normalized = normalizeInput(raw).trim();

  if (normalized === '') return { ok: true, value: '', violations: [] };
  if (CONTROL_CHARS.test(normalized)) {
    return fail(violation('FREE_TEXT_CONTROL_CHARS'), TEXT_ERROR_CODE);
  }
  if ([...normalized].length > MAX_FREE_TEXT_LENGTH) {
    return fail(
      violation('FREE_TEXT_TOO_LONG', `${[...normalized].length} karakter`),
      TEXT_ERROR_CODE,
    );
  }

  const injection = detectInjection(normalized);
  if (injection.verdict === 'block') {
    return { ok: false, decision: injection };
  }

  // A `flag` is not a refusal: the text goes through, spotlighted, and the event is
  // recorded so a pattern across one account becomes visible (SPEC §10.4 K3).
  return { ok: true, value: normalized, violations: injection.violations };
}

function fail(item: SafetyViolation, errorCode: ErrorCode): SanitizeResult {
  return { ok: false, decision: decide([item], () => errorCode) };
}

/** Never echo a rejected string back verbatim into a log line. */
function redact(text: string): string {
  return text.slice(0, 40).replace(/\s+/gu, ' ');
}
