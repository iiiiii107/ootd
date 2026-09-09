import { describe, expect, it } from 'vitest';

import { DEFAULT_ENABLED_GROUPS, isAlwaysOn } from './groupSettings';
import { BUILTIN_GROUPS } from '../tags/groups';

describe('the enabled-groups defaults', () => {
  // The bug this exists to prevent: `useEnabledGroups` kept a second copy of
  // this list, never heard about pattern and fit, read them as `undefined`,
  // and so showed both everywhere despite their being off by default. A
  // built-in missing from the list is invisible in exactly that way.
  it('has an entry for every optional built-in', () => {
    const optional = BUILTIN_GROUPS.filter((g) => !isAlwaysOn(g.id)).map((g) => g.id);
    expect(Object.keys(DEFAULT_ENABLED_GROUPS).sort()).toEqual(optional.sort());
  });

  it('does not list category, which is never switchable', () => {
    expect(DEFAULT_ENABLED_GROUPS).not.toHaveProperty('category');
  });

  it('starts a new wardrobe on three dimensions, not seven', () => {
    const on = Object.entries(DEFAULT_ENABLED_GROUPS).filter(([, v]) => v);
    expect(on.map(([id]) => id).sort()).toEqual(['formality', 'location', 'season']);
  });
});
