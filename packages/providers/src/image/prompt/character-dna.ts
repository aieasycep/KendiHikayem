/**
 * image/prompt/character-dna.ts — ⭐ layer ① of the five-layer consistency lock (SPEC §8.1).
 *
 * THE PROBLEM. The same child must look like the same child on twelve pages. Image models
 * have no memory between calls and Gemini exposes no seed (SPEC §8.4), so every page is an
 * independent sample from a distribution. The only thing we control is the conditioning:
 * the text tokens and the reference images that go in.
 *
 * THE ANSWER, and why it works. Identity is pinned by a CANONICAL ENGLISH DESCRIPTION that
 * is produced ONCE, frozen, and copied into every prompt BYTE FOR BYTE. Not paraphrased,
 * not regenerated per page, not "the same information in different words". Two properties
 * follow, and both matter:
 *
 *   1. Identical token prefixes condition the model identically. Re-describing "wavy dark
 *      brown hair" as "brown wavy hair" on page 7 is a different token sequence and a
 *      different sample — that is how a child's hair changes shade mid-book.
 *   2. It is CHECKABLE. `auditIllustrationPrompt()` asserts the canon appears verbatim in
 *      the prompt. Drift becomes a deterministic test failure, not a customer complaint.
 *
 * ⚠️ NO PHOTOGRAPH. EVER. The product's public promise is that a child's photo is never
 * uploaded, never sent to a vendor, never used as a likeness reference. That promise is
 * kept structurally: `CharacterDnaInput` has no field that can hold an image, the render
 * function only concatenates catalogue-derived English fragments, and
 * `assertPhotoFreeReferences()` rejects any reference slot that is not one of the four
 * generated ones. There is no code path from a camera roll to a provider.
 *
 * Field order is FIXED and load-bearing. Reordering this file's output invalidates every
 * frozen `story_characters.canon_en` in the database — see `assertCanonUnchanged`.
 */

import type { ImageReference, ImageReferenceKind } from '../../core/adapters';

/**
 * The structured character definition. Every value is an ENGLISH fragment that came from
 * `character_builder_options.dna_en` (a closed catalogue), never free parent text — free
 * text is both a consistency risk and a moderation risk (SPEC §8.1 ②).
 */
export interface CharacterDnaInput {
  /**
   * The child's given name, used as the anchor token. Rendered upper-case so it reads as a
   * label rather than as prose the model might try to draw as a caption.
   */
  name: string;
  /** How old the character LOOKS. Not a birthday — an appearance cue. */
  ageYears: number;
  /** 'girl' | 'boy' | 'child' — 'child' is the neutral default. */
  presentation: CharacterPresentation;
  /** e.g. 'warm olive skin'. */
  skin: string;
  /** e.g. 'dark brown hair'. */
  hairColour: string;
  /** e.g. 'wavy hair' → rendered as 'wavy'. */
  hairType: string;
  /** e.g. 'shoulder-length hair' → rendered as 'shoulder-length'. */
  hairLength: string;
  /** e.g. 'warm brown eyes'. */
  eyes: string;
  /** e.g. 'freckles across the nose'. Omitted when the parent chose 'no freckles'. */
  freckles?: string;
  /** e.g. 'wearing round glasses'. */
  glasses?: string;
  /** e.g. 'yellow dungarees over a white tee'. Clothing NEVER changes between pages. */
  outfit: string;
  /** e.g. 'blue canvas sneakers'. */
  shoes?: string;
  /** e.g. 'a small worn teddy bear'. The companion is part of the silhouette. */
  companion?: string;
  /**
   * One extra distinguishing mark — the single highest-signal consistency token there is,
   * because it is unusual enough that the model does not average it away.
   */
  distinguishingFeature?: string;
}

export type CharacterPresentation = 'girl' | 'boy' | 'child';

/** A frozen canon. Once this exists it is copied, never rebuilt. */
export interface CharacterDna {
  /** The upper-case anchor, e.g. `ELIF`. */
  anchor: string;
  /** `story_characters.canon_en`. The exact string every prompt must contain. */
  canonEn: string;
  /** sha256 of `canonEn`, so a drift is one comparison rather than a diff. */
  sha256: string;
}

/** Presentation → the noun the description opens with. */
const PRESENTATION_NOUN: Record<CharacterPresentation, string> = {
  girl: 'girl',
  boy: 'boy',
  child: 'child',
};

/**
 * Strips the catalogue's trailing noun so fragments compose into prose instead of
 * "wavy hair hair". `dna_en` values are written for standalone display ('wavy hair'),
 * and this is the one place that knows they are being composed.
 */
function stripSuffix(fragment: string, suffix: string): string {
  const trimmed = fragment.trim();
  const lowered = trimmed.toLowerCase();
  const lowerSuffix = ` ${suffix.toLowerCase()}`;
  if (lowered.endsWith(lowerSuffix)) {
    return trimmed.slice(0, trimmed.length - lowerSuffix.length).trim();
  }
  if (lowered === suffix.toLowerCase()) return '';
  return trimmed;
}

