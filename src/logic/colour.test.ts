import { describe, expect, it } from 'vitest';

import {
  colourFamily,
  deltaE,
  harmony,
  hexToOklch,
  hexToRgb,
  hueDistance,
  isNeutral,
  mergeSwatches,
  paletteAffinity,
  paletteHarmony,
  rgbToHex,
  type HarmonyRules,
  type Swatch,
} from './colour';

const ALL: HarmonyRules = { neutralWithAnything: true, analogous: true, complementary: true };
const NONE: HarmonyRules = { neutralWithAnything: false, analogous: false, complementary: false };

describe('hex', () => {
  it('round-trips', () => {
    expect(rgbToHex(...hexToRgb('#1a2b3c'))).toBe('#1a2b3c');
  });

  it('accepts short form, upper case and a missing hash', () => {
    expect(hexToRgb('#FFF')).toEqual([255, 255, 255]);
    expect(hexToRgb('AA3322')).toEqual([170, 51, 34]);
  });

  it('clamps rather than wrapping', () => {
    expect(rgbToHex(300, -20, 128)).toBe('#ff0080');
  });
});

describe('OKLab', () => {
  it('puts white at the top of the lightness range with no chroma', () => {
    const white = hexToOklch('#ffffff');
    expect(white.L).toBeCloseTo(1, 2);
    expect(white.C).toBeCloseTo(0, 2);
  });

  it('puts black at the bottom', () => {
    expect(hexToOklch('#000000').L).toBeCloseTo(0, 2);
  });

  it('places the primaries where the space says they are', () => {
    expect(hexToOklch('#ff0000').h).toBeGreaterThan(20);
    expect(hexToOklch('#ff0000').h).toBeLessThan(40);
    expect(hexToOklch('#0000ff').h).toBeGreaterThan(250);
    expect(hexToOklch('#0000ff').h).toBeLessThan(280);
  });

  it('measures identical colours as zero apart', () => {
    expect(deltaE('#b8714c', '#b8714c')).toBe(0);
  });
});

/**
 * This block is the feature's central judgement written down. Each colour is a
 * real garment, because the threshold is only meaningful against real clothes.
 */
describe('isNeutral', () => {
  it.each([
    ['#000000', 'black tee'],
    ['#ffffff', 'white shirt'],
    ['#808080', 'grey marl'],
    ['#2b2825', 'charcoal — the app’s own ink'],
    ['#f2ead6', 'cream'],
    ['#d8d3c6', 'oatmeal'],
  ])('treats %s (%s) as a neutral', (hex) => {
    expect(isNeutral(hexToOklch(hex))).toBe(true);
  });

  it.each([
    ['#3b5b8c', 'denim'],
    ['#5f6b4a', 'olive'],
    ['#b8714c', 'rust'],
    ['#7a5a85', 'plum'],
  ])('treats %s (%s) as a colour', (hex) => {
    expect(isNeutral(hexToOklch(hex))).toBe(false);
  });
});

describe('hueDistance', () => {
  it('takes the short way round', () => {
    expect(hueDistance(350, 10)).toBe(20);
    expect(hueDistance(10, 350)).toBe(20);
  });

  it('never exceeds half the wheel', () => {
    expect(hueDistance(0, 180)).toBe(180);
    expect(hueDistance(0, 181)).toBe(179);
  });
});

