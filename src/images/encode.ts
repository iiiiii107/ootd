/**
 * Canvas → Blob, in the smallest format that still carries transparency.
 *
 * Cutouts have to keep their alpha channel so the app's own paper background
 * shows through instead of a white rectangle, which rules out the JPEG every
 * other image in the app uses. WebP with alpha is a fraction of the size of
 * the equivalent PNG — a real concern when the whole wardrobe lives in one
 * device's storage — so it's tried first, with PNG as the fallback for any
 * browser whose canvas won't encode it.
 *
 * The probe result is remembered: the answer can't change mid-session, and a
 * failed WebP encode per photo would be pure waste on a batch import.
 */

const QUALITY = 0.9;

type AlphaFormat = 'image/webp' | 'image/png';

let known: AlphaFormat | null = null;

export async function encodeWithAlpha(canvas: OffscreenCanvas): Promise<Blob> {
  if (known !== 'image/png') {
    try {
      const blob = await canvas.convertToBlob({ type: 'image/webp', quality: QUALITY });
      // A canvas that doesn't know the format doesn't necessarily throw — it
      // may quietly hand back a PNG instead, so check what actually came out.
      if (blob.type === 'image/webp') {
        known = 'image/webp';
        return blob;
      }
    } catch {
      /* fall through to PNG */
    }
    known = 'image/png';
  }
  return canvas.convertToBlob({ type: 'image/png' });
}
