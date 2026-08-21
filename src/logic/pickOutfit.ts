import type { Formality, Item, Location, Season, Vibe } from '../db/types';

const NEGLECT_MS = 30 * 24 * 60 * 60 * 1000; // 30 days, spec §7.1
const MAX_TOP_ATTEMPTS = 20;
const HISTORY_SHUFFLES = 8;

/**
 * The randomizer's own filter shape — season/formality/location/vibe plus
 * the switches from spec §7.1. Deliberately not the Wardrobe's `FilterState`
 * (src/db/query.ts): this module has to stay a fully independent, pure piece
 * of logic (spec §15), and the two screens filter on different concerns
 * (the randomizer doesn't search, doesn't have "needs tagging", and treats
 * wash as an availability gate rather than an isolating chip).
 *
 * Each array is OR-within/empty-means-any, same semantics as spec §5 —
 * empty means unfiltered, a non-empty array excludes anything untagged.
 */
export interface RandomizerFilters {
  seasons: Season[];
  formality: Formality[];
  location: Location[];
  vibe: Vibe[];
  favoritesOnly: boolean;
  /** Off by default — the randomizer excludes wash items unless this is on (spec §6). */
  includeInWash: boolean;
  /** Off by default — also returns one compatible `other` item when on. */
  addAccessory: boolean;
  /**
   * Off by default, no UI switch for it yet (spec §7.1 lists only the six
   * filters above for the filter row) — masculine+feminine pairs are
   * rejected unless this is explicitly set true by a caller.
   */
  allowMixedVibe: boolean;
}

export const DEFAULT_RANDOMIZER_FILTERS: RandomizerFilters = {
  seasons: [],
  formality: [],
  location: ['home'], // spec §7.1: location defaults to home
  vibe: [],
  favoritesOnly: false,
  includeInWash: false,
  addAccessory: false,
  allowMixedVibe: false,
};

/**
 * The last 8 shuffles, oldest first — each entry is the ids shown in one
 * shuffle. Callers push a new entry after every successful pick; this module
 * only ever reads the last 8 (spec §7.1's anti-repeat window).
 */
export type ShuffleHistory = string[][];

export interface PickedOutfit {
  top: Item;
  bottom: Item;
  accessory: Item | null;
}

export type PickFailureReason =
  | 'no-tops' // the top pool is empty after filtering, before compatibility
  | 'no-bottoms' // same, for bottoms
  | 'no-compatible-pair'; // both pools had candidates, but none paired

export type PickResult =
  | { status: 'ok'; outfit: PickedOutfit }
  | { status: 'empty'; reason: PickFailureReason };

export interface PickOptions {
  /** Reshuffle only the bottom — the top is fixed to this item. */
  lockedTop?: Item;
  /** Reshuffle only the top — the bottom is fixed to this item. */
  lockedBottom?: Item;
  /** Injectable for deterministic tests — never call `Math.random()` directly below this. */
  rng?: () => number;
  /** Injectable so "worn in the last 30 days" is testable without mocking the clock. */
  now?: number;
}

function passesFilters(item: Item, filters: RandomizerFilters): boolean {
  if (item.archived || item.deletedAt != null) return false;
  if (!filters.includeInWash && item.inWash) return false;
  if (filters.favoritesOnly && !item.favorite) return false;

  if (filters.seasons.length > 0) {
    if (item.seasons.length === 0) return false;
    if (!item.seasons.some((s) => filters.seasons.includes(s))) return false;
  }
  if (filters.formality.length > 0) {
    if (!item.formality || !filters.formality.includes(item.formality)) return false;
  }
  if (filters.location.length > 0) {
    if (!item.location || !filters.location.includes(item.location)) return false;
  }
  if (filters.vibe.length > 0) {
    if (!item.vibe || !filters.vibe.includes(item.vibe)) return false;
  }
  return true;
}

/**
 * Pairing rules (spec §7.1). A null field on either item is compatible with
 * anything — untagged items are never blocked, only invisible under an
 * active filter (spec §13), which is a separate concern from `passesFilters`.
 *
 * **An active filter overrides the pairwise rule for that dimension.** Select
 * spring + summer and you are saying both seasons are acceptable today, so a
 * spring top may pair with a summer bottom — the filter has already thrown
 * out everything autumn- or winter-only, and re-applying the mutual-overlap
 * rule on top of it would quietly demand that both pieces share a season,
 * which reads as "must be tagged both". Same for formality and vibe: what
 * you selected defines the acceptable set, and anything inside it goes
 * together. With no chips pressed, the original pairwise rules stand.
 */
export function compatible(
  a: Item,
  b: Item,
  filters: Pick<RandomizerFilters, 'allowMixedVibe' | 'seasons' | 'formality' | 'vibe'>,
): boolean {
  return (
    (filters.seasons.length > 0 || seasonsOverlap(a, b)) &&
    (filters.formality.length > 0 || formalityMatches(a, b)) &&
    (filters.vibe.length > 0 || vibeCompatible(a, b, filters.allowMixedVibe))
  );
}

