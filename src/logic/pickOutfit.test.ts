import { describe, expect, it } from 'vitest';

import type { Item } from '../db/types';
import {
  DEFAULT_RANDOMIZER_FILTERS,
  compatible,
  currentSeason,
  pickOutfit,
  weight,
  type RandomizerFilters,
  type ShuffleHistory,
} from './pickOutfit';

let counter = 0;
function makeItem(overrides: Partial<Item> = {}): Item {
  counter++;
  const now = Date.now();
  return {
    id: `item-${counter}`,
    name: `item ${counter}`,
    category: 'top',
    image: new Blob(),
    thumb: new Blob(),
    hasCutout: false,
    originalImage: null,
    seasons: [],
    formality: null,
    location: null,
    elsewhereNote: '',
    vibe: null,
    favorite: false,
    inWash: false,
    customTags: [],
    dominantColor: '#000000',
    memberIds: [],
    notes: '',
    lastWornAt: null,
    wearCount: 0,
    archived: false,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function filters(overrides: Partial<RandomizerFilters> = {}): RandomizerFilters {
  return { ...DEFAULT_RANDOMIZER_FILTERS, location: [], ...overrides };
}

/** Always returns `value` — picks the first candidate a weightedPick considers. */
function fixedRng(value: number): () => number {
  return () => value;
}

describe('compatible — seasons', () => {
  it('requires overlap when both are tagged', () => {
    const summer = makeItem({ seasons: ['summer'] });
    const winter = makeItem({ seasons: ['winter'] });
    expect(compatible(summer, winter, filters())).toBe(false);
  });

  it('a four-season item pairs with a single-season item', () => {
    const fourSeason = makeItem({ seasons: ['spring', 'summer', 'autumn', 'winter'] });
    const winterOnly = makeItem({ seasons: ['winter'] });
    expect(compatible(fourSeason, winterOnly, filters())).toBe(true);
  });

  it('an untagged season is compatible with anything (not blocked)', () => {
    const untagged = makeItem({ seasons: [] });
    const winter = makeItem({ seasons: ['winter'] });
    expect(compatible(untagged, winter, filters())).toBe(true);
  });
});

describe('compatible — formality', () => {
  it('requires an exact match when both are tagged', () => {
    const formal = makeItem({ formality: 'formal' });
    const casual = makeItem({ formality: 'casual' });
    expect(compatible(formal, casual, filters())).toBe(false);
  });

  it('matches when both share the same value', () => {
    const a = makeItem({ formality: 'casual' });
    const b = makeItem({ formality: 'casual' });
    expect(compatible(a, b, filters())).toBe(true);
  });

  it('an untagged formality is compatible with anything', () => {
    const untagged = makeItem({ formality: null });
    const formal = makeItem({ formality: 'formal' });
    expect(compatible(untagged, formal, filters())).toBe(true);
  });
});

describe('compatible — vibe', () => {
  it('androgynous pairs with masculine', () => {
    const a = makeItem({ vibe: 'androgynous' });
    const b = makeItem({ vibe: 'masculine' });
    expect(compatible(a, b, filters())).toBe(true);
  });

  it('androgynous pairs with feminine', () => {
    const a = makeItem({ vibe: 'androgynous' });
    const b = makeItem({ vibe: 'feminine' });
    expect(compatible(a, b, filters())).toBe(true);
  });

  it('masculine + feminine is rejected by default', () => {
    const a = makeItem({ vibe: 'masculine' });
    const b = makeItem({ vibe: 'feminine' });
    expect(compatible(a, b, filters())).toBe(false);
  });

  it('masculine + feminine is allowed when allowMixedVibe is set', () => {
    const a = makeItem({ vibe: 'masculine' });
    const b = makeItem({ vibe: 'feminine' });
    expect(compatible(a, b, filters({ allowMixedVibe: true }))).toBe(true);
  });

  it('same vibe always matches', () => {
    const a = makeItem({ vibe: 'masculine' });
    const b = makeItem({ vibe: 'masculine' });
    expect(compatible(a, b, filters())).toBe(true);
  });

  it('an untagged vibe is compatible with anything', () => {
    const untagged = makeItem({ vibe: null });
    const masculine = makeItem({ vibe: 'masculine' });
    expect(compatible(untagged, masculine, filters())).toBe(true);
  });
});

describe('compatible — an active filter defines the acceptable set', () => {
  it('pairs a spring top with a summer bottom when spring + summer are both selected', () => {
    const springTop = makeItem({ seasons: ['spring'] });
    const summerBottom = makeItem({ seasons: ['summer'] });
    // Without the filter these don't overlap, so the pairwise rule rejects them.
    expect(compatible(springTop, summerBottom, filters())).toBe(false);
    expect(compatible(springTop, summerBottom, filters({ seasons: ['spring', 'summer'] }))).toBe(
      true,
    );
  });

  it('still excludes autumn- and winter-only items — via the filter, not the pairing', () => {
    const winterOnly = makeItem({ category: 'top', seasons: ['winter'] });
    const springOnly = makeItem({ category: 'bottom', seasons: ['spring'] });
    const result = pickOutfit(
      [winterOnly, springOnly],
      filters({ seasons: ['spring', 'summer'] }),
      [],
      { rng: fixedRng(0.5) },
    );
    expect(result).toEqual({ status: 'empty', reason: 'no-tops' });
  });

  it('pairs a casual top with a formal bottom when both formalities are selected', () => {
    const casual = makeItem({ formality: 'casual' });
    const formal = makeItem({ formality: 'formal' });
    expect(compatible(casual, formal, filters())).toBe(false);
    expect(compatible(casual, formal, filters({ formality: ['casual', 'formal'] }))).toBe(true);
  });

  it('pairs masculine with feminine when both vibes are selected, without allowMixedVibe', () => {
    const masculine = makeItem({ vibe: 'masculine' });
    const feminine = makeItem({ vibe: 'feminine' });
    expect(compatible(masculine, feminine, filters())).toBe(false);
    expect(compatible(masculine, feminine, filters({ vibe: ['masculine', 'feminine'] }))).toBe(true);
  });

  it('leaves the other dimensions alone — a season filter does not relax formality', () => {
    const formalTop = makeItem({ seasons: ['spring'], formality: 'formal' });
    const casualBottom = makeItem({ seasons: ['summer'], formality: 'casual' });
    expect(compatible(formalTop, casualBottom, filters({ seasons: ['spring', 'summer'] }))).toBe(
      false,
    );
  });
});

describe('weight', () => {
  const now = Date.parse('2026-08-20');
  const noHistory: ShuffleHistory = [];

  it('is 1 for a plain, recently-worn, never-shown item', () => {
    const item = makeItem({ lastWornAt: now - 1000 });
    expect(weight(item, noHistory, now)).toBeCloseTo(1);
  });

  it('favourites get a 1.4x boost', () => {
    const item = makeItem({ favorite: true, lastWornAt: now - 1000 });
    expect(weight(item, noHistory, now)).toBeCloseTo(1.4);
  });

  it('never-worn items get the 1.5x neglect boost', () => {
    const item = makeItem({ lastWornAt: null });
    expect(weight(item, noHistory, now)).toBeCloseTo(1.5);
  });

  it('items untouched for over 30 days get the 1.5x neglect boost', () => {
    const item = makeItem({ lastWornAt: now - 31 * 24 * 60 * 60 * 1000 });
    expect(weight(item, noHistory, now)).toBeCloseTo(1.5);
  });

  it('items worn within 30 days do not get the neglect boost', () => {
    const item = makeItem({ lastWornAt: now - 29 * 24 * 60 * 60 * 1000 });
    expect(weight(item, noHistory, now)).toBeCloseTo(1);
  });

  it('items shown in the last 8 shuffles decay to 0.2x', () => {
    const item = makeItem({ lastWornAt: now - 1000 });
    const history: ShuffleHistory = [[item.id]];
    expect(weight(item, history, now)).toBeCloseTo(0.2);
  });

  it('a shuffle older than the last 8 no longer counts against an item', () => {
    const item = makeItem({ lastWornAt: now - 1000 });
    const history: ShuffleHistory = [[item.id], [], [], [], [], [], [], [], []]; // 9 entries, item only in the oldest
    expect(weight(item, history, now)).toBeCloseTo(1);
  });

  it('stacks favourite and neglect boosts multiplicatively', () => {
    const item = makeItem({ favorite: true, lastWornAt: null });
    expect(weight(item, noHistory, now)).toBeCloseTo(1.4 * 1.5);
  });
});

describe('pickOutfit — empty pools', () => {
  it('reports no-tops when the top pool is empty', () => {
    const items = [makeItem({ category: 'bottom' })];
    const result = pickOutfit(items, filters(), [], { rng: fixedRng(0) });
    expect(result).toEqual({ status: 'empty', reason: 'no-tops' });
  });

  it('reports no-bottoms when the bottom pool is empty', () => {
    const items = [makeItem({ category: 'top' })];
    const result = pickOutfit(items, filters(), [], { rng: fixedRng(0) });
    expect(result).toEqual({ status: 'empty', reason: 'no-bottoms' });
  });

  it('reports no-compatible-pair when nothing pairs, up to the retry ceiling', () => {
    const items = [
      makeItem({ category: 'top', seasons: ['summer'] }),
      makeItem({ category: 'bottom', seasons: ['winter'] }),
    ];
    const result = pickOutfit(items, filters(), [], { rng: fixedRng(0) });
    expect(result).toEqual({ status: 'empty', reason: 'no-compatible-pair' });
  });
});

describe('pickOutfit — a successful pick', () => {
  it('returns a compatible top and bottom', () => {
    const items = [
      makeItem({ category: 'top', seasons: ['summer'], formality: 'casual' }),
      makeItem({ category: 'bottom', seasons: ['summer'], formality: 'casual' }),
    ];
    const result = pickOutfit(items, filters(), [], { rng: fixedRng(0) });
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.outfit.top.category).toBe('top');
      expect(result.outfit.bottom.category).toBe('bottom');
      expect(result.outfit.accessory).toBeNull();
    }
  });

  it('excludes in-wash items unless includeInWash is set', () => {
    const dirtyTop = makeItem({ category: 'top', inWash: true });
    const cleanTop = makeItem({ category: 'top', inWash: false });
    const bottom = makeItem({ category: 'bottom' });
    const items = [dirtyTop, cleanTop, bottom];

    const excluded = pickOutfit(items, filters(), [], { rng: fixedRng(0) });
    expect(excluded.status).toBe('ok');
    if (excluded.status === 'ok') expect(excluded.outfit.top.id).toBe(cleanTop.id);

    // With only the dirty top available and includeInWash off, it's a no-tops failure.
    const onlyDirty = pickOutfit([dirtyTop, bottom], filters(), [], { rng: fixedRng(0) });
    expect(onlyDirty).toEqual({ status: 'empty', reason: 'no-tops' });

    const included = pickOutfit([dirtyTop, bottom], filters({ includeInWash: true }), [], {
      rng: fixedRng(0),
    });
    expect(included.status).toBe('ok');
  });

  it('adds a compatible accessory only when addAccessory is on', () => {
    const items = [
      makeItem({ category: 'top' }),
      makeItem({ category: 'bottom' }),
      makeItem({ category: 'other' }),
    ];

    const off = pickOutfit(items, filters({ addAccessory: false }), [], { rng: fixedRng(0) });
    expect(off.status).toBe('ok');
    if (off.status === 'ok') expect(off.outfit.accessory).toBeNull();

    const on = pickOutfit(items, filters({ addAccessory: true }), [], { rng: fixedRng(0) });
    expect(on.status).toBe('ok');
    if (on.status === 'ok') expect(on.outfit.accessory?.category).toBe('other');
  });

  it('addAccessory with no other items just omits the accessory, not the whole pick', () => {
    const items = [makeItem({ category: 'top' }), makeItem({ category: 'bottom' })];
    const result = pickOutfit(items, filters({ addAccessory: true }), [], { rng: fixedRng(0) });
    expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(result.outfit.accessory).toBeNull();
  });
});

