/**
 * rubric.ts — the age-band content matrix (SPEC §10.4).
 *
 * ⚠️ NO MODERATION API IMPLEMENTS THIS. "Büyükanne öldü ve Ayşe çok üzüldü" comes back
 * clean from every vendor — correct for a general audience, wrong for a four-year-old. The
 * matrix below is the product's own policy, and it is data rather than prose so that three
 * consumers can share one source: the system prompt (what the model is told), the judge
 * prompt (what the judge grades), and this package (what the deterministic layer enforces).
 *
 * Grounded in developmental research (docs/research/03-story.md §4b): a preschooler reads
 * death as reversible and can conclude it was their fault, so the answer is not "never
 * mention it" but "not below six, and above six only supported, off-scene, and resolved".
 */

import type { AgeBand } from '@kendihikayem/contract';

import { SAFETY_MESSAGES_TR } from './messages.tr';
import type { SafetyViolation } from './types';

/** One row of the SPEC §10.4 matrix. */
export type RubricAllowance = 'forbidden' | 'conditional' | 'allowed';

/** The seven things the judge grades. Mirrors the SPEC's K4c rubric exactly. */
export const JUDGE_DIMENSIONS = [
  'olum',
  'tehlike',
  'korku_ile_disiplin',
  'dini_icerik',
  'cinsiyet_kalibi',
  'beden_yorumu',
  'cozumsuz_son',
] as const;
export type JudgeDimension = (typeof JUDGE_DIMENSIONS)[number];

export interface RubricRow {
  /** Turkish label used in the prompt and in the ops view. */
  labelTr: string;
  byBand: Record<AgeBand, RubricAllowance>;
  /** Only meaningful where the row is `conditional` — spells out the condition. */
  conditionTr?: string;
}

export const AGE_CONTENT_MATRIX: Record<string, RubricRow> = {
  olum: {
    labelTr: 'Ölüm',
    byBand: { '0-2': 'forbidden', '3-5': 'forbidden', '6-8': 'conditional' },
    conditionTr:
      'Yalnızca yaşlılık ya da evcil hayvan; sahne dışında; bir yetişkin desteğiyle; dini iddia yok',
  },
  fiziksel_tehlike: {
    labelTr: 'Fiziksel tehlike',
    byBand: { '0-2': 'forbidden', '3-5': 'forbidden', '6-8': 'conditional' },
    conditionTr: 'Hafif ve aynı sahnede çözülen',
  },
  kotu_karakter: {
    labelTr: 'Kötü karakter',
    byBand: { '0-2': 'forbidden', '3-5': 'forbidden', '6-8': 'conditional' },
    conditionTr: 'Islah olan, tehditkâr olmayan',
  },
  ebeveynden_ayrilik: {
    labelTr: 'Ebeveynden ayrılık',
    byBand: { '0-2': 'conditional', '3-5': 'conditional', '6-8': 'conditional' },
    conditionTr: '0-2 ve 3-5: aynı sayfada çözülür; 6-8: aynı sahnede çözülür',
  },
  karanlik_korku: {
    labelTr: 'Karanlık / korku',
    byBand: { '0-2': 'conditional', '3-5': 'allowed', '6-8': 'allowed' },
    conditionTr: 'Korku ehlileştirilerek: korku gerçek kabul edilir, sonra dönüştürülür',
  },
  yaralanma: {
    labelTr: 'Yaralanma tasviri',
    byBand: { '0-2': 'forbidden', '3-5': 'forbidden', '6-8': 'forbidden' },
  },
  silah_madde: {
    labelTr: 'Silah / madde / kendine zarar',
    byBand: { '0-2': 'forbidden', '3-5': 'forbidden', '6-8': 'forbidden' },
  },
  cozumsuz_son: {
    labelTr: 'Çözümsüz son',
    byBand: { '0-2': 'forbidden', '3-5': 'forbidden', '6-8': 'forbidden' },
  },
  korku_ile_disiplin: {
    labelTr: 'Korku ile disiplin (öcü, umacı, polis alır…)',
    byBand: { '0-2': 'forbidden', '3-5': 'forbidden', '6-8': 'forbidden' },
  },
  beden_yorumu: {
    labelTr: 'Beden / kilo / görünüş yorumu',
    byBand: { '0-2': 'forbidden', '3-5': 'forbidden', '6-8': 'forbidden' },
  },
  cinsiyet_kalibi: {
    labelTr: 'Toplumsal cinsiyet kalıbı',
    byBand: { '0-2': 'forbidden', '3-5': 'forbidden', '6-8': 'forbidden' },
  },
};

const ALLOWANCE_LABEL_TR: Record<RubricAllowance, string> = {
  forbidden: 'YASAK',
  conditional: 'KOŞULLU',
  allowed: 'serbest',
};

/**
 * Renders the matrix for one band as prompt text. Generated rather than hand-written so
 * the prompt and the enforcement can never disagree — one edit, both move.
 */
export function rubricPromptTr(ageBand: AgeBand, religiousOptIn: boolean): string {
  const rows = Object.values(AGE_CONTENT_MATRIX).map((row) => {
    const allowance = row.byBand[ageBand];
    const condition =
      allowance === 'conditional' && row.conditionTr ? ` — ${row.conditionTr}` : '';
    return `- ${row.labelTr}: ${ALLOWANCE_LABEL_TR[allowance]}${condition}`;
  });
  rows.push(
    `- Dini içerik: ${religiousOptIn ? 'ebeveyn açıkça istedi, ölçülü kullanılabilir' : 'YASAK (ebeveyn açmadı)'}`,
  );
  return rows.join('\n');
}

/* ── judge verdict ─────────────────────────────────────────────────────────── */

export interface JudgeFinding {
  boyut: JudgeDimension;
  /** The judge's own quote of the offending passage. */
  kanit?: string;
  sayfa_no?: number;
}

export interface JudgeVerdict {
  uygun: boolean;
  ihlaller: JudgeFinding[];
  /** Free-text note from the judge, Turkish, for the ops view. */
  not?: string;
}

/**
 * Converts the judge's answer into violations. The judge is advisory on `conditional` rows
 * and authoritative on `forbidden` ones: it may not overrule the matrix, only apply it.
 */
export function evaluateJudgeVerdict(
  verdict: JudgeVerdict,
  ageBand: AgeBand,
): SafetyViolation[] {
  if (verdict.uygun && verdict.ihlaller.length === 0) return [];

  return verdict.ihlaller.map((finding) => {
    const row = AGE_CONTENT_MATRIX[finding.boyut];
    const allowance = row?.byBand[ageBand] ?? 'forbidden';
    return {
      code: 'AGE_RUBRIC_VIOLATION',
      engine: 'llm_judge',
      // A `conditional` row that the judge flagged is a review signal; a `forbidden` row is
      // a refusal. That is what keeps a supported bereavement story publishable at 6-8.
      severity: allowance === 'forbidden' ? 'block' : 'flag',
      messageTr: SAFETY_MESSAGES_TR.AGE_RUBRIC_VIOLATION,
      detail: `${finding.boyut} (${ageBand}: ${allowance})${verdict.not ? ` — ${verdict.not}` : ''}`,
      ...(finding.kanit ? { excerpt: finding.kanit.slice(0, 160) } : {}),
      ...(finding.sayfa_no !== undefined ? { pageNo: finding.sayfa_no } : {}),
    } satisfies SafetyViolation;
  });
}
