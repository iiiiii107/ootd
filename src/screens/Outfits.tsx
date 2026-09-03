import { useEffect, useMemo, useState } from 'react';

import { DetailSheet } from '../components/DetailSheet';
import { FilterBar } from '../components/FilterBar';
import { OutfitBuilder } from '../components/OutfitBuilder';
import { OutfitTile } from '../components/OutfitTile';
import { ScreenTitle } from '../components/ScreenTitle';
import { SearchBar } from '../components/SearchBar';
import { SortRow } from '../components/SortRow';
import { WearFeed } from '../components/WearFeed';
import { SearchIcon } from '../components/icons';
import { useOutfitItems } from '../db/hooks';
import { getMeta, setMeta } from '../db/meta';
import { DEFAULT_FILTER_STATE, filterItems, sortItems, type FilterState, type SortKey } from '../db/query';
import { useGroups } from '../tags/useGroups';

const FILTER_STATE_KEY = 'outfitsFilterState';
const SORT_KEY_KEY = 'outfitsSortKey';
const SORT_REVERSED_KEY = 'outfitsSortReversed';

// No 'category' sort here — every item in this view is already category
// 'outfit', so that sort would be a no-op that only adds a dead-end button.
const SORT_OPTIONS: SortKey[] = ['newest', 'name', 'lastWorn'];

const TAB_KEY = 'outfitsTab';

/**
 * Two things live here, and they are related but not the same: what you have
 * *worn*, and what you have *saved to wear*. Worn leads, because it is the
 * one that answers a question you actually have ("what have I had on lately")
 * where the saved list is a library you consult on purpose.
 */
type Tab = 'worn' | 'saved';

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
  const [sortReversed, setSortReversed] = useState(false);
  const [loadedPersisted, setLoadedPersisted] = useState(false);
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('worn');
  const [building, setBuilding] = useState(false);

  useEffect(() => {
    void (async () => {
      const [savedFilters, savedSort, savedReversed] = await Promise.all([
        getMeta<FilterState>(FILTER_STATE_KEY),
        getMeta<SortKey>(SORT_KEY_KEY),
        getMeta<boolean>(SORT_REVERSED_KEY),
      ]);
      const savedTab = await getMeta<Tab>(TAB_KEY);
      if (savedTab) setTab(savedTab);
      if (savedFilters) setFilters(savedFilters);
      if (savedSort) setSortKey(savedSort);
      if (savedReversed != null) setSortReversed(savedReversed);
      setLoadedPersisted(true);
    })();
  }, []);

  useEffect(() => {
    if (loadedPersisted) void setMeta(FILTER_STATE_KEY, filters);
  }, [filters, loadedPersisted]);

  useEffect(() => {
    if (loadedPersisted) void setMeta(SORT_KEY_KEY, sortKey);
  }, [sortKey, loadedPersisted]);

  useEffect(() => {
    if (loadedPersisted) void setMeta(SORT_REVERSED_KEY, sortReversed);
  }, [sortReversed, loadedPersisted]);

  useEffect(() => {
    if (loadedPersisted) void setMeta(TAB_KEY, tab);
  }, [tab, loadedPersisted]);

  const visible = useMemo(() => {
    if (!items) return undefined;
    return sortItems(filterItems(items, filters, groups), sortKey, sortReversed);
  }, [items, filters, groups, sortKey, sortReversed]);

  if (items === undefined) return null; // first read from IndexedDB

  return (
    <div className="flex flex-col gap-4 px-4 pb-10">
      <ScreenTitle>outfits</ScreenTitle>

      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1.5">
          {(['worn', 'saved'] as Tab[]).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              aria-pressed={tab === id}
              className="rounded-chip min-h-9 border px-3 text-[13px]"
              style={
                tab === id
                  ? {
                      backgroundColor: 'var(--color-on)',
                      borderColor: 'var(--color-on)',
                      color: 'var(--color-on-tag)',
                    }
                  : { borderColor: 'var(--color-rule)', color: 'var(--color-muted)' }
              }
            >
              {id === 'worn' ? 'recently worn' : 'saved'}
            </button>
          ))}
        </div>

        <div className="flex">
          <button
            type="button"
            onClick={() => setBuilding(true)}
            aria-label="Build an outfit from your wardrobe"
            className="flex min-h-11 min-w-11 items-center justify-center text-[22px] leading-none text-muted"
          >
            +
          </button>
          {/* Search and sort only mean anything against the saved library;
              the worn feed is a short, strictly chronological list. */}
          {tab === 'saved' && (
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
          )}
        </div>
      </div>

      {tab === 'worn' && <WearFeed />}

      {tab === 'saved' && filtersOpen && (
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

      {tab === 'saved' && (
        <SortRow
          count={visible?.length ?? 0}
          noun="outfit"
          options={SORT_OPTIONS}
          sortKey={sortKey}
          reversed={sortReversed}
          onChange={(key, reversed) => {
            setSortKey(key);
            setSortReversed(reversed);
          }}
        />
      )}

      {tab !== 'saved' ? null : items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
          <p className="max-w-xs text-[13px] leading-relaxed text-muted">
            Nothing saved yet. Tap + to build one from clothes you already have, photograph a whole
            look from Add, or save one from a randomizer shuffle.
          </p>
        </div>
      ) : visible && visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="text-[13px] text-muted">Nothing matches these filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {visible?.map((item) => (
            <OutfitTile key={item.id} item={item} onTap={() => setOpenItemId(item.id)} />
          ))}
        </div>
      )}

      {openItemId && <DetailSheet itemId={openItemId} onClose={() => setOpenItemId(null)} />}

      {building && (
        <OutfitBuilder
          onClose={() => setBuilding(false)}
          onCreated={(id) => {
            // Land on the thing just made, in the list it was made into.
            setTab('saved');
            setOpenItemId(id);
          }}
        />
      )}
    </div>
  );
}
