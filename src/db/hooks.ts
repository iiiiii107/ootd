import { useLiveQuery } from 'dexie-react-hooks';

import { db } from './schema';
import type { Item } from './types';

/**
 * The base wardrobe list: newest first, archived and trashed items excluded
 * everywhere except their dedicated views (spec §4.4, §5). Search and tag
 * filtering are layered on top of this in Phase 2.
 */
export function useWardrobeItems(): Item[] | undefined {
  return useLiveQuery(
    () =>
      db.items
        .orderBy('createdAt')
        .reverse()
        .filter((item) => !item.archived && item.deletedAt == null)
        .toArray(),
    [],
  );
}