function seasonsOverlap(a: Item, b: Item): boolean {
  if (a.seasons.length === 0 || b.seasons.length === 0) return true;
  return a.seasons.some((s) => b.seasons.includes(s));
}

function formalityMatches(a: Item, b: Item): boolean {
  if (!a.formality || !b.formality) return true;
  return a.formality === b.formality;
}

function vibeCompatible(a: Item, b: Item, allowMixedVibe: boolean): boolean {
  if (!a.vibe || !b.vibe) return true;
  if (a.vibe === 'androgynous' || b.vibe === 'androgynous') return true;
  if (a.vibe === b.vibe) return true;
  return allowMixedVibe; // one masculine, one feminine
}

function recentlyShown(history: ShuffleHistory, id: string): boolean {
  return history.slice(-HISTORY_SHUFFLES).some((shuffle) => shuffle.includes(id));
}

/**
 * Favourites and neglected pieces resurface more; recently-shown pieces
 * decay hard so back-to-back shuffles don't just repeat themselves (spec §7.1).
 */
export function weight(item: Item, history: ShuffleHistory, now: number): number {
  let w = 1;
  if (item.favorite) w *= 1.4;
  if (item.lastWornAt == null || now - item.lastWornAt > NEGLECT_MS) w *= 1.5;
  if (recentlyShown(history, item.id)) w *= 0.2;
  return w;
}

function weightedPick(items: Item[], history: ShuffleHistory, now: number, rng: () => number): Item {
  const weights = items.map((item) => weight(item, history, now));
  const total = weights.reduce((sum, w) => sum + w, 0);
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1]; // floating-point remainder guard
}

/**
 * The one piece of real logic in the app (spec §15) — pure, no Dexie, no
 * React, `Math.random` never called directly (an `rng` is threaded through
 * instead, so every branch below is deterministically testable).
 */
export function pickOutfit(items: Item[], filters: RandomizerFilters, history: ShuffleHistory, options: PickOptions = {}): PickResult {
  const rng = options.rng ?? Math.random;
  const now = options.now ?? Date.now();

  const tops = options.lockedTop ? [options.lockedTop] : items.filter((i) => i.category === 'top' && passesFilters(i, filters));
  const bottoms = options.lockedBottom ? [options.lockedBottom] : items.filter((i) => i.category === 'bottom' && passesFilters(i, filters));

  if (tops.length === 0) return { status: 'empty', reason: 'no-tops' };
  if (bottoms.length === 0) return { status: 'empty', reason: 'no-bottoms' };

  const pair = pickPair(tops, bottoms, filters, history, now, rng, options);
  if (!pair) return { status: 'empty', reason: 'no-compatible-pair' };

  const accessory = filters.addAccessory ? pickAccessory(items, filters, history, now, rng) : null;

  return { status: 'ok', outfit: { top: pair.top, bottom: pair.bottom, accessory } };
}

function pickPair(
  tops: Item[],
  bottoms: Item[],
  filters: RandomizerFilters,
  history: ShuffleHistory,
  now: number,
  rng: () => number,
  options: PickOptions,
): { top: Item; bottom: Item } | null {
  // A locked side is fixed — there's nothing to retry, just find a compatible
  // partner for it directly rather than rejection-sampling against it.
  if (options.lockedTop) {
    const compatibleBottoms = bottoms.filter((b) => compatible(options.lockedTop!, b, filters));
    if (compatibleBottoms.length === 0) return null;
    return { top: options.lockedTop, bottom: weightedPick(compatibleBottoms, history, now, rng) };
  }
  if (options.lockedBottom) {
    const compatibleTops = tops.filter((t) => compatible(t, options.lockedBottom!, filters));
    if (compatibleTops.length === 0) return null;
    return { top: weightedPick(compatibleTops, history, now, rng), bottom: options.lockedBottom };
  }

  // Neither locked: weighted-pick a top, then a compatible bottom for it: re-pick
  // the top on failure, up to MAX_TOP_ATTEMPTS times, before giving up (spec §7.1).
  for (let attempt = 0; attempt < MAX_TOP_ATTEMPTS; attempt++) {
    const top = weightedPick(tops, history, now, rng);
    const compatibleBottoms = bottoms.filter((b) => compatible(top, b, filters));
    if (compatibleBottoms.length > 0) {
      return { top, bottom: weightedPick(compatibleBottoms, history, now, rng) };
    }
  }
  return null;
}

function pickAccessory(items: Item[], filters: RandomizerFilters, history: ShuffleHistory, now: number, rng: () => number): Item | null {
  const others = items.filter((i) => i.category === 'other' && passesFilters(i, filters));
  if (others.length === 0) return null;
  return weightedPick(others, history, now, rng);
}

/** Today's date maps to a season for the filter row's default (spec §7.1). */
export function currentSeason(date = new Date()): Season {
  const month = date.getMonth(); // 0-indexed
  if (month >= 2 && month <= 4) return 'spring'; // Mar–May
  if (month >= 5 && month <= 7) return 'summer'; // Jun–Aug
  if (month >= 8 && month <= 10) return 'autumn'; // Sep–Nov
  return 'winter'; // Dec–Feb
}
