import { useEffect, useMemo, useState } from 'react';

import { BulkActionBar } from '../components/BulkActionBar';
import { DetailSheet } from '../components/DetailSheet';
import { FilterBar } from '../components/FilterBar';
import { ItemTile } from '../components/ItemTile';
import { OutfitBuilder } from '../components/OutfitBuilder';
import { ScreenTitle } from '../components/ScreenTitle';
import { SearchBar } from '../components/SearchBar';
import { SortRow } from '../components/SortRow';
import { BasketIcon, HeartIcon, SearchIcon } from '../components/icons';
import { useWardrobeItems } from '../db/hooks';
import { getMeta, setMeta } from '../db/meta';
import { DEFAULT_FILTER_STATE, filterItems, sortItems, type FilterState, type SortKey } from '../db/query';
import { useGroups } from '../tags/useGroups';

const FILTER_STATE_KEY = 'wardrobeFilterState';
const SORT_KEY_KEY = 'wardrobeSortKey';
const SORT_REVERSED_KEY = 'wardrobeSortReversed';

const SORT_OPTIONS: SortKey[] = ['lastWorn', 'newest', 'name', 'category'];

/**
 * Search, generic tag filters, sort, the detail sheet, and bulk multi-select
 * (spec §7.2) — layered over the plain grid from Phase 1. Search and every
 * filter chip live behind one spyglass toggle, collapsed by default, so the
 * grid is what you see first rather than a wall of controls.
 */
export default function Wardrobe() {
  const items = useWardrobeItems();
  const groups = useGroups();

  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTER_STATE);
  // Last-worn is the default view (not newest): the useful question about a
  // wardrobe is what's been in rotation and what hasn't, which only matters
  // once the import session is over and the grid stops changing.
  const [sortKey, setSortKey] = useState<SortKey>('lastWorn');
  const [sortReversed, setSortReversed] = useState(false);
  const [loadedPersisted, setLoadedPersisted] = useState(false);

  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [buildingFrom, setBuildingFrom] = useState<string[] | null>(null);

  // Restore filters and sort once on mount (spec §5: "filter state persists
  // across app launches"). Loaded async, so writes below wait for this first.
  useEffect(() => {
    void (async () => {
      const [savedFilters, savedSort, savedReversed] = await Promise.all([
        getMeta<FilterState>(FILTER_STATE_KEY),
        getMeta<SortKey>(SORT_KEY_KEY),
        getMeta<boolean>(SORT_REVERSED_KEY),
      ]);
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

  const visible = useMemo(() => {
    if (!items) return undefined;
    return sortItems(filterItems(items, filters, groups), sortKey, sortReversed);
  }, [items, filters, groups, sortKey, sortReversed]);

  function chooseSort(key: SortKey, reversed: boolean) {
    setSortKey(key);
    setSortReversed(reversed);
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function enterSelectMode(id: string) {
    setSelectMode(true);
    setSelectedIds(new Set([id]));
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  if (items === undefined) {
    return null; // first read from IndexedDB; avoids an empty-state flash
  }

  return (
    <div className="flex flex-col gap-2 px-4 pb-8">
      <ScreenTitle>wardrobe</ScreenTitle>

      {/*
        Two one-tap shortcuts for the filters people actually reach for, next
        to the spyglass that opens the full set. Both are plain toggles over
        the same FilterState the filter bar edits, so pressing one here and
        clearing it down there are the same switch, not two competing ones.
      */}
      <div className="-mt-1 flex justify-end gap-1">
        <button
          type="button"
          onClick={() => setFilters({ ...filters, washOnly: !filters.washOnly })}
          aria-pressed={filters.washOnly}
          className={`flex min-h-11 min-w-11 items-center justify-center ${
            filters.washOnly ? 'text-ink' : 'text-muted'
          }`}
          aria-label={filters.washOnly ? 'Show everything again' : 'Show only what is in the wash'}
        >
          <BasketIcon filled={filters.washOnly} className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => setFilters({ ...filters, favoritesOnly: !filters.favoritesOnly })}
          aria-pressed={filters.favoritesOnly}
          className={`flex min-h-11 min-w-11 items-center justify-center ${
            filters.favoritesOnly ? 'text-ink' : 'text-muted'
          }`}
          aria-label={filters.favoritesOnly ? 'Show everything again' : 'Show only favorites'}
        >
          <HeartIcon filled={filters.favoritesOnly} className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => setFiltersOpen(!filtersOpen)}
          aria-pressed={filtersOpen}
          className={`flex min-h-11 min-w-11 items-center justify-center ${
            filtersOpen ? 'text-ink' : 'text-muted'
          }`}
          aria-label={filtersOpen ? 'Hide search and filters' : 'Search and filter your wardrobe'}
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
          />
          <FilterBar groups={groups} filters={filters} onChange={setFilters} />
        </>
      )}

      <SortRow
        count={visible?.length ?? 0}
        noun="item"
        options={SORT_OPTIONS}
        sortKey={sortKey}
        reversed={sortReversed}
        onChange={chooseSort}
      />

      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
          <p className="max-w-xs text-[13px] leading-relaxed text-muted">
            Nothing here yet. Add a few photos to get started.
          </p>
        </div>
      ) : visible && visible.length === 0 ? (
        <EmptyFilterState filters={filters} groups={groups} onChange={setFilters} />
      ) : (
        <div className="wardrobe-grid grid gap-3">
          {visible?.map((item) => (
            <ItemTile
              key={item.id}
              item={item}
              selectMode={selectMode}
              selected={selectedIds.has(item.id)}
              onTap={() => setOpenItemId(item.id)}
              onToggleSelect={() => toggleSelected(item.id)}
              onLongPress={() => enterSelectMode(item.id)}
            />
          ))}
        </div>
      )}

      {selectMode && (
        <BulkActionBar
          selectedIds={[...selectedIds]}
          onDone={exitSelectMode}
          onMakeOutfit={() => setBuildingFrom([...selectedIds])}
        />
      )}

      {buildingFrom && (
        <OutfitBuilder
          initialIds={buildingFrom}
          onClose={() => setBuildingFrom(null)}
          onCreated={() => exitSelectMode()}
        />
      )}

      {openItemId && <DetailSheet itemId={openItemId} onClose={() => setOpenItemId(null)} />}
    </div>
  );
}

