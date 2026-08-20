import type { Item } from '../db/types';

/**
 * Save-as-outfit composite (spec §7.1, §4.1): stacks each member's already-
 * processed thumb into one square image. Built from thumbs rather than full
 * resolution images — a composite is derived content from up to three
 * members, and holding several full-resolution bitmaps at once is exactly
 * what R3 warns against. Used for both `image` and `thumb`: this square is
 * what the outfit actually looks like, there's no separate "original" to
 * fall back to.
 */
const SIZE = 400;
const QUALITY = 0.85;

export async function composeOutfitThumb(members: Item[]): Promise<Blob> {
  const bitmaps = await Promise.all(members.map((member) => createImageBitmap(member.thumb)));
  try {
    const canvas = new OffscreenCanvas(SIZE, SIZE);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');

    const cellHeight = Math.floor(SIZE / bitmaps.length);
    bitmaps.forEach((bitmap, i) => {
      const side = Math.min(bitmap.width, bitmap.height);
      const sx = (bitmap.width - side) / 2;
      const sy = (bitmap.height - side) / 2;
      const y = i * cellHeight;
      // The last cell absorbs any rounding remainder so the stack fills SIZE exactly.
      const height = i === bitmaps.length - 1 ? SIZE - y : cellHeight;
      ctx.drawImage(bitmap, sx, sy, side, side, 0, y, SIZE, height);
    });

    return await canvas.convertToBlob({ type: 'image/jpeg', quality: QUALITY });
  } finally {
    bitmaps.forEach((bitmap) => bitmap.close());
  }
}
