import { useLiveQuery } from 'dexie-react-hooks';

import { db } from './schema';
import type { CustomTag, Item } from './types';

/**
 * The base wardrobe list: newest first, trashed items excluded outright
 * (spec §4.4), and `outfit`-category items excluded outright too — those
 * live in their own Outfits view (spec §7.3), never mixed into the wardrobe
 * grid. Archived items are *not* excluded here — the `archivedOnly` filter
 * in `filterItems` (src/db/query.ts) needs to see them to implement the
 * "Archived view" toggle, so that exclusion lives there instead.
 */
export function useWardrobeItems(): Item[] | undefined {
  return useLiveQuery(
    () =>
      db.items
        .orderBy('createdAt')
        .reverse()
        .filter((item) => item.deletedAt == null && item.category !== 'outfit')
        .toArray(),
    [],
  );
}

/**
 * The Outfits view's own list (spec §7.3): `outfit`-category items only,
 * newest first, trashed excluded. Both kinds live here together — real
 * worn looks photographed with category `outfit`, and composites saved
 * from the randomizer — the category is all that distinguishes them.
 */
export function useOutfitItems(): Item[] | undefined {
  return useLiveQuery(
    () =>
      db.items
        .orderBy('createdAt')
        .reverse()
        .filter((item) => item.deletedAt == null && item.category === 'outfit')
        .toArray(),
    [],
  );
}

/**
 * Every custom tag value across every group (spec §4.2). Empty until Phase 6
 * ships a group manager — `useGroups` still merges over this list today so
 * that manager needs no changes here when it lands (spec §15).
 */
export function useCustomTags(): CustomTag[] | undefined {
  return useLiveQuery(() => db.tags.orderBy('sortOrder').toArray(), []);
}

/** A single item, live — independent of any filtered list it might drop out of mid-edit. */
export function useItem(id: string | null): Item | undefined {
  return useLiveQuery(() => (id ? db.items.get(id) : undefined), [id]);
}
