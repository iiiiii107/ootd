import Dexie, { type EntityTable } from 'dexie';

import type { CustomTag, Item, MetaEntry, Wear } from './types';

/**
 * The one Dexie instance. Nothing outside `src/db/` should import this —
 * screens go through the repository functions in `items.ts` / `meta.ts` /
 * `hooks.ts` so a future sync backend is a swap, not a rewrite (spec §15).
 */
export const db = new Dexie('ootd') as Dexie & {
  items: EntityTable<Item, 'id'>;
  tags: EntityTable<CustomTag, 'id'>;
  meta: EntityTable<MetaEntry, 'key'>;
  wears: EntityTable<Wear, 'id'>;
};

// Index string per spec §4.1. `*seasons` and `*customTags` are multi-entry
// indexes so a filter can match any one value inside those arrays.
db.version(1).stores({
  items:
    'id, category, location, formality, vibe, favorite, inWash, archived, deletedAt, createdAt, lastWornAt, *seasons, *customTags',
  tags: 'id, groupName, sortOrder',
  meta: 'key',
});

/**
 * The wear log (spec §7.6). Purely additive — no existing store changes shape,
 * so Dexie carries every existing record forward untouched and there is no
 * migration function to get wrong.
 *
 * `id` is the local date and needs no separate index; `wornAt` is indexed
 * because the feed reads this store in time order and nothing else.
 */
db.version(2).stores({
  wears: 'id, wornAt',
});
