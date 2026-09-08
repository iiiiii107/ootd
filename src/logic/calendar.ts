/**
 * Month grids and day names, pure.
 *
 * Every date here is built with `new Date(y, m, d)` and stepped by
 * incrementing the day number — **never by adding 86,400,000 milliseconds**.
 * Two Sundays a year are 23 or 25 hours long, and a millisecond-stepped
 * calendar silently duplicates or skips a day on each of them. There is a test
 * for exactly that, and it is the reason this module exists rather than the
 * arithmetic living inline in a component.
 *
 * `formatDay` moved here out of the old wear feed for the same reason: it
 * could not be tested there without mocking the clock.
 */

export interface DayCell {
  /** `YYYY-MM-DD`, or null for a padding cell outside the month. */
  key: string | null;
  day: number;
  isToday: boolean;
  isFuture: boolean;
}

function keyOf(year: number, monthIndex: number, day: number): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
}

/**
 * Six rows of seven, Monday first.
 *
 * Padding cells carry a null key rather than the neighbouring month's dates:
 * this is a wardrobe, not a scheduling app, and showing greyed-out neighbours
 * only invites tapping across a month boundary by mistake.
 */
export function monthGrid(year: number, monthIndex: number, todayKey: string): DayCell[][] {
  const first = new Date(year, monthIndex, 1);
  // getDay() is Sunday-first; shift so Monday leads, which is how a week reads
  // everywhere this app is likely to be used.
  const lead = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  const cells: DayCell[] = [];
  for (let i = 0; i < lead; i++) cells.push({ key: null, day: 0, isToday: false, isFuture: false });
  for (let day = 1; day <= daysInMonth; day++) {
    const key = keyOf(year, monthIndex, day);
    cells.push({ key, day, isToday: key === todayKey, isFuture: key > todayKey });
  }
  while (cells.length % 7 !== 0) {
    cells.push({ key: null, day: 0, isToday: false, isFuture: false });
  }

  const weeks: DayCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

/** Lowercase, like every other label in the app. */
export function monthLabel(year: number, monthIndex: number): string {
  return `${MONTHS[monthIndex]} ${year}`;
}

export function shiftMonth(
  year: number,
  monthIndex: number,
  delta: number,
): { year: number; monthIndex: number } {
  const d = new Date(year, monthIndex + delta, 1);
  return { year: d.getFullYear(), monthIndex: d.getMonth() };
}

/** There is nothing to see in the future, so the forward control stops at this month. */
export function canGoForward(year: number, monthIndex: number, todayKey: string): boolean {
  const [todayYear, todayMonth] = todayKey.split('-').map(Number);
  return year < todayYear || (year === todayYear && monthIndex < todayMonth - 1);
}

/** The weekday initials above the grid, Monday first. */
export const WEEKDAY_INITIALS = ['m', 't', 'w', 't', 'f', 's', 's'];

/**
 * A day's name: `today`, `yesterday`, `3 days ago`, then the date.
 *
 * Parsed field by field rather than through `new Date(key)`, which reads a
 * bare `YYYY-MM-DD` as UTC midnight and so names the wrong day for anyone west
 * of Greenwich.
 */
export function formatDay(key: string, todayKey: string): string {
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(year, month - 1, day);

  const [ty, tm, td] = todayKey.split('-').map(Number);
  const today = new Date(ty, tm - 1, td);

  const daysAgo = Math.round((today.getTime() - date.getTime()) / 86_400_000);
  if (daysAgo === 0) return 'today';
  if (daysAgo === 1) return 'yesterday';
  if (daysAgo > 1 && daysAgo < 7) return `${daysAgo} days ago`;

  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: year === ty ? undefined : 'numeric',
  });
}
