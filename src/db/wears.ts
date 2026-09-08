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
export async function logWear(
  memberIds: string[],
  outfitId: string | null = null,
  /** A date, or a `YYYY-MM-DD` key. Defaults to today. */
  when: Date | string = new Date(),
): Promise<Wear> {
  const id = typeof when === 'string' ? when : localDateKey(when);

  // Refused here rather than only in the UI, because the date is the primary
  // key: a future row would sit at the top of the log and hold `lastWornAt`
  // ahead of every real wear indefinitely. String comparison is a correct date
  // comparison for this format precisely because it is fixed-width and
  // zero-padded — it looks like a bug otherwise, so: it isn't.
  if (id > localDateKey()) throw new Error('That day has not happened yet.');

  const entry: Wear = { id, wornAt: noonOn(id), memberIds, outfitId, note: '' };

  const affected = await db.transaction('rw', db.items, db.wears, async () => {
    const previous = await db.wears.get(id);
    await db.wears.put(entry);
    return [...new Set([...(previous?.memberIds ?? []), ...memberIds])];
  });

  await recomputeWearStats(affected);
  return entry;
}

/** Unchanged for every existing caller — the randomizer and the detail sheet. */
export function logWearToday(memberIds: string[], outfitId: string | null = null): Promise<Wear> {
  return logWear(memberIds, outfitId);
}

/**
 * Midday on the given day, and the "midday" is the point.
 *
 * `deriveWearStats` takes `Math.max(wornAt)` as `lastWornAt`, so stamping a
 * back-dated entry with `Date.now()` would tell the wardrobe's sort and the
 * randomizer's neglect weighting that a month-old outfit was worn *today* —
 * silently changing what the app recommends. Noon rather than midnight so a
 * daylight-saving shift cannot move it across a day boundary.
 *
 * Parsed field by field, never `new Date(key)`, which reads a bare
 * `YYYY-MM-DD` as UTC midnight and lands on the wrong day west of Greenwich.
 *
 * One honest wrinkle: today's entry logged at 09:00 carries a timestamp three
 * hours ahead. The only consumer asks whether it is more than thirty days ago,
 * so it costs nothing.
 */
function noonOn(key: string): number {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day, 12).getTime();
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

/** One day's entry, if that day has one. */
export async function getWear(id: string): Promise<Wear | undefined> {
  return db.wears.get(id);
}

/** Today's entry, if today has one. */
export async function getTodaysWear(): Promise<Wear | undefined> {
  return getWear(localDateKey());
}
