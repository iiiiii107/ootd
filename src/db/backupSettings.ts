/**
 * Which settings travel inside a backup, and which stay behind.
 *
 * The pair of functions here are pure and know nothing about Dexie, so the
 * decision they encode — *what* crosses between two phones — can be tested
 * on its own. The writing back is in `backup.ts`, where the setters live.
 */

/**
 * An explicit allow-list, rather than dumping the whole `meta` store.
 *
 * The difference matters the next time a device-local key is added: with a
 * dump it silently starts travelling between phones, and nobody finds out
 * until it causes something strange on the far end. Here, a new key does
 * nothing at all until somebody names it, which is the right default for a
 * file that leaves the device.
 *
 * What is deliberately *not* here is as much of the design as what is:
 *
 * - **`lastBackupAt`** — the one entry that would actively cause harm.
 *   Restoring it would tell a phone that has never exported anything that it
 *   is up to date, and the 30-day nag exists precisely to catch the phone
 *   that has never exported anything.
 * - **Filter, sort and tab state** — restoring a filter would hand somebody a
 *   wardrobe with most of it hidden, immediately after the anxious moment of
 *   restoring a backup. That reads as data loss even though nothing is lost.
 * - **Migration flags** — bookkeeping about what this install has already
 *   done, not preferences. They are handled separately on the way in, below.
 */
export const BACKUP_SETTING_KEYS = [
  'appearance',
  'autoDetectEnabled',
  'backgroundRemovalEnabled',
  'segmentationModel',
  'colourPreferences',
  'enabledGroups',
] as const;

export type BackupSettingKey = (typeof BACKUP_SETTING_KEYS)[number];

export type BackupSettings = Partial<Record<BackupSettingKey, unknown>>;

/** Keys whose value is merged over a defaults object on read, so a non-object
 *  would spread into nonsense (`{...defaults, ...'dark'}` yields numbered
 *  keys) rather than being ignored. Checked on the way in, since an archive
 *  is a file from outside and may have been edited by hand. */
const OBJECT_KEYS = new Set<string>(['appearance', 'colourPreferences', 'enabledGroups']);

function isAllowed(key: string, value: unknown): key is BackupSettingKey {
  if (!(BACKUP_SETTING_KEYS as readonly string[]).includes(key)) return false;
  if (value === undefined) return false;
  if (OBJECT_KEYS.has(key)) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
  return true;
}

/** Narrow a device's `meta` rows down to the settings worth carrying. */
export function pickBackupSettings(entries: { key: string; value: unknown }[]): BackupSettings {
  const settings: BackupSettings = {};
  for (const { key, value } of entries) {
    if (isAllowed(key, value)) settings[key] = value;
  }
  return settings;
}

/**
 * Filter what an archive claims to carry, through the same list.
 *
 * Checking on the way *in* as well as out is not belt-and-braces: the archive
 * may have been written by an older build with a wider list, or edited, and
 * the receiving app is the only one whose list can be trusted.
 */
export function readBackupSettings(raw: unknown): BackupSettings {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  return pickBackupSettings(
    Object.entries(raw as Record<string, unknown>).map(([key, value]) => ({ key, value })),
  );
}
