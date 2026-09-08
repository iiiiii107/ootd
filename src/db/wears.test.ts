import { describe, expect, it } from 'vitest';

import { deriveWearStats, localDateKey } from './wears';
import type { Wear } from './types';

function wear(id: string, wornAt: number, memberIds: string[]): Wear {
  return { id, wornAt, memberIds, outfitId: null, note: '' };
}

describe('localDateKey', () => {
  it('uses the local date, not UTC', () => {
    // 23:30 on the 30th, local. Converted to UTC first — which is what
    // `toISOString().slice(0, 10)` does — this lands on the 31st anywhere
    // east of Greenwich, filing the evening's outfit under tomorrow.
    const late = new Date(2026, 7, 30, 23, 30);
    expect(localDateKey(late)).toBe('2026-08-30');
  });

  it('pads single-digit months and days', () => {
    expect(localDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('deriveWearStats', () => {
  it('counts every day a garment appears in', () => {
    const log = [wear('2026-08-30', 300, ['top']), wear('2026-08-29', 200, ['top', 'skirt'])];
    expect(deriveWearStats('top', log)).toEqual({ lastWornAt: 300, wearCount: 2 });
    expect(deriveWearStats('skirt', log)).toEqual({ lastWornAt: 200, wearCount: 1 });
  });

  it('reports never-worn as null rather than zero', () => {
    // Zero is a real timestamp (1970); null is what "never" has to be, or
    // the randomizer's neglect weighting reads it as worn long ago.
    expect(deriveWearStats('unworn', [wear('2026-08-30', 300, ['top'])])).toEqual({
      lastWornAt: null,
      wearCount: 0,
    });
  });

  it('does not double-count a day that was logged more than once', () => {
    // The point of deriving rather than incrementing. One entry per day is
    // guaranteed by the date being the primary key, so re-logging a day
    // replaces it — and the count follows, where a counter could only go up.
    const afterReplacing = [wear('2026-08-30', 500, ['top'])];
    expect(deriveWearStats('top', afterReplacing)).toEqual({ lastWornAt: 500, wearCount: 1 });
  });

  it('drops a garment swapped out of a replaced day', () => {
    // Wore the skirt, changed into trousers, logged again. The skirt was not
    // worn that day after all and must not keep the wear.
    const afterSwap = [wear('2026-08-30', 500, ['top', 'trousers'])];
    expect(deriveWearStats('skirt', afterSwap)).toEqual({ lastWornAt: null, wearCount: 0 });
    expect(deriveWearStats('trousers', afterSwap)).toEqual({ lastWornAt: 500, wearCount: 1 });
  });

  it('falls back to the previous wear when the most recent day is deleted', () => {
    // The case an incrementing counter cannot handle at all: removing the
    // latest wear has to expose the one before it, not leave a stale date.
    const log = [wear('2026-08-20', 100, ['top']), wear('2026-08-25', 200, ['top'])];
    const afterDeletingLatest = log.filter((w) => w.id !== '2026-08-25');
    expect(deriveWearStats('top', afterDeletingLatest)).toEqual({ lastWornAt: 100, wearCount: 1 });
  });

  it('takes the latest timestamp regardless of log order', () => {
    const unordered = [wear('2026-08-20', 900, ['top']), wear('2026-08-25', 100, ['top'])];
    expect(deriveWearStats('top', unordered).lastWornAt).toBe(900);
  });
});

/**
 * The back-dating rules. These are pure assertions about how a logged day's
 * timestamp relates to the day itself — the part that, done naively, quietly
 * corrupts what the app recommends.
 */
describe('a back-dated entry', () => {
  /** Mirrors `noonOn` in wears.ts, which is private. */
  const noonOn = (key: string) => {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d, 12).getTime();
  };

  it('is stamped on its own day, not the day it was entered', () => {
    // `deriveWearStats` takes the largest `wornAt` as `lastWornAt`. Stamping a
    // month-old outfit with the current time tells the wardrobe's sort and the
    // randomizer's neglect weighting that it was worn today.
    const stamp = noonOn('2026-08-01');
    expect(localDateKey(new Date(stamp))).toBe('2026-08-01');
  });

  it('sits at midday, so a clock change cannot move it to another day', () => {
    // Midnight would be one hour from the boundary twice a year.
    expect(new Date(noonOn('2026-03-29')).getHours()).toBe(12);
    expect(new Date(noonOn('2026-10-25')).getHours()).toBe(12);
  });

  it('leaves an older wear as the most recent when it is older', () => {
    const log = [
      wear('2026-08-01', noonOn('2026-08-01'), ['top']),
      wear('2026-09-05', noonOn('2026-09-05'), ['top']),
    ];
    expect(deriveWearStats('top', log).lastWornAt).toBe(noonOn('2026-09-05'));
  });

  it('does not become the most recent just because it was entered last', () => {
    // Logging August after September must not make August the latest wear.
    const enteredOutOfOrder = [
      wear('2026-09-05', noonOn('2026-09-05'), ['top']),
      wear('2026-08-01', noonOn('2026-08-01'), ['top']),
    ];
    expect(deriveWearStats('top', enteredOutOfOrder).lastWornAt).toBe(noonOn('2026-09-05'));
  });
});
