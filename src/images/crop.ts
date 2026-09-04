/**
 * Cropping, and the "find the garment" detection that pre-fills the crop box.
 *
 * Rectangles are normalised (0–1 of the source's own width/height) rather than
 * pixels, so one rect from the crop UI applies unchanged to both the plain
 * photo and its cutout, whatever size either happens to be.
 */

import { encodeWithAlpha } from './encode';

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const FULL_FRAME: CropRect = { x: 0, y: 0, width: 1, height: 1 };

/** Detection scans a downscaled copy — 200px is plenty for a bounding box and ~36× less pixel work. */
const SCAN_EDGE = 200;
/** Below this the pixel is background, or the soft antialiased fringe around the subject. */
const ALPHA_MIN = 24;
/**
 * Fraction of the total alpha allowed to fall outside the box on each side.
 *
 * Segmentation output is never clean at the edges — a faint haze of low-alpha
 * pixels usually survives across much of the frame, and a plain min/max scan
 * over "any pixel above the threshold" latches onto that haze and reports the
 * whole frame as the subject. Discarding the outermost 1% of the alpha *mass*
 * on each axis ignores the haze (which carries almost none of it) while
 * keeping genuinely thin parts of a garment like a sleeve (which carry
 * comparatively little per column, but far more than nothing).
 */
const TAIL_FRACTION = 0.01;
/**
 * Breathing room around the detected garment, as a fraction of its own size.
 * Deliberately generous: a box that's slightly loose costs one corner drag,
 * while a box that clips a sleeve off has to be noticed first.
 */
const PADDING = 0.06;
/** A subject smaller than this is almost certainly a detection failure, not a garment. */
const MIN_AREA = 0.01;

/** `alpha` keeps transparency (cutouts); otherwise the result is a JPEG like everything else. */
/**
 * Crop, then scale down — in that order, and that is the whole point.
 *
 * The app used to resize to 1200px and crop out of *that*, which meant a
 * garment cropped to 40% of the frame was stored at 360×480 and looked soft
 * the moment it filled a phone screen. Cropping the full-resolution photo
 * first and scaling the result gives 900×1200 from the same source: 2.5×
 * the detail in each direction, measured.
 *
 * It also encodes once rather than twice. The old path compressed to JPEG for
 * the intermediate and again for the crop, and the intermediate was never
 * stored — a whole generation of loss for nothing.
 */
export async function cropAndResize(
  source: Blob,
  rect: CropRect,
  maxEdge: number,
  quality: number,
): Promise<Blob> {
  const bitmap = await createImageBitmap(source);
  try {
    const { canvas } = drawCrop(bitmap, rect, maxEdge);
    return await canvas.convertToBlob({ type: 'image/jpeg', quality });
  } finally {
    // Closed before anything else opens one: two full-resolution bitmaps at
    // once is what kills the tab on a phone (spec R3).
    bitmap.close();
  }
}

/**
 * The garment at full crop resolution, wearing the mask's transparency.
 *
 * Colour comes from the sharp crop and only the alpha comes from the cutout,
 * because the mask is computed at 1200px and upscaling *it* would upscale the
 * garment's pixels too — throwing away the detail this whole change exists to
 * keep. A slightly soft mask edge on a sharp garment is the right way round;
 * the model's resolution was always the limit on edge precision anyway.
 */
export async function cropWithMask(
  source: Blob,
  mask: Blob,
  rect: CropRect,
): Promise<OffscreenCanvas> {
  const sourceBitmap = await createImageBitmap(source);
  let width: number;
  let height: number;
  let canvas: OffscreenCanvas;
  try {
    const drawn = drawCrop(sourceBitmap, rect, MAX_EDGE);
    canvas = drawn.canvas;
    width = drawn.width;
    height = drawn.height;
  } finally {
    sourceBitmap.close();
  }

  const maskBitmap = await createImageBitmap(mask);
  try {
    const maskCanvas = new OffscreenCanvas(width, height);
    const maskCtx = maskCanvas.getContext('2d');
    const ctx = canvas.getContext('2d');
    if (!maskCtx || !ctx) throw new Error('2D canvas context unavailable');

    const sx = Math.round(rect.x * maskBitmap.width);
    const sy = Math.round(rect.y * maskBitmap.height);
    const sw = Math.max(1, Math.round(rect.width * maskBitmap.width));
    const sh = Math.max(1, Math.round(rect.height * maskBitmap.height));
    maskCtx.drawImage(maskBitmap, sx, sy, sw, sh, 0, 0, width, height);

    const target = ctx.getImageData(0, 0, width, height);
    const from = maskCtx.getImageData(0, 0, width, height);
    for (let i = 3; i < target.data.length; i += 4) target.data[i] = from.data[i];
    ctx.putImageData(target, 0, 0);
    return canvas;
  } finally {
    maskBitmap.close();
  }
}

