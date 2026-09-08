import { describe, expect, it } from 'vitest';

import { extractPalette, type PixelSource } from './palette';

/** Builds an image where a callback decides each pixel's colour and opacity. */
function image(
  width: number,
  height: number,
  at: (x: number, y: number) => [number, number, number, number],
): PixelSource {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = at(x, y);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }
  }
  return { data, width, height };
}

const RUST: [number, number, number, number] = [184, 113, 76, 255];
const BLACK: [number, number, number, number] = [20, 20, 20, 255];
const WALL: [number, number, number, number] = [216, 211, 198, 255];

describe('extractPalette', () => {
  it('reads a solid colour back', () => {
    const palette = extractPalette(image(20, 20, () => RUST));
    expect(palette).toHaveLength(1);
    expect(palette[0].share).toBeCloseTo(1, 5);
    expect(palette[0].hex).toBe('#b8714c');
  });

  it('finds two colours in their real proportions', () => {
    const palette = extractPalette(image(20, 20, (_, y) => (y < 10 ? RUST : BLACK)));
    expect(palette).toHaveLength(2);
    expect(palette[0].share).toBeCloseTo(0.5, 2);
    expect(palette[1].share).toBeCloseTo(0.5, 2);
  });

  it('ignores the background of a cutout entirely', () => {
    // The whole reason this module exists: a black garment on a pale wall must
    // read as black, not as the average of garment and wall.
    const inside = (x: number, y: number) => x > 5 && x < 15 && y > 5 && y < 15;
    const palette = extractPalette(
      image(20, 20, (x, y) => (inside(x, y) ? BLACK : [216, 211, 198, 0])),
    );
    expect(palette).toHaveLength(1);
    expect(palette[0].hex).toBe('#141414');
  });

  it('rejects the semi-transparent halo around a cutout', () => {
    // Lossy WebP leaves edge pixels part garment, part wall. At alpha 180 they
    // are the wall's colour bleeding in, and must not count.
    const palette = extractPalette(
      image(20, 20, (x, y) => {
        if (x > 5 && x < 15 && y > 5 && y < 15) return BLACK;
        if (x > 3 && x < 17 && y > 3 && y < 17) return [216, 211, 198, 180];
        return [0, 0, 0, 0];
      }),
    );
    expect(palette).toHaveLength(1);
    expect(palette[0].hex).toBe('#141414');
  });

  it('folds near-identical shades into one colour', () => {
    // A photographed garment is never one exact value; forty shades of rust is
    // one rust, not forty colours.
    const palette = extractPalette(
      image(20, 20, (x) => [184 + (x % 5), 113 + (x % 3), 76 + (x % 4), 255]),
    );
    expect(palette).toHaveLength(1);
  });

  it('drops a colour too small to be worth naming', () => {
    // A 4% contrast stripe is a detail, not something you would say you wear.
    const palette = extractPalette(
      image(25, 20, (x) => (x < 24 ? RUST : [63, 112, 104, 255])),
    );
    expect(palette).toHaveLength(1);
    expect(palette[0].hex).toBe('#b8714c');
  });

  it('returns nothing at all for a fully transparent image', () => {
    // Not '#000000'. Confusing "unknown" with "black" is the bug this replaces.
    expect(extractPalette(image(20, 20, () => [0, 0, 0, 0]))).toEqual([]);
  });

  it('falls back to the centre when a cutout removed almost everything', () => {
    // Four opaque pixels is not a garment. Rather than reporting them as the
    // whole palette, look at the middle of the frame, which is where a thumb
    // puts the garment.
    const palette = extractPalette(
      image(40, 40, (x, y) => {
        if (x === 0 && y === 0) return [255, 0, 255, 255];
        return x > 10 && x < 30 && y > 10 && y < 30 ? BLACK : WALL;
      }),
    );
    expect(palette.some((s) => s.hex === '#ff00ff')).toBe(false);
  });

  it('lets the garment dominate when there is no cutout to go on', () => {
    // A photo with no cutout: the edges are the room, the middle is the
    // clothes. The centre box still catches some wall — it cannot not — so the
    // honest guarantee is that the garment comes first and outweighs it, not
    // that the room disappears. Only an alpha channel can do that, which is
    // why cutouts are read differently.
    const palette = extractPalette(
      image(40, 40, (x, y) => (x > 10 && x < 30 && y > 10 && y < 30 ? BLACK : WALL)),
      { centreOnly: true },
    );
    expect(palette[0].hex).toBe('#141414');
    expect(palette[0].share).toBeGreaterThan(0.5);
  });

  it('reads the same garment more accurately with a cutout than without', () => {
    // The measurable case for cutouts: with alpha, the wall contributes
    // nothing at all; without it, the wall is a third of the answer.
    const garment = (x: number, y: number) => x > 10 && x < 30 && y > 10 && y < 30;
    const withCutout = extractPalette(
      image(40, 40, (x, y) => (garment(x, y) ? BLACK : [216, 211, 198, 0])),
    );
    const without = extractPalette(
      image(40, 40, (x, y) => (garment(x, y) ? BLACK : WALL)),
      { centreOnly: true },
    );
    expect(withCutout).toHaveLength(1);
    expect(withCutout[0].share).toBeCloseTo(1, 5);
    expect(without.length).toBeGreaterThan(1);
  });

  it('always returns shares that sum to one', () => {
    const palette = extractPalette(
      image(30, 30, (x) => (x < 10 ? RUST : x < 20 ? BLACK : [63, 112, 104, 255])),
    );
    expect(palette.reduce((s, p) => s + p.share, 0)).toBeCloseTo(1, 5);
  });
});
