import { BUILTIN_GROUPS, CATEGORY_GROUP } from '../tags/groups';
import { getMeta, setMeta } from './meta';
import { db } from './schema';

/**
 * Which of the built-in tag groups this person actually wants.
 *
 * Not everyone thinks about clothes in five dimensions. Vibe in particular is
 * a way of sorting a wardrobe that many people simply do not use, and meeting
 * it on day one makes the app look like it is asking for homework.
 *
 * Custom groups are not listed here — creating one *is* the decision to have
 * it, and deleting it is how it goes away.
 */
export const ENABLED_GROUPS_KEY = 'enabledGroups';

/**
 * Vibe, pattern and fit are off to begin with; the rest are on. All three are
 * ways of sorting a wardrobe that some people find essential and others never
 * think about, and a new user should not meet seven dimensions on day one.
 *
 * Category is absent deliberately — it is the one tag required at save time
 * (spec §4.1), so it is not a preference and must never be switchable.
 */
const DEFAULTS: Record<string, boolean> = {
  season: true,
  formality: true,
  location: true,
  vibe: false,
  pattern: false,
  fit: false,
};

export function isAlwaysOn(groupId: string): boolean {
  return groupId === CATEGORY_GROUP.id;
}

export async function getEnabledGroups(): Promise<Record<string, boolean>> {
  const stored = await getMeta<Record<string, boolean>>(ENABLED_GROUPS_KEY);
  return { ...DEFAULTS, ...stored };
}

export async function setGroupEnabled(groupId: string, enabled: boolean): Promise<void> {
  if (isAlwaysOn(groupId)) return;
  await setMeta(ENABLED_GROUPS_KEY, { ...(await getEnabledGroups()), [groupId]: enabled });
}

/**
 * Exported so a restore can mark it settled: an archive's group choices are a
 * decision already made, and the migration below must not second-guess them
 * on the restored device's first launch (src/db/backup.ts).
 */
export const ENABLED_GROUPS_MIGRATED_KEY = 'enabledGroupsMigrated';

/**
 * Keep any group that is already in use.
 *
 * This is the user's own idea — "if a tag is used, it should be there" — put
 * where it actually works. As a *live* rule it would be circular: a hidden
 * group cannot be used, so an unused group could never come back on its own,
 * and a group would vanish mid-use the moment you deleted the last garment
 * carrying it. As a one-time migration it does exactly the right thing: an
 * existing wardrobe keeps every dimension it has actually been sorted by, and
 * somebody starting today gets the simpler app.
 *
 * Runs once, guarded by its own flag, because it overrides the default and
 * must not undo a later decision to switch something off.
 */
export async function migrateEnabledGroups(): Promise<void> {
  if (await getMeta<boolean>(ENABLED_GROUPS_MIGRATED_KEY)) return;
  await setMeta(ENABLED_GROUPS_MIGRATED_KEY, true);

  const items = await db.items.filter((item) => item.deletedAt == null).toArray();
  if (items.length === 0) return; // a fresh install has nothing to preserve

  const enabled = await getEnabledGroups();
  let changed = false;
  for (const group of BUILTIN_GROUPS) {
    if (isAlwaysOn(group.id) || enabled[group.id]) continue;
    if (items.some((item) => group.getValues(item).length > 0)) {
      enabled[group.id] = true;
      changed = true;
    }
  }
  if (changed) await setMeta(ENABLED_GROUPS_KEY, enabled);
}
