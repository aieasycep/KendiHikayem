/**
 * Colour maths tests.
 *
 * CIEDE2000 is notoriously easy to implement almost-right — the hue-difference wraparound
 * and the rotation term have signs that a plausible-looking implementation gets backwards,
 * and the result still looks reasonable on similar colours while being wrong exactly where
 * the palette gate needs it. So it is pinned against Sharma, Wu & Dalal's published
 * verification pairs.
 */

import { describe, expect, it } from 'vitest';

import { deltaE2000, dominantPalette, paletteDistance, rgbToLab } from './color';

describe('deltaE2000', () => {
  it('is zero for identical colours', () => {
    expect(deltaE2000({ l: 50, a: 2.6772, b: -79.7751 }, { l: 50, a: 2.6772, b: -79.7751 })).toBe(0);
  });

  it.each([
    // [lab1, lab2, expected] — from the CIEDE2000 verification data set.
    [{ l: 50, a: 2.6772, b: -79.7751 }, { l: 50, a: 0, b: -82.7485 }, 2.0425],
    [{ l: 50, a: 3.1571, b: -77.2803 }, { l: 50, a: 0, b: -82.7485 }, 2.8615],
    [{ l: 50, a: -1.3802, b: -84.2814 }, { l: 50, a: 0, b: -82.7485 }, 1.0],
    [{ l: 50, a: 2.5, b: 0 }, { l: 50, a: 0, b: -2.5 }, 4.3065],
    [{ l: 60.2574, a: -34.0099, b: 36.2677 }, { l: 60.4626, a: -34.1751, b: 39.4387 }, 1.2644],
    [{ l: 22.7233, a: 20.0904, b: -46.694 }, { l: 23.0331, a: 14.973, b: -42.5619 }, 2.0373],
  ])('matches the reference value for pair %#', (one, two, expected) => {
    expect(deltaE2000(one, two)).toBeCloseTo(expected, 3);
  });

  it('rates a hue shift as a large distance and a shade shift as a small one', () => {
    const ochre = rgbToLab({ r: 204, g: 153, b: 92 });
    const slightlyDarkerOchre = rgbToLab({ r: 190, g: 142, b: 85 });
    const teal = rgbToLab({ r: 31, g: 122, b: 107 });

    expect(deltaE2000(ochre, slightlyDarkerOchre)).toBeLessThan(6);
    // The style-drift threshold is 20; a full hue change must clear it comfortably.
    expect(deltaE2000(ochre, teal)).toBeGreaterThan(30);
  });
});

describe('dominantPalette', () => {
  const solid = (r: number, g: number, b: number, count: number) => {
    const data = new Uint8Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      data[i * 3] = r;
      data[i * 3 + 1] = g;
      data[i * 3 + 2] = b;
    }
    return data;
  };

  it('returns the colours in coverage order', () => {
    const pixels = new Uint8Array([...solid(200, 120, 60, 30), ...solid(60, 120, 200, 10)]);
    const palette = dominantPalette(pixels, 3, { size: 2 });

    expect(palette).toHaveLength(2);
    expect(palette[0]!.weight).toBeGreaterThan(palette[1]!.weight);
    expect(palette[0]!.rgb.r).toBeGreaterThan(palette[0]!.rgb.b);
  });

  it('is deterministic — the same buffer always yields the same palette', () => {
    const pixels = new Uint8Array([...solid(200, 120, 60, 30), ...solid(60, 120, 200, 30)]);
    expect(dominantPalette(pixels, 3)).toEqual(dominantPalette(pixels, 3));
  });

  it('ignores paper white, which would otherwise dominate every watercolour frame', () => {
    const pixels = new Uint8Array([...solid(252, 251, 250, 90), ...solid(200, 120, 60, 10)]);
    const palette = dominantPalette(pixels, 3);
    expect(palette).toHaveLength(1);
    expect(palette[0]!.rgb.r).toBeCloseTo(200, -1);
  });

  it('returns nothing rather than guessing on an all-white buffer', () => {
    expect(dominantPalette(solid(255, 255, 255, 50), 3)).toEqual([]);
  });
});

describe('paletteDistance', () => {
  const warm = dominantPalette(
    new Uint8Array([200, 120, 60, 190, 140, 90, 210, 160, 110]),
    3,
  );
  const cold = dominantPalette(new Uint8Array([40, 90, 160, 30, 110, 150, 50, 100, 170]), 3);

  it('is zero against itself', () => {
    expect(paletteDistance(warm, warm)).toBeCloseTo(0, 6);
  });

  it('clears the drift threshold for an opposite palette', () => {
    expect(paletteDistance(cold, warm)).toBeGreaterThan(20);
  });

  it('is empty-safe', () => {
    expect(paletteDistance([], warm)).toBe(0);
    expect(paletteDistance(warm, [])).toBe(0);
  });
});
