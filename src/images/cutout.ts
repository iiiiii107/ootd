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
  //
  // Measured on a fast machine: ~9.9s on the CPU backend and ~9.1s on WebGPU
  // — near enough identical, and the GPU path still pinned the main thread.
  // Since neither backend is fast enough to wait on, the fix isn't the
  // backend, it's that this whole module runs inside a worker
  // (src/images/pipeline.worker.ts) and one photo is analysed ahead of the
  // one being cropped. Left on the CPU backend: same speed, less surface.
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

    const width = bitmap.width;
    const height = bitmap.height;
    const image = ctx.getImageData(0, 0, width, height);
    const data = image.data;
    const range = ALPHA_CEIL - ALPHA_FLOOR;

    const keep = solidRegions(data, width, height);
    const scanWidth = keep.width;

    for (let y = 0; y < height; y++) {
      const scanY = Math.min(keep.height - 1, Math.floor((y * keep.height) / height));
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4 + 3;
        const scanX = Math.min(scanWidth - 1, Math.floor((x * scanWidth) / width));
        if (!keep.data[scanY * scanWidth + scanX]) {
          data[i] = 0; // an island out in the background, not the garment
          continue;
        }
        const alpha = data[i];
        if (alpha <= ALPHA_FLOOR) data[i] = 0;
        else if (alpha >= ALPHA_CEIL) data[i] = 255;
        else data[i] = Math.round(((alpha - ALPHA_FLOOR) / range) * 255);
      }
    }
    ctx.putImageData(image, 0, 0);

    return await encodeWithAlpha(canvas);
  } finally {
    bitmap.close();
  }
}

/** Coarse grid the island-removal pass works on — exact edges come from the alpha ramp, not from here. */
const REGION_SCAN_EDGE = 256;
/**
 * A region smaller than this share of the biggest one is background litter.
 *
 * Not "keep only the largest": a garment legitimately arrives in pieces — a
 * strappy top, a belt read separately from a dress, a two-piece laid out
 * together — and throwing all but one away would quietly delete real
 * clothing, which is a far worse failure than leaving a speck behind.
 *
 * 2% rather than something stricter, because the gap between the two cases is
 * enormous and there's no reason to run close to the edge of it: measured
 * against a test mask, background specks came in around 0.2% of the garment
 * while a separate waistband piece was 10%. An earlier 15% cutoff deleted
 * that waistband.
 */
const REGION_MIN_SHARE = 0.02;

/**
 * Marks which parts of the mask belong to a region big enough to be clothing.
 *
 * The model reliably leaves a few stray blobs floating in the background, and
 * those survive an alpha threshold perfectly well because they're opaque —
 * they're just not the garment. Connectivity is what separates them: they
 * don't touch the main mass.
 *
 * Labelled on a coarse grid with an explicit stack rather than recursion; a
 * flood fill over a megapixel image recurses deep enough to blow the stack.
 */
function solidRegions(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): { data: Uint8Array; width: number; height: number } {
  const scale = Math.min(1, REGION_SCAN_EDGE / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));

  const solid = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const sourceY = Math.min(height - 1, Math.floor((y * height) / h));
    for (let x = 0; x < w; x++) {
      const sourceX = Math.min(width - 1, Math.floor((x * width) / w));
      solid[y * w + x] = data[(sourceY * width + sourceX) * 4 + 3] > ALPHA_FLOOR ? 1 : 0;
    }
  }

  const label = new Int32Array(w * h).fill(-1);
  const sizes: number[] = [];
  const stack: number[] = [];

  for (let start = 0; start < solid.length; start++) {
    if (!solid[start] || label[start] !== -1) continue;
    const id = sizes.length;
    let size = 0;
    stack.push(start);
    label[start] = id;

    while (stack.length > 0) {
      const cell = stack.pop() as number;
      size++;
      const x = cell % w;
      const y = (cell / w) | 0;
      if (x > 0) push(cell - 1);
      if (x < w - 1) push(cell + 1);
      if (y > 0) push(cell - w);
      if (y < h - 1) push(cell + w);
    }
    sizes.push(size);

    function push(next: number) {
      if (solid[next] && label[next] === -1) {
        label[next] = id;
        stack.push(next);
      }
    }
  }

  const largest = sizes.length > 0 ? Math.max(...sizes) : 0;
  const threshold = largest * REGION_MIN_SHARE;
  const keep = new Uint8Array(w * h);
  for (let i = 0; i < keep.length; i++) {
    keep[i] = label[i] >= 0 && sizes[label[i]] >= threshold ? 1 : 0;
  }
  return { data: keep, width: w, height: h };
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
