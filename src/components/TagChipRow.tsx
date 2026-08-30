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
      {/*
        The group's name in the group's own colour. This used to be muted grey
        small-caps with wide letterspacing, which made every group look the
        same and read like shouting; the colour does the distinguishing now,
        so the word can just be a word.
      */}
      <p className="text-[12px] font-medium" style={{ color: `var(${group.hue})` }}>
        {group.label}
      </p>
      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {group.options.map((option) => {
          const active = selected.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onToggle(option.value)}
              aria-pressed={active}
              className="rounded-chip min-h-8 shrink-0 border px-2.5 text-[12px] tracking-[0.02em]"
              style={
                active
                  ? {
                      backgroundColor: `var(${group.hue})`,
                      borderColor: `var(${group.hue})`,
                      color: 'var(--color-on-tag)',
                    }
                  : { borderColor: `color-mix(in oklab, var(${group.hue}) 38%, transparent)` }
              }
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
