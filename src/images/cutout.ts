/**
 * Background removal (spec §9, R3) — runs entirely in the browser via
 * @imgly/background-removal's ONNX model, so the photo itself never leaves
 * the device. The model weights are a separate matter: they're ~40MB and
 * fetched from IMG.LY's CDN on first use rather than bundled into this repo
 * (spec R3 already describes this exact shape — "download, cached after
 * first use" — not a day-one precache). `vite.config.ts` adds a runtime
 * caching rule so that download only happens once, and any failure here —
 * offline, slow network, an unsupported browser — falls back to the plain
 * photo automatically (spec R3's explicit mitigation), never a broken import.
 *
 * `isnet_quint8` is the ~40MB quantized model, not the ~80MB default —
 * matching spec R3's stated size and the smallest reasonable footprint on
 * an iPhone.
 */

const TIMEOUT_MS = 30_000;
const SIZE = 400; // matches the thumb pipeline's own crop size (spec §4.1)
const QUALITY = 0.82;

export interface CutoutResult {
  image: Blob;
  thumb: Blob;
  hasCutout: boolean;
}

/**
 * Attempts a cutout of `source` (the already resized/compressed photo).
 * Always resolves — never rejects — falling back to the plain photo (with
 * a plain re-cropped thumb) on any failure so a bad network never blocks
 * import (spec R3).
 */
export async function removeBackground(source: Blob, plainThumb: Blob): Promise<CutoutResult> {
  try {
    const cutout = await withTimeout(runModel(source), TIMEOUT_MS);
    const composited = await compositeOnWhite(cutout);
    const thumb = await cropToThumb(composited);
    return { image: composited, thumb, hasCutout: true };
  } catch {
    return { image: source, thumb: plainThumb, hasCutout: false };
  }
}

async function runModel(source: Blob): Promise<Blob> {
  // Dynamically imported so the ~1MB library and its wasm loader don't sit
  // in the main bundle for a feature most imports won't use every time —
  // the same reasoning as the lazy HEIC decoder (src/images/decode.ts).
  const { removeBackground: imglyRemoveBackground } = await import('@imgly/background-removal');
  // `removeBackground` (as opposed to the library's `removeForeground`)
  // already keeps the foreground/subject — no separate "type" option in
  // this version of the config.
  return imglyRemoveBackground(source, {
    model: 'isnet_quint8',
    output: { format: 'image/png' },
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('background removal timed out')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * Flattens the cutout's transparency onto flat white (spec §8: "cutouts on
 * flat white make the grid read as a lookbook") and re-encodes as JPEG,
 * consistent with every other image this app stores.
 */
async function compositeOnWhite(cutout: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(cutout);
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, bitmap.width, bitmap.height);
    ctx.drawImage(bitmap, 0, 0);
    return await canvas.convertToBlob({ type: 'image/jpeg', quality: QUALITY });
  } finally {
    bitmap.close();
  }
}

/** Same centre-crop the plain pipeline uses (src/images/process.ts), so cutout and plain thumbs match. */
async function cropToThumb(image: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(image);
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const sx = (bitmap.width - side) / 2;
    const sy = (bitmap.height - side) / 2;
    const canvas = new OffscreenCanvas(SIZE, SIZE);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, SIZE, SIZE);
    return await canvas.convertToBlob({ type: 'image/jpeg', quality: QUALITY });
  } finally {
    bitmap.close();
  }
}
