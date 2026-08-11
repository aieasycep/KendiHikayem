/**
 * banlists.tr.ts — the Turkish and culture-specific denylist (SPEC §10.4).
 *
 * ⚠️ NO OFF-THE-SHELF MODERATION API CATCHES ANY OF THIS. "Yaramazlık yaparsan öcü gelir"
 * is not hate speech, not violence, not self-harm — every vendor returns it clean. It is
 * also developmentally harmful and culturally specific to exactly our market, which is why
 * the list is ours and lives in code rather than in a vendor's classifier.
 *
 * Three matching modes, because Turkish is agglutinative and a naive substring match is
 * either useless or catastrophic:
 *   `stem`   — the term plus any suffix: "öcü" also catches "öcüler", "öcüden"
 *   `word`   — the exact word only: "kan" must NOT fire on "kanat", "kanepe", "kandırdı"
 *   `phrase` — a multi-word expression, whitespace-flexible
 *
 * Severity varies by age band on purpose (SPEC §10.4 matrix): death is ❌ under six and
 * ⚠️ conditional at 6-8, so at 6-8 it is a `flag` that hands the decision to the age-rubric
 * judge instead of a blanket refusal that would make bereavement stories impossible.
 */

import type { AgeBand } from '@kendihikayem/contract';
import { toLowerTr } from '@kendihikayem/shared';

import { SAFETY_MESSAGES_TR } from './messages.tr';
import type { AgeContext, SafetyViolation, SafetyViolationCode } from './types';

export type BanCategory =
  | 'korku_ile_disiplin'
  | 'siddet'
  | 'olum'
  | 'silah_madde'
  | 'argo_hakaret'
  | 'bolgesel_hakaret'
  | 'siyasi_hassas'
  | 'dini'
  | 'kurban'
  | 'marka_telif'
  | 'beden_gorunus'
  | 'cinsiyet_kalibi'
  | 'yetiskin';

export type BanSeverity = 'allow' | 'flag' | 'block';

export interface BanEntry {
  term: string;
  category: BanCategory;
  match: 'word' | 'stem' | 'phrase';
  /** Default when the band has no explicit entry. */
  severity: BanSeverity;
  byBand?: Partial<Record<AgeBand, BanSeverity>>;
  note?: string;
}

/* ────────────────────────────────────────────────────────────────────────────
 * 1. Korku ile disiplin — the single most important list in this file.
 *    Threatening a child with a bogeyman is a widespread Turkish parenting habit and
 *    developmentally harmful; a product that automates it at scale would be indefensible.
 * ──────────────────────────────────────────────────────────────────────────── */
const FEAR_DISCIPLINE: BanEntry[] = [
  { term: 'öcü', category: 'korku_ile_disiplin', match: 'stem', severity: 'block' },
  { term: 'umacı', category: 'korku_ile_disiplin', match: 'stem', severity: 'block' },
  { term: 'gulyabani', category: 'korku_ile_disiplin', match: 'stem', severity: 'block' },
  { term: 'hortlak', category: 'korku_ile_disiplin', match: 'stem', severity: 'block' },
  { term: 'cin çarp', category: 'korku_ile_disiplin', match: 'phrase', severity: 'block' },
  { term: 'polis alır', category: 'korku_ile_disiplin', match: 'phrase', severity: 'block' },
  { term: 'polis gelir', category: 'korku_ile_disiplin', match: 'phrase', severity: 'block' },
  { term: 'doktor iğne yapar', category: 'korku_ile_disiplin', match: 'phrase', severity: 'block' },
  { term: 'iğne yaptırırım', category: 'korku_ile_disiplin', match: 'phrase', severity: 'block' },
  { term: 'yaramazlık yaparsan', category: 'korku_ile_disiplin', match: 'phrase', severity: 'block' },
  { term: 'seni kaçırır', category: 'korku_ile_disiplin', match: 'phrase', severity: 'block' },
  { term: 'yemezsen seni', category: 'korku_ile_disiplin', match: 'phrase', severity: 'block' },
];

