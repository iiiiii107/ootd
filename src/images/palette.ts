import { mergeSwatches, rgbToHex, type Swatch } from '../logic/colour';

/**
 * The colours a garment is actually made of.
 *
 * This replaces `dominantColor`, which averaged every pixel of the *plain*
 * crop and never looked at alpha — so a black top photographed against a white
 * wall was stored as mid grey. Every garment's colour was partly the colour of
 * the room it was photographed in, which makes matching meaningless.
 *
 * Two things fix that: read the *cutout* where there is one, and skip the
 * pixels that are background. What is left is the garment.
 *
 * `PixelSource` is structurally an `ImageData`, kept as its own type so the
 * extraction stays a pure function, testable without a DOM.
 */
export interface PixelSource {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/**
 * Alpha at or above this counts as garment.
 *
 * 200 rather than a midpoint 128, and the difference matters: cutout thumbs go
 * through `encodeWithAlpha` as lossy WebP, so a pixel at the garment's edge is
 * literally a blend of the garment and the wall behind it — the exact
 * contamination this module exists to remove. A lower threshold readmits the
 * halo and the feature quietly under-performs in a way that looks like the
 * colour maths being wrong.
 */
const OPAQUE = 200;

/** Colour resolution of the histogram: 4 bits a channel, so 4096 buckets. */
const BUCKET_BITS = 4;
/** Below this share a colour is a detail, not something you would say you wear. */
const MIN_SHARE = 0.1;
const MAX_SWATCHES = 3;
/** Too few garment pixels to trust — fall back to the centre of the frame. */
const MIN_SAMPLE = 64;

export interface PaletteOptions {
  /** Sample only the middle of the frame, for a photo with no cutout to guide us. */
  centreOnly?: boolean;
}

/**
 * Up to three colours, largest share first.
 *
 * A fixed histogram rather than k-means, deliberately: clustering is
 * randomised, which would make the backfill produce different answers on
 * different runs and the tests flaky. This is deterministic, O(pixels), and
 * good enough — a garment has a handful of colours, not a continuum.
 *
 * Returns `[]` for an image with nothing in it. Never `#000000`: confusing
 * "unknown" with "black" is precisely the bug this module replaces, in
 * miniature.
 */
export function extractPalette(pixels: PixelSource, options: PaletteOptions = {}): Swatch[] {
  const counts = new Map<number, { r: number; g: number; b: number; n: number }>();
  const shift = 8 - BUCKET_BITS;

  const sample = (skipTransparent: boolean, centreOnly: boolean) => {
    counts.clear();
    const { data, width, height } = pixels;
    const x0 = centreOnly ? Math.floor(width * 0.2) : 0;
    const x1 = centreOnly ? Math.ceil(width * 0.8) : width;
    const y0 = centreOnly ? Math.floor(height * 0.2) : 0;
    const y1 = centreOnly ? Math.ceil(height * 0.8) : height;

    let total = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * width + x) * 4;
        if (skipTransparent && data[i + 3] < OPAQUE) continue;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const key = ((r >> shift) << (BUCKET_BITS * 2)) | ((g >> shift) << BUCKET_BITS) | (b >> shift);
        const bin = counts.get(key);
        if (bin) {
          bin.r += r;
          bin.g += g;
          bin.b += b;
          bin.n++;
        } else {
          counts.set(key, { r, g, b, n: 1 });
        }
        total++;
      }
    }
    return total;
  };

  let total = sample(true, options.centreOnly ?? false);

  // Barely anything opaque: either there is no alpha channel to speak of, or
  // the cutout removed almost everything. The thumb is already a centre view of
  // the garment, so the middle of the frame is the honest next best guess.
  if (total < MIN_SAMPLE && !options.centreOnly) {
    total = sample(true, true);
  }
  if (total < MIN_SAMPLE) return [];

  const raw: Swatch[] = [...counts.values()]
    .map((bin) => ({
      hex: rgbToHex(bin.r / bin.n, bin.g / bin.n, bin.b / bin.n),
      share: bin.n / total,
    }))
    .sort((a, b) => b.share - a.share);

  const merged = mergeSwatches(raw);
  const kept = merged.filter((s) => s.share >= MIN_SHARE).slice(0, MAX_SWATCHES);
  // Everything was below the threshold — a photo of nothing but fine texture.
  // Keep the largest rather than returning "unknown", which would be a lie.
  const chosen = kept.length > 0 ? kept : merged.slice(0, 1);

  const sum = chosen.reduce((s, c) => s + c.share, 0);
  return sum > 0 ? chosen.map((c) => ({ ...c, share: c.share / sum })) : [];
}

/**
 * The same, from a stored thumbnail.
 *
 * Must not fill the canvas before drawing: a fresh `OffscreenCanvas` is
 * transparent, and that transparency is exactly what carries the cutout's
 * information about where the garment is not.
 */
export async function paletteFromThumb(thumb: Blob, hasCutout: boolean): Promise<Swatch[]> {
  const bitmap = await createImageBitmap(thumb);
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return [];
    ctx.drawImage(bitmap, 0, 0);
    const pixels = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    // Without a cutout every pixel is opaque, including the wall, so the centre
    // of the frame is all we have to go on.
    return extractPalette(pixels, { centreOnly: !hasCutout });
  } finally {
    bitmap.close();
  }
}