describe('pickOutfit — locking', () => {
  it('lockedTop keeps the given top and only reshuffles the bottom', () => {
    const lockedTop = makeItem({ category: 'top', formality: 'formal' });
    const wrongBottom = makeItem({ category: 'bottom', formality: 'casual' });
    const rightBottom = makeItem({ category: 'bottom', formality: 'formal' });
    const items = [lockedTop, wrongBottom, rightBottom];

    const result = pickOutfit(items, filters(), [], { rng: fixedRng(0), lockedTop });
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.outfit.top.id).toBe(lockedTop.id);
      expect(result.outfit.bottom.id).toBe(rightBottom.id);
    }
  });

  it('lockedBottom keeps the given bottom and only reshuffles the top', () => {
    const lockedBottom = makeItem({ category: 'bottom', formality: 'formal' });
    const wrongTop = makeItem({ category: 'top', formality: 'casual' });
    const rightTop = makeItem({ category: 'top', formality: 'formal' });
    const items = [lockedBottom, wrongTop, rightTop];

    const result = pickOutfit(items, filters(), [], { rng: fixedRng(0), lockedBottom });
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.outfit.bottom.id).toBe(lockedBottom.id);
      expect(result.outfit.top.id).toBe(rightTop.id);
    }
  });

  it('a locked item with no compatible partner fails immediately, without retrying', () => {
    const lockedTop = makeItem({ category: 'top', seasons: ['summer'] });
    const incompatibleBottom = makeItem({ category: 'bottom', seasons: ['winter'] });
    const result = pickOutfit([lockedTop, incompatibleBottom], filters(), [], {
      rng: fixedRng(0),
      lockedTop,
    });
    expect(result).toEqual({ status: 'empty', reason: 'no-compatible-pair' });
  });
});