/* 2. Violence, weapons, substances — ❌ at every band (SPEC §10.4 matrix). */
const VIOLENCE: BanEntry[] = [
  { term: 'silah', category: 'silah_madde', match: 'stem', severity: 'block' },
  { term: 'tabanca', category: 'silah_madde', match: 'stem', severity: 'block' },
  { term: 'tüfek', category: 'silah_madde', match: 'stem', severity: 'block' },
  { term: 'bıçakla', category: 'silah_madde', match: 'stem', severity: 'block' },
  { term: 'bomba', category: 'silah_madde', match: 'stem', severity: 'block' },
  { term: 'kurşun', category: 'silah_madde', match: 'stem', severity: 'block' },
  { term: 'uyuşturucu', category: 'silah_madde', match: 'stem', severity: 'block' },
  { term: 'sigara', category: 'silah_madde', match: 'stem', severity: 'block' },
  { term: 'içki', category: 'silah_madde', match: 'stem', severity: 'block' },
  { term: 'dövdü', category: 'siddet', match: 'stem', severity: 'block' },
  { term: 'dövmek', category: 'siddet', match: 'stem', severity: 'block' },
  { term: 'tokat', category: 'siddet', match: 'stem', severity: 'block' },
  { term: 'yumrukla', category: 'siddet', match: 'stem', severity: 'block' },
  {
    term: 'kan',
    category: 'siddet',
    match: 'word',
    severity: 'block',
    note: 'YALNIZ tam kelime: "kanat", "kanepe", "kandırdı", "kanıt" masumdur',
  },
  { term: 'kanam', category: 'siddet', match: 'stem', severity: 'block', note: 'kanama, kanaması' },
  { term: 'yaralan', category: 'siddet', match: 'stem', severity: 'block', byBand: { '6-8': 'flag' } },
  { term: 'intihar', category: 'siddet', match: 'stem', severity: 'block' },
  { term: 'kendine zarar', category: 'siddet', match: 'phrase', severity: 'block' },
];

/* 3. Death — banded. Off-scene, supported, old-age or a pet only, from 6-8 up. */
const DEATH: BanEntry[] = [
  {
    term: 'öldü',
    category: 'olum',
    match: 'stem',
    severity: 'block',
    byBand: { '6-8': 'flag' },
    note: '6-8: yargıç karar verir (yaşlılık/evcil hayvan, sahne dışı)',
  },
  { term: 'ölüm', category: 'olum', match: 'stem', severity: 'block', byBand: { '6-8': 'flag' } },
  { term: 'öldür', category: 'olum', match: 'stem', severity: 'block' },
  { term: 'cenaze', category: 'olum', match: 'stem', severity: 'block', byBand: { '6-8': 'flag' } },
  { term: 'mezar', category: 'olum', match: 'stem', severity: 'block', byBand: { '6-8': 'flag' } },
];

/* 4. Slang and insults. A masal does not call anyone stupid. */
const INSULTS: BanEntry[] = [
  { term: 'aptal', category: 'argo_hakaret', match: 'stem', severity: 'block' },
  { term: 'salak', category: 'argo_hakaret', match: 'stem', severity: 'block' },
  { term: 'gerizekalı', category: 'argo_hakaret', match: 'stem', severity: 'block' },
  { term: 'geri zekalı', category: 'argo_hakaret', match: 'phrase', severity: 'block' },
  { term: 'gerizekâlı', category: 'argo_hakaret', match: 'stem', severity: 'block' },
  { term: 'ahmak', category: 'argo_hakaret', match: 'stem', severity: 'block' },
  { term: 'budala', category: 'argo_hakaret', match: 'stem', severity: 'block' },
  { term: 'dangalak', category: 'argo_hakaret', match: 'stem', severity: 'block' },
  { term: 'şerefsiz', category: 'argo_hakaret', match: 'stem', severity: 'block' },
  { term: 'lanet', category: 'argo_hakaret', match: 'stem', severity: 'block' },
  { term: 'kahrolası', category: 'argo_hakaret', match: 'stem', severity: 'block' },
  { term: 'defol', category: 'argo_hakaret', match: 'stem', severity: 'block' },
  { term: 'iğrenç', category: 'argo_hakaret', match: 'stem', severity: 'block' },
];

