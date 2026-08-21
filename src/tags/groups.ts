import type { Item } from '../db/types';

export interface TagOption {
  value: string;
  label: string;
}

/**
 * A group of tag values an item can carry — either one of the five built-ins
 * or a custom group from the `tags` store (spec §4.2). The filter bar and the
 * item editor are both generic renderers over this list: neither one ever
 * names `formality` or `vibe` directly, so a new custom group needs zero code
 * changes to show up in both places (spec §15).
 */
export interface TagGroup {
  id: string;
  label: string;
  /** Whether an item can hold several values from this group at once. */
  multiSelect: boolean;
  /** The five built-ins have special pairing behaviour and can't be deleted. */
  builtin: boolean;
  options: TagOption[];
  /** This item's current values in the group — 0, 1, or many. */
  getValues(item: Item): string[];
  /**
   * The patch to apply when the user taps `value` while editing this item.
   * Respects `multiSelect` and each built-in field's own shape (nullable
   * single value vs. array); a group can refuse a clear (category always
   * needs exactly one value) by returning the item unchanged.
   */
  toggle(item: Item, value: string): Partial<Item>;
}

function singleSelectGroup(
  id: string,
  label: string,
  field: 'formality' | 'location' | 'vibe',
  options: TagOption[],
): TagGroup {
  return {
    id,
    label,
    multiSelect: false,
    builtin: true,
    options,
    getValues: (item) => {
      const value = item[field];
      return value ? [value] : [];
    },
    // Tapping the already-selected chip clears it (untagged is a valid,
    // meaningful state here — spec §4.1); tapping another replaces it.
    toggle: (item, value) => ({ [field]: item[field] === value ? null : value }),
  };
}

export const CATEGORY_GROUP: TagGroup = {
  id: 'category',
  label: 'Category',
  multiSelect: false,
  builtin: true,
  // No 'outfit' option here on purpose — this group is what the Wardrobe
  // filter bar and item editor render, and outfit-category items never
  // appear in the wardrobe grid (spec §7.3); they get their own view and
  // their own tag editing in Phase 4. Add's own category picker is separate
  // and still offers 'outfit', for photographing a whole look directly.
  options: [
    { value: 'top', label: 'top' },
    { value: 'bottom', label: 'bottom' },
    { value: 'other', label: 'other' },
  ],
  getValues: (item) => [item.category],
  // Category is the one mandatory tag (spec §4.1) — it can be changed but
  // never cleared, so re-tapping the active chip is just a no-op.
  toggle: (item, value) => (item.category === value ? {} : { category: value as Item['category'] }),
};

export const SEASON_GROUP: TagGroup = {
  id: 'season',
  label: 'Season',
  multiSelect: true,
  builtin: true,
  options: [
    { value: 'spring', label: 'spring' },
    { value: 'summer', label: 'summer' },
    { value: 'autumn', label: 'autumn' },
    { value: 'winter', label: 'winter' },
  ],
  getValues: (item) => item.seasons,
  toggle: (item, value) => {
    const season = value as Item['seasons'][number];
    return {
      seasons: item.seasons.includes(season)
        ? item.seasons.filter((s) => s !== season)
        : [...item.seasons, season],
    };
  },
};

export const FORMALITY_GROUP = singleSelectGroup('formality', 'Formality', 'formality', [
  { value: 'formal', label: 'formal' },
  { value: 'casual', label: 'casual' },
  { value: 'home', label: 'home' },
]);

export const LOCATION_GROUP = singleSelectGroup('location', 'Location', 'location', [
  { value: 'university', label: 'university' },
  { value: 'linh', label: '@Linh' },
  { value: 'home', label: 'home' },
  { value: 'elsewhere', label: 'elsewhere' },
]);

// Ordered masculine → androgynous → feminine so the value that pairs with
// everything (spec §7.1's vibe rule) sits between the two it reconciles.
export const VIBE_GROUP = singleSelectGroup('vibe', 'Vibe', 'vibe', [
  { value: 'masculine', label: 'masculine' },
  { value: 'androgynous', label: 'androgynous' },
  { value: 'feminine', label: 'feminine' },
]);

/**
 * The five built-ins (spec §4.2). Fixed order, fixed set — these have special
 * pairing behaviour in `pickOutfit` (Phase 3) and can't be deleted. Custom
 * groups from the `tags` store are appended after these by `useGroups`.
 */
export const BUILTIN_GROUPS: TagGroup[] = [
  CATEGORY_GROUP,
  SEASON_GROUP,
  FORMALITY_GROUP,
  LOCATION_GROUP,
  VIBE_GROUP,
];
