/**
 * Resize, compress, and thumbnail — Canvas API, no dependency (spec §9).
 *
 * Critical constraint (spec R3, §15): never hold more than one full-resolution
 * bitmap in memory at a time. iOS aggressively kills memory-hungry tabs, and
 * batch-importing 20 photos is the single likeliest way to crash this app.
 * Every bitmap opened here is explicitly `close()`d before the next one opens.
 */

const MAX_EDGE = 1200;
const WORKING_QUALITY = 0.92;

/**
 * The 1200px working copy: the crop screen's backdrop, and what the
 * segmentation model reads. Never stored — the saved photo is cropped from
 * the original (src/images/pipeline.ts) — so its quality is set for the
 * model's benefit rather than to save space, and 0.92 keeps compression
 * artefacts out of the mask for a copy that is discarded minutes later.
 *
 * It used to build a thumbnail here too, which was then thrown away unused:
 * thumbnails come from the cropped photo, since a thumbnail of the *uncropped*
 * frame would show whatever was around the garment.
 */
export async function makeWorkingCopy(source: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(source);
  try {
    return await resizeToBlob(bitmap, MAX_EDGE, WORKING_QUALITY);
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


