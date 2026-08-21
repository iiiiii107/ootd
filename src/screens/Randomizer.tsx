import { useEffect, useState } from 'react';

import { LockIcon } from '../components/icons';
import { ScreenTitle } from '../components/ScreenTitle';
import { TagChipRow } from '../components/TagChipRow';
import { useWardrobeItems } from '../db/hooks';
import { createOutfitFromMembers, favoriteMany, markWornToday } from '../db/items';
import { getMeta, setMeta } from '../db/meta';
import type { Formality, Item, Location, Season, Vibe } from '../db/types';
import { composeOutfitThumb } from '../images/composite';
import { toggleInArray } from '../lib/toggleInArray';
import { useObjectUrl } from '../lib/useObjectUrl';
import {
  DEFAULT_RANDOMIZER_FILTERS,
  currentSeason,
  pickOutfit,
  type PickFailureReason,
  type PickResult,
  type RandomizerFilters,
  type ShuffleHistory,
} from '../logic/pickOutfit';
import { FORMALITY_GROUP, LOCATION_GROUP, SEASON_GROUP, VIBE_GROUP } from '../tags/groups';

const FILTERS_KEY = 'randomizerFilters';
const HISTORY_SHUFFLES = 8;

const SWITCHES: { key: 'favoritesOnly' | 'includeInWash' | 'addAccessory'; label: string }[] = [
  { key: 'favoritesOnly', label: 'favorites only' },
  { key: 'includeInWash', label: 'include in the wash' },
  { key: 'addAccessory', label: 'add an accessory' },
];

/**
 * The Clueless machine (spec §7.1). All the real logic lives in
 * src/logic/pickOutfit.ts, pure and unit-tested; this screen is just state
 * and rendering around it.
 */
export default function Randomizer() {
  const items = useWardrobeItems();

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
      if (saved) setFilters(saved);
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
    });
    setResult(next);
    setSavedOutfitId(null);
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
    if (ids.length > 0) await markWornToday(ids);
  }

  async function handleSaveAsOutfit() {
    const picked = members();
    if (picked.length === 0) return;
    setIsSaving(true);
    try {
      const composite = await composeOutfitThumb(picked);
      const outfit = await createOutfitFromMembers(picked, composite);
      setSavedOutfitId(outfit.id);
    } finally {
      setIsSaving(false);
    }
  }

  if (items === undefined) return null; // first read from IndexedDB

  return (
    <div className="flex flex-col gap-4 px-4 pb-24">
      <ScreenTitle>randomizer</ScreenTitle>

      <div className="flex flex-col gap-3">
        <TagChipRow
          group={SEASON_GROUP}
          selected={filters.seasons}
          onToggle={(v) =>
            setFilters({ ...filters, seasons: toggleInArray(filters.seasons, v as Season) })
          }
        />
        <TagChipRow
          group={FORMALITY_GROUP}
          selected={filters.formality}
          onToggle={(v) =>
            setFilters({ ...filters, formality: toggleInArray(filters.formality, v as Formality) })
          }
        />
        <TagChipRow
          group={LOCATION_GROUP}
          selected={filters.location}
          onToggle={(v) =>
            setFilters({ ...filters, location: toggleInArray(filters.location, v as Location) })
          }
        />
        <TagChipRow
          group={VIBE_GROUP}
          selected={filters.vibe}
          onToggle={(v) => setFilters({ ...filters, vibe: toggleInArray(filters.vibe, v as Vibe) })}
        />
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {SWITCHES.map(({ key, label }) => {
            const active = filters[key];
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFilters({ ...filters, [key]: !active })}
                aria-pressed={active}
                className={`min-h-8 shrink-0 border px-2.5 text-[12px] tracking-[0.02em] ${
                  active ? 'border-ink bg-ink text-paper' : 'border-rule text-muted'
                }`}
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
        className="min-h-14 border border-ink text-[15px] tracking-[0.06em] text-ink uppercase"
      >
        {result ? 'reshuffle' : 'shuffle'}
      </button>

      {result?.status === 'empty' && (
        <EmptyResult reason={result.reason} filters={filters} onChange={setFilters} />
      )}

      {result?.status === 'ok' && (
        <div key={shuffleCount} className="shuffle-result flex flex-col gap-3">
          <ResultCard item={result.outfit.top} label="top" locked={!!lockedTop} onToggleLock={toggleLockTop} />
          <ResultCard
            item={result.outfit.bottom}
            label="bottom"
            locked={!!lockedBottom}
            onToggleLock={toggleLockBottom}
          />
          {result.outfit.accessory && (
            <ResultCard item={result.outfit.accessory} label="accessory" locked={false} onToggleLock={() => {}} lockable={false} />
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={() => void handleFavoriteBoth()}
              className="min-h-11 flex-1 border border-rule text-[13px] text-ink"
            >
              ♡ favorite
            </button>
            <button
              type="button"
              onClick={() => void handleWearingToday()}
              className="min-h-11 flex-1 border border-rule text-[13px] text-ink"
            >
              wearing this today
            </button>
            <button
              type="button"
              onClick={() => void handleSaveAsOutfit()}
              disabled={isSaving || !!savedOutfitId}
              className="min-h-11 flex-1 border border-rule text-[13px] text-ink disabled:opacity-50"
            >
              {savedOutfitId ? 'saved ✓' : isSaving ? 'saving…' : 'save as outfit'}
            </button>
          </div>
        </div>
      )}
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
  const url = useObjectUrl(item.thumb);
  return (
    <div className="relative border border-rule">
      <div className="aspect-square bg-paper">
        {url && <img src={url} alt={item.name} className="h-full w-full object-cover" />}
      </div>
      {lockable && (
        <button
          type="button"
          onClick={onToggleLock}
          aria-pressed={locked}
          aria-label={locked ? `Unlock the ${label}` : `Lock the ${label}`}
          className={`absolute top-2 right-2 flex h-9 w-9 items-center justify-center border ${
            locked ? 'border-ink bg-ink text-paper' : 'border-rule bg-paper/85 text-ink'
          }`}
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
  onChange,
}: {
  reason: PickFailureReason;
  filters: RandomizerFilters;
  onChange: (next: RandomizerFilters) => void;
}) {
  const chips: { label: string; clear: () => void }[] = [];

  for (const value of filters.seasons) {
    const option = SEASON_GROUP.options.find((o) => o.value === value);
    chips.push({
      label: option?.label ?? value,
      clear: () => onChange({ ...filters, seasons: filters.seasons.filter((v) => v !== value) }),
    });
  }
  for (const value of filters.formality) {
    const option = FORMALITY_GROUP.options.find((o) => o.value === value);
    chips.push({
      label: option?.label ?? value,
      clear: () => onChange({ ...filters, formality: filters.formality.filter((v) => v !== value) }),
    });
  }
  for (const value of filters.location) {
    const option = LOCATION_GROUP.options.find((o) => o.value === value);
    chips.push({
      label: option?.label ?? value,
      clear: () => onChange({ ...filters, location: filters.location.filter((v) => v !== value) }),
    });
  }
  for (const value of filters.vibe) {
    const option = VIBE_GROUP.options.find((o) => o.value === value);
    chips.push({
      label: option?.label ?? value,
      clear: () => onChange({ ...filters, vibe: filters.vibe.filter((v) => v !== value) }),
    });
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
              className="min-h-8 border border-rule px-2.5 text-[11px] tracking-[0.04em] text-ink"
            >
              {chip.label} ×
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
