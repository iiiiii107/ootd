import type { ReactNode } from 'react';

import type { SortKey } from '../db/query';

/**
 * Each sort has a real name in both directions rather than an abstract
 * asc/desc arrow — "oldest" and "not worn in ages" are what you actually
 * want to ask for. The reversed name only appears while that sort is the
 * active one, so the row stays short.
 */
const SORT_LABELS: Record<SortKey, { label: string; reversedLabel: string }> = {
  lastWorn: { label: 'last worn', reversedLabel: 'not worn in ages' },
  newest: { label: 'newest', reversedLabel: 'oldest' },
  name: { label: 'a–z', reversedLabel: 'z–a' },
  category: { label: 'category', reversedLabel: 'category ↑' },
};

/**
 * The count-and-sort bar above a grid, shared by Wardrobe and Outfits so the
 * two can't drift apart — they were already two near-identical copies, and
 * only one of them grew the reverse behaviour.
 *
 * Tapping the active sort flips its direction; tapping another switches to it
 * and starts forwards.
 */
export function SortRow({
  count,
  noun,
  options,
  sortKey,
  reversed,
  onChange,
  children,
}: {
  count: number;
  /** Singular; pluralised with a bare "s". */
  noun: string;
  options: SortKey[];
  sortKey: SortKey;
  reversed: boolean;
  onChange: (sortKey: SortKey, reversed: boolean) => void;
  /** Optional category shortcuts, shown opposite the sort options. */
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 border-b border-rule pb-2">
      {/*
        The shortcuts share the count's line rather than the sort options'.
        Beside the sorts they squeezed them into a scroller that cut "category"
        in half on a phone; the count is one short phrase and has room to spare.
      */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] text-muted">
          {count} {noun}
          {count === 1 ? '' : 's'}
        </p>
        {children}
      </div>
      <div className="flex items-center gap-2">
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1">
        {options.map((option) => {
          const active = sortKey === option;
          return (
            <button
              key={option}
              type="button"
              onClick={() => (active ? onChange(option, !reversed) : onChange(option, false))}
              aria-pressed={active}
              title={active ? 'Tap again to reverse' : undefined}
              className={`min-h-8 shrink-0 px-2 text-[12px] whitespace-nowrap ${
                active ? 'font-medium text-accent underline underline-offset-4' : 'text-muted'
              }`}
            >
              {active && reversed ? SORT_LABELS[option].reversedLabel : SORT_LABELS[option].label}
            </button>
          );
        })}
        </div>
      </div>
    </div>
  );
}
