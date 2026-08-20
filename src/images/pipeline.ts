import { extractDominantColor } from './color';
import { ensureJpeg } from './decode';
import { processImage } from './process';

export interface ImportedPhoto {
  image: Blob;
  thumb: Blob;
  dominantColor: string;
}

/**
 * The full per-photo pipeline: HEIC→JPEG, resize/compress/thumb, dominant
 * colour. Callers must await one photo before starting the next (spec R3) —
 * this function itself only ever holds one photo's bitmaps at a time, but it
 * cannot enforce sequencing across a batch on its own.
 */
export async function importPhoto(file: Blob): Promise<ImportedPhoto> {
  const jpeg = await ensureJpeg(file);
  const { image, thumb } = await processImage(jpeg);
  const dominantColor = await extractDominantColor(thumb);
  return { image, thumb, dominantColor };
}
