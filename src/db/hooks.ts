import { useLiveQuery } from 'dexie-react-hooks';

import { DEFAULT_APPEARANCE, type Appearance } from '../design/theme';
import { APPEARANCE_KEY } from './appearance';
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

/** Every custom tag value across every group (spec §4.2), for the group manager and `useGroups`. */
export function useCustomTags(): CustomTag[] | undefined {
  return useLiveQuery(() => db.tags.orderBy('sortOrder').toArray(), []);
}

/** Trashed items (spec §4.4), newest-trashed first — Settings' Trash section. */
export function useTrashedItems(): Item[] | undefined {
  return useLiveQuery(
    () =>
      db.items
        .filter((item) => item.deletedAt != null)
        .toArray()
        .then((items) => items.sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0))),
    [],
  );
}

/** Archived items (spec §4.4), newest first — Settings' Archived section. */
export function useArchivedItems(): Item[] | undefined {
  return useLiveQuery(
    () =>
      db.items
        .orderBy('createdAt')
        .reverse()
        .filter((item) => item.archived && item.deletedAt == null)
        .toArray(),
    [],
  );
}

/**
 * How many items are sitting in the wash right now. Archived and trashed
 * items don't count — they aren't in a real laundry basket, whatever their
 * stale `inWash` flag says.
 *
 * Filtered rather than index-queried: IndexedDB can't use a boolean as a key,
 * so the `inWash` index in the schema never actually serves a lookup.
 */
export function useWashCount(): number {
  const count = useLiveQuery(
    () => db.items.filter((item) => item.inWash && !item.archived && item.deletedAt == null).count(),
    [],
  );
  return count ?? 0;
}

/** A single item, live — independent of any filtered list it might drop out of mid-edit. */
export function useItem(id: string | null): Item | undefined {
  return useLiveQuery(() => (id ? db.items.get(id) : undefined), [id]);
}

/**
 * Automatic background removal is the locked default (spec §2), with a
 * visible off switch living in Settings (spec §7.5) — reactive so a change
 * there is picked up immediately by Add without needing a remount.
 */
export function useCutoutEnabled(): boolean {
  return useFlag('backgroundRemovalEnabled');
}

/**
 * Automatic garment detection: whether the crop box arrives pre-drawn around
 * the clothing rather than around the whole frame. On by default, off-switch
 * in Settings alongside background removal — the two share one inference pass
 * (src/images/pipeline.ts) but are genuinely independent choices.
 */
export function useAutoDetectEnabled(): boolean {
  return useFlag('autoDetectEnabled');
}

/** A boolean in `meta`, defaulting to on — both photo features are locked defaults (spec §2). */
function useFlag(key: string): boolean {
  const value = useLiveQuery(async () => {
    const entry = await db.meta.get(key);
    return (entry?.value as boolean | undefined) ?? true;
  }, [key]);
  return value ?? true;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * The backup nag's own condition (spec §12 R1): more than 30 days since the
 * last export, *and* at least one item has been added since then — an
 * unchanged wardrobe never needs re-backing-up just because a month passed.
 */
export function useNeedsBackup(): boolean {
  const result = useLiveQuery(async () => {
    const entry = await db.meta.get('lastBackupAt');
    const lastBackupAt = (entry?.value as number | undefined) ?? null;
    const overdue = lastBackupAt == null || Date.now() - lastBackupAt > THIRTY_DAYS_MS;
    if (!overdue) return false;
    const newItemCount = await db.items.where('createdAt').above(lastBackupAt ?? 0).count();
    return newItemCount > 0;
  }, []);
  return result ?? false;
}

/**
 * The stored appearance, live. Everything visual it controls is already on
 * the document by the time this resolves (see `bootAppearance`), so this is
 * for the Settings screen's own controls rather than for styling anything.
 */
export function useAppearance(): Appearance {
  const value = useLiveQuery(async () => {
    const entry = await db.meta.get(APPEARANCE_KEY);
    return { ...DEFAULT_APPEARANCE, ...(entry?.value as Partial<Appearance> | undefined) };
  }, []);
  return value ?? DEFAULT_APPEARANCE;
}
