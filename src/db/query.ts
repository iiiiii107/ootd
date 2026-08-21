import type { TagGroup } from '../tags/groups';
import { needsTagging, type Item } from './types';

/**
 * Persisted to `meta.wardrobeFilterState` so filters survive an app relaunch
 * (spec §5). This is the Wardrobe screen's own filter shape — the Randomizer
 * (Phase 3) filters on a different set of fields (season/formality/location/
 * vibe plus include-in-wash and add-accessory switches) and gets its own key.
 */
export interface FilterState {
  search: string;
  /** groupId -> selected option values. OR within a group, AND across groups. */
  groups: Record<string, string[]>;
  favoritesOnly: boolean;
  /**
   * Isolates to items currently in the wash, off by default — the "clear a
   * laundry load" workflow (spec §6), not a hide switch. The Randomizer
   * (Phase 3) is where wash items are hidden by default instead; the
   * Wardrobe's job is to show what's actually available, dirty or not, with
   * the tile indicator doing that work.
   */
  washOnly: boolean;
  needsTaggingOnly: boolean;
  /** When on, shows *only* archived items — the stand-in for a dedicated Archived view. */
  archivedOnly: boolean;
}

export const DEFAULT_FILTER_STATE: FilterState = {
  search: '',
  groups: {},
  favoritesOnly: false,
  washOnly: false,
  needsTaggingOnly: false,
  archivedOnly: false,
};

/**
 * Filtering semantics (spec §5): within a tag group, OR; across groups, AND.
 * An item with no value in a filtered group is excluded — untagged items are
 * compatible with everything but invisible under an active filter, which is
 * what makes "needs tagging" a useful way to find them again.
 */
export function filterItems(items: Item[], filters: FilterState, groups: TagGroup[]): Item[] {
  return items.filter((item) => {
    if (item.deletedAt != null) return false; // trashed, never shown regardless of view

    if (filters.archivedOnly) {
      if (!item.archived) return false;
    } else if (item.archived) {
      return false;
    }

    if (filters.favoritesOnly && !item.favorite) return false;
    if (filters.washOnly && !item.inWash) return false;
    if (filters.needsTaggingOnly && !needsTagging(item)) return false;

    if (filters.search.trim()) {
      const query = filters.search.trim().toLowerCase();
      const haystack = `${item.name} ${item.notes}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }

    for (const group of groups) {
      const selected = filters.groups[group.id];
      if (!selected || selected.length === 0) continue;
      const itemValues = group.getValues(item);
      if (itemValues.length === 0) return false;
      if (!itemValues.some((value) => selected.includes(value))) return false;
    }

    return true;
  });
}

export type SortKey = 'newest' | 'name' | 'lastWorn' | 'category';

const CATEGORY_ORDER: Item['category'][] = ['top', 'bottom', 'other', 'outfit'];

/**
 * Every sort runs in one direction and is then optionally reversed, rather
 * than each key carrying two comparators. That keeps the reversed meaning
 * of each key honest and automatic: `newest` reversed is oldest-first, and
 * `lastWorn` reversed puts never-worn items at the very front, because
 * forward-order deliberately sinks them to the very back.
 *
 * `items` is assumed newest-first already (the base Dexie query orders it
 * that way), so `newest` is a no-op pass-through rather than a re-sort.
 */
export function sortItems(items: Item[], sortKey: SortKey, reversed = false): Item[] {
  const sorted = sortForward(items, sortKey);
  if (!reversed) return sorted;
  // `sortForward` may have returned `items` itself (the `newest` case), so
  // copy before reversing — never mutate the caller's array in place.
  return [...sorted].reverse();
}

function sortForward(items: Item[], sortKey: SortKey): Item[] {
  switch (sortKey) {
    case 'newest':
      return items;
    case 'name':
      return [...items].sort((a, b) => a.name.localeCompare(b.name));
    case 'lastWorn':
      // Never-worn items sort last, not first — they're not "least recent",
      // they're unknown. Reversed, that lands them first, which is exactly
      // right for "what have I not worn in ages".
      return [...items].sort((a, b) => (b.lastWornAt ?? -Infinity) - (a.lastWornAt ?? -Infinity));
    case 'category':
      return [...items].sort(
        (a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category),
      );
  }
}
