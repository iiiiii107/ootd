import type { TagGroup } from '../tags/groups';

/**
 * Generic renderer over one tag group — used by both the filter bar and the
 * item editor, neither of which names a specific field (spec §15). The two
 * contexts pick different toggle behaviour: the filter bar lets any number
 * of chips be active regardless of `multiSelect` (it's an OR-within-group
 * selector, spec §5), while the item editor should respect `multiSelect`
 * strictly — that distinction lives in what the caller passes as `selected`
 * and does inside `onToggle`, not in this component.
 */
export function TagChipRow({
  group,
  selected,
  onToggle,
}: {
  group: TagGroup;
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[11px] tracking-[0.08em] text-muted uppercase">{group.label}</p>
      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {group.options.map((option) => {
          const active = selected.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onToggle(option.value)}
              aria-pressed={active}
              className={`rounded-chip min-h-8 shrink-0 border px-2.5 text-[12px] tracking-[0.02em] ${
                active ? 'border-ink bg-ink text-paper' : 'border-rule text-ink'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
