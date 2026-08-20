/** Adds `value` if absent, removes it if present — the OR-within-a-group filter toggle (spec §5). */
export function toggleInArray<T>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
}