/** Shared geometry: crop `rect` out of `bitmap` and scale it to fit `maxEdge`. */
function drawCrop(
  bitmap: ImageBitmap,
  rect: CropRect,
  maxEdge: number,
): { canvas: OffscreenCanvas; width: number; height: number } {
  const sx = Math.round(rect.x * bitmap.width);
  const sy = Math.round(rect.y * bitmap.height);
  const sw = Math.max(1, Math.round(rect.width * bitmap.width));
  const sh = Math.max(1, Math.round(rect.height * bitmap.height));

  const scale = Math.min(1, maxEdge / Math.max(sw, sh));
  const width = Math.max(1, Math.round(sw * scale));
  const height = Math.max(1, Math.round(sh * scale));

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, width, height);
  return { canvas, width, height };
}

/** The longest edge a stored photo is allowed — matches src/images/process.ts. */
const MAX_EDGE = 1200;

export async function cropToBlob(source: Blob, rect: CropRect, alpha = false): Promise<Blob> {
  const bitmap = await createImageBitmap(source);
  try {
    const sx = Math.round(rect.x * bitmap.width);
    const sy = Math.round(rect.y * bitmap.height);
    const sw = Math.max(1, Math.round(rect.width * bitmap.width));
    const sh = Math.max(1, Math.round(rect.height * bitmap.height));
    const canvas = new OffscreenCanvas(sw, sh);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
    return alpha
      ? await encodeWithAlpha(canvas)
      : await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.82 });
  } finally {
    bitmap.close();
  }
}

/**
 * The bounding box of everything the segmentation model kept, padded a little.
 *
 * This is the whole of "automatic clothes detection": the background-removal
 * model already produces a per-pixel mask of the garment, so the garment's
 * extent is just that mask's alpha bounds. No second model, no extra download.
 *
 * Returns `null` when the mask is empty or covers essentially the whole frame
 * — in both cases there's nothing useful to suggest, and the caller should
 * fall back to the full frame rather than propose a nonsense crop.
 */
export async function detectSubjectBounds(cutout: Blob): Promise<CropRect | null> {
  const bitmap = await createImageBitmap(cutout);
  try {
    const scale = Math.min(1, SCAN_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);

    const columns = new Float64Array(w);
    const rows = new Float64Array(h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const alpha = data[(y * w + x) * 4 + 3];
        if (alpha < ALPHA_MIN) continue;
        columns[x] += alpha;
        rows[y] += alpha;
      }
    }

    const horizontal = span(columns);
    const vertical = span(rows);
    if (!horizontal || !vertical) return null; // nothing kept — no subject found

    return padRect(
      {
        x: horizontal.start / w,
        y: vertical.start / h,
        width: (horizontal.end - horizontal.start + 1) / w,
        height: (vertical.end - vertical.start + 1) / h,
      },
      PADDING,
    );
  } finally {
    bitmap.close();
  }
}

/** The range holding all but the outermost `TAIL_FRACTION` of the alpha on this axis. */
function span(totals: Float64Array): { start: number; end: number } | null {
  let mass = 0;
  for (const total of totals) mass += total;
  if (mass === 0) return null;

  const tail = mass * TAIL_FRACTION;
  let start = 0;
  let end = totals.length - 1;

  let seen = 0;
  for (let i = 0; i < totals.length; i++) {
    seen += totals[i];
    if (seen > tail) {
      start = i;
      break;
    }
  }
  seen = 0;
  for (let i = totals.length - 1; i >= 0; i--) {
    seen += totals[i];
    if (seen > tail) {
      end = i;
      break;
    }
  }

  return end > start ? { start, end } : null;
}

function padRect(rect: CropRect, padding: number): CropRect | null {
  if (rect.width * rect.height < MIN_AREA) return null;
  const px = rect.width * padding;
  const py = rect.height * padding;
  const x = Math.max(0, rect.x - px);
  const y = Math.max(0, rect.y - py);
  const padded: CropRect = {
    x,
    y,
    width: Math.min(1 - x, rect.width + px * 2),
    height: Math.min(1 - y, rect.height + py * 2),
  };
  // A "detection" that kept the entire frame tells the user nothing and just
  // makes the crop step feel broken. Treat it as no suggestion at all.
  if (padded.width > 0.98 && padded.height > 0.98) return null;
  return padded;
}
