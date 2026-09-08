import { describe, expect, it } from 'vitest';

import { pickBackupSettings, readBackupSettings } from './backupSettings';

const meta = (obj: Record<string, unknown>) =>
  Object.entries(obj).map(([key, value]) => ({ key, value }));

describe('pickBackupSettings', () => {
  it('carries the settings a person chose', () => {
    expect(
      pickBackupSettings(
        meta({
          appearance: { theme: 'dark', density: 3 },
          autoDetectEnabled: false,
          backgroundRemovalEnabled: true,
          segmentationModel: 'isnet_fp16',
          colourPreferences: { liked: ['#8a4b2f'] },
          enabledGroups: { vibe: true },
        }),
      ),
    ).toEqual({
      appearance: { theme: 'dark', density: 3 },
      autoDetectEnabled: false,
      backgroundRemovalEnabled: true,
      segmentationModel: 'isnet_fp16',
      colourPreferences: { liked: ['#8a4b2f'] },
      enabledGroups: { vibe: true },
    });
  });

  // The one entry that would do damage: a device that has never exported
  // anything must not be told it is up to date.
  it('never carries lastBackupAt', () => {
    expect(pickBackupSettings(meta({ lastBackupAt: 1_700_000_000_000 }))).toEqual({});
  });

  // A restored filter hiding most of the grid reads as data loss, in the one
  // moment the user is least able to tell the difference.
  it('leaves filter, sort and tab state behind', () => {
    expect(
      pickBackupSettings(
        meta({
          wardrobeFilterState: { groups: { category: ['top'] } },
          wardrobeSortKey: 'name',
          outfitsTab: 'saved',
          randomizerFilters: { includeJacket: false },
        }),
      ),
    ).toEqual({});
  });

  // Bookkeeping about what this install has already done, not preferences.
  it('leaves migration flags behind', () => {
    expect(
      pickBackupSettings(
        meta({ enabledGroupsMigrated: true, appearanceDensityDefault3: true, paletteVersion: 2 }),
      ),
    ).toEqual({});
  });

  it('skips a key stored as undefined rather than writing it as present', () => {
    expect(pickBackupSettings(meta({ appearance: undefined }))).toEqual({});
  });
});

describe('readBackupSettings', () => {
  it('is empty for an archive that predates settings', () => {
    expect(readBackupSettings(undefined)).toEqual({});
  });

  // The receiving app's list is the only one that can be trusted: the archive
  // may come from a build with a wider one, or from a text editor.
  it('filters an archive through the list this build trusts', () => {
    expect(
      readBackupSettings({
        appearance: { theme: 'dark' },
        lastBackupAt: 1,
        wardrobeSortKey: 'name',
        somethingInvented: true,
      }),
    ).toEqual({ appearance: { theme: 'dark' } });
  });

  // `{...DEFAULT_APPEARANCE, ...'dark'}` spreads a string into numbered keys
  // and yields an appearance nobody could have chosen.
  it('rejects a merged-over setting that is not an object', () => {
    expect(readBackupSettings({ appearance: 'dark', colourPreferences: [], enabledGroups: null }))
      .toEqual({});
  });

  it('is empty rather than throwing for a settings field that is not an object', () => {
    expect(readBackupSettings('nonsense')).toEqual({});
    expect(readBackupSettings([{ appearance: { theme: 'dark' } }])).toEqual({});
  });
});
