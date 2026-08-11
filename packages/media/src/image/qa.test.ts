/**
 * ⭐ QA gate tests — and, for text detection, a CALIBRATION.
 *
 * The text check is a heuristic, so "it works" is not a boolean, it is a separation: how
 * far apart do rendered letterforms and deliberately busy artwork score? These tests render
 * both with sharp and assert the gap, so a future change that narrows it fails here instead
 * of shipping books with words drawn into the pictures.
 *
 * The artwork cases are ADVERSARIAL on purpose — hard-edged blobs, foliage, a picket fence,
 * horizontal stripes — because a real watercolour render is far smoother than any of them.
 * Passing on these is a stronger claim than passing on a pretty illustration.
 */

import { describe, expect, it } from 'vitest';
import sharp from 'sharp';

import { toRawPixels } from './engine';
import {
  DEFAULT_QA_THRESHOLDS,
  luminanceSpread,
  runImageQaGate,
  safeZoneBusyness,
  textArtifactScore,
} from './qa';

const EDGE = 1024;

/** Renders an SVG scene to PNG bytes — a real raster, not a synthetic pixel array. */
async function render(svgBody: string): Promise<Uint8Array> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${EDGE}" height="${EDGE}">${svgBody}</svg>`;
  return new Uint8Array(await sharp(Buffer.from(svg)).png().toBuffer());
}

async function grey(bytes: Uint8Array) {
  return toRawPixels(bytes, { maxEdgePx: 640, greyscale: true });
}

/* ── scenes ────────────────────────────────────────────────────────────────── */

const BACKDROP = '<rect width="1024" height="1024" fill="#EEE6D6"/>';

const scenes = {
  /** Two lines of Turkish text over an illustration — the exact failure SPEC §8.4 bans. */
  textTwoLines: `${BACKDROP}<circle cx="300" cy="300" r="180" fill="#C98B6B"/>
    <text x="80" y="760" font-family="DejaVu Sans" font-size="64" fill="#2b2b2b">Elif ve şirin kedisi</text>
    <text x="80" y="850" font-family="DejaVu Sans" font-size="64" fill="#2b2b2b">bahçede oynuyorlardı</text>`,

  /** Small caption text — the size a model most often sneaks in. */
  textSmall: `${BACKDROP}<text x="60" y="900" font-family="DejaVu Sans" font-size="34" fill="#333">bir varmış bir yokmuş uzak bir ülkede</text>`,

  /** A shop sign inside the scene: covers only a fraction of the frame width. */
  textSign: `<rect width="1024" height="1024" fill="#D9C7A8"/><circle cx="700" cy="700" r="220" fill="#8FA86F"/>
    <rect x="120" y="200" width="420" height="120" fill="#fff"/>
    <text x="140" y="285" font-family="DejaVu Sans" font-size="70" fill="#111">MARKET</text>`,

  /** A single small word in a corner — the hardest true positive. */
  textTiny: `<rect width="1024" height="1024" fill="#D9C7A8"/><text x="700" y="980" font-family="DejaVu Sans" font-size="22" fill="#444">kitap</text>`,

  /** 400 hard-edged blobs. Far busier than any watercolour render. */
  busyBlobs: `${BACKDROP}${Array.from({ length: 400 }, (_, i) => {
    const x = (i * 137) % 1024;
    const y = (i * 211) % 1024;
    return `<circle cx="${x}" cy="${y}" r="${8 + (i % 23)}" fill="hsl(${(i * 17) % 360} 45% 55%)" opacity="0.75"/>`;
  }).join('')}`,

  /** Dense foliage: the classic false-positive risk for edge-based text detection. */
  foliage: `${BACKDROP}${Array.from({ length: 900 }, (_, i) => {
    const x = (i * 97) % 1024;
    const y = (i * 61) % 1024;
    return `<ellipse cx="${x}" cy="${y}" rx="14" ry="6" transform="rotate(${(i * 23) % 180} ${x} ${y})" fill="hsl(${90 + (i % 40)} 40% ${35 + (i % 25)}%)"/>`;
  }).join('')}`,

  /** Horizontal stripes — banded like text lines, but with no glyph density. */
  stripes: `${BACKDROP}${Array.from({ length: 40 }, (_, i) => `<rect x="0" y="${i * 26}" width="1024" height="13" fill="#7a5c3e"/>`).join('')}`,

  /** A picket fence: many vertical strokes, the closest thing to letter stems. */
  fence: `${BACKDROP}${Array.from({ length: 30 }, (_, i) => `<rect x="${i * 34}" y="600" width="16" height="300" fill="#8a6a45"/>`).join('')}`,

  /** A field of grass blades. */
  grass: `${BACKDROP}${Array.from({ length: 1500 }, (_, i) => {
    const x = (i * 41) % 1024;
    const y = 500 + ((i * 97) % 520);
    return `<path d="M ${x} ${y} l 3 -22" stroke="hsl(${95 + (i % 25)} 45% 40%)" stroke-width="3" fill="none"/>`;
  }).join('')}`,

  /** A soft, smooth watercolour-ish frame — what a good render looks like. */
  smooth: `<defs><radialGradient id="g"><stop offset="0%" stop-color="#F3E3CE"/><stop offset="100%" stop-color="#9C7B5B"/></radialGradient></defs>
    <rect width="1024" height="1024" fill="url(#g)"/><circle cx="512" cy="620" r="260" fill="#B98F6A" opacity="0.8"/>`,
};