/** Diagnostic, not blank — names every active filter so it can be cleared. */
function EmptyFilterState({
  filters,
  groups,
  onChange,
}: {
  filters: FilterState;
  groups: ReturnType<typeof useGroups>;
  onChange: (next: FilterState) => void;
}) {
  const activeChips: { label: string; clear: () => void }[] = [];

  for (const group of groups) {
    for (const value of filters.groups[group.id] ?? []) {
      const option = group.options.find((o) => o.value === value);
      activeChips.push({
        label: option?.label ?? value,
        clear: () =>
          onChange({
            ...filters,
            groups: { ...filters.groups, [group.id]: filters.groups[group.id].filter((v) => v !== value) },
          }),
      });
    }
  }
  if (filters.favoritesOnly) {
    activeChips.push({ label: 'favorites', clear: () => onChange({ ...filters, favoritesOnly: false }) });
  }
  if (filters.washOnly) {
    activeChips.push({ label: 'in the wash', clear: () => onChange({ ...filters, washOnly: false }) });
  }
  if (filters.needsTaggingOnly) {
    activeChips.push({
      label: 'needs tagging',
      clear: () => onChange({ ...filters, needsTaggingOnly: false }),
    });
  }
  if (filters.archivedOnly) {
    activeChips.push({ label: 'archived', clear: () => onChange({ ...filters, archivedOnly: false }) });
  }

  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <p className="text-[13px] text-muted">
        {filters.search
          ? `Nothing matches "${filters.search}"${activeChips.length > 0 ? ' with these filters' : ''}.`
          : 'Nothing matches these filters.'}
      </p>
      {activeChips.length > 0 && (
        <div className="flex flex-wrap justify-center gap-1.5">
          {activeChips.map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={chip.clear}
              className="min-h-8 rounded-chip border border-rule px-2.5 text-[12px] text-ink"
            >
              {chip.label} ×
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
