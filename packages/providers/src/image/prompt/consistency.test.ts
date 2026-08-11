/**
 * ⭐ The character-consistency test.
 *
 * This is the file that says what "the same child on twelve pages" means MECHANICALLY.
 * Character consistency ultimately depends on the model, and no test here can prove the
 * rendered faces match — that needs a key and human eyes (SPEC §14 R3). What CAN be proven
 * without a vendor, and is proven here, is that every input we control is identical across
 * the book:
 *
 *   · the canon appears byte for byte in all thirteen prompts,
 *   · the reference images are the same assets in the same order,
 *   · the only thing that differs between page 1 and page 12 is the SCENE block,
 *   · a paraphrased canon is a hard failure, not a warning.
 *
 * If this suite passes and the faces still drift, the cause is the model — which is
 * exactly the diagnosis we want to be able to make.
 */

import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  adoptCharacterDna,
  assertCanonUnchanged,
  CharacterCanonDriftError,
  freezeCharacterDna,
  PhotoReferenceError,
  assertPhotoFreeReferences,
  renderCharacterDna,
  type CharacterDnaInput,
} from './character-dna';
import { buildCoverPrompt, buildPagePrompt, buildReferences, REFERENCE_SLOT_ORDER } from './builder';
import { auditIllustrationPrompt } from './audit';
import type { StyleDna } from './style-dna';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');

const ELIF: CharacterDnaInput = {
  name: 'Elif',
  ageYears: 6,
  presentation: 'girl',
  skin: 'warm olive skin',
  hairColour: 'dark brown hair',
  hairType: 'wavy hair',
  hairLength: 'shoulder-length hair',
  eyes: 'warm brown eyes',
  freckles: 'freckles across the nose',
  outfit: 'yellow dungarees over a white tee',
  shoes: 'blue canvas sneakers',
  companion: 'a small worn teddy bear',
  distinguishingFeature: 'a small gap between the front teeth when smiling',
};

const STYLE: StyleDna = {
  code: 'suluboya',
  styleDnaEn:
    'soft watercolour children book illustration, visible paper grain, wet-on-wet bleeding ' +
    'edges, muted warm palette of ochre, dusty rose and sage',
  negativePromptEn: 'photorealistic, 3d render, harsh contrast',
};

const REFS = {
  characterSheetAssetId: 'sheet-1',
  faceRefAssetId: 'face-1',
  stylePlateAssetId: 'plate-1',
};

/** The twelve interior scenes plus the cover — a whole book's worth of prompts. */
function bookPrompts(): string[] {
  const character = freezeCharacterDna(ELIF, hash);
  const pages = Array.from({ length: 12 }, (_, index) =>
    buildPagePrompt({
      character,
      style: STYLE,
      scene: {
        pageNo: index + 1,
        sceneEn: `Scene ${index + 1}: the hero walks through a different part of the garden.`,
        emotion: 'curious',
        timeOfDay: 'late afternoon',
        camera: 'medium shot',
        textSafeZone: 'bottom',
      },
    }),
  );
  const cover = buildCoverPrompt({
    character,
    style: STYLE,
    scene: {
      sceneEn: 'The hero stands at the garden gate looking towards the reader.',
      textSafeZone: 'top',
    },
  });
  return [...pages, cover];
}

describe('CHARACTER_DNA', () => {
  it('renders a deterministic canonical description', () => {
    expect(renderCharacterDna(ELIF)).toBe(renderCharacterDna({ ...ELIF }));
    expect(renderCharacterDna(ELIF)).toMatchInlineSnapshot(
      `"ELIF — a 6-year-old girl. Shoulder-length wavy dark brown hair. Warm brown eyes. Warm olive skin. Freckles across the nose. Always wears yellow dungarees over a white tee and blue canvas sneakers. Always carries a small worn teddy bear. A small gap between the front teeth when smiling."`,
    );
  });

  it('upper-cases the anchor with the invariant locale, not the Turkish one', () => {
    // On a tr-TR machine `'i'.toLocaleUpperCase()` is 'İ'. If that leaked in, the canon —
    // and therefore its hash, and therefore every cached page — would depend on the
    // server's locale.
    expect(freezeCharacterDna({ ...ELIF, name: 'ilke' }, hash).anchor).toBe('ILKE');
  });

  it('drops optional traits instead of emitting empty clauses', () => {
    const canon = renderCharacterDna({
      ...ELIF,
      freckles: undefined as unknown as string,
      companion: undefined as unknown as string,
      distinguishingFeature: undefined as unknown as string,
      shoes: undefined as unknown as string,
    });
    expect(canon).not.toContain('undefined');
    expect(canon).not.toContain('Always carries');
    expect(canon.endsWith('.')).toBe(true);
  });

  it('detects drift when a frozen canon is re-rendered by changed code', () => {
    const stored = freezeCharacterDna(ELIF, hash);
    const rerendered = freezeCharacterDna({ ...ELIF, hairColour: 'auburn hair' }, hash);
    expect(() => assertCanonUnchanged(stored, rerendered)).toThrow(CharacterCanonDriftError);
  });

  it('adopts a canon read back from the database without re-rendering it', () => {
    const stored = freezeCharacterDna(ELIF, hash);
    const adopted = adoptCharacterDna(stored.canonEn, hash);
    expect(adopted.sha256).toBe(stored.sha256);
    expect(adopted.anchor).toBe('ELIF');
  });
});

