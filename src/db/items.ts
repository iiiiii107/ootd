import { db } from './schema';
import type { Category, Item } from './types';

const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days, spec §4.4

/** Everything a caller must supply to create an item; the rest defaults. */
export interface NewItemInput {
  category: Category;
  image: Blob;
  thumb: Blob;
  dominantColor: string;
  hasCutout?: boolean;
  name?: string;
}

/**
 * `Top 14` / `Bottom 7` — a counter over items ever created in this category,
 * so import is never blocked on the user typing a name (spec §4.1, §7.4).
 */
export async function suggestName(category: Category): Promise<string> {
  const count = await db.items.where('category').equals(category).count();
  const label = category.charAt(0).toUpperCase() + category.slice(1);
  return `${label} ${count + 1}`;
}

export async function createItem(input: NewItemInput): Promise<Item> {
  const now = Date.now();
  const item: Item = {
    id: crypto.randomUUID(),
    name: input.name ?? (await suggestName(input.category)),
    category: input.category,
    image: input.image,
    thumb: input.thumb,
    hasCutout: input.hasCutout ?? false,
    seasons: [],
    formality: null,
    location: null,
    elsewhereNote: '',
    vibe: null,
    favorite: false,
    inWash: false,
    customTags: [],
    dominantColor: input.dominantColor,
    memberIds: [],
    notes: '',
    lastWornAt: null,
    wearCount: 0,
    archived: false,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  await db.items.add(item);
  return item;
}

export async function getItem(id: string): Promise<Item | undefined> {
  return db.items.get(id);
}

export async function updateItem(id: string, patch: Partial<Item>): Promise<void> {
  await db.items.update(id, { ...patch, updatedAt: Date.now() });
}

export async function toggleFavorite(id: string): Promise<void> {
  const item = await db.items.get(id);
  if (!item) return;
  await updateItem(id, { favorite: !item.favorite });
}

export async function toggleWash(id: string): Promise<void> {
  const item = await db.items.get(id);
  if (!item) return;
  await updateItem(id, { inWash: !item.inWash });
}

export async function archiveItem(id: string, archived = true): Promise<void> {
  await updateItem(id, { archived });
}

/**
 * Trash an item. If it is referenced by any saved outfit's `memberIds`, that
 * outfit is trashed too (spec §4.4) — the caller is expected to have already
 * warned the user via `outfitsReferencing`.
 */
export async function trashItem(id: string): Promise<void> {
  const now = Date.now();
  const broken = await outfitsReferencing(id);
  await db.transaction('rw', db.items, async () => {
    await db.items.update(id, { deletedAt: now, updatedAt: now });
    for (const outfit of broken) {
      await db.items.update(outfit.id, { deletedAt: now, updatedAt: now });
    }
  });
}

/** Saved outfits that would break if `itemId` were removed. Used to warn before trashing. */
export async function outfitsReferencing(itemId: string): Promise<Item[]> {
  const outfits = await db.items.where('category').equals('outfit').toArray();
  return outfits.filter((o) => o.memberIds.includes(itemId) && o.deletedAt == null);
}

export async function restoreItem(id: string): Promise<void> {
  await updateItem(id, { deletedAt: null });
}

/** Hard-deletes anything trashed more than 30 days ago. Call once at app start. */
export async function purgeExpiredTrash(): Promise<number> {
  const cutoff = Date.now() - TRASH_RETENTION_MS;
  // IndexedDB never indexes a `null` key, so items that were never trashed
  // (deletedAt === null) are simply absent from this range — no extra filter needed.
  const expired = await db.items.where('deletedAt').below(cutoff).toArray();
  if (expired.length > 0) {
    await db.items.bulkDelete(expired.map((i) => i.id));
  }
  return expired.length;
}
