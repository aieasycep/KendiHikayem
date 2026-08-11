/**
 * output-audit.ts — LAYER K4a (SPEC §10.4): the deterministic output check.
 *
 * Runs before the paid layers (vendor moderation, the LLM judge) because it costs nothing
 * and catches the two failures that must never reach a parent no matter what a model says:
 *
 *   · CANARY LEAK — the system prompt carries a random token. If it appears in the output,
 *     the model has been talked into echoing its instructions and the whole generation is
 *     discarded. This is the check that turns "we think spotlighting works" into evidence.
 *   · INJECTION SENTINEL — the model was told to set the title to `GECERSIZ_GIRDI` when the
 *     parent's data block looked like an instruction. Seeing it is not an error to hide: it
 *     is an attempt that got as far as the model, and the account gets flagged.
 *
 * Plus the Turkish denylist over the assembled text, which is the layer no vendor provides.
 */

import type { ErrorCode } from '@kendihikayem/contract';

import { scanBanlist } from './banlists.tr';
import { SAFETY_MESSAGES_TR } from './messages.tr';
import { isInjectionSentinel } from './spotlight';
import { type AgeContext, type SafetyDecision, type SafetyViolation, decide, excerptOf } from './types';

export interface OutputAuditInput extends AgeContext {
  /** Everything the model produced, concatenated — pages, title, lesson. */
  text: string;
  titleTr?: string | undefined;
  /** The token planted in this generation's system prompt. */
  canaryToken?: string | undefined;
  pageNo?: number | undefined;
}

export interface OutputAuditResult {
  decision: SafetyDecision;
  /** True when the model used the injection escape hatch — worth an account flag. */
  injectionSignalled: boolean;
}

const ERROR_CODE_BY_CODE: Partial<Record<SafetyViolation['code'], ErrorCode>> = {
  CANARY_LEAK: 'INTERNAL',
  BRAND_OR_COPYRIGHT: 'CONTENT_BLOCKED',
  RELIGIOUS_NOT_OPTED_IN: 'CONTENT_BLOCKED',
  AGE_BANNED_TERM: 'AGE_POLICY_VIOLATION',
  BANNED_TERM: 'MODERATION_BLOCKED',
};

export function auditStoryOutput(input: OutputAuditInput): OutputAuditResult {
  const violations: SafetyViolation[] = [];

  if (input.canaryToken && input.text.includes(input.canaryToken)) {
    const index = input.text.indexOf(input.canaryToken);
    violations.push({
      code: 'CANARY_LEAK',
      engine: 'deterministic',
      severity: 'block',
      messageTr: SAFETY_MESSAGES_TR.CANARY_LEAK,
      detail: 'sistem prompt kanaryası çıktıda görüldü',
      // The excerpt deliberately omits the token itself: it must not be persisted.
      excerpt: excerptOf(input.text.replace(input.canaryToken, '[KANARYA]'), index),
    });
  }

  const injectionSignalled = isInjectionSentinel(input.titleTr);
  if (injectionSignalled) {
    violations.push({
      code: 'INJECTION_PATTERN',
      engine: 'injection_detector',
      severity: 'block',
      messageTr: SAFETY_MESSAGES_TR.INJECTION_PATTERN,
      detail: 'model GECERSIZ_GIRDI kaçış yolunu kullandı (K3 sinyali)',
    });
  }

  violations.push(
    ...scanBanlist(
      input.text,
      { ageBand: input.ageBand, religiousOptIn: input.religiousOptIn },
      input.pageNo !== undefined ? { pageNo: input.pageNo } : {},
    ),
  );

  const decision = decide(
    violations,
    (violation) =>
      ERROR_CODE_BY_CODE[violation.code] ??
      (violation.code === 'INJECTION_PATTERN' ? 'INJECTION_DETECTED' : 'MODERATION_BLOCKED'),
  );

  return { decision, injectionSignalled };
}

/**
 * Maps a vendor moderation verdict into our violation shape, so a vendor block and a
 * denylist block land in `moderation_events` looking the same and can be counted together.
 */
export function violationsFromModeration(
  verdict: 'pass' | 'flag' | 'block',
  categories: Record<string, boolean>,
  scores: Record<string, number>,
): SafetyViolation[] {
  if (verdict === 'pass') return [];
  const flagged = Object.keys(categories).filter((key) => categories[key]);
  const top = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];

  return [
    {
      code: 'MODERATION_FLAGGED',
      engine: 'openai_moderation',
      severity: verdict === 'block' ? 'block' : 'flag',
      messageTr: SAFETY_MESSAGES_TR.MODERATION_FLAGGED,
      detail:
        flagged.length > 0
          ? `kategoriler: ${flagged.join(', ')}`
          : top
            ? `en yüksek skor: ${top[0]}=${top[1].toFixed(2)}`
            : 'sağlayıcı işaretledi',
    },
  ];
}
