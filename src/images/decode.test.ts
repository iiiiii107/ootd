import { describe, expect, it } from 'vitest';

import { isHeic } from './decode';

function ftypBox(brand: string): Blob {
  const bytes = new Uint8Array(16);
  // bytes 0-4: box size, unread by isHeic.
  bytes.set([0x66, 0x74, 0x79, 0x70], 4); // "ftyp"
  for (let i = 0; i < 4; i++) bytes[8 + i] = brand.charCodeAt(i);
  return new Blob([bytes]);
}

describe('isHeic', () => {
  it('recognises the heic brand', async () => {
    expect(await isHeic(ftypBox('heic'))).toBe(true);
  });

  it('recognises heif general-purpose brands', async () => {
    expect(await isHeic(ftypBox('mif1'))).toBe(true);
  });

  it('is case-insensitive about the brand', async () => {
    expect(await isHeic(ftypBox('HEIC'))).toBe(true);
  });

  it('rejects a non-ftyp box, e.g. a PNG', async () => {
    const png = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])]);
    expect(await isHeic(png)).toBe(false);
  });

  it('rejects an unrelated ftyp brand, e.g. AVIF', async () => {
    expect(await isHeic(ftypBox('avif'))).toBe(false);
  });

  it('rejects a file too short to contain a box header', async () => {
    expect(await isHeic(new Blob([new Uint8Array(4)]))).toBe(false);
  });
});