/** Collapses whitespace so a stray newline in a catalogue row cannot change the hash. */
function normalise(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

/**
 * Renders the canonical description. PURE and DETERMINISTIC: same input, same bytes,
 * forever. This function's output is what gets frozen into the database.
 *
 * The shape mirrors the worked example in SPEC §8.1 ①:
 *   `ELIF — a 6-year-old girl. Shoulder-length wavy dark brown hair. Warm brown eyes. …`
 */
export function renderCharacterDna(input: CharacterDnaInput): string {
  const anchor = characterAnchor(input.name);
  const noun = PRESENTATION_NOUN[input.presentation];

  const hairLength = stripSuffix(input.hairLength, 'hair');
  const hairType = stripSuffix(input.hairType, 'hair');
  const hairColour = stripSuffix(input.hairColour, 'hair');
  const hairParts = [hairLength, hairType, hairColour].filter(Boolean).join(' ');

  const sentences: string[] = [
    `${anchor} — a ${input.ageYears}-year-old ${noun}.`,
    hairParts ? `${capitalise(hairParts)} hair.` : '',
    `${capitalise(input.eyes)}.`,
    `${capitalise(input.skin)}.`,
    input.freckles ? `${capitalise(input.freckles)}.` : '',
    input.glasses ? `${capitalise(input.glasses)}.` : '',
    `Always wears ${input.outfit}${input.shoes ? ` and ${input.shoes}` : ''}.`,
    input.companion ? `Always carries ${input.companion}.` : '',
    input.distinguishingFeature ? `${capitalise(input.distinguishingFeature)}.` : '',
  ];

  return normalise(sentences.filter(Boolean).join(' '));
}

function capitalise(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) return trimmed;
  // Deliberately NOT locale-aware: this string is English and must render identically on
  // a Turkish-locale machine, where `'i'.toUpperCase()` would produce 'İ'.
  return trimmed[0]!.toUpperCase() + trimmed.slice(1);
}

/**
 * The anchor token. Upper-cased with the invariant locale for the same reason: a Turkish
 * default locale turns `i` into `İ`, which would silently change the canon — and therefore
 * the hash — depending on which machine rendered it.
 */
export function characterAnchor(name: string): string {
  return normalise(name)
    .replace(/[^\p{L}\p{N} '-]/gu, '')
    .toUpperCase()
    .slice(0, 40);
}

/** Freezes a rendered canon into the value the rest of the pipeline copies. */
export function freezeCharacterDna(
  input: CharacterDnaInput,
  hash: (value: string) => string,
): CharacterDna {
  const canonEn = renderCharacterDna(input);
  return { anchor: characterAnchor(input.name), canonEn, sha256: hash(canonEn) };
}

/** Rebuilds a `CharacterDna` around an already-frozen canon read back from the database. */
export function adoptCharacterDna(
  canonEn: string,
  hash: (value: string) => string,
): CharacterDna {
  const normalised = normalise(canonEn);
  return { anchor: anchorFromCanon(normalised), canonEn: normalised, sha256: hash(normalised) };
}

function anchorFromCanon(canonEn: string): string {
  const match = /^([^—.]+)—/u.exec(canonEn);
  return match ? match[1]!.trim() : canonEn.split(' ')[0] ?? '';
}

export class CharacterCanonDriftError extends Error {
  constructor(
    readonly storedSha256: string,
    readonly recomputedSha256: string,
  ) {
    super(
      'CHARACTER_DNA drift: the stored canon no longer matches what the current code ' +
        `renders (stored ${storedSha256.slice(0, 12)}, recomputed ${recomputedSha256.slice(0, 12)}). ` +
        'A frozen canon must never be re-rendered — reuse story_characters.canon_en verbatim.',
    );
    this.name = 'CharacterCanonDriftError';
  }
}

/**
 * The guard that makes "frozen" mean something. Call it whenever code is tempted to
 * re-render a canon it could have read: if this repo's rendering rules ever change,
 * existing books must keep their original description, not silently acquire a new one
 * halfway through their page set.
 */
export function assertCanonUnchanged(stored: CharacterDna, recomputed: CharacterDna): void {
  if (stored.sha256 !== recomputed.sha256) {
    throw new CharacterCanonDriftError(stored.sha256, recomputed.sha256);
  }
}

/* ── The photo ban, enforced in code ───────────────────────────────────────── */

/**
 * The only reference images that may ever reach a provider. All four are things WE
 * generated from a text description; none of them originates with the parent.
 */
export const ALLOWED_REFERENCE_KINDS: readonly ImageReferenceKind[] = [
  'style_plate',
  'character_sheet',
  'face_ref',
  'previous_page',
];

export class PhotoReferenceError extends Error {
  constructor(detail: string) {
    super(
      `refusing to send a non-generated reference to an image provider: ${detail}. ` +
        "KendiHikayem's promise is that a child's photograph is never used (SPEC §8.1).",
    );
    this.name = 'PhotoReferenceError';
  }
}

/**
 * Rejects any reference slot that is not one of the four generated kinds. Cheap, and it is
 * the difference between "we do not do that" and "we cannot do that".
 */
export function assertPhotoFreeReferences(references: readonly ImageReference[]): void {
  for (const reference of references) {
    if (!ALLOWED_REFERENCE_KINDS.includes(reference.kind)) {
      throw new PhotoReferenceError(`reference kind '${String(reference.kind)}'`);
    }
    if (reference.assetId.trim() === '' && reference.url === undefined) {
      throw new PhotoReferenceError(`reference '${reference.kind}' has neither assetId nor url`);
    }
  }
}
