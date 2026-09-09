import { useEffect, useState } from 'react';

import { LockIcon } from '../components/icons';
import { ScreenTitle } from '../components/ScreenTitle';
import { TagChipRow } from '../components/TagChipRow';
import { useColourPreferences, useEnabledGroups, useWardrobeItems } from '../db/hooks';
import { createOutfitFromMembers, favoriteMany } from '../db/items';
import { logWearToday } from '../db/wears';
import { getMeta, setMeta } from '../db/meta';
import type { Item } from '../db/types';
import { toggleInArray } from '../lib/toggleInArray';
import { ItemImage } from '../components/ItemImage';
import { OutfitLayout } from '../components/OutfitLayout';
import {
  DEFAULT_RANDOMIZER_FILTERS,
  currentSeason,
  pickOutfit,
  type PickFailureReason,
  type PickResult,
  type RandomizerFilters,
  type ShuffleHistory,
} from '../logic/pickOutfit';
import { CATEGORY_GROUP, type TagGroup } from '../tags/groups';
import { useGroups } from '../tags/useGroups';

const FILTERS_KEY = 'randomizerFilters';
const HISTORY_SHUFFLES = 8;

const SWITCHES: {
  key:
    | 'favoritesOnly'
    | 'includeInWash'
    | 'includeJacket'
    | 'includeShoes'
    | 'addAccessory'
    | 'matchColours';
  label: string;
}[] = [
  { key: 'favoritesOnly', label: 'favorites only' },
  { key: 'includeInWash', label: 'include in the wash' },
  { key: 'includeJacket', label: 'include a jacket' },
  { key: 'includeShoes', label: 'include shoes' },
  { key: 'addAccessory', label: 'include an accessory' },
  { key: 'matchColours', label: 'colours that match' },
];

/**
 * Where one filter row reads and writes its selection.
 *
 * The four built-in rows have typed fields of their own on the filter state;
 * everything else — every group the user made — shares the generic `groups`
 * record. Returning a whole next-filters value rather than a setter keeps
 * this a pure function of what it is given, so the screen stays a renderer.
 */
function selectionFor(
  group: TagGroup,
  filters: RandomizerFilters,
): { selected: string[]; toggle: (value: string) => RandomizerFilters } {
  const builtin: Partial<Record<string, keyof RandomizerFilters>> = {
    season: 'seasons',
    formality: 'formality',
    location: 'location',
    vibe: 'vibe',
  };
  const field = builtin[group.id];
  if (field) {
    const selected = filters[field] as string[];
    return {
      selected,
      toggle: (value) => ({ ...filters, [field]: toggleInArray(selected, value) }),
    };
  }
  const selected = filters.groups[group.id] ?? [];
  return {
    selected,
    toggle: (value) => ({
      ...filters,
      groups: { ...filters.groups, [group.id]: toggleInArray(selected, value) },
    }),
  };
}

/**
 * The Clueless machine (spec §7.1). All the real logic lives in
 * src/logic/pickOutfit.ts, pure and unit-tested; this screen is just state
 * and rendering around it.
 */
