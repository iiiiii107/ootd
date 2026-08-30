/**
 * The ootd app icon, as one file.
 *
 * Locked default (spec §8): lowercase `ootd` wordmark in EB Garamond at its
 * semibold (600) weight — the old-style serif shared with cookbook — warm ink
 * on the family's paper ground, generous margin. If you ever want a drawn
 * symbol instead, replace `markup()` here and re-run `npm run icons`.
 */

export const PAPER = '#FAF8F3';
export const INK = '#2B2825';

/**
 * @param {number} size      canvas edge in px
 * @param {number} inset     fraction of the canvas the wordmark may occupy.
 *                           Maskable icons get a smaller value so the wordmark
 *                           survives being cropped to a circle.
 * @param {string} ground    background fill
 * @param {string} ink       wordmark fill
 */
export function markup({ size, inset = 0.62, ground = PAPER, ink = INK }) {
  // EB Garamond Semibold's lowercase `ootd` measures ~1.95em wide before
  // tracking — an old-style serif is set considerably tighter than Sniglet's
  // round bubble letters were, so it needs more tracking and a larger em to
  // fill the same box.
  const tracking = 0.1;
  const advance = 1.95 + tracking * 4;
  const fontSize = (size * inset) / advance;
  const letterSpacing = fontSize * tracking;
  // `central` centres on the x-height band. Garamond has a small x-height and a
  // tall `d` ascender, so the optical centre sits meaningfully above the band —
  // a larger lift than the bubble face needed.
  const opticalLift = fontSize * 0.09;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${ground}"/>
  <text
    x="${size / 2 - letterSpacing / 2}"
    y="${size / 2 - opticalLift}"
    fill="${ink}"
    font-family="EB Garamond"
    font-weight="600"
    font-size="${fontSize}"
    letter-spacing="${letterSpacing}"
    text-anchor="middle"
    dominant-baseline="central"
  >ootd</text>
</svg>`;
}
