/**
 * quality/index.ts — the Turkish quality gate, assembled.
 *
 * Runs on EVERY generated text before it reaches a parent, and on every parent edit. A
 * blocking finding sends the page or the book back to the model with the finding attached,
 * up to `STORY_QUALITY_MAX_ATTEMPTS` — the model is told what was wrong, in Turkish, and
 * asked again. That loop is the difference between "we use a good model" and "we ship good
 * Turkish": the model is not trusted, it is checked.
 *
 * The five checks, in the order a Turkish editor would apply them:
 *   1. the child's name — spelling, apostrophe, suffix phonology   (name-consistency.ts)
 *   2. age fit — words, sentences, syllables, Ateşman              (age-fit.ts)
 *   3. natural Turkish — no translation smell                      (translationese.ts)
 *   4. book shape — refrain, warm ending, title, hero presence     (structure.ts)
 *   5. content — the TR/culture denylist                           (../banlists.tr.ts)
 */

import type { AgeBand, ErrorCode } from '@kendihikayem/contract';

import { scanBanlist } from '../banlists.tr';
import { type SafetyDecision, type SafetyViolation, decide } from '../types';
import { type PageMetrics, checkAgeFit } from './age-fit';
import { checkNameUsage } from './name-consistency';
import { checkStructure } from './structure';
import { checkTranslationese } from './translationese';

export * from './age-fit';
export * from './name-consistency';
export * from './structure';
export * from './translationese';

export interface StoryQualityInput {
  heroName: string;
  ageBand: AgeBand;
  religiousOptIn: boolean;
  titleTr?: string | undefined;
  pages: ReadonlyArray<{ pageNo: number; textTr: string }>;
}

export interface StoryQualityReport {
  decision: SafetyDecision;
  metrics: {
    pages: PageMetrics[];
    bookReadability: number;
    translationeseScore: number;
    heroNamePageRatio: number;
    refrain?: string;
  };
  /**
   * Turkish feedback for the regeneration prompt. Handing the model its own report is what
   * makes attempt 2 different from attempt 1 — a bare retry would reproduce the same text.
   */
  feedbackTr: string;
}

/** Which contract error the API returns when this gate blocks. */
const ERROR_CODE_BY_ENGINE: Record<string, ErrorCode> = {
  age_rubric: 'AGE_POLICY_VIOLATION',
  brand_denylist: 'CONTENT_BLOCKED',
  deterministic: 'MODERATION_BLOCKED',
};

export function checkStoryQuality(input: StoryQualityInput): StoryQualityReport {
  const violations: SafetyViolation[] = [];

  // 1 ── the name, per page (a wrong suffix on page 7 is still a wrong suffix)
  for (const page of input.pages) {
    violations.push(...checkNameUsage(page.textTr, input.heroName, { pageNo: page.pageNo }));
  }

  // 2 ── age fit
  const ageFit = checkAgeFit(input.pages, input.ageBand);
  violations.push(...ageFit.violations);

  // 3 ── translation smell, measured over the whole book: the rates only mean something
  //      across a few hundred words.
  const translationese = checkTranslationese(input.pages.map((page) => page.textTr).join('\n'));
  violations.push(...translationese.violations);

  // 4 ── book shape
  const structure = checkStructure({
    ageBand: input.ageBand,
    heroName: input.heroName,
    titleTr: input.titleTr,
    pages: input.pages,
  });
  violations.push(...structure.violations);

  // 5 ── content denylist, per page so the offending page number is reportable
  const ageContext = { ageBand: input.ageBand, religiousOptIn: input.religiousOptIn };
  for (const page of input.pages) {
    violations.push(...scanBanlist(page.textTr, ageContext, { pageNo: page.pageNo }));
  }
  if (input.titleTr) violations.push(...scanBanlist(input.titleTr, ageContext));

  const decision = decide(
    violations,
    (violation) => ERROR_CODE_BY_ENGINE[violation.engine] ?? 'MODERATION_BLOCKED',
  );

  return {
    decision,
    metrics: {
      pages: ageFit.metrics,
      bookReadability: ageFit.bookReadability,
      translationeseScore: translationese.score,
      heroNamePageRatio: structure.heroNamePageRatio,
      ...(structure.refrain ? { refrain: structure.refrain } : {}),
    },
    feedbackTr: feedbackFor(violations),
  };
}

/**
 * Turns findings into an instruction the model can act on. Ordered blocking-first and
 * capped: a 30-item list makes the next attempt worse, not better.
 */
export function feedbackFor(violations: readonly SafetyViolation[]): string {
  const ordered = [...violations].sort((a, b) =>
    a.severity === b.severity ? 0 : a.severity === 'block' ? -1 : 1,
  );
  const lines = ordered.slice(0, 8).map((violation) => {
    const where = violation.pageNo !== undefined ? `Sayfa ${violation.pageNo}: ` : '';
    return `- ${where}${violation.detail ?? violation.messageTr}`;
  });
  return lines.join('\n');
}
