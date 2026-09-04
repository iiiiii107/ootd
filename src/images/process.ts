/**
 * Resize, compress, and thumbnail — Canvas API, no dependency (spec §9).
 *
 * Critical constraint (spec R3, §15): never hold more than one full-resolution
 * bitmap in memory at a time. iOS aggressively kills memory-hungry tabs, and
 * batch-importing 20 photos is the single likeliest way to crash this app.
 * Every bitmap opened here is explicitly `close()`d before the next one opens.
 */

const MAX_EDGE = 1200;
/**
 * Longest edge of a thumbnail, and 512 rather than 400 because the grid is
 * read on a phone at 3× — a tile about 110pt wide is 330 real pixels, and a
 * portrait garment scaled to 400 on its long edge only has 300 across. 512
 * clears that with room for the two-across setting.
 */
const THUMB_EDGE = 512;
const JPEG_QUALITY = 0.82;

export interface ProcessedImage {
  /** ~1200px longest edge, quality 0.82. */
  image: Blob;
  /** ~512px longest edge, the garment's own proportions kept. */
  thumb: Blob;
}

export async function processImage(source: Blob): Promise<ProcessedImage> {
  const bitmap = await createImageBitmap(source);
  try {
    const image = await resizeToBlob(bitmap, MAX_EDGE, JPEG_QUALITY);
    const thumb = await resizeToBlob(bitmap, THUMB_EDGE, JPEG_QUALITY);
    return { image, thumb };
  } finally {
    bitmap.close();
  }
}

function resizeToBlob(bitmap: ImageBitmap, maxEdge: number, quality: number): Promise<Blob> {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  ctx.drawImage(bitmap, 0, 0, width, height);
  return canvas.convertToBlob({ type: 'image/jpeg', quality });
}

/*
 * The thumbnail used to be a 400×400 centre crop, and that was a real loss:
 * a tall coat had its top and bottom cut off before it was ever displayed, so
 * letting the grid show a photo's own proportions achieved nothing — the
 * cropping had already happened here. A thumbnail is now just a small version
 * of the picture.
 */