export default function Randomizer() {
  const items = useWardrobeItems();
  const colour = useColourPreferences();
  const enabledGroups = useEnabledGroups();
  // Built-ins the user still has, plus their own groups — already filtered by
  // what is switched off, so this screen needs no gating of its own.
  const groups = useGroups();
  // A dimension switched off in Settings imposes no rule here either — see
  // `ActiveDimensions`. Hiding a group must not leave it quietly shaping
  // which outfits come up.
  const dimensions = {
    season: enabledGroups.season !== false,
    formality: enabledGroups.formality !== false,
    vibe: enabledGroups.vibe !== false,
    pattern: enabledGroups.pattern !== false,
    fit: enabledGroups.fit !== false,
  };

  const [filters, setFilters] = useState<RandomizerFilters>(() => ({
    ...DEFAULT_RANDOMIZER_FILTERS,
    seasons: [currentSeason()],
  }));
  const [loadedPersisted, setLoadedPersisted] = useState(false);
  const [history, setHistory] = useState<ShuffleHistory>([]);
  const [result, setResult] = useState<PickResult | null>(null);
  const [lockedTop, setLockedTop] = useState<Item | null>(null);
  const [lockedBottom, setLockedBottom] = useState<Item | null>(null);
  const [savedOutfitId, setSavedOutfitId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  // Whether *this* result has been logged. The button used to write to the
  // database and then look exactly as it had a moment earlier, which is
  // indistinguishable from a button that does nothing at all.
  const [loggedWear, setLoggedWear] = useState(false);
  // Uncapped, unlike `history` (which caps at 8 for the anti-repeat window) —
  // this only exists to force the result to remount and re-play its fade-in
  // on every shuffle, including the 9th and beyond.
  const [shuffleCount, setShuffleCount] = useState(0);

  // Restore the last-used filters (spec §7.1: "overridable, and the last
  // used state is remembered"); if nothing was saved yet, keep today's
  // season pre-selected rather than overwriting it with an empty restore.
  useEffect(() => {
    void (async () => {
      const saved = await getMeta<RandomizerFilters>(FILTERS_KEY);
      // Merged over the defaults, never assigned wholesale. A stored object
      // written before a field existed comes back missing it, and a missing
      // boolean reads as false — so a wholesale restore ships every new
      // option switched off for exactly the people who already use the app.
      if (saved) setFilters({ ...DEFAULT_RANDOMIZER_FILTERS, ...saved });
      setLoadedPersisted(true);
    })();
  }, []);

  useEffect(() => {
    if (loadedPersisted) void setMeta(FILTERS_KEY, filters);
  }, [filters, loadedPersisted]);

  function shuffle() {
    if (!items) return;
    const next = pickOutfit(items, filters, history, {
      lockedTop: lockedTop ?? undefined,
      lockedBottom: lockedBottom ?? undefined,
      colour,
      dimensions,
    });
    setResult(next);
    setSavedOutfitId(null);
    setLoggedWear(false);
    setShuffleCount((n) => n + 1);
    if (next.status === 'ok') {
      const shown = [next.outfit.top.id, next.outfit.bottom.id, next.outfit.accessory?.id].filter(
        (id): id is string => id != null,
      );
      setHistory((prev) => [...prev, shown].slice(-HISTORY_SHUFFLES));
    }
  }

  function toggleLockTop() {
    if (result?.status !== 'ok') return;
    setLockedTop((prev) => (prev ? null : result.outfit.top));
  }

  function toggleLockBottom() {
    if (result?.status !== 'ok') return;
    setLockedBottom((prev) => (prev ? null : result.outfit.bottom));
  }

  function members(): Item[] {
    if (result?.status !== 'ok') return [];
    return [result.outfit.top, result.outfit.bottom, result.outfit.accessory].filter(
      (item): item is Item => item != null,
    );
  }

  async function handleFavoriteBoth() {
    const ids = members().map((m) => m.id);
    if (ids.length > 0) await favoriteMany(ids);
  }

  async function handleWearingToday() {
    const ids = members().map((m) => m.id);
    if (ids.length === 0) return;
    await logWearToday(ids, savedOutfitId);
    setLoggedWear(true);
  }

  async function handleSaveAsOutfit() {
    const picked = members();
    if (picked.length === 0) return;
    setIsSaving(true);
    try {
      const outfit = await createOutfitFromMembers(picked);
      setSavedOutfitId(outfit.id);
    } finally {
      setIsSaving(false);
    }
  }

  if (items === undefined) return null; // first read from IndexedDB

  return (
    <div className="flex flex-col gap-4 px-4 pb-8">
      <ScreenTitle>randomizer</ScreenTitle>

      <div className="flex flex-col gap-3">
        {/*
          One loop over `useGroups()`, so the rows here are whatever the user
          actually has — a group they invented this morning narrows a shuffle
          exactly as season does, and a group they removed disappears from
          here along with everywhere else. Category is skipped: the randomizer
          picks the categories itself.

          Built-in rows still write to their own typed fields, because those
          four take part in pairing and the types are what keep that logic
          honest; `selectionFor` is the whole of that difference.
        */}
        {groups
          .filter((group) => group.id !== CATEGORY_GROUP.id)
          .map((group) => {
            const { selected, toggle } = selectionFor(group, filters);
            return (
              <TagChipRow
                key={group.id}
                group={group}
                selected={selected}
                onToggle={(value) => setFilters(toggle(value))}
              />
            );
          })}

        {/*
          Wraps rather than scrolls: there are only a handful of these and they
          grow rarely, so a scroller only ever hid the last one off the right
          edge behind a scrollbar. The tag rows above genuinely can grow —
          a custom group can hold any number of values — so those still scroll.
        */}
        <div className="flex flex-wrap gap-1.5">
          {SWITCHES.map(({ key, label }) => {
            const active = filters[key];
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFilters({ ...filters, [key]: !active })}
                aria-pressed={active}
                className="rounded-chip min-h-8 shrink-0 border px-2.5 text-[12px] tracking-[0.02em]"
                style={
                  active
                    ? {
                  backgroundColor: 'var(--color-on)',
                  borderColor: 'var(--color-on)',
                  color: 'var(--color-on-tag)',
                }
                    : { borderColor: 'var(--color-rule)', color: 'var(--color-muted)' }
                }
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={shuffle}
        className="min-h-14 rounded-chip border text-[16px] font-medium tracking-[0.01em]"
        style={{
          backgroundColor: 'var(--color-accent)',
          borderColor: 'var(--color-accent)',
          color: 'var(--color-on-tag)',
        }}
      >
        {result ? 'reshuffle' : 'shuffle'}
      </button>

      {result?.status === 'empty' && (
        <EmptyResult reason={result.reason} filters={filters} groups={groups} onChange={setFilters} />
      )}

      {result?.status === 'ok' && (
        <div key={shuffleCount} className="shuffle-result flex flex-col gap-3">
          <OutfitLayout
            jacket={
              result.outfit.jacket && <SideCard item={result.outfit.jacket} label="jacket" />
            }
            top={
              <ResultCard
                item={result.outfit.top}
                label="top"
                locked={!!lockedTop}
                onToggleLock={toggleLockTop}
              />
            }
            accessory={
              result.outfit.accessory && (
                <SideCard item={result.outfit.accessory} label="accessory" />
              )
            }
            bottom={
              <ResultCard
                item={result.outfit.bottom}
                label="bottom"
                locked={!!lockedBottom}
                onToggleLock={toggleLockBottom}
              />
            }
            shoes={result.outfit.shoes && <SideCard item={result.outfit.shoes} label="shoes" />}
          />

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={() => void handleFavoriteBoth()}
              className="min-h-11 flex-1 rounded-chip border border-rule text-[13px] text-ink"
            >
              ♡ favorite
            </button>
            <button
              type="button"
              onClick={() => void handleWearingToday()}
              disabled={loggedWear}
              className="min-h-11 flex-1 rounded-chip border text-[13px]"
              style={
                loggedWear
                  ? {
                      backgroundColor: 'var(--color-on)',
                      borderColor: 'var(--color-on)',
                      color: 'var(--color-on-tag)',
                    }
                  : { borderColor: 'var(--color-rule)', color: 'var(--color-ink)' }
              }
            >
              {loggedWear ? "today's ootd ✓" : 'wearing this today'}
            </button>
            <button
              type="button"
              onClick={() => void handleSaveAsOutfit()}
              disabled={isSaving || !!savedOutfitId}
              className="min-h-11 flex-1 rounded-chip border border-rule text-[13px] text-ink disabled:opacity-50"
            >
              {savedOutfitId ? 'saved ✓' : isSaving ? 'saving…' : 'save as outfit'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * A supporting piece — jacket, shoes, accessory.
 *
 * Smaller than the top and bottom, and deliberately not lockable: locking
 * exists so you can keep half an outfit and reshuffle the rest, and the half
 * worth keeping is the pair. Four more locks would be four more things to
 * reason about for very little.
 */
function SideCard({ item, label }: { item: Item; label: string }) {
  return (
    <div className="rounded-chip border border-rule">
      <div className="aspect-square bg-paper">
        <ItemImage item={item} className="h-full w-full object-contain" lazy={false} />
      </div>
      <p className="truncate px-1 py-0.5 text-center text-[10px] text-muted">{label}</p>
    </div>
  );
}

function ResultCard({
  item,
  label,
  locked,
  onToggleLock,
  lockable = true,
}: {
  item: Item;
  label: string;
  locked: boolean;
  onToggleLock: () => void;
  lockable?: boolean;
}) {
  return (
    // Capped and centred rather than full-bleed. At full width two of these
    // stacked are taller than a phone screen, so the pair could not be seen
    // at once — which is the entire point of the randomizer.
    <div className="relative mx-auto w-full max-w-[190px] rounded-chip border border-rule">
      <div className="aspect-square bg-paper">
        <ItemImage item={item} className="h-full w-full object-cover" lazy={false} />
      </div>
      {lockable && (
        <button
          type="button"
          onClick={onToggleLock}
          aria-pressed={locked}
          aria-label={locked ? `Unlock the ${label}` : `Lock the ${label}`}
          className={`rounded-chip absolute top-2 right-2 flex h-9 w-9 items-center justify-center border ${
            locked ? '' : 'border-rule bg-paper/85 text-ink'
          }`}
          style={locked ? {
                  backgroundColor: 'var(--color-on)',
                  borderColor: 'var(--color-on)',
                  color: 'var(--color-on-tag)',
                } : undefined}
        >
          <LockIcon locked={locked} className="h-4 w-4" />
        </button>
      )}
      <p className="px-2 py-1.5 text-[13px] text-ink">{item.name}</p>
    </div>
  );
}

function EmptyResult({
  reason,
  filters,
  groups,
  onChange,
}: {
  reason: PickFailureReason;
  filters: RandomizerFilters;
  groups: TagGroup[];
  onChange: (next: RandomizerFilters) => void;
}) {
  // Built from the same list the filter rows are, so a selection in a group
  // the user invented is just as clearable here as a season. Clearing reuses
  // `selectionFor`'s toggle: taking an active value off is what a toggle does.
  const chips: { label: string; clear: () => void }[] = [];

  for (const group of groups) {
    if (group.id === CATEGORY_GROUP.id) continue;
    const { selected, toggle } = selectionFor(group, filters);
    for (const value of selected) {
      const option = group.options.find((o) => o.value === value);
      chips.push({ label: option?.label ?? value, clear: () => onChange(toggle(value)) });
    }
  }
  if (filters.favoritesOnly) {
    chips.push({ label: 'favorites only', clear: () => onChange({ ...filters, favoritesOnly: false }) });
  }

  const subject = reason === 'no-tops' ? 'tops' : reason === 'no-bottoms' ? 'bottoms' : 'compatible pairs';
  const description = chips.length > 0 ? chips.map((c) => c.label).join(' + ') : null;

  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <p className="text-[13px] text-muted">
        {description ? `No ${subject} match ${description}.` : `No ${subject} available right now.`}
      </p>
      {chips.length > 0 && (
        <div className="flex flex-wrap justify-center gap-1.5">
          {chips.map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={chip.clear}
              className="min-h-8 rounded-chip border border-rule px-2.5 text-[11px] tracking-[0.04em] text-ink"
            >
              {chip.label} ×
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
