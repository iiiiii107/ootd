import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

import { setMeta } from './meta';
import { db } from './schema';
import type { CustomTag, Item, Wear } from './types';

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

type ManifestItem = Omit<Item, 'image' | 'thumb' | 'originalImage'>;

interface Manifest {
  /**
   * 2 adds the wear log. Read leniently rather than rejected on mismatch: a
   * version-1 archive is still a complete wardrobe, it simply predates the
   * log, and refusing to restore someone's clothes over a missing field
   * would be the worst possible trade in this particular file.
   */
  version: 1 | 2;
  exportedAt: number;
  items: ManifestItem[];
  tags: CustomTag[];
  wears?: Wear[];
}

export async function exportBackup(): Promise<Blob> {
  const items = await db.items.filter((item) => item.deletedAt == null).toArray();
  const tags = await db.tags.toArray();
  const wears = await db.wears.toArray();

  const manifest: Manifest = {
    version: 2,
    exportedAt: Date.now(),
    items: items.map(({ image: _image, thumb: _thumb, originalImage: _original, ...rest }) => rest),
    tags,
    // Plain JSON, no blobs: the log is references and dates. Without it a
    // restore would bring the wardrobe back and silently lose every ootd.
    wears,
  };

  const files: Record<string, Uint8Array> = {
    'manifest.json': strToU8(JSON.stringify(manifest)),
  };
  for (const item of items) {
    // An outfit built from wardrobe pieces carries no photograph of its own —
    // it is its members, and their images are already in this archive. Nothing
    // to write, and nothing lost: it recomposes from them on restore.
    if (!item.image || !item.thumb) continue;
    files[`images/${item.id}.jpg`] = new Uint8Array(await item.image.arrayBuffer());
    files[`thumbs/${item.id}.jpg`] = new Uint8Array(await item.thumb.arrayBuffer());
    // The pre-cutout copy, where one was kept — without it a restored
    // wardrobe could never put a background back.
    if (item.originalImage) {
      files[`originals/${item.id}.jpg`] = new Uint8Array(await item.originalImage.arrayBuffer());
    }
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
    // An outfit assembled from wardrobe pieces has no photograph by design,
    // so missing files are expected there and only there. For a garment they
    // still mean a damaged archive, and that must not import silently.
    if (!image || !thumb) {
      if (meta.category === 'outfit' && meta.memberIds.length > 0) {
        return { ...meta, image: null, thumb: null, originalImage: null };
      }
      throw new Error(`Backup is missing photos for "${meta.name}".`);
    }
    const original = files[`originals/${meta.id}.jpg`];
    return {
      ...meta,
      image: new Blob([image as BlobPart], { type: 'image/jpeg' }),
      thumb: new Blob([thumb as BlobPart], { type: 'image/jpeg' }),
      // Absent for anything whose background was never removed, and for
      // archives written before originals were kept.
      originalImage: original ? new Blob([original as BlobPart], { type: 'image/jpeg' }) : null,
    };
  });

  // bulkPut, not bulkAdd — preserves original ids, so memberIds and
  // customTags references between items stay intact, and re-running the
  // same import twice is a safe no-op rather than a duplicate-key error.
  await db.transaction('rw', db.items, db.tags, db.wears, async () => {
    await db.items.bulkPut(items);
    await db.tags.bulkPut(manifest.tags);
    // Absent in a version-1 archive; restoring it as an empty list would
    // wipe a log the device already had.
    if (manifest.wears?.length) await db.wears.bulkPut(manifest.wears);
  });

  return { itemCount: items.length, tagCount: manifest.tags.length };
}
