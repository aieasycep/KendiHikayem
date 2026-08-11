/**
 * image/prompt/audit.ts — K5, the deterministic illustration-prompt gate (SPEC §8.2 step 4).
 *
 * WHY THIS IS CODE AND NOT AN LLM CALL. The prompt is written by a model (stage 2 emits
 * `scene_en`). Asking a second model whether the first model's prompt is acceptable buys a
 * probabilistic answer to a question with a deterministic answer: does the frozen canon
 * appear verbatim, is the art style in the catalogue, does the text mention a trademarked
 * character, is the no-text suffix present. Every one of those is a string operation. A
 * judge model would also cost money per page and could be talked out of its verdict by the
 * prompt it is judging.
 *
 * A prompt that fails here NEVER reaches the image provider: the caller regenerates it
 * (back to the LLM) or repairs it. That ordering is what keeps a $0.067 render from being
 * spent on a prompt we already knew was wrong.
 */

import type { CharacterDna } from './character-dna';
import { NO_TEXT_NEGATIVE_EN } from './style-dna';

export type PromptAuditFinding =
  /** The art style is not a row in `art_styles`. Free-text styles are refused. */
  | 'unknown_art_style'
  /** CHARACTER_DNA is missing or paraphrased. The single most damaging failure. */
  | 'canon_missing'
  /** A brand, a copyrighted character or a real person appears in the prompt. */
  | 'denylisted_term'
  /** The mandatory "no text, no letters …" suffix is absent. */
  | 'no_text_suffix_missing'
  /** The prompt asks for a photo/likeness of a real child. */
  | 'photo_reference'
  /** Turkish leaked into an English-only prompt. */
  | 'not_english'
  /** Empty, or long enough that the tail will be truncated by the provider. */
  | 'length_out_of_bounds';

export interface PromptAuditIssue {
  finding: PromptAuditFinding;
  /** English, for logs and ops. Parents never see this. */
  detail: string;
  /** The matched term, when there is one. */
  match?: string;
}

export interface PromptAuditResult {
  ok: boolean;
  issues: PromptAuditIssue[];
}

/**
 * Brands, franchises and characters whose look must not be requested. Two families:
 * global rights holders and the Turkish children's-TV canon a Turkish story prompt is
 * genuinely likely to drift into (SPEC §8.2 step 4 names these explicitly).
 *
 * Matched on word boundaries over a case-folded, accent-tolerant form of the prompt, so
 * `RAFADAN TAYFA`, `rafadan tayfa` and `Rafadan  Tayfa` all match.
 *
 * TODO(A3): when `packages/safety` lands its shared denylists, this list should move there
 * and be imported — one list, two consumers (text and prompt), not two lists that drift.
 */
export const BRAND_DENYLIST: readonly string[] = [
  // Global rights holders / franchises
  'disney',
  'pixar',
  'dreamworks',
  'studio ghibli',
  'ghibli',
  'marvel',
  'nintendo',
  'pokemon',
  'pokémon',
  'peppa pig',
  'paw patrol',
  'frozen elsa',
  'elsa and anna',
  'mickey mouse',
  'minnie mouse',
  'spider-man',
  'spiderman',
  'batman',
  'superman',
  'barbie',
  'lego',
  'hello kitty',
  'sponge bob',
  'spongebob',
  'bluey',
  'cocomelon',
  'minecraft',
  'roblox',
  // Turkish children's TV and publishing
  'trt çocuk',
  'trt cocuk',
  'rafadan tayfa',
  'niloya',
  'pepee',
  'kral şakir',
  'kral sakir',
  'keloğlan',
  'keloglan',
  'nasreddin hoca',
  'ayas',
  'maysa ve bulut',
  'akıllı tavşan momo',
  'akilli tavsan momo',
  'elif ve arkadaşları',
  'canım kardeşim',
  'canim kardesim',
];

/**
 * Requests for a real person's likeness. Public figures are a rights problem; a real child
 * is the product's core promise (SPEC §8.1). Both are refused by the same list.
 */
export const PHOTO_REFERENCE_PATTERNS: readonly RegExp[] = [
  /\bphotograph(?:ic|s)?\s+(?:of|reference)\b/iu,
  /\bphoto\s+(?:of|reference)\b/iu,
  /\breference\s+photo\b/iu,
  /\buploaded\s+(?:photo|image|picture)\b/iu,
  /\bthe\s+(?:real|actual)\s+child\b/iu,
  /\b(?:likeness|resemblance)\s+of\s+(?:a|the)\s+real\b/iu,
  /\bfrom\s+the\s+(?:parent|user)'?s?\s+(?:photo|picture|camera)\b/iu,
  /\bselfie\b/iu,
  /\bdeepfake\b/iu,
];

/**
 * Turkish function words. A proper noun like `Elif` or `Doğa` is legitimate in an English
 * prompt; `ve bir çocuk` is untranslated scene text, which measurably degrades every image
 * model (SPEC §8.2 step 0). Function words separate the two cases without banning names.
 */
const TURKISH_FUNCTION_WORDS: readonly string[] = [
  've',
  'bir',
  'ile',
  'için',
  'ama',
  'çok',
  'daha',
  'gibi',
  'sonra',
  'kadar',
  'çocuk',
  'küçük',
  'büyük',
  'gece',
  'sabah',
  'orman',
  'köyde',
  'evde',
  'bahçede',
];

export const PROMPT_MIN_LENGTH = 40;
/**
 * Upper bound. Not a vendor limit — a discipline: past this the SCENE block has stopped
 * being a scene, and the tokens that matter (the canon) lose relative weight.
 */
export const PROMPT_MAX_LENGTH = 6000;

