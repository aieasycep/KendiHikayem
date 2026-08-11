/**
 * image/prompt/builder.ts — assembles the four prompt kinds the pipeline renders.
 *
 * ⭐ THE CONSISTENCY CONTRACT, in one place:
 *
 *   1. Every page prompt is built from the SAME TEMPLATE with the SAME SECTION ORDER.
 *      Only the SCENE block differs between page 1 and page 12. Everything the model uses
 *      to decide what the child looks like is byte-identical across the book.
 *   2. `CHARACTER_DNA` and `STYLE_DNA` are pasted verbatim. This module never rewrites,
 *      shortens or "improves" them — `auditIllustrationPrompt()` fails the prompt if it did.
 *   3. Reference slots are emitted in a FIXED ORDER (SPEC §8.1 ③):
 *        character_sheet → face_ref → style_plate → previous_page
 *      Providers weight reference images by position; shuffling the order between pages is
 *      the same class of mistake as paraphrasing the description.
 *   4. The mandatory negative suffix ("no text, no letters …") is appended by construction,
 *      not by the caller remembering to.
 *
 * Nothing here talks to a network, so every property above is a unit test rather than a
 * hope — see `builder.test.ts` and `consistency.test.ts`.
 */

import type { ImageReference, ImageReferenceKind } from '../../core/adapters';
import type { CharacterDna } from './character-dna';
import { assertPhotoFreeReferences } from './character-dna';
import { composeNegativePrompt, type StyleDna } from './style-dna';

/** Where the typeset Turkish text will sit; the illustrator must leave it quiet. */
export type TextSafeZone = 'bottom' | 'top' | 'left' | 'right';

/** `story_pages.emotion` — mirrors PAGE_EMOTION in packages/db. */
export type PageEmotion = string;

/** The scene breakdown stage 2 produced for one page (SPEC §8.2 step 0). */
export interface PageScene {
  pageNo: number;
  /** ENGLISH. Every model is measurably better with English image prompts. */
  sceneEn: string;
  emotion?: PageEmotion;
  timeOfDay?: string;
  camera?: string;
  textSafeZone: TextSafeZone;
}

export interface PagePromptInput {
  character: CharacterDna;
  /** Supporting cast, each with its own frozen canon. Same verbatim rule applies. */
  supportingCharacters?: readonly CharacterDna[];
  style: StyleDna;
  scene: PageScene;
  /** Bumped by the QA loop; each level adds an explicit corrective instruction. */
  hardening?: PromptHardening;
}

/**
 * What a QA failure adds to the retry prompt. Not a different prompt — the SAME prompt
 * with an appended, targeted correction, so the retry stays conditioned on the same
 * identity tokens (SPEC §8.2 step 5: "retry, prompt sertleştirilerek").
 */
export interface PromptHardening {
  attempt: number;
  /** QA check ids that failed on the previous attempt. */
  failedChecks: readonly string[];
}

const SAFE_ZONE_PHRASE: Record<TextSafeZone, string> = {
  bottom: 'the bottom third of the frame',
  top: 'the top third of the frame',
  left: 'the left third of the frame',
  right: 'the right third of the frame',
};

/**
 * Corrective instructions per QA check. English, imperative, specific — a generic "try
 * harder" changes nothing about the sample.
 */
const HARDENING_BY_CHECK: Record<string, string> = {
  text_leak:
    'CRITICAL: the previous attempt contained letterforms. Render absolutely no text, ' +
    'no letters, no numbers and no signage anywhere in the image, including on books, ' +
    'signs, packaging and clothing.',
  palette_drift:
    'CRITICAL: the previous attempt drifted from the style. Match the colour palette and ' +
    'the painting technique of the style reference image exactly.',
  safe_zone:
    'CRITICAL: keep the reserved text area simple, low-contrast and free of important ' +
    'detail — the previous attempt filled it with busy content.',
  identity:
    'CRITICAL: the character did not match the reference sheet. Reproduce the face, hair ' +
    'and outfit from the character sheet exactly, feature by feature.',
  provider_block:
    'Render a gentle, calm, entirely child-appropriate scene with no frightening elements.',
  dimensions:
    'Render the full frame at the requested aspect ratio with no borders or padding.',
  blank_frame:
    'Render a complete, detailed illustration filling the frame — the previous attempt ' +
    'was nearly empty.',
};

/** Deduped, ordered hardening lines so the retry prompt is deterministic. */
function hardeningLines(hardening: PromptHardening | undefined): string[] {
  if (!hardening || hardening.failedChecks.length === 0) return [];
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const check of [...hardening.failedChecks].sort()) {
    const line = HARDENING_BY_CHECK[check];
    if (line && !seen.has(line)) {
      seen.add(line);
      lines.push(line);
    }
  }
  return lines;
}

function section(label: string, body: string): string {
  return `${label}: ${body.trim().replace(/\s+/gu, ' ')}`;
}

/**
 * ⭐ The page prompt. Sections in a fixed order; only SCENE varies across the book.
 */
