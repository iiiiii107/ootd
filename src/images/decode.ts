/**
 * HEIC/HEIF brands under the ISO base media file format `ftyp` box. iOS
 * usually hands the picker a JPEG already, but not always (spec R4) — so
 * this is a fallback path, not the common case.
 */
const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1']);

/**
 * Sniffs the file's magic bytes rather than trusting the extension or MIME
 * type, both of which iOS gets wrong often enough to matter.
 */
export async function isHeic(file: Blob): Promise<boolean> {
  if (file.size < 12) return false;
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const boxType = String.fromCharCode(...header.slice(4, 8));
  if (boxType !== 'ftyp') return false;
  const brand = String.fromCharCode(...header.slice(8, 12)).toLowerCase();
  return HEIC_BRANDS.has(brand);
}

/**
 * Converts a HEIC/HEIF file to JPEG; passes any other image straight through.
 *
 * `heic-to` bundles the libheif WASM decoder inline (a multi-MB module), so
 * it is imported dynamically here rather than at the top of the file — the
 * fallback path stays out of the main bundle and only loads when an actual
 * HEIC file shows up. Vite's build still emits it as its own chunk, which
 * the service worker precaches like every other build asset, so it works
 * offline too; it just isn't paid for on every page load.
 */
export async function ensureJpeg(file: Blob): Promise<Blob> {
  if (!(await isHeic(file))) return file;
  const { heicTo } = await import('heic-to');
  return heicTo({ blob: file, type: 'image/jpeg', quality: 0.92 });
}
