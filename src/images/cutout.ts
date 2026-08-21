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
 *
 * The segmentation runs **once per photo** and its result is used for two
 * things: the cutout image itself, and the garment bounding box that
 * pre-fills the crop box (src/images/crop.ts). Both features are separately
 * switchable in Settings, but neither costs a second inference pass.
 */

import { encodeWithAlpha } from './encode';

const TIMEOUT_MS = 30_000;
const SIZE = 400; // matches the thumb pipeline's own crop size (spec §4.1)
const QUALITY = 0.82;

/**
 * Segments the subject out of `source`, returning a transparent PNG — or
 * `null` if it couldn't be done for any reason at all. Never rejects: every
 * caller's fallback is simply "carry on with the plain photo" (spec R3).
 */
export async function segment(source: Blob): Promise<Blob | null> {
  try {
    return await withTimeout(runModel(source), TIMEOUT_MS);
  } catch {
    return null;
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

/** Alpha at or below this is haze, not garment — forced fully transparent. */
const ALPHA_FLOOR = 96;
/** Alpha at or above this is solidly garment — forced fully opaque. */
const ALPHA_CEIL = 176;

/**
 * Hardens a segmentation mask's alpha, and it earns its keep twice over.
 *
 * The model leaves a wide, faint haze of low-alpha pixels across the frame.
 * Composited onto white that haze was invisible, but a transparent cutout on
 * the app's dark-mode ground shows it as white speckle around the garment.
 * It also wrecks automatic detection: the haze reaches the frame edges, so a
 * bounding box drawn over "anything not fully transparent" is the whole photo.
 *
 * A two-point ramp rather than a hard cut: below the floor is dropped, above
 * the ceiling is made solid, and the band between is stretched across the full
 * range so the garment's own edge keeps its antialiasing instead of turning
 * into a jagged stencil.
 */
export async function cleanMask(cutout: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(cutout);
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return cutout;
    ctx.drawImage(bitmap, 0, 0);

    const image = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    const data = image.data;
    const range = ALPHA_CEIL - ALPHA_FLOOR;
    for (let i = 3; i < data.length; i += 4) {
      const alpha = data[i];
      if (alpha <= ALPHA_FLOOR) data[i] = 0;
      else if (alpha >= ALPHA_CEIL) data[i] = 255;
      else data[i] = Math.round(((alpha - ALPHA_FLOOR) / range) * 255);
    }
    ctx.putImageData(image, 0, 0);

    return await encodeWithAlpha(canvas);
  } finally {
    bitmap.close();
  }
}

/**
 * Same centre-crop the plain pipeline uses (src/images/process.ts), so cutout
 * and plain thumbs are framed identically.
 *
 * `alpha` keeps the transparency rather than flattening it, so a cutout sits
 * on the app's own paper background wherever it's shown instead of carrying a
 * white rectangle around with it.
 */
export async function cropToThumb(image: Blob, alpha = false): Promise<Blob> {
  const bitmap = await createImageBitmap(image);
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const sx = (bitmap.width - side) / 2;
    const sy = (bitmap.height - side) / 2;
    const canvas = new OffscreenCanvas(SIZE, SIZE);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, SIZE, SIZE);
    return alpha ? await encodeWithAlpha(canvas) : await canvas.convertToBlob({ type: 'image/jpeg', quality: QUALITY });
  } finally {
    bitmap.close();
  }
}
