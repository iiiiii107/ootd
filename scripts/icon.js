/**
 * The ootd app icon, as one file.
 *
 * Locked default (spec §8): lowercase `ootd` wordmark in Sniglet at its bold
 * (800) weight — the bubble-letter look the app now uses throughout — near-
 * black on the off-white paper ground, generous margin. If you ever want a
 * drawn symbol instead, replace `markup()` here and re-run `npm run icons`.
 */

export const PAPER = '#FAF9F7';
export const INK = '#1A1A1A';

/**
 * @param {number} size      canvas edge in px
 * @param {number} inset     fraction of the canvas the wordmark may occupy.
 *                           Maskable icons get a smaller value so the wordmark
 *                           survives being cropped to a circle.
 * @param {string} ground    background fill
 * @param {string} ink       wordmark fill
 */
export function markup({ size, inset = 0.62, ground = PAPER, ink = INK }) {
  // Sniglet Bold's lowercase `ootd` measures ~2.55em wide before tracking —
  // its round bubble letters are considerably wider-set than Playfair's.
  const tracking = 0.08;
  const advance = 2.55 + tracking * 4;
  const fontSize = (size * inset) / advance;
  const letterSpacing = fontSize * tracking;
  // `central` centres on the x-height band. Sniglet's letters sit fairly
  // evenly around it already, so only a small lift is needed for the `d`
  // ascender and `o`/`t` bowls to look centred rather than low.
  const opticalLift = fontSize * 0.03;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${ground}"/>
  <text
    x="${size / 2 - letterSpacing / 2}"
    y="${size / 2 - opticalLift}"
    fill="${ink}"
    font-family="Sniglet"
    font-weight="800"
    font-size="${fontSize}"
    letter-spacing="${letterSpacing}"
    text-anchor="middle"
    dominant-baseline="central"
  >ootd</text>
</svg>`;
}
