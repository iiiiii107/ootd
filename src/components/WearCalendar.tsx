import { useMemo, useState } from 'react';

import { useItem, useWearsInMonth } from '../db/hooks';
import { localDateKey } from '../db/wears';
import {
  WEEKDAY_INITIALS,
  canGoForward,
  monthGrid,
  monthLabel,
  shiftMonth,
} from '../logic/calendar';
import { DaySheet } from './DaySheet';
import { ItemImage } from './ItemImage';

/**
 * What you wore, a month at a time.
 *
 * A calendar rather than the day-by-day list it replaces, because the useful
 * question about wearing habits is shaped like a month — what have I actually
 * worn lately, and which stretches are empty — and a list can only answer that
 * by being scrolled and counted.
 *
 * A logged day shows its first garment rather than a dot. This is a wardrobe
 * app; its calendar should show clothes.
 */
export function WearCalendar() {
  const todayKey = localDateKey();
  const [{ year, monthIndex }, setMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), monthIndex: now.getMonth() };
  });

  const wears = useWearsInMonth(year, monthIndex);
  const byDay = useMemo(
    () => new Map((wears ?? []).map((wear) => [wear.id, wear])),
    [wears],
  );
  const weeks = useMemo(
    () => monthGrid(year, monthIndex, todayKey),
    [year, monthIndex, todayKey],
  );

  const [openDay, setOpenDay] = useState<string | null>(null);
  const forward = canGoForward(year, monthIndex, todayKey);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setMonth(shiftMonth(year, monthIndex, -1))}
          aria-label="The month before"
          className="min-h-11 min-w-11 text-[16px] text-muted"
        >
          ‹
        </button>
        <p className="text-[14px] text-ink">{monthLabel(year, monthIndex)}</p>
        <button
          type="button"
          onClick={() => forward && setMonth(shiftMonth(year, monthIndex, 1))}
          disabled={!forward}
          aria-label="The month after"
          className="min-h-11 min-w-11 text-[16px] text-muted disabled:opacity-30"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAY_INITIALS.map((initial, i) => (
          <p key={i} className="text-center text-[10px] text-muted">
            {initial}
          </p>
        ))}

        {weeks.flat().map((cell, i) => {
          // Padding outside the month renders as nothing at all rather than as
          // the neighbouring month's dates — this is not a scheduling app, and
          // greyed neighbours only invite tapping across a boundary by mistake.
          if (!cell.key) return <div key={i} />;

          const wear = byDay.get(cell.key);
          return (
            <DayCellButton
              key={cell.key}
              day={cell.day}
              isToday={cell.isToday}
              isFuture={cell.isFuture}
              memberId={wear?.memberIds[0]}
              pieces={wear?.memberIds.length ?? 0}
              onTap={() => setOpenDay(cell.key)}
            />
          );
        })}
      </div>

      <p className="text-center text-[12px] leading-relaxed text-muted">
        {byDay.size === 0
          ? 'Nothing logged this month. Tap any day to say what you wore.'
          : 'Tap any day to change what you wore, or fill one in.'}
      </p>

      {openDay && (
        <DaySheet dateKey={openDay} todayKey={todayKey} onClose={() => setOpenDay(null)} />
      )}
    </div>
  );
}

function DayCellButton({
  day,
  isToday,
  isFuture,
  memberId,
  pieces,
  onTap,
}: {
  day: number;
  isToday: boolean;
  isFuture: boolean;
  memberId: string | undefined;
  pieces: number;
  onTap: () => void;
}) {
  const item = useItem(memberId ?? null);

  const label = isFuture
    ? `${day} — hasn't happened yet`
    : pieces > 0
      ? `${day} — ${pieces} ${pieces === 1 ? 'piece' : 'pieces'}`
      : `${day} — nothing logged`;

  return (
    <button
      type="button"
      onClick={onTap}
      disabled={isFuture}
      aria-label={label}
      className="relative aspect-square overflow-hidden rounded-chip border disabled:opacity-30"
      style={{
        borderColor: isToday ? 'var(--color-on)' : 'var(--color-rule)',
        borderWidth: isToday ? 2 : 1,
      }}
    >
      {item && <ItemImage item={item} alt="" className="h-full w-full object-cover" />}
      {/* A day whose garments have all been deleted still happened, so it is
          marked as logged rather than left looking empty. */}
      {!item && pieces > 0 && <span className="absolute inset-0 bg-sunken" />}
      <span
        className={`absolute right-1 bottom-0.5 text-[10px] ${
          item ? 'rounded-sm bg-paper/85 px-1 text-ink' : 'text-muted'
        }`}
      >
        {day}
      </span>
    </button>
  );
}
