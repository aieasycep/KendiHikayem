/**
 * quality/translationese.ts — "çeviri kokusu" detection.
 *
 * SPEC §14 R2 names this as the product's only differentiator, and docs/research/03-story.md
 * lists "çeviri kokusu yokluğu" as a blind-A/B criterion. A model writing Turkish from an
 * English-shaped latent space produces text that is grammatically correct and still reads
 * like a dub. That is not something a moderation API or a readability score can see.
 *
 * The signals here are the measurable half of the phenomenon — the ones that survive being
 * written down as a rule:
 *
 *   · Pronoun subjects. Turkish conjugation carries the subject, so "O gülümsedi" is
 *     marked; English needs "He smiled" and a translator carries the pronoun over.
 *   · "ve" as the universal connector. Turkish prefers -ip / -erek / -ince converbs;
 *     "and" survives translation and stacks up.
 *   · "bir" on every noun. English needs "a"; Turkish only marks indefiniteness when it
 *     means something.
 *   · Redundant possessive ("onun annesi" for "his mother"). The suffix already said it.
 *   · "sahip olmak" for "to have" — the classic word-for-word calque; Turkish uses "var".
 *   · Idioms translated literally ("günün sonunda", "fark yaratmak").
 *
 * Every rule is a RATE, not a single occurrence: one "ve" is Turkish, one per sentence is a
 * translation. The gate blocks on the accumulated score, so a book can carry a couple of
 * marked constructions without being rejected — which is what keeps this from flagging the
 * shipped reference stories.
 */

import { countSentences, countWords, toLowerTr } from '@kendihikayem/shared';

import { SAFETY_MESSAGES_TR } from '../messages.tr';
import type { SafetyViolation } from '../types';

export interface TranslationeseSignal {
  id: string;
  /** Weight added to the score. The block threshold is 3. */
  weight: number;
  detail: string;
}

export interface TranslationeseResult {
  score: number;
  signals: TranslationeseSignal[];
  violations: SafetyViolation[];
}

/** Literal calques. One occurrence is enough — no Turkish children's author writes these. */
const CALQUES: ReadonlyArray<{ id: string; pattern: RegExp; weight: number }> = [
  { id: 'gunun_sonunda', pattern: /günün sonunda/u, weight: 3 },
  { id: 'fark_yaratmak', pattern: /fark yarat(mak|tı|ır)/u, weight: 2 },
  { id: 'kutunun_disinda', pattern: /kutunun dışında düşün/u, weight: 3 },
  { id: 'sahip_olmak', pattern: /(bir|iki|üç)\s+\w+(e|a|ye|ya)\s+sahip(ti|tir|\b)/u, weight: 2 },
  { id: 'kendine_inan', pattern: /kendine inan(mak|malısın|ırsan)/u, weight: 1 },
  { id: 'hayallerinin_pesinden', pattern: /hayallerinin peşinden/u, weight: 1 },
  { id: 'bu_arada', pattern: /\bbu arada\b.{0,40}\bbu arada\b/su, weight: 1 },
  { id: 'emin_ol_ki', pattern: /emin ol ki\b/u, weight: 2 },
  { id: 'ne_olursa_olsun', pattern: /her ne olursa olsun/u, weight: 1 },
];

/** Sentence-initial subject pronouns — the strongest single marker. */
const PRONOUN_SUBJECT = /(^|[.!?…]\s+|["“”]\s*)(o|onlar|ben|sen|biz|siz)\s+[a-zçğıöşü]/giu;

const REDUNDANT_POSSESSIVE = /\bonun\s+\w+(sı|si|su|sü|ı|i|u|ü)\b/giu;

const BLOCK_THRESHOLD = 3;

export function checkTranslationese(text: string): TranslationeseResult {
  const lower = toLowerTr(text);
  const sentences = Math.max(1, countSentences(text));
  const totalWords = Math.max(1, countWords(text));
  const signals: TranslationeseSignal[] = [];

  for (const calque of CALQUES) {
    if (calque.pattern.test(lower)) {
      signals.push({
        id: `calque.${calque.id}`,
        weight: calque.weight,
        detail: `çeviri kalıbı: ${calque.id}`,
      });
    }
  }

  const pronounSubjects = countMatches(text, PRONOUN_SUBJECT);
  const pronounRate = pronounSubjects / sentences;
  if (pronounRate > 0.25) {
    signals.push({
      id: 'pronoun_subject_rate',
      weight: pronounRate > 0.4 ? 3 : 2,
      detail: `cümlelerin %${Math.round(pronounRate * 100)}'i zamirle başlıyor (Türkçede özne ekte)`,
    });
  }

  const veRate = countWordOccurrences(lower, 've') / sentences;
  if (veRate > 0.85) {
    signals.push({
      id: 've_rate',
      weight: veRate > 1.2 ? 3 : 1,
      detail: `cümle başına ${veRate.toFixed(2)} "ve" (bağfiil yerine bağlaç yığılması)`,
    });
  }

  const birRate = countWordOccurrences(lower, 'bir') / sentences;
  if (birRate > 1.3) {
    signals.push({
      id: 'bir_rate',
      weight: birRate > 1.8 ? 2 : 1,
      detail: `cümle başına ${birRate.toFixed(2)} "bir" (İngilizce a/an aktarımı)`,
    });
  }

  const redundant = countMatches(text, REDUNDANT_POSSESSIVE);
  if (redundant > 0) {
    signals.push({
      id: 'redundant_possessive',
      weight: redundant >= 2 ? 2 : 1,
      detail: `${redundant} kez gereksiz "onun" (iyelik eki zaten var)`,
    });
  }

  // Very long words per sentence is a proxy for nominalised, report-like prose — the shape
  // machine translation produces when it renders an English subordinate clause.
  const longWordRate =
    (text.match(/[a-zçğıöşüA-ZÇĞİÖŞÜ]{14,}/gu) ?? []).length / Math.max(1, totalWords / 100);
  if (longWordRate > 6) {
    signals.push({
      id: 'nominalisation',
      weight: 1,
      detail: `100 kelimede ${longWordRate.toFixed(1)} adet 14+ harfli kelime`,
    });
  }

  const score = signals.reduce((total, signal) => total + signal.weight, 0);
  const violations: SafetyViolation[] =
    score === 0
      ? []
      : [
          {
            code: 'TRANSLATIONESE',
            engine: 'deterministic',
            severity: score >= BLOCK_THRESHOLD ? 'block' : 'flag',
            messageTr: SAFETY_MESSAGES_TR.TRANSLATIONESE,
            detail: `skor ${score}: ${signals.map((signal) => signal.detail).join('; ')}`,
          },
        ];

  return { score, signals, violations };
}

function countMatches(text: string, pattern: RegExp): number {
  return [...text.matchAll(new RegExp(pattern.source, pattern.flags))].length;
}

function countWordOccurrences(lowerText: string, word: string): number {
  return [...lowerText.matchAll(new RegExp(`(?<![a-zçğıöşü])${word}(?![a-zçğıöşü])`, 'gu'))].length;
}
