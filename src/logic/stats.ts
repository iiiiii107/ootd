import type { Item, Wear } from '../db/types';
import { colourFamily, FAMILY_LABELS, type FamilyId } from './colour';

/**
 * What the wardrobe and the log add up to.
 *
 * Pure — arrays in, plain data out, no Dexie, no React, no clock unless it is
 * passed in. The same contract as `pickOutfit`, and for the same reason: these
 * are the app's opinions about your habits, and an opinion you cannot test is
 * one you cannot trust.
 *
 * **Counts come from the log, never from `Item.wearCount`.** Those fields are
 * caches by the code's own description, and a screen whose whole purpose is to
 * tell you the truth about your wardrobe should read the thing that is true.
 * It also means a drifted cache shows up here rather than hiding.
 *
 * Days still ahead are excluded everywhere. A plan is not a wear — the same
 * rule the wardrobe and the randomizer follow.
 */

export interface WearTally {
  item: Item;
  wearCount: number;
  lastWornAt: number | null;
}

/** Garments only: outfits are saved combinations, and counting both double-counts. */
function isGarment(item: Item): boolean {
  return item.deletedAt == null && !item.archived && item.category !== 'outfit';
}

function past(wears: Wear[], todayKey: string): Wear[] {
  return wears.filter((wear) => wear.id <= todayKey);
}

export function tallyWears(items: Item[], wears: Wear[], todayKey: string): WearTally[] {
  const worn = past(wears, todayKey);
  return items.filter(isGarment).map((item) => {
    const mine = worn.filter((wear) => wear.memberIds.includes(item.id));
    return {
      item,
      wearCount: mine.length,
      lastWornAt: mine.length > 0 ? Math.max(...mine.map((w) => w.wornAt)) : null,
    };
  });
}

export function mostWorn(tallies: WearTally[], limit = 6): WearTally[] {
  return [...tallies]
    .filter((t) => t.wearCount > 0)
    .sort((a, b) => b.wearCount - a.wearCount || a.item.name.localeCompare(b.item.name))
    .slice(0, limit);
}

/**
 * Worn at least once, ascending. Never-worn has its own section — without
 * that exclusion the two lists would be largely the same list, and the
 * interesting question ("what do I own and rarely reach for") would be buried
 * under the far commoner "what have I not worn at all".
 */
export function leastWorn(tallies: WearTally[], limit = 6): WearTally[] {
  return [...tallies]
    .filter((t) => t.wearCount > 0)
    .sort((a, b) => a.wearCount - b.wearCount || a.item.name.localeCompare(b.item.name))
    .slice(0, limit);
}

export function neverWorn(tallies: WearTally[]): WearTally[] {
  return tallies.filter((t) => t.wearCount === 0);
}

/**
 * What share of the wardrobe has actually been worn since a given day.
 *
 * Archived and trashed garments are out of the denominator: clothes you no
 * longer own should not drag down "how much of my wardrobe do I use".
 * Compared as date strings, so the window needs no timezone reasoning at all.
 */
export function wardrobeUsage(
  items: Item[],
  wears: Wear[],
  sinceKey: string,
  todayKey: string,
): { worn: number; total: number; share: number } {
  const garments = items.filter(isGarment);
  const inWindow = past(wears, todayKey).filter((wear) => wear.id >= sinceKey);
  const wornIds = new Set(inWindow.flatMap((wear) => wear.memberIds));
  const worn = garments.filter((item) => wornIds.has(item.id)).length;
  return { worn, total: garments.length, share: garments.length > 0 ? worn / garments.length : 0 };
}

/**
 * Days logged per month, oldest first, **with empty months filled in**.
 *
 * A chart that silently skips a fallow month lies about exactly the thing this
 * section exists to show. The month comes from slicing the entry's date, so
 * again no date parsing and no timezone.
 */
