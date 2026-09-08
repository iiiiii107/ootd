/**
 * Colour, as the app understands it: whether two garments go together.
 *
 * Pure — no pixels, no canvases, no items. Everything here takes hex strings
 * or swatches and returns numbers, which is what makes the one genuinely
 * subjective judgement in this app (what counts as a match) testable.
 *
 * **Why OKLab and not HSL.** HSL is ten lines and wrong for exactly the
 * garments a wardrobe is full of. Its saturation is high for near-black —
 * `#0a0a12` reads as 83% saturated — so neutral detection, the rule this whole
 * feature hangs off, fails on black, charcoal and navy. Its hue distances are
 * not perceptual either: 30° in the greens is invisible where 30° in the blues
 * is navy against royal, so "neighbouring colours" would quietly mean something
 * different on each part of the wheel. OKLab costs two 3×3 matrices and a cube
 * root, needs no dependency, and makes every threshold below mean one thing
 * everywhere.
 */

/** One colour a garment is made of, and how much of it there is. */
export interface Swatch {
  hex: string;
  /** 0–1. Shares within a palette sum to roughly 1. */
  share: number;
}

export interface Oklch {
  /** Perceptual lightness, 0 (black) to 1 (white). */
  L: number;
  /** Chroma — how colourful, 0 for any grey. */
  C: number;
  /** Hue in degrees, 0–360. Meaningless when C is near zero. */
  h: number;
}

/** Which pairings count as "these go together". All three are the user's choice. */
export interface HarmonyRules {
  /** Black, white, grey, cream — they sit with anything. */
  neutralWithAnything: boolean;
  /** Neighbours on the wheel: rust with mustard, sage with olive. */
  analogous: boolean;
  /** Opposites: rust with teal, mustard with indigo. */
  complementary: boolean;
}

export interface ColourPreferences {
  rules: HarmonyRules;
  /** Colours the user likes wearing. The randomizer leans toward these. */
  liked: string[];
}

export const DEFAULT_COLOUR_PREFERENCES: ColourPreferences = {
  rules: { neutralWithAnything: true, analogous: true, complementary: true },
  liked: [],
};

// --- conversion ------------------------------------------------------------

export function hexToRgb(hex: string): [number, number, number] {
  const raw = hex.trim().replace('#', '');
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw;
  const n = Number.parseInt(full.slice(0, 6), 16);
  return Number.isNaN(n) ? [0, 0, 0] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const part = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}

/** sRGB's transfer curve. The 2.4 exponent is the standard, not an approximation. */
function toLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Björn Ottosson's OKLab. The constants are the published matrices, not tuned by us. */
export function rgbToOklab(r: number, g: number, b: number): { L: number; a: number; b: number } {
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);

  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);

  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

export function hexToOklch(hex: string): Oklch {
  const [r, g, b] = hexToRgb(hex);
  const lab = rgbToOklab(r, g, b);
  const C = Math.hypot(lab.a, lab.b);
  const h = ((Math.atan2(lab.b, lab.a) * 180) / Math.PI + 360) % 360;
  return { L: lab.L, C, h };
}

/**
 * Perceptual distance. In OKLab, plain Euclidean distance *is* perceptual
 * distance — that is the entire point of the space, and why nothing more
 * elaborate (a ΔE2000 with its rotation term) is warranted here.
 */
export function deltaE(a: string, b: string): number {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const x = rgbToOklab(r1, g1, b1);
  const y = rgbToOklab(r2, g2, b2);
  return Math.hypot(x.L - y.L, x.a - y.a, x.b - y.b);
}

// --- the judgements --------------------------------------------------------

/**
 * Below this chroma a colour has no useful hue and behaves as a neutral.
 *
 * Tuning history: started at 0.045, which puts black, white, every grey,
 * charcoal `#2b2825` and cream `#f2ead6` on the neutral side while leaving
 * denim, olive and rust chromatic. Navy sits close to the line and is the value
 * to revisit first if real garments disagree — it is chromatic by the maths but
 * functions as a neutral in an actual wardrobe. Resist special-casing
 * individual hues; move this one number.
 */
export const NEUTRAL_CHROMA = 0.045;
const NEUTRAL_DARK = 0.2;
const NEUTRAL_LIGHT = 0.93;

/**
 * Whether a colour goes with everything.
 *
 * The lightness clauses matter as much as the chroma one: a near-black or
 * near-white read off a lossy JPEG carries spurious chroma from compression
 * noise, and without them a black tee occasionally reads as a dark green.
 */
export function isNeutral(c: Oklch): boolean {
  return c.C < NEUTRAL_CHROMA || c.L < NEUTRAL_DARK || c.L > NEUTRAL_LIGHT;
}

/** Shortest way round the wheel, 0–180. Meaningless for a neutral; callers check first. */
export function hueDistance(h1: number, h2: number): number {
  const d = Math.abs(h1 - h2) % 360;
  return d > 180 ? 360 - d : d;
}

const ANALOGOUS_FULL = 25;
const ANALOGOUS_ZERO = 60;
const COMPLEMENTARY_FULL = 180;
const COMPLEMENTARY_ZERO = 135;

/**
 * How well one colour sits with another, 0–1.
 *
 * The enabled rules are *permissions*, never penalties — the score is the best
 * any of them can make of the pair. Switching a rule off can only ever remove
 * a way for two colours to be considered a match.
 *
 * There is deliberately no triadic or evenly-spaced branch. The user was
 * offered it and did not want it; this note exists so nobody later "completes
 * the set" and quietly changes what the app considers well dressed.
 */