/* 5. Regional / ethnic pejoratives. Listed here precisely so they can never be generated. */
const REGIONAL_SLURS: BanEntry[] = [
  { term: 'çingene', category: 'bolgesel_hakaret', match: 'stem', severity: 'block' },
  { term: 'kıro', category: 'bolgesel_hakaret', match: 'stem', severity: 'block' },
  { term: 'maganda', category: 'bolgesel_hakaret', match: 'stem', severity: 'block' },
  { term: 'yobaz', category: 'bolgesel_hakaret', match: 'stem', severity: 'block' },
  { term: 'gâvur', category: 'bolgesel_hakaret', match: 'stem', severity: 'block' },
  { term: 'gavur', category: 'bolgesel_hakaret', match: 'stem', severity: 'block' },
  { term: 'köylü kurnazı', category: 'bolgesel_hakaret', match: 'phrase', severity: 'block' },
];

/* 6. Politics and other charged subjects — never in a children's bedtime story. */
const POLITICAL: BanEntry[] = [
  { term: 'terör', category: 'siyasi_hassas', match: 'stem', severity: 'block' },
  { term: 'darbe', category: 'siyasi_hassas', match: 'stem', severity: 'block' },
  { term: 'savaş', category: 'siyasi_hassas', match: 'stem', severity: 'block' },
  { term: 'şehit', category: 'siyasi_hassas', match: 'stem', severity: 'block' },
  { term: 'seçim kampanyası', category: 'siyasi_hassas', match: 'phrase', severity: 'block' },
  { term: 'siyasi parti', category: 'siyasi_hassas', match: 'phrase', severity: 'block' },
  { term: 'cumhurbaşkanı', category: 'siyasi_hassas', match: 'stem', severity: 'block' },
  { term: 'başbakan', category: 'siyasi_hassas', match: 'stem', severity: 'block' },
  { term: 'mülteci', category: 'siyasi_hassas', match: 'stem', severity: 'flag' },
];

/**
 * 7. Religious content — OPT-IN, default off (SPEC §10.4). Not "bad": present only when
 * the parent explicitly asked for it. Turkey is religiously diverse and the default cannot
 * assume one household's practice.
 */
const RELIGIOUS: BanEntry[] = [
  { term: 'allah', category: 'dini', match: 'stem', severity: 'block' },
  { term: 'peygamber', category: 'dini', match: 'stem', severity: 'block' },
  { term: 'namaz', category: 'dini', match: 'stem', severity: 'block' },
  { term: 'oruç', category: 'dini', match: 'stem', severity: 'block' },
  { term: 'dua et', category: 'dini', match: 'phrase', severity: 'block' },
  { term: 'cami', category: 'dini', match: 'stem', severity: 'block' },
  { term: 'cennet', category: 'dini', match: 'stem', severity: 'block' },
  { term: 'cehennem', category: 'dini', match: 'stem', severity: 'block' },
  { term: 'günah', category: 'dini', match: 'stem', severity: 'block' },
  { term: 'sevap', category: 'dini', match: 'stem', severity: 'block' },
];

/**
 * 8. Kurban Bayramı — allowed as sharing, hospitality and family visits; the slaughter is
 * NEVER depicted, at any age, opt-in or not (SPEC §10.4).
 */
