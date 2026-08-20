import { db } from './schema';
import type { CustomTag } from './types';

/**
 * CRUD over the `tags` store (spec §4.2) — the custom tag-group manager's
 * data layer. Every write here keeps `items.customTags` in sync: deleting or
 * merging a value must not leave a dangling id no item's tag chips can
 * resolve back to a label.
 */

/** Creates a group's first value — a group only exists as the groupName on its rows, nothing separate to create first. */
export async function createTagValue(groupName: string, label: string, multiSelect: boolean): Promise<CustomTag> {
  const sortOrder = await db.tags.where('groupName').equals(groupName).count();
  const tag: CustomTag = { id: crypto.randomUUID(), groupName, label, multiSelect, sortOrder };
  await db.tags.add(tag);
  return tag;
}

/** Adds another value to an existing group, inheriting its multiSelect flag. */
export async function addTagValue(groupName: string, label: string): Promise<CustomTag> {
  const existing = await db.tags.where('groupName').equals(groupName).toArray();
  const multiSelect = existing[0]?.multiSelect ?? true;
  return createTagValue(groupName, label, multiSelect);
}

export async function renameTagValue(id: string, label: string): Promise<void> {
  await db.tags.update(id, { label });
}

/** Usage count — how many active (non-trashed) items currently carry this tag. */
export async function tagUsageCount(tagId: string): Promise<number> {
  const items = await db.items.where('customTags').equals(tagId).toArray();
  return items.filter((item) => item.deletedAt == null).length;
}

/** Deletes a value outright, pulling it out of every item that had it tagged. */
export async function deleteTagValue(id: string): Promise<void> {
  await db.transaction('rw', db.items, db.tags, async () => {
    const carriers = await db.items.where('customTags').equals(id).toArray();
    for (const item of carriers) {
      await db.items.update(item.id, { customTags: item.customTags.filter((t) => t !== id) });
    }
    await db.tags.delete(id);
  });
}

/** Deletes an entire group — every value in it, and every item's reference to any of them. */
export async function deleteTagGroup(groupName: string): Promise<void> {
  const rows = await db.tags.where('groupName').equals(groupName).toArray();
  for (const row of rows) {
    await deleteTagValue(row.id);
  }
}

/**
 * Merges `fromId` into `toId`: every item carrying `fromId` gets `toId`
 * instead (no duplicates), then `fromId` is deleted. Both must be in the
 * same group — merging across groups would silently misfile items.
 */
export async function mergeTagValues(fromId: string, toId: string): Promise<void> {
  await db.transaction('rw', db.items, db.tags, async () => {
    const carriers = await db.items.where('customTags').equals(fromId).toArray();
    for (const item of carriers) {
      const withoutFrom = item.customTags.filter((t) => t !== fromId);
      const next = withoutFrom.includes(toId) ? withoutFrom : [...withoutFrom, toId];
      await db.items.update(item.id, { customTags: next });
    }
    await db.tags.delete(fromId);
  });
}