export function buildPagePrompt(input: PagePromptInput): string {
  const { character, style, scene } = input;
  const supporting = input.supportingCharacters ?? [];

  const sceneBits = [
    scene.sceneEn,
    scene.timeOfDay ? `Time of day: ${scene.timeOfDay}.` : '',
    scene.emotion ? `${character.anchor} feels ${scene.emotion}.` : '',
    scene.camera ? `Camera: ${scene.camera}.` : '',
  ]
    .filter(Boolean)
    .join(' ');

  const parts = [
    section('STYLE', style.styleDnaEn),
    section('CHARACTER', character.canonEn),
    ...supporting.map((extra) => section('SUPPORTING CHARACTER', extra.canonEn)),
    section('SCENE', sceneBits),
    section(
      'COMPOSITION',
      `Single illustration, no panels, no borders. Leave ${SAFE_ZONE_PHRASE[scene.textSafeZone]} ` +
        'calm and uncluttered so typeset text can be placed there later.',
    ),
    section(
      'CONSISTENCY',
      `${character.anchor} must match the attached character sheet exactly: same face, ` +
        'same hair, same clothing, same proportions. Match the attached style reference ' +
        'for palette, technique and texture.',
    ),
    section('NEGATIVE', composeNegativePrompt(style)),
    ...hardeningLines(input.hardening),
  ];

  return parts.join('\n');
}

export interface CoverPromptInput extends Omit<PagePromptInput, 'scene'> {
  /** The cover's own scene beat, produced alongside the page scenes. */
  scene: Omit<PageScene, 'pageNo'>;
}

/**
 * The cover. Same skeleton as a page — deliberately, so the cover child is the same child.
 * The title is NOT drawn: it is overlaid as a vector layer (SPEC §8.4).
 */
export function buildCoverPrompt(input: CoverPromptInput): string {
  const prompt = buildPagePrompt({
    ...input,
    scene: { ...input.scene, pageNo: 0 },
  });
  return `${prompt}\nCOVER: Full-bleed cover illustration. Leave clear space at the top for a title that will be added later as text — do NOT draw the title.`;
}

export interface StylePlatePromptInput {
  style: StyleDna;
  /** A location from the story, so the plate anchors this book's world, not a generic one. */
  settingEn: string;
}

/**
 * The style plate (SPEC §8.2 step 2). Character-free ON PURPOSE: it fixes palette,
 * technique and texture without contributing any face for the page renders to average in.
 */
export function buildStylePlatePrompt(input: StylePlatePromptInput): string {
  return [
    section('STYLE', input.style.styleDnaEn),
    section('SCENE', input.settingEn),
    section(
      'CONTENT',
      'Empty environment only. No characters, no people, no animals, no faces, no hands.',
    ),
    section(
      'PURPOSE',
      'This is a style reference plate: show the palette, brushwork and texture clearly ' +
        'across the whole frame.',
    ),
    section('NEGATIVE', composeNegativePrompt(input.style, 'people, characters, animals, faces')),
  ].join('\n');
}

export interface CharacterSheetPromptInput {
  character: CharacterDna;
  style: StyleDna;
  /** 1..3 — the three variants the parent chooses between (SPEC §8.1 ④). */
  variant: number;
}

/**
 * The character sheet (SPEC §8.2 step 3): the artefact every later page is conditioned on.
 *
 * The rigid LAYOUT / BACKGROUND / LIGHTING block is not decoration. A model sheet on a
 * flat neutral ground with even light is what makes the face crop (`face_ref`) usable and
 * keeps the sheet from smuggling a background, a light direction or a mood into all twelve
 * pages. The three views plus four expressions give the page renders a full identity
 * envelope instead of one frozen pose.
 */
export function buildCharacterSheetPrompt(input: CharacterSheetPromptInput): string {
  const { character, style } = input;
  return [
    section('STYLE', style.styleDnaEn),
    section('CHARACTER', character.canonEn),
    section(
      'LAYOUT',
      'Character model sheet. Top row: the same character full-body from the front, ' +
        'three-quarter and side view, all at identical scale and identical proportions. ' +
        'Bottom row: four head close-ups showing happy, curious, surprised and sleepy.',
    ),
    section('BACKGROUND', 'Plain flat #EDEDED background. No props, no scenery, no shadows.'),
    section('LIGHTING', 'Even, soft, frontal lighting. No dramatic shadows, no rim light.'),
    section(
      'CONSISTENCY',
      'Every view and every close-up must be the SAME character with identical hair, ' +
        'identical clothing and identical facial features.',
    ),
    section('NEGATIVE', composeNegativePrompt(style, 'background scenery, props, multiple characters')),
  ].join('\n');
}

/* ── Reference slots ───────────────────────────────────────────────────────── */

/**
 * THE FIXED ORDER (SPEC §8.1 ③). Exported so tests can assert it rather than trusting a
 * comment: providers weight references by position, so a shuffled order between pages is
 * an unforced consistency loss.
 */
export const REFERENCE_SLOT_ORDER: readonly ImageReferenceKind[] = [
  'character_sheet',
  'face_ref',
  'style_plate',
  'previous_page',
];

export interface ReferenceSlotInput {
  characterSheetAssetId?: string;
  faceRefAssetId?: string;
  stylePlateAssetId?: string;
  /** Narrative continuity: page n−1 keeps lighting and location from jumping. */
  previousPageAssetId?: string;
}

/**
 * Builds the reference list in the canonical order, dropping empty slots. Runs the photo
 * ban on the way out, so no caller can hand a provider something we did not draw.
 */
export function buildReferences(input: ReferenceSlotInput): ImageReference[] {
  const byKind: Partial<Record<ImageReferenceKind, string | undefined>> = {
    character_sheet: input.characterSheetAssetId,
    face_ref: input.faceRefAssetId,
    style_plate: input.stylePlateAssetId,
    previous_page: input.previousPageAssetId,
  };

  const references = REFERENCE_SLOT_ORDER.flatMap((kind) => {
    const assetId = byKind[kind];
    return assetId && assetId.trim() !== '' ? [{ kind, assetId }] : [];
  });

  assertPhotoFreeReferences(references);
  return references;
}
