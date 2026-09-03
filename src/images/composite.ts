import type { Item } from '../db/types';
import { encodeWithAlpha } from './encode';

/**
 * Save-as-outfit composite (spec §7.1, §4.1): stacks each member's already-
 * processed thumb into one square image. Built from thumbs rather than full
 * resolution images — a composite is derived content from up to three
 * members, and holding several full-resolution bitmaps at once is exactly
 * what R3 warns against. Used for both `image` and `thumb`: this square is
 * what the outfit actually looks like, there's no separate "original" to
 * fall back to.
 */
/**
 * Portrait, not square. A stack of garments is a tall thing, and squeezing two
 * of them into a square gave each one half the height of its own width — the
 * source of the squashed look these used to have.
 */
const WIDTH = 400;
const HEIGHT = 600;
const QUALITY = 0.85;

export async function composeOutfitThumb(members: Item[]): Promise<Blob> {
  // Members without a thumb are outfits themselves, or records mid-restore.
  // Nesting an outfit inside an outfit is not a thing the app offers, so this
  // is a guard rather than a case: draw what can be drawn.
  const drawable = members.filter((member) => member.thumb != null);
  if (drawable.length === 0) throw new Error('No member images to compose');
  const bitmaps = await Promise.all(
    drawable.map((member) => createImageBitmap(member.thumb as Blob)),
  );
  try {
    const canvas = new OffscreenCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');

    const cellHeight = Math.floor(HEIGHT / bitmaps.length);
    bitmaps.forEach((bitmap, i) => {
      const y = i * cellHeight;
      // The last cell absorbs any rounding remainder so the stack fills HEIGHT exactly.
      const height = i === bitmaps.length - 1 ? HEIGHT - y : cellHeight;

      // Crop the source to the cell's own shape before drawing, rather than
      // squeezing a square into it. This is what was wrong before: a square
      // region was drawn into a half-height cell, so every garment in a
      // two-piece outfit came out squashed to half its proper height.
      const cellAspect = WIDTH / height;
      const sourceAspect = bitmap.width / bitmap.height;
      const sw = sourceAspect > cellAspect ? bitmap.height * cellAspect : bitmap.width;
      const sh = sourceAspect > cellAspect ? bitmap.height : bitmap.width / cellAspect;
      const sx = (bitmap.width - sw) / 2;
      const sy = (bitmap.height - sh) / 2;

      ctx.drawImage(bitmap, sx, sy, sw, sh, 0, y, WIDTH, height);
    });

    // Transparency is only worth its file size when a member actually has
    // some: a stack of cutouts should show the app's background between the
    // pieces, while a stack of ordinary photos is opaque anyway.
    return drawable.some((member) => member.hasCutout)
      ? await encodeWithAlpha(canvas)
      : await canvas.convertToBlob({ type: 'image/jpeg', quality: QUALITY });
  } finally {
    bitmaps.forEach((bitmap) => bitmap.close());
  }
}