export function wearsPerMonth(
  wears: Wear[],
  todayKey: string,
): { month: string; label: string; days: number }[] {
  const worn = past(wears, todayKey);
  if (worn.length === 0) return [];

  const counts = new Map<string, number>();
  for (const wear of worn) {
    const month = wear.id.slice(0, 7);
    counts.set(month, (counts.get(month) ?? 0) + 1);
  }

  const months = [...counts.keys()].sort();
  const [firstYear, firstMonth] = months[0].split('-').map(Number);
  const [lastYear, lastMonth] = todayKey.slice(0, 7).split('-').map(Number);

  const out: { month: string; label: string; days: number }[] = [];
  for (let y = firstYear, m = firstMonth; y < lastYear || (y === lastYear && m <= lastMonth); ) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    out.push({ month: key, label: MONTH_SHORT[m - 1], days: counts.get(key) ?? 0 });
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

const MONTH_SHORT = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export interface TagShare {
  value: string;
  label: string;
  /** Share of tagged garments carrying this value. */
  ownedShare: number;
  /** Share of wear *events* involving it. */
  wornShare: number;
}

/**
 * What you own against what you actually wear, for one tag group.
 *
 * Takes the group's options and a reader rather than importing `TagGroup`, so
 * this module stays free of the tag system — and so a custom group the user
 * invents gets a breakdown for free, the same way the filter bar renders one
 * without knowing what it is.
 *
 * `ownedShare` counts garments; `wornShare` counts wear *events*, so a garment
 * worn eight times counts eight times. That asymmetry is the entire point:
 * "I own mostly formal but wear mostly casual" is a sentence about the gap
 * between the two.
 *
 * Untagged garments are excluded from both sides and reported separately —
 * otherwise a half-tagged wardrobe reads as "0% formal" rather than "not
 * enough of this is tagged yet".
 */
export function tagBreakdown(
  items: Item[],
  wears: Wear[],
  options: readonly { value: string; label: string }[],
  getValues: (item: Item) => string[],
  todayKey: string,
): { shares: TagShare[]; untagged: number } {
  const garments = items.filter(isGarment);
  const tagged = garments.filter((item) => getValues(item).length > 0);

  const byId = new Map(garments.map((item) => [item.id, item]));
  const events: string[] = [];
  for (const wear of past(wears, todayKey)) {
    for (const id of wear.memberIds) {
      const item = byId.get(id);
      if (item) events.push(...getValues(item));
    }
  }

  const shares = options.map(({ value, label }) => ({
    value,
    label,
    ownedShare: tagged.length > 0 ? tagged.filter((i) => getValues(i).includes(value)).length / tagged.length : 0,
    wornShare: events.length > 0 ? events.filter((v) => v === value).length / events.length : 0,
  }));

  return { shares, untagged: garments.length - tagged.length };
}

export interface Pairing {
  a: FamilyId;
  b: FamilyId;
  label: string;
  count: number;
}

/**
 * Which colours you actually put together.
 *
 * Every unordered pair within a day, so a three-piece day yields three
 * pairings. Garments with no palette are skipped rather than counted as black
 * — "not read yet" is not a colour.
 *
 * Same-family pairs are kept. "Black with black" is a real habit, and a chart
 * that hid it would be flattering rather than useful.
 */
export function colourPairings(
  items: Item[],
  wears: Wear[],
  todayKey: string,
  limit = 6,
): Pairing[] {
  const family = new Map<string, FamilyId>();
  for (const item of items) {
    const hex = item.palette[0]?.hex;
    if (hex) family.set(item.id, colourFamily(hex));
  }

  const counts = new Map<string, Pairing>();
  for (const wear of past(wears, todayKey)) {
    const families = wear.memberIds.map((id) => family.get(id)).filter((f): f is FamilyId => !!f);
    for (let i = 0; i < families.length; i++) {
      for (let j = i + 1; j < families.length; j++) {
        // Sorted so "black with beige" and "beige with black" are one pairing.
        const [a, b] = [families[i], families[j]].sort();
        const key = `${a}|${b}`;
        const existing = counts.get(key);
        if (existing) existing.count++;
        else counts.set(key, { a, b, label: `${FAMILY_LABELS[a]} · ${FAMILY_LABELS[b]}`, count: 1 });
      }
    }
  }

  return [...counts.values()]
    .sort((x, y) => y.count - x.count || x.label.localeCompare(y.label))
    .slice(0, limit);
}

/** The first day of the month `months` back — the window for "in rotation". */
export function monthsAgoKey(todayKey: string, months: number): string {
  const [year, month] = todayKey.split('-').map(Number);
  const d = new Date(year, month - 1 - months, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
