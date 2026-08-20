/**
 * Dominant colour by pixel averaging — ~30 lines, no dependency (spec §9).
 * Not used for matching in v1; stored so colour features can be added later
 * without reprocessing 200 photos.
 *
 * `PixelSource` is structurally an `ImageData`, but kept as its own type so
 * the averaging math stays a pure function, testable without a DOM.
 */
export interface PixelSource {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export function dominantColor(pixels: PixelSource): string {
  const { data } = pixels;
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
    count++;
  }
  if (count === 0) return '#000000';
  return `#${toHex(r / count)}${toHex(g / count)}${toHex(b / count)}`;
}

function toHex(channel: number): string {
  return Math.round(channel).toString(16).padStart(2, '0');
}

/** Runs the averaging over an already-processed thumb. */
export async function extractDominantColor(thumb: Blob): Promise<string> {
  const bitmap = await createImageBitmap(thumb);
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    ctx.drawImage(bitmap, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    return dominantColor({ data, width, height });
  } finally {
    bitmap.close();
  }
}
