/**
 * K5 audit tests — the gate that decides whether a prompt is allowed to cost money.
 */

import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { assertIllustrationPrompt, auditIllustrationPrompt, PromptAuditError } from './audit';
import { freezeCharacterDna, type CharacterDnaInput } from './character-dna';
import { NO_TEXT_NEGATIVE_EN } from './style-dna';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');

const INPUT: CharacterDnaInput = {
  name: 'Deniz',
  ageYears: 5,
  presentation: 'child',
  skin: 'fair skin',
  hairColour: 'black hair',
  hairType: 'curly hair',
  hairLength: 'short hair',
  eyes: 'hazel eyes',
  outfit: 'blue tracksuit with a star on the chest',
};

const CANON = freezeCharacterDna(INPUT, hash);

/** A minimal prompt that passes everything, so each test changes exactly one thing. */
function goodPrompt(extra = ''): string {
  return [
    'STYLE: soft watercolour children book illustration with visible paper grain',
    `CHARACTER: ${CANON.canonEn}`,
    'SCENE: The hero stands beside a wooden garden gate at sunset.',
    `NEGATIVE: ${NO_TEXT_NEGATIVE_EN}`,
    extra,
  ]
    .filter(Boolean)
    .join('\n');
}

const BASE = { character: CANON, artStyleCode: 'suluboya', knownArtStyleCodes: ['suluboya'] };

describe('auditIllustrationPrompt', () => {
  it('passes a well-formed prompt', () => {
    expect(auditIllustrationPrompt({ promptEn: goodPrompt(), ...BASE })).toEqual({
      ok: true,
      issues: [],
    });
  });

  it('rejects an art style that is not in the catalogue', () => {
    const result = auditIllustrationPrompt({
      promptEn: goodPrompt(),
      character: CANON,
      artStyleCode: 'ebeveynin-yazdigi-uslup',
      knownArtStyleCodes: ['suluboya', 'duz_vektor'],
    });
    expect(result.issues.map((i) => i.finding)).toEqual(['unknown_art_style']);
  });

  it('rejects the mandatory no-text fragment being dropped', () => {
    const result = auditIllustrationPrompt({
      promptEn: goodPrompt().replace(`NEGATIVE: ${NO_TEXT_NEGATIVE_EN}`, 'NEGATIVE: blurry'),
      ...BASE,
    });
    expect(result.issues.map((i) => i.finding)).toContain('no_text_suffix_missing');
  });

  it.each([
    ['a Turkish TV franchise', 'SCENE: The hero meets the Rafadan Tayfa gang in the street.'],
    ['a global studio', 'SCENE: Drawn in the style of Disney animation.'],
    ['a case variant', 'SCENE: rendered like PIXAR films.'],
    ['a diacritic variant', 'SCENE: The hero visits Keloğlan in his village.'],
  ])('rejects %s', (_label, line) => {
    const result = auditIllustrationPrompt({ promptEn: goodPrompt(line), ...BASE });
    expect(result.issues.map((i) => i.finding)).toContain('denylisted_term');
  });

  it('does not fire on an innocent word that merely contains a denylisted one', () => {
    // 'legoland' / 'marvellous' must not trip a word-boundary matcher.
    const result = auditIllustrationPrompt({
      promptEn: goodPrompt('SCENE: A marvellous afternoon in a legoland-shaped cloud.'),
      ...BASE,
    });
    expect(result.issues.map((i) => i.finding)).not.toContain('denylisted_term');
  });

  it('flags untranslated Turkish scene text', () => {
    const result = auditIllustrationPrompt({
      promptEn: goodPrompt('SCENE: Küçük bir çocuk ve annesi ormanda yürüyor.'),
      ...BASE,
    });
    expect(result.issues.map((i) => i.finding)).toContain('not_english');
  });

  it('does not flag a Turkish proper noun in an English sentence', () => {
    const result = auditIllustrationPrompt({
      promptEn: goodPrompt('SCENE: The hero walks with Doğa towards the old bridge.'),
      ...BASE,
    });
    expect(result.issues.map((i) => i.finding)).not.toContain('not_english');
  });

  it('rejects an empty prompt and a runaway one', () => {
    expect(
      auditIllustrationPrompt({ promptEn: 'draw it', ...BASE }).issues.map((i) => i.finding),
    ).toContain('length_out_of_bounds');
    expect(
      auditIllustrationPrompt({
        promptEn: goodPrompt(`SCENE: ${'a very detailed description '.repeat(400)}`),
        ...BASE,
      }).issues.map((i) => i.finding),
    ).toContain('length_out_of_bounds');
  });

  it('reports EVERY issue at once, not just the first', () => {
    const result = auditIllustrationPrompt({
      promptEn: 'SCENE: Disney style, with a photo of the child.',
      character: CANON,
      artStyleCode: 'yok-boyle-bir-uslup',
      knownArtStyleCodes: ['suluboya'],
    });
    const findings = new Set(result.issues.map((i) => i.finding));
    expect(findings).toContain('unknown_art_style');
    expect(findings).toContain('canon_missing');
    expect(findings).toContain('denylisted_term');
    expect(findings).toContain('no_text_suffix_missing');
    expect(findings).toContain('photo_reference');
  });

  it('does not require a canon for a style-plate prompt', () => {
    const result = auditIllustrationPrompt({
      promptEn: [
        'STYLE: soft watercolour children book illustration',
        'SCENE: An empty attic at dusk with dust motes in the light.',
        'CONTENT: No characters, no people, no animals.',
        `NEGATIVE: ${NO_TEXT_NEGATIVE_EN}`,
      ].join('\n'),
      artStyleCode: 'suluboya',
      knownArtStyleCodes: ['suluboya'],
    });
    expect(result.ok).toBe(true);
  });

  it('throws with all findings in the message when asserted', () => {
    expect(() =>
      assertIllustrationPrompt({
        promptEn: 'draw a Disney princess',
        artStyleCode: 'suluboya',
        knownArtStyleCodes: ['suluboya'],
      }),
    ).toThrow(PromptAuditError);
  });
});
