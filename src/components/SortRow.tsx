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
}: {
  count: number;
  /** Singular; pluralised with a bare "s". */
  noun: string;
  options: SortKey[];
  sortKey: SortKey;
  reversed: boolean;
  onChange: (sortKey: SortKey, reversed: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-1 border-b border-rule pb-2">
      <p className="text-[11px] tracking-[0.06em] text-muted uppercase">
        {count} {noun}
        {count === 1 ? '' : 's'}
      </p>
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
              className={`min-h-8 shrink-0 px-2 text-[11px] tracking-[0.04em] whitespace-nowrap uppercase ${
                active ? 'text-ink underline underline-offset-4' : 'text-muted'
              }`}
            >
              {active && reversed ? SORT_LABELS[option].reversedLabel : SORT_LABELS[option].label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
