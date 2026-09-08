import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

import type { Appearance } from '../design/theme';
import { DENSITY_MIGRATED_KEY, updateAppearance } from './appearance';
import { type BackupSettings, pickBackupSettings, readBackupSettings } from './backupSettings';
import { ENABLED_GROUPS_KEY, ENABLED_GROUPS_MIGRATED_KEY } from './groupSettings';
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
   * 2 adds the wear log, 3 the settings. Every version is read leniently
   * rather than rejected on mismatch: an older archive is still a complete
   * wardrobe, it simply predates a field, and refusing to restore someone's
   * clothes over a missing key would be the worst possible trade in this
   * particular file. Nothing here is ever required — the manifest is the
   * only thing that is.
   */
  version: 1 | 2 | 3;
  exportedAt: number;
  items: ManifestItem[];
  tags: CustomTag[];
  wears?: Wear[];
  settings?: BackupSettings;
}

export async function exportBackup(): Promise<Blob> {
  const items = await db.items.filter((item) => item.deletedAt == null).toArray();
  const tags = await db.tags.toArray();
  const wears = await db.wears.toArray();
  // Read before the `lastBackupAt` write below, though it would make no
  // difference: that key is not on the allow-list, and cannot be.
  const settings = pickBackupSettings(await db.meta.toArray());

  const manifest: Manifest = {
    version: 3,
    exportedAt: Date.now(),
    items: items.map(({ image: _image, thumb: _thumb, originalImage: _original, ...rest }) => rest),
    tags,
    // Plain JSON, no blobs: the log is references and dates. Without it a
    // restore would bring the wardrobe back and silently lose every ootd.
    wears,
    // So a restored phone looks and behaves like the one it came from, not
    // like a fresh install wearing someone else's clothes.
    settings,
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
  settingsRestored: boolean;
}

/**
 * The stored type of a photo, read from the file rather than assumed.
 *
 * Cutouts are WebP, because that is the only format here that keeps an alpha
 * channel; plain crops are JPEG. The archive does not record which is which
 * (the paths all end `.jpg`, from before cutouts existed), so a restore used
 * to label every blob `image/jpeg`. That mostly worked — `createImageBitmap`
 * and `<img>` both sniff the bytes and ignore the label — but "mostly" is
 * doing a lot of work in a file whose whole job is that nothing is lost, and
 * the colour backfill now reads alpha out of exactly these blobs.
 */
function imageType(bytes: Uint8Array): string {
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[8] === 0x57 && bytes[9] === 0x45) {
    return 'image/webp'; // 'RIFF' … 'WE' of 'WEBP'
  }
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png';
  return 'image/jpeg';
}

function toBlob(bytes: Uint8Array): Blob {
  return new Blob([bytes as BlobPart], { type: imageType(bytes) });
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
      image: toBlob(image),
      thumb: toBlob(thumb),
      // Absent for anything whose background was never removed, and for
      // archives written before originals were kept.
      originalImage: original ? toBlob(original) : null,
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

  // Deliberately after the transaction has committed, in its own try/catch: a
  // setting this build cannot make sense of must never take the clothes down
  // with it. The wardrobe is the irreplaceable half of this file; a colour
  // preference can be set again in ten seconds.
  let settingsRestored = false;
  try {
    settingsRestored = await restoreSettings(readBackupSettings(manifest.settings));
  } catch {
    // Nothing to tell the user: their wardrobe is back, and the app is
    // sitting on its defaults, which is exactly where it started.
  }

  return { itemCount: items.length, tagCount: manifest.tags.length, settingsRestored };
}

/**
 * Write restored settings back through the app's own setters.
 *
 * `updateAppearance` rather than `db.meta.put` is the non-obvious part: it is
 * the only thing that writes the synchronous localStorage mirror *and* puts
 * the palette on the document. A direct meta write would restore a theme that
 * did not appear until a reload, and was then overwritten at the next launch
 * by a mirror that still held the defaults.
 *
 * The two migration flags are set alongside their settings. Both migrations
 * exist to move an install that never made a choice; an archive is a choice,
 * already made, and letting them run over a fresh restore would quietly
 * undo it on the first launch.
 */
async function restoreSettings(settings: BackupSettings): Promise<boolean> {
  if (settings.appearance) {
    // A merge, not a replacement, because that is what `updateAppearance` is
    // — and it comes to the same thing: every appearance write stores the
    // whole object, so an archive that carries one carries all of it.
    await updateAppearance(settings.appearance as Partial<Appearance>);
    await setMeta(DENSITY_MIGRATED_KEY, true);
  }
  if (settings.enabledGroups) {
    await setMeta(ENABLED_GROUPS_KEY, settings.enabledGroups);
    await setMeta(ENABLED_GROUPS_MIGRATED_KEY, true);
  }
  // The rest are plain values with no mirror and nothing to apply, so `meta`
  // is genuinely all there is to write. The hooks that read them are live
  // queries, so the Settings screen updates itself.
  const plain = [
    'autoDetectEnabled',
    'backgroundRemovalEnabled',
    'segmentationModel',
    'colourPreferences',
  ] as const;
  for (const key of plain) {
    if (settings[key] !== undefined) await setMeta(key, settings[key]);
  }

  return Object.keys(settings).length > 0;
}
