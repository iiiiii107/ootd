import type { FilterState } from '../db/query';
import { toggleInArray } from '../lib/toggleInArray';
import type { TagGroup } from '../tags/groups';
import { TagChipRow } from './TagChipRow';

const SWITCHES: { key: 'favoritesOnly' | 'washOnly' | 'needsTaggingOnly' | 'archivedOnly'; label: string }[] = [
  { key: 'favoritesOnly', label: 'favorites' },
  { key: 'washOnly', label: 'in the wash' },
  { key: 'needsTaggingOnly', label: 'needs tagging' },
  { key: 'archivedOnly', label: 'archived' },
];

/**
 * One horizontally scrolling chip row per tag group, plus the four boolean
 * switches (spec §7.2). Renders whatever `groups` it's given — built-in or
 * custom — so a new custom group needs no changes here (spec §15).
 */
export function FilterBar({
  groups,
  filters,
  onChange,
}: {
  groups: TagGroup[];
  filters: FilterState;
  onChange: (next: FilterState) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {groups.map((group) => (
        <TagChipRow
          key={group.id}
          group={group}
          selected={filters.groups[group.id] ?? []}
          onToggle={(value) =>
            onChange({
              ...filters,
              groups: {
                ...filters.groups,
                [group.id]: toggleInArray(filters.groups[group.id] ?? [], value),
              },
            })
          }
        />
      ))}

      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {SWITCHES.map(({ key, label }) => {
          const active = filters[key];
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange({ ...filters, [key]: !active })}
              aria-pressed={active}
              className="rounded-chip min-h-8 shrink-0 border px-2.5 text-[12px] tracking-[0.02em]"
              style={
                active
                  ? {
                  backgroundColor: 'var(--color-on)',
                  borderColor: 'var(--color-on)',
                  color: 'var(--color-on-tag)',
                }
                  : { borderColor: 'var(--color-rule)', color: 'var(--color-muted)' }
              }
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
