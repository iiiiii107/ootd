import { paletteFromThumbAsync } from '../images/pipelineClient';
import { mergeSwatches } from '../logic/colour';
import { PALETTE_VERSION, USER_SET_PALETTE } from './paletteVersion';
import type { Item } from './types';
import { db } from './schema';

/**
 * Give every garment already in the wardrobe its real colours.
 *
 * Existing items carry `dominantColor`, which averaged the whole crop
 * including the background — unusable for matching. This re-reads the colours
 * from thumbnails that are already on disk: no model, no network, nothing that
 * can fail the way importing can. It is the cheap half of the colour feature,
 * which is exactly why it can run on every launch.
 *
 * **Not a Dexie upgrade**, and it cannot be one: an upgrade transaction dies
 * the moment it awaits a non-Dexie promise, and decoding two hundred
 * thumbnails is nothing but non-Dexie promises. It is a boot task instead.
 *
 * Idempotent through each item's own `paletteVersion` rather than a global
 * "done" flag, so an interrupted run simply resumes — deliberately unlike
 * `migrateDensityDefault`, which uses a flag because it overrides a choice the
 * user might have made and must therefore happen exactly once.
 */

/** Items per chunk. Small enough that the main thread never waits noticeably. */
const CHUNK = 8;

export async function backfillPalettes(): Promise<number> {
  const stale = await db.items.filter(needsReading).toArray();
  if (stale.length === 0) return 0;

  let done = 0;

  // Garments first: an outfit's colours are pooled from its members, so it can
  // only be right once they are.
  const garments = stale.filter((item) => item.thumb != null);
  const outfits = stale.filter((item) => item.thumb == null && item.memberIds.length > 0);

  for (let i = 0; i < garments.length; i += CHUNK) {
    for (const item of garments.slice(i, i + CHUNK)) {
      try {
        const palette = await paletteFromThumbAsync(item.thumb as Blob, item.hasCutout);
        await write(item.id, palette);
        done++;
      } catch {
        // Leave it stale and try again next launch. One unreadable thumbnail
        // must not stop the wardrobe getting its colours.
      }
    }
    // Let the app paint between chunks.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  for (const outfit of outfits) {
    try {
      const members = (await db.items.bulkGet(outfit.memberIds)).filter((m) => m != null);
      if (members.length === 0) continue;
      const pooled = mergeSwatches(
        members.flatMap((m) => m.palette.map((s) => ({ ...s, share: s.share / members.length }))),
      ).slice(0, 3);
      await write(outfit.id, pooled);
      done++;
    } catch {
      /* same discipline */
    }
  }

  return done;
}

/**
 * Writes through `db.items.update` rather than `updateItem`, deliberately: that
 * helper stamps `updatedAt`, and `updatedAt` means "the user changed this". A
 * background re-read of a colour is not the user, and letting it touch that
 * field would reorder a wardrobe sorted by it for no reason anybody could see.
 */
async function write(id: string, palette: { hex: string; share: number }[]): Promise<void> {
  await db.items.update(id, {
    palette,
    paletteVersion: PALETTE_VERSION,
    dominantColor: palette[0]?.hex ?? '#000000',
  });
}

/** How many garments are still waiting, for Settings to show while it runs. */
export async function pendingPaletteCount(): Promise<number> {
  return db.items.filter(needsReading).count();
}

/**
 * A garment whose colours are stale — but never one the user has corrected by
 * hand. Their answer outranks ours by definition: they are looking at the
 * garment and we are looking at a thumbnail.
 */
function needsReading(item: Item): boolean {
  return (
    item.deletedAt == null &&
    item.paletteVersion !== PALETTE_VERSION &&
    item.paletteVersion !== USER_SET_PALETTE
  );
}
