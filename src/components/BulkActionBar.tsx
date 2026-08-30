import { bulkSetLocation, bulkSetWash } from '../db/items';
import type { Location } from '../db/types';

const LOCATIONS: { value: Location; label: string }[] = [
  { value: 'home', label: 'home' },
  { value: 'university', label: 'university' },
  { value: 'elsewhere', label: 'elsewhere' },
];

/**
 * Bulk actions for multi-select mode (spec §7.2) — the two cases the spec
 * names by hand: "everything in this box is going to university" (location)
 * and clearing a whole laundry load in a few taps (wash).
 */
export function BulkActionBar({
  selectedIds,
  onDone,
}: {
  selectedIds: string[];
  onDone: () => void;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex flex-col gap-2 border-t border-rule bg-paper px-4 py-3 pb-[max(env(safe-area-inset-bottom),12px)]">
      <div className="flex items-center justify-between">
        <p className="text-[12px] tracking-[0.04em] text-muted">{selectedIds.length} selected</p>
        <button type="button" onClick={onDone} className="min-h-8 px-2 text-[13px] text-ink">
          done
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          disabled={selectedIds.length === 0}
          onClick={() => void bulkSetWash(selectedIds, true)}
          className="min-h-8 rounded-chip border border-rule px-2.5 text-[12px] text-ink disabled:opacity-40"
        >
          mark in the wash
        </button>
        <button
          type="button"
          disabled={selectedIds.length === 0}
          onClick={() => void bulkSetWash(selectedIds, false)}
          className="min-h-8 rounded-chip border border-rule px-2.5 text-[12px] text-ink disabled:opacity-40"
        >
          mark clean
        </button>
        {LOCATIONS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            disabled={selectedIds.length === 0}
            onClick={() => void bulkSetLocation(selectedIds, value)}
            className="min-h-8 rounded-chip border border-rule px-2.5 text-[12px] text-ink disabled:opacity-40"
          >
            → {label}
          </button>
        ))}
      </div>
    </div>
  );
}
