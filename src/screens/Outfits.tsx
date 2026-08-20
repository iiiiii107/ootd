import { useEffect, useMemo, useState } from 'react';

import { DetailSheet } from '../components/DetailSheet';
import { FilterBar } from '../components/FilterBar';
import { OutfitTile } from '../components/OutfitTile';
import { ScreenTitle } from '../components/ScreenTitle';
import { SearchBar } from '../components/SearchBar';
import { SearchIcon } from '../components/icons';
import { useOutfitItems } from '../db/hooks';
import { getMeta, setMeta } from '../db/meta';
import { DEFAULT_FILTER_STATE, filterItems, sortItems, type FilterState, type SortKey } from '../db/query';
import { useGroups } from '../tags/useGroups';

const FILTER_STATE_KEY = 'outfitsFilterState';
const SORT_KEY_KEY = 'outfitsSortKey';

// No 'category' sort here — every item in this view is already category
// 'outfit', so that sort would be a no-op that only adds a dead-end button.
const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'newest', label: 'newest' },
  { value: 'name', label: 'name' },
  { value: 'lastWorn', label: 'last worn' },
];

/**
 * The dedicated outfits grid (spec §7.3) — larger cards than Wardrobe's,
 * both real photographed looks and randomizer composites living together,
 * filterable by the same generic tag groups minus 'category' (every item
 * here already is one, so that chip row would never do anything).
 */
export default function Outfits() {
  const items = useOutfitItems();
  const groups = useGroups().filter((g) => g.id !== 'category');

  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTER_STATE);
  const [sortKey, setSortKey] = useState<SortKey>('newest');
  const [loadedPersisted, setLoadedPersisted] = useState(false);
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    void (async () => {
      const [savedFilters, savedSort] = await Promise.all([
        getMeta<FilterState>(FILTER_STATE_KEY),
        getMeta<SortKey>(SORT_KEY_KEY),
      ]);
      if (savedFilters) setFilters(savedFilters);
      if (savedSort) setSortKey(savedSort);
      setLoadedPersisted(true);
    })();
  }, []);

  useEffect(() => {
    if (loadedPersisted) void setMeta(FILTER_STATE_KEY, filters);
  }, [filters, loadedPersisted]);

  useEffect(() => {
    if (loadedPersisted) void setMeta(SORT_KEY_KEY, sortKey);
  }, [sortKey, loadedPersisted]);

  const visible = useMemo(() => {
    if (!items) return undefined;
    return sortItems(filterItems(items, filters, groups), sortKey);
  }, [items, filters, groups, sortKey]);

  if (items === undefined) return null; // first read from IndexedDB

  return (
    <div className="flex flex-col gap-4 px-4 pb-10">
      <ScreenTitle>outfits</ScreenTitle>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setFiltersOpen(!filtersOpen)}
          aria-pressed={filtersOpen}
          className={`flex min-h-11 min-w-11 items-center justify-center ${
            filtersOpen ? 'text-ink' : 'text-muted'
          }`}
          aria-label={filtersOpen ? 'Hide search and filters' : 'Search and filter your outfits'}
        >
          <SearchIcon className="h-5 w-5" />
        </button>
      </div>

      {filtersOpen && (
        <>
          <SearchBar
            autoFocus
            value={filters.search}
            onChange={(search) => setFilters({ ...filters, search })}
            placeholder="search your outfits"
          />
          <FilterBar groups={groups} filters={filters} onChange={setFilters} />
        </>
      )}

      <div className="flex items-center justify-between border-b border-rule pb-2">
        <p className="text-[11px] tracking-[0.06em] text-muted uppercase">
          {visible?.length ?? 0} outfit{visible?.length === 1 ? '' : 's'}
        </p>
        <div className="flex gap-1.5">
          {SORT_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setSortKey(option.value)}
              aria-pressed={sortKey === option.value}
              className={`min-h-8 px-2 text-[11px] tracking-[0.04em] uppercase ${
                sortKey === option.value ? 'text-ink' : 'text-muted'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
          <p className="max-w-xs text-[13px] leading-relaxed text-muted">
            Nothing saved yet. Photograph a whole look from Add, or save one from a randomizer shuffle.
          </p>
        </div>
      ) : visible && visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="text-[13px] text-muted">Nothing matches these filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {visible?.map((item) => (
            <OutfitTile key={item.id} item={item} onTap={() => setOpenItemId(item.id)} />
          ))}
        </div>
      )}

      {openItemId && <DetailSheet itemId={openItemId} onClose={() => setOpenItemId(null)} />}
    </div>
  );
}
