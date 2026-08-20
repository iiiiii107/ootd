import { extractDominantColor } from './color';
import { removeBackground } from './cutout';
import { ensureJpeg } from './decode';
import { processImage } from './process';

export interface ImportedPhoto {
  image: Blob;
  thumb: Blob;
  dominantColor: string;
  hasCutout: boolean;
}

/**
 * The full per-photo pipeline: HEIC→JPEG, resize/compress/thumb, dominant
 * colour, optional background removal. Callers must await one photo before
 * starting the next (spec R3) — this function itself only ever holds one
 * photo's bitmaps at a time, but it cannot enforce sequencing across a batch
 * on its own.
 *
 * Dominant colour is always sampled from the plain (pre-cutout) thumb —
 * post-cutout, much of the frame is flat white background, which would
 * skew the average away from the garment itself.
 */
export async function importPhoto(file: Blob, cutout = false): Promise<ImportedPhoto> {
  const jpeg = await ensureJpeg(file);
  const plain = await processImage(jpeg);
  const dominantColor = await extractDominantColor(plain.thumb);

  if (!cutout) {
    return { ...plain, dominantColor, hasCutout: false };
  }

  const result = await removeBackground(plain.image, plain.thumb);
  return { image: result.image, thumb: result.thumb, dominantColor, hasCutout: result.hasCutout };
}