const TEXT_SCENES = ['textTwoLines', 'textSmall', 'textSign', 'textTiny'] as const;
const CLEAN_SCENES = ['busyBlobs', 'foliage', 'stripes', 'fence', 'grass', 'smooth'] as const;

/* ── text detection ────────────────────────────────────────────────────────── */

describe('textArtifactScore', () => {
  it.each(TEXT_SCENES)('flags rendered text: %s', async (name) => {
    const score = textArtifactScore(await grey(await render(scenes[name])));
    expect(score).toBeGreaterThan(DEFAULT_QA_THRESHOLDS.textScoreMax);
  });

  it.each(CLEAN_SCENES)('does not flag artwork: %s', async (name) => {
    const score = textArtifactScore(await grey(await render(scenes[name])));
    expect(score).toBeLessThan(DEFAULT_QA_THRESHOLDS.textScoreMax);
  });

  it('keeps a real margin between the two populations', async () => {
    // The calibration this threshold is derived from. A change that narrows the gap
    // below 0.15 fails here, where it is cheap, instead of in a parent's book.
    const textScores = await Promise.all(
      TEXT_SCENES.map(async (name) => textArtifactScore(await grey(await render(scenes[name])))),
    );
    const cleanScores = await Promise.all(
      CLEAN_SCENES.map(async (name) => textArtifactScore(await grey(await render(scenes[name])))),
    );

    const worstText = Math.min(...textScores);
    const worstClean = Math.max(...cleanScores);
    expect(worstText - worstClean).toBeGreaterThan(0.15);
    expect(DEFAULT_QA_THRESHOLDS.textScoreMax).toBeGreaterThan(worstClean);
    expect(DEFAULT_QA_THRESHOLDS.textScoreMax).toBeLessThan(worstText);
  });
});

/* ── other pixel checks ────────────────────────────────────────────────────── */

describe('safeZoneBusyness', () => {
  it('reports a quiet reserved zone as below parity', async () => {
    const busy = `${BACKDROP}${Array.from({ length: 300 }, (_, i) => `<circle cx="${(i * 71) % 1024}" cy="${(i * 37) % 700}" r="12" fill="#8a6a45"/>`).join('')}`;
    const score = safeZoneBusyness(await grey(await render(busy)), 'bottom');
    expect(score).toBeLessThan(1);
  });

  it('catches detail crowding into the area reserved for text', async () => {
    const crowded = `${BACKDROP}${Array.from({ length: 600 }, (_, i) => `<rect x="${(i * 67) % 1024}" y="${780 + ((i * 29) % 240)}" width="9" height="9" fill="hsl(${(i * 13) % 360} 60% 40%)"/>`).join('')}`;
    const score = safeZoneBusyness(await grey(await render(crowded)), 'bottom');
    expect(score).toBeGreaterThan(1 + DEFAULT_QA_THRESHOLDS.safeZoneMax);
  });
});

describe('luminanceSpread', () => {
  it('is near zero for a solid frame and clearly positive for artwork', async () => {
    const flat = await grey(await render('<rect width="1024" height="1024" fill="#C9B79A"/>'));
    const art = await grey(await render(scenes.smooth));
    expect(luminanceSpread(flat)).toBeLessThan(0.02);
    expect(luminanceSpread(art)).toBeGreaterThan(0.02);
  });
});

