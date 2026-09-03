import { applyAppearance, DEFAULT_APPEARANCE, type Appearance } from '../design/theme';
import { getMeta, setMeta } from './meta';

export const APPEARANCE_KEY = 'appearance';

/**
 * A synchronous mirror of the appearance, and the reason it exists:
 * IndexedDB can only be read asynchronously, so a wardrobe themed dark or
 * given its own paper colour would spend the first frames of every launch
 * showing the built-in light palette and then snap. localStorage is readable
 * before the first paint, so `boot()` below can style the document during
 * module evaluation and the flash never happens.
 *
 * `meta` stays the source of truth, for the same reason the two photo switches
 * live there: it is the app's own store, so a browser that clears site data
 * without clearing IndexedDB keeps the setting. This mirror is only a cache,
 * and losing it costs one frame of default styling while the real value loads.
 *
 * Note that the backup file (src/db/backup.ts) carries items and tags only, so
 * a restore onto a fresh device brings the wardrobe back but not the look of
 * it. That is worth fixing, but not by widening the backup format casually —
 * it is the one thing standing between the user and a re-photographed
 * wardrobe, and it has been round-tripped through a real wipe in this shape.
 */
const MIRROR_KEY = 'ootd:appearance';

function readMirror(): Partial<Appearance> {
  try {
    const raw = localStorage.getItem(MIRROR_KEY);
    return raw ? (JSON.parse(raw) as Partial<Appearance>) : {};
  } catch {
    return {}; // private mode, disabled storage, or corrupt JSON — defaults are fine
  }
}

function writeMirror(appearance: Appearance): void {
  try {
    localStorage.setItem(MIRROR_KEY, JSON.stringify(appearance));
  } catch {
    // Not being able to cache is survivable; the value is safe in IndexedDB.
  }
}

/** Style the document from the cache. Called once, before React renders. */
export function bootAppearance(): void {
  applyAppearance(readMirror());

  // On `system`, the phone can change scheme underneath a running app — at
  // sunset, or on a schedule. The palette in force is chosen at apply time,
  // so that flip has to re-run this or the app keeps the daylight colours
  // until it is next reopened.
  window
    .matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', () => applyAppearance(readMirror()));
}

export async function getAppearance(): Promise<Appearance> {
  const stored = await getMeta<Partial<Appearance>>(APPEARANCE_KEY);
  return { ...DEFAULT_APPEARANCE, ...stored };
}

const DENSITY_MIGRATED_KEY = 'appearanceDensityDefault3';

/**
 * The wardrobe's default went from two garments across to three.
 *
 * A stored `2` needs moving with it, and can be: every appearance write saves
 * the whole object, so anyone who ever changed a colour has a density they
 * never chose — the old default, written incidentally. Migrating it is what
 * makes the new default actually reach an existing wardrobe.
 *
 * Guarded by its own flag so it happens exactly once. Someone who genuinely
 * prefers two across is moved a single time and can set it straight back, and
 * it will stay: the flag means this never runs again.
 */
export async function migrateDensityDefault(): Promise<void> {
  if (await getMeta<boolean>(DENSITY_MIGRATED_KEY)) return;
  await setMeta(DENSITY_MIGRATED_KEY, true);

  const stored = await getMeta<Partial<Appearance>>(APPEARANCE_KEY);
  if (stored?.density !== 2) return;
  await updateAppearance({ density: DEFAULT_APPEARANCE.density });
}

/** Merge a change into the stored appearance and apply it immediately. */
export async function updateAppearance(patch: Partial<Appearance>): Promise<Appearance> {
  const next = { ...(await getAppearance()), ...patch };
  await setMeta(APPEARANCE_KEY, next);
  writeMirror(next);
  applyAppearance(next);
  return next;
}