const SACRIFICE: BanEntry[] = [
  { term: 'kurban kes', category: 'kurban', match: 'phrase', severity: 'block' },
  { term: 'kurbanlık', category: 'kurban', match: 'stem', severity: 'block' },
  { term: 'kesim', category: 'kurban', match: 'stem', severity: 'block' },
  { term: 'boğazla', category: 'kurban', match: 'stem', severity: 'block' },
];

/**
 * 9. Brands, real people and copyrighted characters — text AND illustration prompt.
 * The printed book makes this a materially larger risk than a screen-only product
 * (docs/research/03-story.md §5c).
 */
const BRANDS: BanEntry[] = [
  { term: 'disney', category: 'marka_telif', match: 'stem', severity: 'block' },
  { term: 'pixar', category: 'marka_telif', match: 'stem', severity: 'block' },
  { term: 'elsa', category: 'marka_telif', match: 'word', severity: 'block' },
  { term: 'frozen', category: 'marka_telif', match: 'stem', severity: 'block' },
  { term: 'örümcek adam', category: 'marka_telif', match: 'phrase', severity: 'block' },
  { term: 'spiderman', category: 'marka_telif', match: 'stem', severity: 'block' },
  { term: 'batman', category: 'marka_telif', match: 'stem', severity: 'block' },
  { term: 'pokemon', category: 'marka_telif', match: 'stem', severity: 'block' },
  { term: 'pokémon', category: 'marka_telif', match: 'stem', severity: 'block' },
  { term: 'barbie', category: 'marka_telif', match: 'stem', severity: 'block' },
  { term: 'lego', category: 'marka_telif', match: 'word', severity: 'block' },
  { term: 'harry potter', category: 'marka_telif', match: 'phrase', severity: 'block' },
  { term: 'peppa', category: 'marka_telif', match: 'stem', severity: 'block' },
  { term: 'niloya', category: 'marka_telif', match: 'stem', severity: 'block' },
  { term: 'pepee', category: 'marka_telif', match: 'stem', severity: 'block' },
  { term: 'rafadan tayfa', category: 'marka_telif', match: 'phrase', severity: 'block' },
  {
    term: 'keloğlan',
    category: 'marka_telif',
    match: 'stem',
    severity: 'block',
    note: 'Arketip kamu malı, AD telifli çizgi filmle özdeşleşmiş — adı kullanma (SPEC §10.4)',
  },
];

/* 10. Body, appearance and gender stereotypes — SPEC §10.4, all ages. */
const BODY_AND_GENDER: BanEntry[] = [
  { term: 'şişman', category: 'beden_gorunus', match: 'stem', severity: 'block' },
  { term: 'obez', category: 'beden_gorunus', match: 'stem', severity: 'block' },
  { term: 'kilolu', category: 'beden_gorunus', match: 'stem', severity: 'block' },
  { term: 'çirkin', category: 'beden_gorunus', match: 'stem', severity: 'block' },
  { term: 'zayıflaman lazım', category: 'beden_gorunus', match: 'phrase', severity: 'block' },
  { term: 'diyet yap', category: 'beden_gorunus', match: 'phrase', severity: 'block' },
  { term: 'erkekler ağlamaz', category: 'cinsiyet_kalibi', match: 'phrase', severity: 'block' },
  { term: 'kızlar ağlar', category: 'cinsiyet_kalibi', match: 'phrase', severity: 'block' },
  { term: 'kız işi', category: 'cinsiyet_kalibi', match: 'phrase', severity: 'block' },
  { term: 'erkek işi', category: 'cinsiyet_kalibi', match: 'phrase', severity: 'block' },
  { term: 'erkek adam', category: 'cinsiyet_kalibi', match: 'phrase', severity: 'block' },
];

