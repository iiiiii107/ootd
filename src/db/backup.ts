import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

import { setMeta } from './meta';
import { db } from './schema';
import type { CustomTag, Item } from './types';

/**
 * Export/import backup (spec §12 R1) — the disaster-recovery escape hatch
 * for local-only storage. One `.ootd` file: a `manifest.json` of every
 * item's tags plus an `images/` and `thumbs/` folder of the actual JPEGs,
 * zipped with fflate. It's a real zip under a custom extension, so it can
 * sit in iCloud Drive and still be opened by any zip tool if needed.
 *
 * Trashed items are deliberately excluded — they're already on their way
 * out, and restoring them would resurrect things the user chose to delete.
 * Archived items are included; "no longer owned" is still worth keeping.
 */

type ManifestItem = Omit<Item, 'image' | 'thumb'>;

interface Manifest {
  version: 1;
  exportedAt: number;
  items: ManifestItem[];
  tags: CustomTag[];
}

export async function exportBackup(): Promise<Blob> {
  const items = await db.items.filter((item) => item.deletedAt == null).toArray();
  const tags = await db.tags.toArray();

  const manifest: Manifest = {
    version: 1,
    exportedAt: Date.now(),
    items: items.map(({ image: _image, thumb: _thumb, ...rest }) => rest),
    tags,
  };

  const files: Record<string, Uint8Array> = {
    'manifest.json': strToU8(JSON.stringify(manifest)),
  };
  for (const item of items) {
    files[`images/${item.id}.jpg`] = new Uint8Array(await item.image.arrayBuffer());
    files[`thumbs/${item.id}.jpg`] = new Uint8Array(await item.thumb.arrayBuffer());
  }

  const zipped = zipSync(files, { level: 6 });
  await setMeta('lastBackupAt', Date.now());
  // zipSync's Uint8Array wraps a plain ArrayBuffer here (not a SharedArrayBuffer),
  // but TS can't narrow that from the library's type, hence the cast.
  return new Blob([zipped as BlobPart], { type: 'application/zip' });
}

export interface ImportSummary {
  itemCount: number;
  tagCount: number;
}

export async function importBackup(file: Blob): Promise<ImportSummary> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const files = unzipSync(buf);

  const manifestBytes = files['manifest.json'];
  if (!manifestBytes) throw new Error('Not an ootd backup — manifest.json is missing.');
  const manifest = JSON.parse(strFromU8(manifestBytes)) as Manifest;

  const items: Item[] = manifest.items.map((meta) => {
    const image = files[`images/${meta.id}.jpg`];
    const thumb = files[`thumbs/${meta.id}.jpg`];
    if (!image || !thumb) throw new Error(`Backup is missing photos for "${meta.name}".`);
    return {
      ...meta,
      image: new Blob([image as BlobPart], { type: 'image/jpeg' }),
      thumb: new Blob([thumb as BlobPart], { type: 'image/jpeg' }),
    };
  });

  // bulkPut, not bulkAdd — preserves original ids, so memberIds and
  // customTags references between items stay intact, and re-running the
  // same import twice is a safe no-op rather than a duplicate-key error.
  await db.transaction('rw', db.items, db.tags, async () => {
    await db.items.bulkPut(items);
    await db.tags.bulkPut(manifest.tags);
  });

  return { itemCount: items.length, tagCount: manifest.tags.length };
}
