import Dexie, { type EntityTable } from 'dexie';

import type { CustomTag, Item, MetaEntry } from './types';

/**
 * The one Dexie instance. Nothing outside `src/db/` should import this —
 * screens go through the repository functions in `items.ts` / `meta.ts` /
 * `hooks.ts` so a future sync backend is a swap, not a rewrite (spec §15).
 */
export const db = new Dexie('ootd') as Dexie & {
  items: EntityTable<Item, 'id'>;
  tags: EntityTable<CustomTag, 'id'>;
  meta: EntityTable<MetaEntry, 'key'>;
};

// Index string per spec §4.1. `*seasons` and `*customTags` are multi-entry
// indexes so a filter can match any one value inside those arrays.
db.version(1).stores({
  items:
    'id, category, location, formality, vibe, favorite, inWash, archived, deletedAt, createdAt, lastWornAt, *seasons, *customTags',
  tags: 'id, groupName, sortOrder',
  meta: 'key',
});
