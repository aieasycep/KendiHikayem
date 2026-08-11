/**
 * @kendihikayem/safety — shared vocabulary for the six-layer content defence (SPEC §10.4).
 *
 * Every check in this package returns the same shape, for one reason: the audit trail. When
 * a parent is told "bu tema için farklı bir yaklaşım deneyelim", an operator has to be able
 * to answer "why" from a table — which rule fired, on which surface, at which stage, with
 * which excerpt. A boolean return type cannot do that, so nothing here returns a boolean.
 */

import type { AgeBand, ErrorCode } from '@kendihikayem/contract';

/** Mirrors `MODERATION_SURFACE` in packages/db and `ModerationSurface` in providers. */
export type SafetySurface =
  | 'parent_input'
  | 'story_text'
  | 'illustration_prompt'
  | 'image_output'
  | 'voice_script'
  | 'user_edit';

/** Mirrors `MODERATION_STAGE`: before the model ran, or after. */
export type SafetyStage = 'pre' | 'post';

/** Mirrors `MODERATION_ENGINE`. Which mechanism produced the verdict. */
export type SafetyEngine =
  | 'deterministic'
  | 'injection_detector'
  | 'openai_moderation'
  | 'llm_judge'
  | 'age_rubric'
  | 'provider_block'
  | 'brand_denylist';

/** Mirrors `MODERATION_VERDICT`. */
export type SafetyVerdict = 'pass' | 'flag' | 'block';

/** Mirrors `MODERATION_ACTION`. What the pipeline did about it. */
export type SafetyAction = 'none' | 'retry' | 'regenerate' | 'manual_review' | 'account_flag';

/**
 * Why a check failed, in machine terms. The Turkish sentence a parent sees is derived from
 * this (messages.tr.ts) — never written at the call site, so one wording change is one edit.
 */
export type SafetyViolationCode =
  /* ── K1 input ───────────────────────────────────────────── */
  | 'NAME_EMPTY'
  | 'NAME_TOO_LONG'
  | 'NAME_INVALID_CHARS'
  | 'NAME_CONTROL_CHARS'
  | 'FREE_TEXT_TOO_LONG'
  | 'FREE_TEXT_CONTROL_CHARS'
  | 'INJECTION_PATTERN'
  /* ── K4a deterministic output ───────────────────────────── */
  | 'BANNED_TERM'
  | 'AGE_BANNED_TERM'
  | 'BRAND_OR_COPYRIGHT'
  | 'RELIGIOUS_NOT_OPTED_IN'
  | 'CANARY_LEAK'
  | 'HERO_NAME_MISSING'
  /* ── TR quality gate ────────────────────────────────────── */
  | 'NAME_INFLECTION_WRONG'
  | 'NAME_APOSTROPHE_MISSING'
  | 'NAME_SPELLING_INCONSISTENT'
  | 'PAGE_WORD_COUNT_OUT_OF_RANGE'
  | 'SENTENCE_TOO_LONG'
  | 'READABILITY_BELOW_TARGET'
  | 'WORD_TOO_LONG'
  | 'TRANSLATIONESE'
  | 'REFRAIN_MISSING'
  | 'UNRESOLVED_ENDING'
  | 'TITLE_TOO_LONG'
  /* ── K4c judge ──────────────────────────────────────────── */
  | 'AGE_RUBRIC_VIOLATION'
  /* ── K2/K4b vendor moderation ───────────────────────────── */
  | 'MODERATION_FLAGGED';

export interface SafetyViolation {
  code: SafetyViolationCode;
  engine: SafetyEngine;
  /** `block` fails the gate; `flag` is recorded and reviewed but does not stop the story. */
  severity: 'flag' | 'block';
  /** Turkish, shown to the parent verbatim. Concrete instruction, never "hata oluştu". */
  messageTr: string;
  /** Technical detail for ops: the term that matched, the measured value, the rule id. */
  detail?: string;
  /** Short excerpt — enough to review, not enough to reconstruct (schema/ops.ts). */
  excerpt?: string;
  pageNo?: number;
}

export interface SafetyDecision {
  verdict: SafetyVerdict;
  violations: SafetyViolation[];
  /** The contract error code the API should return when `verdict === 'block'`. */
  errorCode?: ErrorCode;
  /** The single message shown to the parent — the first blocking violation's. */
  messageTr?: string;
}

export interface AgeContext {
  ageBand: AgeBand;
  /** SPEC §10.4: religious content is opt-in and OFF by default. */
  religiousOptIn: boolean;
}

/** Builds the decision from a violation list, applying the block-beats-flag rule. */
export function decide(
  violations: SafetyViolation[],
  errorCodeFor: (violation: SafetyViolation) => ErrorCode,
): SafetyDecision {
  const blocking = violations.find((violation) => violation.severity === 'block');
  if (blocking) {
    return {
      verdict: 'block',
      violations,
      errorCode: errorCodeFor(blocking),
      messageTr: blocking.messageTr,
    };
  }
  return {
    verdict: violations.length > 0 ? 'flag' : 'pass',
    violations,
  };
}

/** Short, redacted excerpt for `moderation_events.excerpt`. */
export function excerptOf(text: string, around = 0, radius = 60): string {
  const start = Math.max(0, around - radius);
  return text.slice(start, start + radius * 2).replace(/\s+/gu, ' ').trim();
}