/** Case-folds and strips Turkish diacritics so one denylist entry covers both spellings. */
function foldForMatch(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/ı/gu, 'i')
    .replace(/ş/gu, 's')
    .replace(/ğ/gu, 'g')
    .replace(/ç/gu, 'c')
    .replace(/ö/gu, 'o')
    .replace(/ü/gu, 'u')
    .replace(/\s+/gu, ' ');
}

/** Escapes a literal for use inside a RegExp. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

export interface PromptAuditInput {
  promptEn: string;
  /** The frozen canon that must appear verbatim. Omit for style-plate prompts. */
  character?: CharacterDna;
  /** Supporting cast canons that must also appear verbatim. */
  supportingCharacters?: readonly CharacterDna[];
  /** `art_styles.code` of the requested style. */
  artStyleCode: string;
  /** Every code in the catalogue — the enum this is checked against. */
  knownArtStyleCodes: readonly string[];
}

/**
 * ⭐ The gate. Returns every issue rather than the first, so a regeneration prompt can be
 * told everything that is wrong in one round trip instead of playing whack-a-mole.
 */
export function auditIllustrationPrompt(input: PromptAuditInput): PromptAuditResult {
  const issues: PromptAuditIssue[] = [];
  const prompt = input.promptEn;

  /* 1 ── art style must be a catalogue row */
  if (!input.knownArtStyleCodes.includes(input.artStyleCode)) {
    issues.push({
      finding: 'unknown_art_style',
      detail: `art style '${input.artStyleCode}' is not in the catalogue`,
      match: input.artStyleCode,
    });
  }

  /* 2 ── CHARACTER_DNA verbatim. Substring, not fuzzy: paraphrase IS the failure. */
  const canons = [
    ...(input.character ? [input.character] : []),
    ...(input.supportingCharacters ?? []),
  ];
  for (const canon of canons) {
    if (!prompt.includes(canon.canonEn)) {
      issues.push({
        finding: 'canon_missing',
        detail:
          `CHARACTER_DNA for ${canon.anchor} is not present verbatim. ` +
          'It must be copied byte for byte, never paraphrased per page.',
        match: canon.anchor,
      });
    }
  }

  /* 3 ── brand / franchise / real-person denylist */
  const folded = foldForMatch(prompt);
  for (const term of BRAND_DENYLIST) {
    const foldedTerm = foldForMatch(term);
    const pattern = new RegExp(`(?:^|[^\\p{L}\\p{N}])${escapeRegExp(foldedTerm)}(?:$|[^\\p{L}\\p{N}])`, 'u');
    if (pattern.test(folded)) {
      issues.push({
        finding: 'denylisted_term',
        detail: `prompt references the protected brand/character '${term}'`,
        match: term,
      });
    }
  }

  /* 4 ── the mandatory no-text suffix */
  if (!prompt.includes(NO_TEXT_NEGATIVE_EN)) {
    issues.push({
      finding: 'no_text_suffix_missing',
      detail:
        'the mandatory no-text negative fragment is missing. Book text is a vector layer ' +
        'in the PDF; the illustration must contain no letterforms at all (SPEC §8.4).',
    });
  }

  /* 5 ── photo / likeness requests */
  for (const pattern of PHOTO_REFERENCE_PATTERNS) {
    const match = pattern.exec(prompt);
    if (match) {
      issues.push({
        finding: 'photo_reference',
        detail:
          "prompt asks for a photographic likeness. A child's photo is never used — " +
          'the character is built from a description (SPEC §8.1).',
        match: match[0],
      });
    }
  }

  /* 6 ── English-only scene text */
  const turkishHits = TURKISH_FUNCTION_WORDS.filter((word) => {
    const pattern = new RegExp(
      `(?:^|[^\\p{L}\\p{N}])${escapeRegExp(foldForMatch(word))}(?:$|[^\\p{L}\\p{N}])`,
      'u',
    );
    return pattern.test(folded);
  });
  // Two or more function words is a sentence, not a proper noun that happens to collide.
  if (turkishHits.length >= 2) {
    issues.push({
      finding: 'not_english',
      detail:
        `prompt contains untranslated Turkish (${turkishHits.slice(0, 4).join(', ')}). ` +
        'Image prompts are English; only proper nouns stay Turkish (SPEC §8.2 step 0).',
      match: turkishHits[0]!,
    });
  }

  /* 7 ── length */
  if (prompt.trim().length < PROMPT_MIN_LENGTH) {
    issues.push({
      finding: 'length_out_of_bounds',
      detail: `prompt is ${prompt.trim().length} characters, minimum ${PROMPT_MIN_LENGTH}`,
    });
  } else if (prompt.length > PROMPT_MAX_LENGTH) {
    issues.push({
      finding: 'length_out_of_bounds',
      detail: `prompt is ${prompt.length} characters, maximum ${PROMPT_MAX_LENGTH}`,
    });
  }

  return { ok: issues.length === 0, issues };
}

export class PromptAuditError extends Error {
  readonly issues: readonly PromptAuditIssue[];

  constructor(issues: readonly PromptAuditIssue[]) {
    super(
      `illustration prompt failed the K5 audit: ${issues
        .map((issue) => `${issue.finding}${issue.match ? ` (${issue.match})` : ''}`)
        .join(', ')}`,
    );
    this.name = 'PromptAuditError';
    this.issues = issues;
  }
}

/** Throwing form, for call sites where continuing is never correct. */
export function assertIllustrationPrompt(input: PromptAuditInput): void {
  const result = auditIllustrationPrompt(input);
  if (!result.ok) throw new PromptAuditError(result.issues);
}
