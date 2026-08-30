import { db } from './schema';
import type { Wear } from './types';

/**
 * The wear log (spec §7.6) — what was worn, as opposed to what is owned.
 *
 * One entry per day, and logging again on the same day replaces it. That is
 * not enforced by a check: the local date *is* the primary key, so a second
 * `put` for today overwrites the first and there is no window in which two
 * entries for one day can exist. A read-modify-write could have raced with
 * itself; this cannot.
 */

/**
 * The local calendar date as `YYYY-MM-DD`.
 *
 * Built from the local getters rather than `toISOString()`, which converts to
 * UTC first: anywhere east of Greenwich, an outfit logged in the evening would
 * file itself under tomorrow, and west of it, one logged early would land on
 * yesterday. `sv-SE` happens to format exactly as `YYYY-MM-DD`, but doing it
 * by hand is clearer about what is intended than relying on a locale.
 */
export function localDateKey(when: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`;
}

/**
 * Record what was worn today, replacing today's entry if there is one.
 *
 * Both the old and the new members are re-derived afterwards: replacing an
 * entry has to take the previous outfit's contribution back out, or a day
 * revisited a few times would leave garments claiming wears that never
 * happened.
 */
export async function logWearToday(
  memberIds: string[],
  outfitId: string | null = null,
): Promise<Wear> {
  const id = localDateKey();
  const entry: Wear = { id, wornAt: Date.now(), memberIds, outfitId, note: '' };

  const affected = await db.transaction('rw', db.items, db.wears, async () => {
    const previous = await db.wears.get(id);
    await db.wears.put(entry);
    return [...new Set([...(previous?.memberIds ?? []), ...memberIds])];
  });

  await recomputeWearStats(affected);
  return entry;
}

/** Remove one day from the log, and take its contribution back out of the stats. */
export async function removeWear(id: string): Promise<void> {
  const affected = await db.transaction('rw', db.items, db.wears, async () => {
    const existing = await db.wears.get(id);
    if (!existing) return [];
    await db.wears.delete(id);
    return existing.memberIds;
  });

  await recomputeWearStats(affected);
}

/**
 * Rebuild `lastWornAt` and `wearCount` for the given items from the log.
 *
 * These two fields are caches, not facts. They exist because the randomizer
 * weights by neglect and the wardrobe sorts by last worn, and neither should
 * have to scan the log on every read — but the log is what is true. Deriving
 * them rather than incrementing is what makes a replaced day self-correcting:
 * incrementing a counter can only ever go up, so a day logged three times
 * would have left every garment in it claiming three wears.
 *
 * The whole log is read because it is small by nature — one row per day, so a
 * few hundred a year — and because a partial read cannot answer "when was this
 * last worn" after the most recent wear has just been deleted.
 */
export async function recomputeWearStats(itemIds: string[]): Promise<void> {
  if (itemIds.length === 0) return;
  const wears = await db.wears.toArray();

  await db.transaction('rw', db.items, async () => {
    for (const id of itemIds) {
      const { lastWornAt, wearCount } = deriveWearStats(id, wears);
      // Touch `updatedAt` only when something actually moved: this runs on
      // every log write, and a no-op write would still wake every live query
      // watching the wardrobe.
      const item = await db.items.get(id);
      if (!item) continue;
      if (item.lastWornAt === lastWornAt && item.wearCount === wearCount) continue;
      await db.items.update(id, { lastWornAt, wearCount, updatedAt: Date.now() });
    }
  });
}

/**
 * What the log says about one garment. Pure, so the rule that matters — a
 * replaced day must not leave a wear behind — can be tested without a
 * database, in the same spirit as `pickOutfit`.
 */
export function deriveWearStats(
  itemId: string,
  wears: Wear[],
): { lastWornAt: number | null; wearCount: number } {
  const mine = wears.filter((wear) => wear.memberIds.includes(itemId));
  return {
    lastWornAt: mine.length > 0 ? Math.max(...mine.map((w) => w.wornAt)) : null,
    wearCount: mine.length,
  };
}

/** The feed: every day logged, most recent first. */
export async function listWears(): Promise<Wear[]> {
  return db.wears.orderBy('wornAt').reverse().toArray();
}

/** Today's entry, if today has one. */
export async function getTodaysWear(): Promise<Wear | undefined> {
  return db.wears.get(localDateKey());
}
