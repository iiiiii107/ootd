/**
 * Resize, compress, and thumbnail — Canvas API, no dependency (spec §9).
 *
 * Critical constraint (spec R3, §15): never hold more than one full-resolution
 * bitmap in memory at a time. iOS aggressively kills memory-hungry tabs, and
 * batch-importing 20 photos is the single likeliest way to crash this app.
 * Every bitmap opened here is explicitly `close()`d before the next one opens.
 */

const MAX_EDGE = 1200;
const THUMB_SIZE = 400;
const JPEG_QUALITY = 0.82;

export interface ProcessedImage {
  /** ~1200px longest edge, quality 0.82. */
  image: Blob;
  /** 400×400 centre-cropped, for grid scrolling. */
  thumb: Blob;
}

export async function processImage(source: Blob): Promise<ProcessedImage> {
  const bitmap = await createImageBitmap(source);
  try {
    const image = await resizeToBlob(bitmap, MAX_EDGE, JPEG_QUALITY);
    const thumb = await cropThumbToBlob(bitmap, THUMB_SIZE, JPEG_QUALITY);
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

function cropThumbToBlob(bitmap: ImageBitmap, size: number, quality: number): Promise<Blob> {
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);
  return canvas.convertToBlob({ type: 'image/jpeg', quality });
}