describe('the photo ban', () => {
  it('accepts only the four generated reference kinds', () => {
    expect(() =>
      assertPhotoFreeReferences([{ kind: 'character_sheet', assetId: 'a' }]),
    ).not.toThrow();
    expect(() =>
      assertPhotoFreeReferences([
        // A kind that does not exist in the contract — e.g. someone adding 'child_photo'.
        { kind: 'child_photo' as never, assetId: 'a' },
      ]),
    ).toThrow(PhotoReferenceError);
  });

  it('rejects a reference with no resolvable source', () => {
    expect(() => assertPhotoFreeReferences([{ kind: 'face_ref', assetId: '  ' }])).toThrow(
      PhotoReferenceError,
    );
  });

  it('refuses a prompt that asks for a photographic likeness', () => {
    const character = freezeCharacterDna(ELIF, hash);
    const prompt = `${buildPagePrompt({
      character,
      style: STYLE,
      scene: { pageNo: 1, sceneEn: 'A garden.', textSafeZone: 'bottom' },
    })}\nUse the uploaded photo of the child as the face reference.`;

    const result = auditIllustrationPrompt({
      promptEn: prompt,
      character,
      artStyleCode: STYLE.code,
      knownArtStyleCodes: [STYLE.code],
    });
    expect(result.ok).toBe(false);
    expect(result.issues.map((i) => i.finding)).toContain('photo_reference');
  });
});

describe('a whole book of prompts', () => {
  it('carries the canon verbatim in all thirteen', () => {
    const character = freezeCharacterDna(ELIF, hash);
    const prompts = bookPrompts();
    expect(prompts).toHaveLength(13);
    for (const prompt of prompts) {
      expect(prompt).toContain(character.canonEn);
    }
  });

  it('differs between pages ONLY in the scene block', () => {
    const withoutScene = (prompt: string) =>
      prompt
        .split('\n')
        .filter((line) => !line.startsWith('SCENE:') && !line.startsWith('COVER:'))
        .join('\n');

    const prompts = bookPrompts();
    const baseline = withoutScene(prompts[0]!);
    for (const prompt of prompts.slice(0, 12)) {
      // Every identity-bearing line is byte-identical across the book. That is the
      // mechanism: identical token prefixes condition the model identically.
      expect(withoutScene(prompt)).toBe(baseline);
    }
  });

  it('passes the K5 audit on every page', () => {
    const character = freezeCharacterDna(ELIF, hash);
    for (const prompt of bookPrompts()) {
      const result = auditIllustrationPrompt({
        promptEn: prompt,
        character,
        artStyleCode: STYLE.code,
        knownArtStyleCodes: [STYLE.code, 'duz_vektor'],
      });
      expect(result.issues).toEqual([]);
    }
  });

  it('fails the audit when the canon is paraphrased instead of copied', () => {
    const character = freezeCharacterDna(ELIF, hash);
    // The realistic failure: an LLM "improves" the description on page 7.
    const paraphrased = buildPagePrompt({
      character: { ...character, canonEn: character.canonEn.replace('dark brown', 'brown') },
      style: STYLE,
      scene: { pageNo: 7, sceneEn: 'A garden at dusk.', textSafeZone: 'bottom' },
    });

    const result = auditIllustrationPrompt({
      promptEn: paraphrased,
      character,
      artStyleCode: STYLE.code,
      knownArtStyleCodes: [STYLE.code],
    });
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.finding).toBe('canon_missing');
  });

  it('always ends with the mandatory no-text negative', () => {
    for (const prompt of bookPrompts()) {
      expect(prompt).toContain('no text, no letters, no words');
    }
  });

  it('appends a targeted correction on a QA retry without changing the identity block', () => {
    const character = freezeCharacterDna(ELIF, hash);
    const scene = { pageNo: 3, sceneEn: 'A garden.', textSafeZone: 'bottom' as const };
    const first = buildPagePrompt({ character, style: STYLE, scene });
    const retry = buildPagePrompt({
      character,
      style: STYLE,
      scene,
      hardening: { attempt: 2, failedChecks: ['text_leak'] },
    });

    expect(retry.startsWith(first)).toBe(true);
    expect(retry).toContain('the previous attempt contained letterforms');
    expect(retry).toContain(character.canonEn);
  });

  it('orders hardening lines deterministically regardless of failure order', () => {
    const character = freezeCharacterDna(ELIF, hash);
    const scene = { pageNo: 3, sceneEn: 'A garden.', textSafeZone: 'bottom' as const };
    const a = buildPagePrompt({
      character,
      style: STYLE,
      scene,
      hardening: { attempt: 2, failedChecks: ['text_leak', 'palette_drift'] },
    });
    const b = buildPagePrompt({
      character,
      style: STYLE,
      scene,
      hardening: { attempt: 2, failedChecks: ['palette_drift', 'text_leak'] },
    });
    // Same failures ⇒ same prompt ⇒ same content-cache key.
    expect(a).toBe(b);
  });
});

describe('reference slots', () => {
  it('emits the fixed order from SPEC §8.1 ③', () => {
    const references = buildReferences({ ...REFS, previousPageAssetId: 'page-6' });
    expect(references.map((r) => r.kind)).toEqual([...REFERENCE_SLOT_ORDER]);
  });

  it('keeps the order stable when an optional slot is missing', () => {
    const references = buildReferences(REFS);
    expect(references.map((r) => r.kind)).toEqual(['character_sheet', 'face_ref', 'style_plate']);
  });

  it('produces identical reference lists for every page of a book', () => {
    const first = buildReferences(REFS);
    const twelfth = buildReferences(REFS);
    expect(twelfth).toEqual(first);
  });
});
