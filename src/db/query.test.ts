import { describe, expect, it } from 'vitest';

import { BUILTIN_GROUPS } from '../tags/groups';
import { DEFAULT_FILTER_STATE, filterItems, sortItems, type FilterState } from './query';
import type { Item } from './types';

function makeItem(overrides: Partial<Item> = {}): Item {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    name: 'item',
    category: 'top',
    image: new Blob(),
    thumb: new Blob(),
    hasCutout: false,
    seasons: [],
    formality: null,
    location: null,
    elsewhereNote: '',
    vibe: null,
    favorite: false,
    inWash: false,
    customTags: [],
    dominantColor: '#000000',
    memberIds: [],
    notes: '',
    lastWornAt: null,
    wearCount: 0,
    archived: false,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function filters(overrides: Partial<FilterState> = {}): FilterState {
  return { ...DEFAULT_FILTER_STATE, ...overrides };
}

describe('filterItems', () => {
  it('excludes trashed items regardless of any other filter', () => {
    const items = [makeItem({ deletedAt: Date.now() })];
    expect(filterItems(items, filters(), BUILTIN_GROUPS)).toHaveLength(0);
  });

  it('excludes archived items by default, and shows only them when archivedOnly is on', () => {
    const items = [makeItem({ name: 'kept' }), makeItem({ name: 'archived', archived: true })];
    expect(filterItems(items, filters(), BUILTIN_GROUPS).map((i) => i.name)).toEqual(['kept']);
    expect(
      filterItems(items, filters({ archivedOnly: true }), BUILTIN_GROUPS).map((i) => i.name),
    ).toEqual(['archived']);
  });

  it('washOnly isolates to items currently in the wash, off by default', () => {
    const items = [makeItem({ name: 'clean' }), makeItem({ name: 'dirty', inWash: true })];
    expect(filterItems(items, filters(), BUILTIN_GROUPS).map((i) => i.name).sort()).toEqual([
      'clean',
      'dirty',
    ]);
    expect(
      filterItems(items, filters({ washOnly: true }), BUILTIN_GROUPS).map((i) => i.name),
    ).toEqual(['dirty']);
  });

  it('favoritesOnly keeps only favourites', () => {
    const items = [makeItem({ name: 'plain' }), makeItem({ name: 'fave', favorite: true })];
    expect(
      filterItems(items, filters({ favoritesOnly: true }), BUILTIN_GROUPS).map((i) => i.name),
    ).toEqual(['fave']);
  });

  it('needsTaggingOnly keeps only items missing a non-mandatory tag', () => {
    const tagged = makeItem({
      name: 'tagged',
      seasons: ['summer'],
      formality: 'casual',
      location: 'home',
      vibe: 'androgynous',
    });
    const untagged = makeItem({ name: 'untagged' });
    expect(
      filterItems([tagged, untagged], filters({ needsTaggingOnly: true }), BUILTIN_GROUPS).map(
        (i) => i.name,
      ),
    ).toEqual(['untagged']);
  });

  it('matches search against name and notes, case-insensitively', () => {
    const items = [
      makeItem({ name: 'black wide-leg jeans' }),
      makeItem({ name: 'plain', notes: 'borrowed from Kat' }),
      makeItem({ name: 'unrelated' }),
    ];
    expect(filterItems(items, filters({ search: 'JEANS' }), BUILTIN_GROUPS).map((i) => i.name)).toEqual([
      'black wide-leg jeans',
    ]);
    expect(filterItems(items, filters({ search: 'kat' }), BUILTIN_GROUPS).map((i) => i.name)).toEqual([
      'plain',
    ]);
  });

  it('OR within a multi-select group: summer or spring matches either', () => {
    const items = [
      makeItem({ name: 'summer-only', seasons: ['summer'] }),
      makeItem({ name: 'spring-only', seasons: ['spring'] }),
      makeItem({ name: 'winter-only', seasons: ['winter'] }),
    ];
    const result = filterItems(
      items,
      filters({ groups: { season: ['summer', 'spring'] } }),
      BUILTIN_GROUPS,
    );
    expect(result.map((i) => i.name).sort()).toEqual(['spring-only', 'summer-only']);
  });

  it('AND across groups: season and formality must both match', () => {
    const items = [
      makeItem({ name: 'match', seasons: ['summer'], formality: 'casual' }),
      makeItem({ name: 'wrong-formality', seasons: ['summer'], formality: 'formal' }),
      makeItem({ name: 'wrong-season', seasons: ['winter'], formality: 'casual' }),
    ];
    const result = filterItems(
      items,
      filters({ groups: { season: ['summer'], formality: ['casual'] } }),
      BUILTIN_GROUPS,
    );
    expect(result.map((i) => i.name)).toEqual(['match']);
  });

  it('excludes untagged items once their group has an active filter', () => {
    const items = [makeItem({ name: 'tagged', formality: 'casual' }), makeItem({ name: 'untagged' })];
    const result = filterItems(items, filters({ groups: { formality: ['casual'] } }), BUILTIN_GROUPS);
    expect(result.map((i) => i.name)).toEqual(['tagged']);
  });

  it('an inactive group filter (empty selection) does not exclude untagged items', () => {
    const items = [makeItem({ name: 'untagged' })];
    expect(filterItems(items, filters({ groups: { formality: [] } }), BUILTIN_GROUPS)).toHaveLength(1);
  });
});

describe('sortItems', () => {
  it('name sorts alphabetically', () => {
    const items = [makeItem({ name: 'zebra' }), makeItem({ name: 'apple' })];
    expect(sortItems(items, 'name').map((i) => i.name)).toEqual(['apple', 'zebra']);
  });

  it('lastWorn sorts most-recent first, with never-worn items last', () => {
    const items = [
      makeItem({ name: 'never', lastWornAt: null }),
      makeItem({ name: 'old', lastWornAt: 1000 }),
      makeItem({ name: 'recent', lastWornAt: 5000 }),
    ];
    expect(sortItems(items, 'lastWorn').map((i) => i.name)).toEqual(['recent', 'old', 'never']);
  });

  it('category follows the fixed top/bottom/other/outfit order, not alphabetical', () => {
    const items = [
      makeItem({ name: 'an-outfit', category: 'outfit' }),
      makeItem({ name: 'a-top', category: 'top' }),
      makeItem({ name: 'a-bottom', category: 'bottom' }),
    ];
    expect(sortItems(items, 'category').map((i) => i.name)).toEqual([
      'a-top',
      'a-bottom',
      'an-outfit',
    ]);
  });

  it('newest is a pass-through, not a re-sort', () => {
    const items = [makeItem({ name: 'b' }), makeItem({ name: 'a' })];
    expect(sortItems(items, 'newest').map((i) => i.name)).toEqual(['b', 'a']);
  });

  it('reversed newest is oldest-first', () => {
    const items = [makeItem({ name: 'newer' }), makeItem({ name: 'older' })];
    expect(sortItems(items, 'newest', true).map((i) => i.name)).toEqual(['older', 'newer']);
  });

  it('reversed lastWorn leads with never-worn, then longest-ago', () => {
    const items = [
      makeItem({ name: 'recent', lastWornAt: 5000 }),
      makeItem({ name: 'never', lastWornAt: null }),
      makeItem({ name: 'old', lastWornAt: 1000 }),
    ];
    expect(sortItems(items, 'lastWorn', true).map((i) => i.name)).toEqual([
      'never',
      'old',
      'recent',
    ]);
  });

  it('reversed name is z-a', () => {
    const items = [makeItem({ name: 'apple' }), makeItem({ name: 'zebra' })];
    expect(sortItems(items, 'name', true).map((i) => i.name)).toEqual(['zebra', 'apple']);
  });

  it('reversing never mutates the array it was given', () => {
    const items = [makeItem({ name: 'a' }), makeItem({ name: 'b' })];
    sortItems(items, 'newest', true);
    expect(items.map((i) => i.name)).toEqual(['a', 'b']);
  });
});
