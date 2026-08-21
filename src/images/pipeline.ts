import { extractDominantColor } from './color';
import { FULL_FRAME, cropToBlob, detectSubjectBounds, type CropRect } from './crop';
import { cleanMask, cropToThumb, segment } from './cutout';
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
}

/**
 * Everything known about a photo before the user has chosen a crop. Held in
 * memory only for as long as the crop step is on screen.
 */
export interface PhotoAnalysis {
  /** The resized, compressed photo — the crop step's backdrop, and the source of the plain image. */
  base: Blob;
  /** Transparent-PNG segmentation of `base`, or null if it was off or failed. */
  cutout: Blob | null;
  /** Where the crop box starts. The detected garment, or the whole frame. */
  suggestedCrop: CropRect;
  /** True only when the box above actually came from detection — the crop step says so. */
  detected: boolean;
}

/**
 * Phase one of import: decode, resize, and (optionally) find the garment.
 * Stops short of saving anything, because the crop step comes between.
 *
 * Detection and background removal are the same single inference pass — the
 * model's alpha mask *is* the garment outline — so having both switched on
 * costs no more than having either one on (src/images/cutout.ts).
 */
export async function analyzePhoto(file: Blob, options: AnalyzeOptions): Promise<PhotoAnalysis> {
  const jpeg = await ensureJpeg(file);
  const { image: base } = await processImage(jpeg);

  if (!options.detect && !options.cutout) {
    return { base, cutout: null, suggestedCrop: FULL_FRAME, detected: false };
  }

  const raw = await segment(base);
  // Cleaned once, here, so both the stored cutout and the detected bounds are
  // working from the same hardened mask rather than the model's raw haze.
  const cutout = raw ? await cleanMask(raw) : null;
  const bounds = options.detect && cutout ? await detectSubjectBounds(cutout) : null;

  return {
    base,
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
export async function finishPhoto(analysis: PhotoAnalysis, crop: CropRect): Promise<ImportedPhoto> {
  const plain = await cropToBlob(analysis.base, crop);
  const plainThumb = await cropToThumb(plain);
  const dominantColor = await extractDominantColor(plainThumb);

  if (!analysis.cutout) {
    return { image: plain, thumb: plainThumb, dominantColor, hasCutout: false };
  }

  try {
    // Transparency is kept all the way through rather than flattened onto
    // white — a cutout should sit directly on the app's paper background
    // wherever it's shown, not carry a white rectangle around with it.
    const image = await cropToBlob(analysis.cutout, crop, true);
    const thumb = await cropToThumb(image, true);
    return { image, thumb, dominantColor, hasCutout: true };
  } catch {
    // Same rule as everywhere else in this pipeline (spec R3): a cutout that
    // can't be produced falls back to the plain photo, never a failed import.
    return { image: plain, thumb: plainThumb, dominantColor, hasCutout: false };
  }
}