export function harmony(a: string, b: string, rules: HarmonyRules): number {
  const x = hexToOklch(a);
  const y = hexToOklch(b);

  if (isNeutral(x) || isNeutral(y)) {
    // Includes neutral-with-neutral: black and white is a match, and is most
    // of what people actually wear.
    return rules.neutralWithAnything ? 1 : 0;
  }

  const d = hueDistance(x.h, y.h);
  let best = 0;

  if (rules.analogous) {
    best = Math.max(
      best,
      d <= ANALOGOUS_FULL
        ? 1
        : Math.max(0, 1 - (d - ANALOGOUS_FULL) / (ANALOGOUS_ZERO - ANALOGOUS_FULL)),
    );
  }
  if (rules.complementary) {
    best = Math.max(
      best,
      d >= COMPLEMENTARY_FULL
        ? 1
        : Math.max(
            0,
            1 - (COMPLEMENTARY_FULL - d) / (COMPLEMENTARY_FULL - COMPLEMENTARY_ZERO),
          ),
    );
  }
  return best;
}

/**
 * How well two garments go together, 0–1, or null when either has no palette.
 *
 * Share-weighted across every pair of swatches, deliberately rather than taking
 * the best single pair. With a `max`, a garment whose main colour clashes would
 * score full marks off a 4% accent stripe. Weighting by share means the
 * *dominant* colours have to agree — which is the user's own framing of what
 * they wanted: the goal is not to wear one colour, it is to wear two that match.
 *
 * Null, not zero, when a palette is missing. Unknown must never read as bad.
 */
export function paletteHarmony(
  a: Swatch[],
  b: Swatch[],
  rules: HarmonyRules,
): number | null {
  if (a.length === 0 || b.length === 0) return null;

  let total = 0;
  let weight = 0;
  for (const x of a) {
    for (const y of b) {
      const w = x.share * y.share;
      total += w * harmony(x.hex, y.hex, rules);
      weight += w;
    }
  }
  return weight > 0 ? total / weight : null;
}

/** How near a garment sits to colours the user likes wearing, 0–1. */
const AFFINITY_RADIUS = 0.25;

export function paletteAffinity(palette: Swatch[], liked: string[]): number {
  if (palette.length === 0 || liked.length === 0) return 0;

  let total = 0;
  let weight = 0;
  for (const swatch of palette) {
    const nearest = Math.min(...liked.map((hex) => deltaE(swatch.hex, hex)));
    total += swatch.share * Math.max(0, 1 - nearest / AFFINITY_RADIUS);
    weight += swatch.share;
  }
  return weight > 0 ? total / weight : 0;
}

// --- naming ----------------------------------------------------------------

export type FamilyId =
  | 'black'
  | 'white'
  | 'grey'
  | 'beige'
  | 'brown'
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'teal'
  | 'blue'
  | 'purple'
  | 'pink';

export const FAMILY_LABELS: Record<FamilyId, string> = {
  black: 'black',
  white: 'white',
  grey: 'grey',
  beige: 'beige',
  brown: 'brown',
  red: 'red',
  orange: 'orange',
  yellow: 'yellow',
  green: 'green',
  teal: 'teal',
  blue: 'blue',
  purple: 'purple',
  pink: 'pink',
};

/**
 * A name for a colour, so analytics can say something.
 *
 * "You wear black with beige" is a sentence about your wardrobe. "#3a2f28 ×
 * #d9cbb4" is not, which is the only reason this exists.
 */
export function colourFamily(hex: string): FamilyId {
  const c = hexToOklch(hex);

  if (c.L < NEUTRAL_DARK) return 'black';
  if (c.L > NEUTRAL_LIGHT) return 'white';

  if (c.C < NEUTRAL_CHROMA) {
    // Beige and brown are barely-chromatic warm colours, and they sit *below*
    // the neutral threshold — measured: beige #d9cbb4 is C=0.035, brown
    // #5a4433 is C=0.041, against a threshold of 0.045. Checking them before
    // falling through to grey is what stops half a wardrobe being called grey.
    if (c.C > 0.018 && c.h >= 40 && c.h < 120) return c.L > 0.6 ? 'beige' : 'brown';
    return 'grey';
  }

  // Hue bands measured from the primaries in *this* space, not carried over
  // from HSL: OKLab puts pure red at 29°, orange 53°, yellow 110°, green 142°,
  // cyan 195°, blue 264°, violet 294° and magenta 328°. Using the HSL wheel
  // here named a strong red "orange", which is how this was caught.
  if (c.h < 45 || c.h >= 350) return 'red';
  if (c.h < 75) return c.L < 0.45 ? 'brown' : 'orange';
  if (c.h < 120) return 'yellow';
  if (c.h < 175) return 'green';
  if (c.h < 215) return 'teal';
  if (c.h < 290) return 'blue';
  if (c.h < 325) return 'purple';
  return 'pink';
}

/** Merge near-identical swatches, largest share first. Used by extraction and by outfits. */
export function mergeSwatches(swatches: Swatch[], tolerance = 0.1): Swatch[] {
  const sorted = [...swatches].sort((a, b) => b.share - a.share);
  const merged: Swatch[] = [];

  for (const swatch of sorted) {
    const near = merged.find((m) => deltaE(m.hex, swatch.hex) < tolerance);
    if (near) near.share += swatch.share;
    else merged.push({ ...swatch });
  }

  const total = merged.reduce((sum, m) => sum + m.share, 0);
  return total > 0 ? merged.map((m) => ({ ...m, share: m.share / total })) : [];
}
