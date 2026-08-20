import { useCustomTags } from '../db/hooks';
import type { CustomTag, Item } from '../db/types';
import { BUILTIN_GROUPS, type TagGroup } from './groups';

/** Builds one custom TagGroup from the tag-value rows that share a groupName. */
function customGroup(groupName: string, rows: CustomTag[]): TagGroup {
  const multiSelect = rows[0]?.multiSelect ?? true;
  return {
    id: `custom:${groupName}`,
    label: groupName,
    multiSelect,
    builtin: false,
    options: rows.map((row) => ({ value: row.id, label: row.label })),
    getValues: (item: Item) => item.customTags.filter((id) => rows.some((row) => row.id === id)),
    toggle: (item: Item, value: string) => {
      const has = item.customTags.includes(value);
      if (has) {
        return { customTags: item.customTags.filter((id) => id !== value) };
      }
      if (multiSelect) {
        return { customTags: [...item.customTags, value] };
      }
      // Single-select custom group: swap out any other value from this same
      // group, but leave tags belonging to other groups untouched.
      const otherGroupIds = new Set(rows.map((row) => row.id));
      const withoutThisGroup = item.customTags.filter((id) => !otherGroupIds.has(id));
      return { customTags: [...withoutThisGroup, value] };
    },
  };
}

/**
 * Built-ins plus every custom group from the `tags` store, merged into one
 * list — the filter bar and item editor render this and nothing more
 * specific, so a new custom group needs zero code changes to appear in both
 * (spec §15).
 */
export function useGroups(): TagGroup[] {
  const customTags = useCustomTags() ?? [];
  const byGroup = new Map<string, CustomTag[]>();
  for (const tag of customTags) {
    const rows = byGroup.get(tag.groupName) ?? [];
    rows.push(tag);
    byGroup.set(tag.groupName, rows);
  }
  const custom = [...byGroup.entries()].map(([groupName, rows]) => customGroup(groupName, rows));
  return [...BUILTIN_GROUPS, ...custom];
}
