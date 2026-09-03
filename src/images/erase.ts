/**
 * Manual background removal, for when the model gets it almost right.
 *
 * Everything here works on the **alpha channel only** — erasing never touches
 * a colour. That keeps an undo snapshot to one byte per pixel rather than
 * four, which is what makes a usable history affordable on a phone, and it
 * means an erase is always exactly reversible.
 */

/** Colour distance past which a pixel is a different thing, not a shade of the same thing. */
export const DEFAULT_TOLERANCE = 32;

/**
 * Past this share of the *visible* picture, a tap is worth remarking on.
 *
 * Not a refusal. A share-of-the-whole-image limit was tried first and was
 * worse than nothing: a garment occupying a fifth of the frame sat well under
 * any sensible cap, so tapping it erased the lot without complaint, while a
 * genuinely large background would have been refused for no good reason. The
 * threshold fired in exactly the wrong cases.
 *
 * Measured against opaque pixels rather than the whole frame, because most of
 * a cutout is already transparent and a share of the frame says nothing about
 * how much of the garment just went. And it only warns: undo is right there,
 * the result is visible immediately, and a tool that sometimes refuses a
 * legitimate tap is more annoying than one that is simply reversible.
 */
const LARGE_REMOVAL = 0.4;

export interface WandResult {
  /** The new alpha channel, or null when there was nothing at that point to take. */
  alpha: Uint8Array | null;
  /** Share of the previously-visible picture this removed, 0–1. */
  share: number;
  /** True when that share is large enough to be worth pointing out. */
  large: boolean;
}

/**
 * Erase the connected patch of similar colour under a tap.
 *
 * Similarity rather than pure connectivity, because leftover background is not
 * always a free-floating island: a patch fused to the garment's edge shares no
 * boundary the alpha channel can see, but it is still a different colour. The
 * comparison is against the *seed* pixel rather than each neighbour, so a
 * gentle gradient across a wall doesn't creep indefinitely into the garment.
 *
 * Iterative with an explicit stack — a recursive fill over a megapixel image
 * blows the call stack, which is the same reason `solidRegions` in cutout.ts
 * is written this way.
 */
export function wandErase(
  data: Uint8ClampedArray,
  alpha: Uint8Array,
  width: number,
  height: number,
  seedX: number,
  seedY: number,
  tolerance = DEFAULT_TOLERANCE,
): WandResult {
  const seed = (seedY * width + seedX) * 4;
  // Already transparent: nothing to take, and flooding from a hole would
  // wander through the whole background it belongs to.
  if (alpha[seedY * width + seedX] === 0) return { alpha: null, share: 0, large: false };

  const seedR = data[seed];
  const seedG = data[seed + 1];
  const seedB = data[seed + 2];
  const limit = tolerance * tolerance * 3;

  const next = Uint8Array.from(alpha);
  const seen = new Uint8Array(width * height);
  const stack: number[] = [seedY * width + seedX];
  seen[seedY * width + seedX] = 1;
  let taken = 0;

  while (stack.length > 0) {
    const cell = stack.pop() as number;
    const i = cell * 4;
    const dr = data[i] - seedR;
    const dg = data[i + 1] - seedG;
    const db = data[i + 2] - seedB;
    if (dr * dr + dg * dg + db * db > limit) continue;
    if (next[cell] === 0) continue;

    next[cell] = 0;
    taken++;

    const x = cell % width;
    const y = (cell / width) | 0;
    if (x > 0) push(cell - 1);
    if (x < width - 1) push(cell + 1);
    if (y > 0) push(cell - width);
    if (y < height - 1) push(cell + width);
  }

  function push(cell: number) {
    if (!seen[cell]) {
      seen[cell] = 1;
      stack.push(cell);
    }
  }

  let visible = 0;
  for (let i = 0; i < alpha.length; i++) if (alpha[i] > 0) visible++;
  const share = visible > 0 ? taken / visible : 0;

  return { alpha: next, share, large: share > LARGE_REMOVAL };
}

/**
 * Rub out a round patch, as a soft-edged brush.
 *
 * Soft rather than a hard disc because a hard one leaves a visibly scalloped
 * edge wherever two strokes meet, and because a garment's real edge is
 * antialiased — a hard eraser next to it reads as a cut-out-with-scissors
 * line. Alpha is only ever reduced, so overlapping strokes can't brighten
 * anything back up.
 */
export function brushErase(
  alpha: Uint8Array,
  width: number,
  height: number,
  centreX: number,
  centreY: number,
  radius: number,
): void {
  const minX = Math.max(0, Math.floor(centreX - radius));
  const maxX = Math.min(width - 1, Math.ceil(centreX + radius));
  const minY = Math.max(0, Math.floor(centreY - radius));
  const maxY = Math.min(height - 1, Math.ceil(centreY + radius));
  const inner = radius * 0.6;

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x - centreX;
      const dy = y - centreY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > radius) continue;

      // Full strength in the middle, tapering to nothing at the rim.
      const strength =
        distance <= inner ? 1 : 1 - (distance - inner) / Math.max(1, radius - inner);
      const cell = y * width + x;
      alpha[cell] = Math.min(alpha[cell], Math.round(alpha[cell] * (1 - strength)));
    }
  }
}

/** Read just the alpha channel out of image data. */
export function alphaOf(data: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const alpha = new Uint8Array(width * height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3];
  return alpha;
}

/** Write an alpha channel back into image data, in place. */
export function applyAlpha(data: Uint8ClampedArray, alpha: Uint8Array): void {
  for (let i = 0; i < alpha.length; i++) data[i * 4 + 3] = alpha[i];
}