/* ── the gate ──────────────────────────────────────────────────────────────── */

describe('runImageQaGate', () => {
  const plate = () => render(scenes.smooth);

  it('passes a clean render', async () => {
    const result = await runImageQaGate({
      image: await render(scenes.smooth),
      stylePlate: await plate(),
      textSafeZone: 'bottom',
      expectedAspectRatio: 1,
    });
    expect(result.passed).toBe(true);
    expect(result.failedChecks).toEqual([]);
    expect(result.imageQa.textScore).toBeDefined();
    expect(result.imageQa.paletteDeltaE).toBeLessThan(DEFAULT_QA_THRESHOLDS.paletteDeltaEMax);
  });

  it('fails a render with text and names the check the retry must address', async () => {
    const result = await runImageQaGate({
      image: await render(scenes.textTwoLines),
      textSafeZone: 'bottom',
    });
    expect(result.passed).toBe(false);
    // The id is exactly what the prompt builder's hardening block keys on.
    expect(result.failedChecks).toContain('text_leak');
  });

  it('fails a palette that drifted away from the style plate', async () => {
    // A cold blue-green render against a warm ochre plate: the drift SPEC §8.3 measures.
    const cold = await render(
      '<rect width="1024" height="1024" fill="#12406B"/><circle cx="512" cy="512" r="300" fill="#1F7A6B"/>',
    );
    const result = await runImageQaGate({ image: cold, stylePlate: await plate() });
    expect(result.failedChecks).toContain('palette_drift');
    expect(result.imageQa.paletteDeltaE).toBeGreaterThan(20);
  });

  it('passes the same image against its own palette', async () => {
    const image = await render(scenes.smooth);
    const result = await runImageQaGate({ image, stylePlate: image });
    expect(result.imageQa.paletteDeltaE).toBeLessThan(1);
  });

  it('fails a blank frame', async () => {
    const result = await runImageQaGate({
      image: await render('<rect width="1024" height="1024" fill="#CCCCCC"/>'),
    });
    expect(result.failedChecks).toContain('blank_frame');
  });

  it('fails the wrong aspect ratio', async () => {
    const wide = new Uint8Array(
      await sharp({ create: { width: 1024, height: 512, channels: 3, background: '#C98B6B' } })
        .png()
        .toBuffer(),
    );
    const result = await runImageQaGate({ image: wide, expectedAspectRatio: 1 });
    expect(result.failedChecks).toContain('dimensions');
  });

  it('turns a provider refusal into a failed check without touching pixels', async () => {
    const result = await runImageQaGate({
      image: new Uint8Array(0),
      providerBlockedReason: 'finish_reason:IMAGE_SAFETY',
    });
    expect(result.failedChecks).toEqual(['provider_block']);
  });

  it('fails a payload that is not an image at all', async () => {
    const result = await runImageQaGate({ image: new Uint8Array([1, 2, 3, 4]) });
    expect(result.passed).toBe(false);
    expect(result.failedChecks).toContain('dimensions');
  });

  it('records identity as UNAVAILABLE rather than inventing a pass', async () => {
    const image = await render(scenes.smooth);
    const result = await runImageQaGate({ image, faceRef: image });

    // The honest outcome with no face-embedding backend: not a pass, not a failure —
    // a recorded gap. Anything else would put a fabricated cosine in the audit trail.
    expect(result.checks.find((c) => c.id === 'identity')?.status).toBe('unavailable');
    expect(result.imageQa.unavailableChecks).toContain('identity');
    expect(result.passed).toBe(true);
  });

  it('blocks on an unavailable check when IMAGE_QA_STRICT is on', async () => {
    const image = await render(scenes.smooth);
    const result = await runImageQaGate({
      image,
      faceRef: image,
      thresholds: { strict: true },
    });
    expect(result.passed).toBe(false);
    expect(result.failedChecks).toContain('identity');
  });

  it('uses a supplied identity scorer when one exists', async () => {
    const image = await render(scenes.smooth);
    const result = await runImageQaGate({
      image,
      faceRef: image,
      identityScorer: { async score() { return 0.41; } },
    });
    expect(result.failedChecks).toContain('identity');
    expect(result.imageQa.identityCosine).toBe(0.41);
  });
});