describe('pickOutfit — anti-repeat weighting changes the outcome', () => {
  it('a mid-range rng value skips a heavily-decayed recently-shown top in favour of a fresh one', () => {
    const shownTop = makeItem({ category: 'top' });
    const freshTop = makeItem({ category: 'top' });
    const bottom = makeItem({ category: 'bottom' });
    const items = [shownTop, freshTop, bottom];
    const history: ShuffleHistory = [[shownTop.id]]; // shownTop -> weight 0.2, freshTop -> weight 1.0, total 1.2

    // r = 0.5 * 1.2 = 0.6; subtract shownTop's 0.2 -> 0.4 (continue); subtract
    // freshTop's 1.0 -> lands on freshTop. A uniform (unweighted) draw could
    // not land past the first item at rng=0.5 out of 2 items either way, so
    // this only proves the outcome if the weighting is actually applied.
    const result = pickOutfit(items, filters(), history, { rng: fixedRng(0.5) });
    expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(result.outfit.top.id).toBe(freshTop.id);
  });
});

describe('currentSeason', () => {
  it.each([
    [0, 'winter'], // Jan
    [1, 'winter'], // Feb
    [2, 'spring'], // Mar
    [4, 'spring'], // May
    [5, 'summer'], // Jun
    [7, 'summer'], // Aug
    [8, 'autumn'], // Sep
    [10, 'autumn'], // Nov
    [11, 'winter'], // Dec
  ] as const)('month index %i maps to %s', (month, expected) => {
    expect(currentSeason(new Date(2026, month, 15))).toBe(expected);
  });
});