/* 11. Adult themes. */
const ADULT: BanEntry[] = [
  { term: 'öpüştü', category: 'yetiskin', match: 'stem', severity: 'block' },
  { term: 'sevgilisi', category: 'yetiskin', match: 'stem', severity: 'block' },
  { term: 'flört', category: 'yetiskin', match: 'stem', severity: 'block' },
  { term: 'aşık oldu', category: 'yetiskin', match: 'phrase', severity: 'block' },
  { term: 'bira', category: 'yetiskin', match: 'word', severity: 'block' },
  { term: 'şarap', category: 'yetiskin', match: 'stem', severity: 'block' },
  { term: 'kumar', category: 'yetiskin', match: 'stem', severity: 'block' },
];

export const BANLIST_TR: readonly BanEntry[] = [
  ...FEAR_DISCIPLINE,
  ...VIOLENCE,
  ...DEATH,
  ...INSULTS,
  ...REGIONAL_SLURS,
  ...POLITICAL,
  ...RELIGIOUS,
  ...SACRIFICE,
  ...BRANDS,
  ...BODY_AND_GENDER,
  ...ADULT,
];

/** Categories that are only forbidden because the parent did not opt in. */
const OPT_IN_CATEGORIES: ReadonlySet<BanCategory> = new Set<BanCategory>(['dini']);

const LETTER = 'a-zçğıöşü';

function patternFor(entry: BanEntry): RegExp {
  const escaped = entry.term.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  switch (entry.match) {
    case 'word':
      return new RegExp(`(?<![${LETTER}])${escaped}(?![${LETTER}])`, 'u');
    case 'stem':
      // Agglutination: the stem plus any suffix, but not as a substring of another word.
      return new RegExp(`(?<![${LETTER}])${escaped}[${LETTER}']*`, 'u');
    case 'phrase':
      return new RegExp(escaped.replace(/\s+/gu, '\\s+'), 'u');
  }
}

const COMPILED = BANLIST_TR.map((entry) => ({ entry, pattern: patternFor(entry) }));

export interface BanlistHit {
  entry: BanEntry;
  severity: 'flag' | 'block';
  index: number;
  matched: string;
}

/** Raw scan. `scanBanlist` below turns hits into violations; this is the reusable core. */
export function findBannedTerms(text: string, context: AgeContext): BanlistHit[] {
  const haystack = toLowerTr(text);
  const hits: BanlistHit[] = [];

  for (const { entry, pattern } of COMPILED) {
    const match = pattern.exec(haystack);
    if (!match) continue;

    const severity = severityFor(entry, context);
    if (severity === 'allow') continue;

    hits.push({ entry, severity, index: match.index, matched: match[0] });
  }
  return hits;
}

function severityFor(entry: BanEntry, context: AgeContext): BanSeverity {
  if (OPT_IN_CATEGORIES.has(entry.category) && context.religiousOptIn) return 'allow';
  return entry.byBand?.[context.ageBand] ?? entry.severity;
}

/** Turns hits into the violation shape the rest of the package speaks. */
export function scanBanlist(
  text: string,
  context: AgeContext,
  options: { pageNo?: number } = {},
): SafetyViolation[] {
  return findBannedTerms(text, context).map((hit) => {
    const code: SafetyViolationCode =
      hit.entry.category === 'marka_telif'
        ? 'BRAND_OR_COPYRIGHT'
        : hit.entry.category === 'dini'
          ? 'RELIGIOUS_NOT_OPTED_IN'
          : hit.entry.byBand !== undefined
            ? 'AGE_BANNED_TERM'
            : 'BANNED_TERM';

    return {
      code,
      engine: hit.entry.category === 'marka_telif' ? 'brand_denylist' : 'deterministic',
      severity: hit.severity,
      messageTr: SAFETY_MESSAGES_TR[code],
      detail: `${hit.entry.category}:${hit.entry.term}`,
      excerpt: text.slice(Math.max(0, hit.index - 40), hit.index + 60).replace(/\s+/gu, ' ').trim(),
      ...(options.pageNo !== undefined ? { pageNo: options.pageNo } : {}),
    };
  });
}
