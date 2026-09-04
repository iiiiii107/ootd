import { extractDominantColor } from './color';
import { FULL_FRAME, cropToBlob, detectSubjectBounds, type CropRect } from './crop';
import { cleanMask, cropToThumb, segment, type ModelChoice } from './cutout';
import { ensureJpeg } from './decode';
import { processImage } from './process';

export interface ImportedPhoto {
  image: Blob;
  thumb: Blob;
  dominantColor: string;
  hasCutout: boolean;
}

export interface AnalyzeOptions {
  /** Pre-fill the crop box with the detected garment's bounds. */
  detect: boolean;
  /** Store the background-removed version rather than the plain photo. */
  cutout: boolean;
  /** Which segmentation model to use (spec §7.5). */
  model?: ModelChoice;
}

/**
 * What the model found. Arrives *after* the crop step is already on screen,
 * and after the garment may already have been saved.
 */
export interface PhotoSegmentation {
  /** Transparent-PNG segmentation of the base photo, or null if it was off or failed. */
  cutout: Blob | null;
  /** Where the crop box should sit. The detected garment, or the whole frame. */
  suggestedCrop: CropRect;
  /** True only when the box above actually came from detection — the crop step says so. */
  detected: boolean;
}

/**
 * Phase one: decode and resize. Measured at ~60ms, and deliberately does not
 * touch the model.
 *
 * This used to run segmentation too, and that is what made importing a single
 * garment take ten seconds — the crop step could not appear until the model
 * had finished. Segmentation is now `segmentPhoto` below, started alongside
 * this and never waited on (src/screens/Add.tsx).
 */
export async function prepPhoto(file: Blob): Promise<Blob> {
  const jpeg = await ensureJpeg(file);
  const { image } = await processImage(jpeg);
  return image;
}

/**
 * The model pass: the garment's outline and its cutout, from one inference.
 *
 * ~9.5s, and no arrangement of inputs changes that — measured at 384px,
 * 512px, 768px and 1200px inputs, every one of them within 8% of the others,
 * because the model resizes to its own fixed resolution first. WebGPU came
 * within a second of the CPU path too. It cannot be made fast, so nothing is
 * allowed to wait on it.
 *
 * Detection and background removal share this single pass — the model's alpha
 * mask *is* the garment outline — so having both switched on costs no more
 * than having either one on.
 */
export async function segmentPhoto(base: Blob, options: AnalyzeOptions): Promise<PhotoSegmentation> {
  if (!options.detect && !options.cutout) {
    return { cutout: null, suggestedCrop: FULL_FRAME, detected: false };
  }

  const raw = await segment(base, options.model);
  // Cleaned once, here, so both the stored cutout and the detected bounds are
  // working from the same hardened mask rather than the model's raw haze.
  const cutout = raw ? await cleanMask(raw) : null;
  const bounds = options.detect && cutout ? await detectSubjectBounds(cutout) : null;

  return {
    cutout: options.cutout ? cutout : null,
    suggestedCrop: bounds ?? FULL_FRAME,
    detected: bounds != null,
  };
}

/**
 * Phase two: apply the chosen crop and produce what actually gets stored.
 *
 * The same normalised rect crops both the plain photo and the cutout, which
 * are pixel-aligned with each other, so the two stay in register no matter
 * which one ends up being saved.
 *
 * Dominant colour is always sampled from the plain crop, never the cutout —
 * post-cutout, much of the frame is flat white background, which would skew
 * the average away from the garment itself.
 */
export async function finishPhoto(
  base: Blob,
  crop: CropRect,
  cutout: Blob | null = null,
): Promise<ImportedPhoto> {
  const plain = await cropToBlob(base, crop);
  const plainThumb = await cropToThumb(plain);
  const dominantColor = await extractDominantColor(plainThumb);

  if (!cutout) {
    return { image: plain, thumb: plainThumb, dominantColor, hasCutout: false };
  }

  try {
    // Transparency is kept all the way through rather than flattened onto
    // white — a cutout should sit directly on the app's paper background
    // wherever it's shown, not carry a white rectangle around with it.
    const image = await cropToBlob(cutout, crop, true);
    const thumb = await cropToThumb(image, true);
    return { image, thumb, dominantColor, hasCutout: true };
  } catch {
    // Same rule as everywhere else in this pipeline (spec R3): a cutout that
    // can't be produced falls back to the plain photo, never a failed import.
    return { image: plain, thumb: plainThumb, dominantColor, hasCutout: false };
  }
}