describe('harmony', () => {
  it('lets a neutral sit with anything', () => {
    expect(harmony('#000000', '#b8714c', ALL)).toBe(1);
    expect(harmony('#ffffff', '#5f6b4a', ALL)).toBe(1);
  });

  it('counts black with white as a match', () => {
    // Most of what people actually wear. If this ever returns 0, the rule has
    // been narrowed to "one neutral only" and a normal wardrobe stops pairing.
    expect(harmony('#000000', '#ffffff', ALL)).toBe(1);
  });

  it('stops neutrals matching when that rule is off', () => {
    expect(harmony('#000000', '#b8714c', { ...ALL, neutralWithAnything: false })).toBe(0);
  });

  it('matches neighbouring hues', () => {
    expect(harmony('#b8714c', '#c19a3a', ALL)).toBeGreaterThan(0.5); // rust · mustard
  });

  it('matches opposite hues only when that rule is on', () => {
    // Mustard and denim — 86° and 259° in OKLab, so genuinely opposite.
    // Rust and teal *look* like opposites by HSL intuition but are only 134°
    // apart in this space, which is how the hue bands below got checked.
    const mustardDenim = ['#c19a3a', '#3b5b8c'] as const;
    expect(harmony(...mustardDenim, { ...NONE, complementary: true })).toBeGreaterThan(0.3);
    expect(harmony(...mustardDenim, { ...NONE, analogous: true })).toBe(0);
  });

  it('scores nothing when every rule is off', () => {
    expect(harmony('#b8714c', '#c19a3a', NONE)).toBe(0);
    expect(harmony('#000000', '#ffffff', NONE)).toBe(0);
  });
});

describe('paletteHarmony', () => {
  const clashing: Swatch[] = [{ hex: '#5f6b4a', share: 1 }]; // olive

  it('is driven by the dominant colours, not a token accent', () => {
    // The reason this is share-weighted rather than a best-pair maximum: a
    // garment that is 96% clashing should not score full marks because 4% of
    // it happens to match.
    const mostlyClashing: Swatch[] = [
      { hex: '#8a3324', share: 0.96 }, // deep red body
      { hex: '#5f6b4a', share: 0.04 }, // olive thread
    ];
    const score = paletteHarmony(mostlyClashing, clashing, { ...NONE, analogous: true });
    expect(score).not.toBeNull();
    expect(score!).toBeLessThan(0.2);
  });

  it('returns null when either garment has no palette', () => {
    // Backfill pending, or an item restored from an older backup. Unknown is
    // not a verdict — the caller must be able to tell it apart from a clash.
    expect(paletteHarmony([], clashing, ALL)).toBeNull();
    expect(paletteHarmony(clashing, [], ALL)).toBeNull();
  });

  it('scores a neutral against a colour highly', () => {
    const black: Swatch[] = [{ hex: '#141414', share: 1 }];
    expect(paletteHarmony(black, clashing, ALL)).toBeCloseTo(1, 5);
  });
});

describe('paletteAffinity', () => {
  const rust: Swatch[] = [{ hex: '#b8714c', share: 1 }];

  it('is zero, not NaN, with nothing to compare against', () => {
    expect(paletteAffinity(rust, [])).toBe(0);
    expect(paletteAffinity([], ['#b8714c'])).toBe(0);
  });

  it('is highest for a colour the user actually likes', () => {
    expect(paletteAffinity(rust, ['#b8714c'])).toBeCloseTo(1, 5);
    expect(paletteAffinity(rust, ['#3f7068'])).toBeLessThan(0.5);
  });
});

describe('colourFamily', () => {
  it.each([
    ['#000000', 'black'],
    ['#ffffff', 'white'],
    ['#808080', 'grey'],
    ['#d9cbb4', 'beige'],
    ['#5a4433', 'brown'],
    ['#c0392b', 'red'],
    ['#5f6b4a', 'green'],
    ['#3f7068', 'teal'],
    ['#3b5b8c', 'blue'],
    ['#7a5a85', 'purple'],
  ])('names %s as %s', (hex, expected) => {
    expect(colourFamily(hex)).toBe(expected);
  });
});

describe('mergeSwatches', () => {
  it('folds near-identical colours together and renormalises', () => {
    const merged = mergeSwatches([
      { hex: '#b8714c', share: 0.5 },
      { hex: '#b97250', share: 0.3 },
      { hex: '#3f7068', share: 0.2 },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0].share).toBeCloseTo(0.8, 5);
    expect(merged.reduce((s, m) => s + m.share, 0)).toBeCloseTo(1, 5);
  });

  it('survives an empty palette', () => {
    expect(mergeSwatches([])).toEqual([]);
  });
});
