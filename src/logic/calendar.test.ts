import { describe, expect, it } from 'vitest';

import { canGoForward, formatDay, monthGrid, monthLabel, shiftMonth } from './calendar';

const keys = (weeks: ReturnType<typeof monthGrid>) =>
  weeks.flat().map((c) => c.key).filter((k): k is string => k !== null);

describe('monthGrid', () => {
  it('lays out a month starting on a Monday with no padding', () => {
    // September 2025 begins on a Monday.
    const weeks = monthGrid(2025, 8, '2025-09-15');
    expect(weeks[0][0].key).toBe('2025-09-01');
  });

  it('pads the lead-in for a month starting on a Sunday', () => {
    // June 2025 begins on a Sunday — six blanks before it, Monday-first.
    const weeks = monthGrid(2025, 5, '2025-06-15');
    expect(weeks[0].slice(0, 6).every((c) => c.key === null)).toBe(true);
    expect(weeks[0][6].key).toBe('2025-06-01');
  });

  it('gives every day of a month exactly once', () => {
    expect(keys(monthGrid(2026, 0, '2026-01-15'))).toHaveLength(31);
    expect(keys(monthGrid(2026, 3, '2026-04-15'))).toHaveLength(30);
  });

  it('knows about leap years', () => {
    expect(keys(monthGrid(2024, 1, '2024-02-15'))).toHaveLength(29);
    expect(keys(monthGrid(2025, 1, '2025-02-15'))).toHaveLength(28);
  });

  /**
   * The test that earns this module. Two Sundays a year are 23 or 25 hours
   * long, so a calendar stepped by adding 86,400,000ms silently duplicates or
   * skips a day in exactly these two months — and only for people in a
   * daylight-saving timezone, which makes it the kind of bug that survives
   * review and reaches a phone.
   */
  it.each([
    ['March', 2, 31],
    ['October', 9, 31],
  ])('produces %s with no duplicated or missing day across a clock change', (_name, month, days) => {
    const produced = keys(monthGrid(2026, month, '2026-06-15'));
    expect(produced).toHaveLength(days);
    expect(new Set(produced).size).toBe(days);
  });

  it('always returns whole weeks', () => {
    for (let month = 0; month < 12; month++) {
      const weeks = monthGrid(2026, month, '2026-06-15');
      expect(weeks.every((w) => w.length === 7)).toBe(true);
    }
  });

  it('marks today, and everything after it as future', () => {
    const weeks = monthGrid(2026, 8, '2026-09-10');
    const cells = weeks.flat().filter((c) => c.key);
    expect(cells.find((c) => c.key === '2026-09-10')?.isToday).toBe(true);
    expect(cells.find((c) => c.key === '2026-09-10')?.isFuture).toBe(false);
    expect(cells.find((c) => c.key === '2026-09-11')?.isFuture).toBe(true);
    expect(cells.find((c) => c.key === '2026-09-09')?.isFuture).toBe(false);
  });
});

describe('shiftMonth', () => {
  it('wraps from December into January', () => {
    expect(shiftMonth(2025, 11, 1)).toEqual({ year: 2026, monthIndex: 0 });
  });

  it('wraps backwards from January into December', () => {
    expect(shiftMonth(2026, 0, -1)).toEqual({ year: 2025, monthIndex: 11 });
  });
});

describe('canGoForward', () => {
  it('stops at the current month', () => {
    expect(canGoForward(2026, 8, '2026-09-10')).toBe(false);
    expect(canGoForward(2026, 7, '2026-09-10')).toBe(true);
    expect(canGoForward(2025, 11, '2026-09-10')).toBe(true);
  });

  it('refuses a month already ahead of today', () => {
    expect(canGoForward(2026, 9, '2026-09-10')).toBe(false);
  });
});

describe('formatDay', () => {
  it('names the days nearest to hand', () => {
    expect(formatDay('2026-09-10', '2026-09-10')).toBe('today');
    expect(formatDay('2026-09-09', '2026-09-10')).toBe('yesterday');
    expect(formatDay('2026-09-07', '2026-09-10')).toBe('3 days ago');
  });

  it('falls back to a date beyond a week', () => {
    expect(formatDay('2026-08-20', '2026-09-10')).toMatch(/20/);
  });

  it('reads the key as a local date, not a UTC one', () => {
    // `new Date('2026-09-10')` is UTC midnight, which is the 9th for anyone
    // west of Greenwich — the day would be named wrong for half the world.
    expect(formatDay('2026-09-10', '2026-09-11')).toBe('yesterday');
  });
});

describe('monthLabel', () => {
  it('is lowercase, like every other label in the app', () => {
    expect(monthLabel(2026, 8)).toBe('september 2026');
  });
});
