import { describe, expect, it } from 'vitest';

import type { Item, Wear } from '../db/types';
import {
  colourPairings,
  leastWorn,
  monthsAgoKey,
  mostWorn,
  neverWorn,
  tagBreakdown,
  tallyWears,
  wardrobeUsage,
  wearsPerMonth,
} from './stats';

let counter = 0;
function makeItem(overrides: Partial<Item> = {}): Item {
  const now = Date.now();
  counter++;
  return {
    id: `i${counter}`,
    name: `Item ${counter}`,
    category: 'top',
    image: new Blob(),
    thumb: new Blob(),
    hasCutout: false,
    originalImage: null,
    palette: [],
    paletteVersion: 1,
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

const noon = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12).getTime();
};
const wear = (id: string, memberIds: string[]): Wear => ({
  id,
  wornAt: noon(id),
  memberIds,
  outfitId: null,
  note: '',
});

const TODAY = '2026-09-10';

describe('tallyWears', () => {
  it('counts from the log, not from the cached field', () => {
    // The cache is deliberately wrong here. A screen whose job is to tell you
    // the truth about your wardrobe must read the thing that is true — and
    // this way a drifted cache shows up rather than hiding.
    const shirt = makeItem({ id: 'shirt', wearCount: 99, lastWornAt: noon('2020-01-01') });
    const tallies = tallyWears([shirt], [wear('2026-09-01', ['shirt'])], TODAY);
    expect(tallies[0].wearCount).toBe(1);
    expect(tallies[0].lastWornAt).toBe(noon('2026-09-01'));
  });

  it('ignores days still ahead', () => {
    // A plan is not a wear, the same rule the wardrobe and randomizer follow.
    const shirt = makeItem({ id: 'shirt' });
    const tallies = tallyWears([shirt], [wear('2026-09-20', ['shirt'])], TODAY);
    expect(tallies[0].wearCount).toBe(0);
  });

  it('leaves out archived, trashed and outfits', () => {
    const items = [
      makeItem({ id: 'a', archived: true }),
      makeItem({ id: 'b', deletedAt: Date.now() }),
      makeItem({ id: 'c', category: 'outfit' }),
      makeItem({ id: 'd' }),
    ];
    expect(tallyWears(items, [], TODAY).map((t) => t.item.id)).toEqual(['d']);
  });
});

describe('the rankings', () => {
  const build = () => {
    const often = makeItem({ id: 'often', name: 'Often' });
    const rarely = makeItem({ id: 'rarely', name: 'Rarely' });
    const untouched = makeItem({ id: 'untouched', name: 'Untouched' });
    const wears = [
      wear('2026-09-01', ['often', 'rarely']),
      wear('2026-09-02', ['often']),
      wear('2026-09-03', ['often']),
    ];
    return tallyWears([often, rarely, untouched], wears, TODAY);
  };

  it('ranks the most worn first', () => {
    expect(mostWorn(build())[0].item.id).toBe('often');
  });

  it('excludes never-worn from the least-worn list', () => {
    // They have their own section; including them would make the two lists
    // nearly identical and bury the interesting case.
    expect(leastWorn(build()).map((t) => t.item.id)).toEqual(['rarely', 'often']);
  });

  it('finds what has never been worn at all', () => {
    expect(neverWorn(build()).map((t) => t.item.id)).toEqual(['untouched']);
  });
});

describe('wardrobeUsage', () => {
  it('measures the share worn inside the window', () => {
    const items = [makeItem({ id: 'a' }), makeItem({ id: 'b' }), makeItem({ id: 'c' }), makeItem({ id: 'd' })];
    const usage = wardrobeUsage(items, [wear('2026-09-01', ['a', 'b'])], '2026-08-01', TODAY);
    expect(usage).toEqual({ worn: 2, total: 4, share: 0.5 });
  });

  it('ignores wears before the window', () => {
    const items = [makeItem({ id: 'a' }), makeItem({ id: 'b' })];
    const usage = wardrobeUsage(items, [wear('2026-01-05', ['a'])], '2026-08-01', TODAY);
    expect(usage.worn).toBe(0);
  });

  it('keeps clothes you no longer own out of the denominator', () => {
    // Archived garments would otherwise drag "how much do I use" down forever.
    const items = [makeItem({ id: 'a' }), makeItem({ id: 'old', archived: true })];
    expect(wardrobeUsage(items, [wear('2026-09-01', ['a'])], '2026-08-01', TODAY).total).toBe(1);
  });

  it('is zero, not NaN, for an empty wardrobe', () => {
    expect(wardrobeUsage([], [], '2026-08-01', TODAY).share).toBe(0);
  });
});

describe('wearsPerMonth', () => {
  it('fills a month with nothing logged rather than skipping it', () => {
    // A chart that skips a fallow stretch lies about exactly what this is for.
    const months = wearsPerMonth(
      [wear('2026-06-01', ['a']), wear('2026-08-04', ['a'])],
      '2026-09-10',
    );
    expect(months.map((m) => m.month)).toEqual(['2026-06', '2026-07', '2026-08', '2026-09']);
    expect(months.map((m) => m.days)).toEqual([1, 0, 1, 0]);
  });

  it('runs to today even when nothing recent was logged', () => {
    const months = wearsPerMonth([wear('2026-07-01', ['a'])], '2026-09-10');
    expect(months.at(-1)?.month).toBe('2026-09');
  });

  it('crosses a year boundary', () => {
    const months = wearsPerMonth([wear('2025-11-02', ['a'])], '2026-01-15');
    expect(months.map((m) => m.month)).toEqual(['2025-11', '2025-12', '2026-01']);
  });

  it('is empty when nothing has been logged', () => {
    expect(wearsPerMonth([], TODAY)).toEqual([]);
  });
});

describe('tagBreakdown', () => {
  const options = [
    { value: 'formal', label: 'formal' },
    { value: 'casual', label: 'casual' },
  ];
  const read = (item: Item) => (item.formality ? [item.formality] : []);

  it('separates what you own from what you wear', () => {
    // The whole point: three formal shirts worn once between them, against one
    // casual shirt worn nine times.
    const items = [
      makeItem({ id: 'f1', formality: 'formal' }),
      makeItem({ id: 'f2', formality: 'formal' }),
      makeItem({ id: 'f3', formality: 'formal' }),
      makeItem({ id: 'c1', formality: 'casual' }),
    ];
    const wears = [
      wear('2026-09-01', ['f1']),
      ...Array.from({ length: 9 }, (_, i) => wear(`2026-08-0${i + 1}`, ['c1'])),
    ];
    const { shares } = tagBreakdown(items, wears, options, read, TODAY);
    const formal = shares.find((s) => s.value === 'formal')!;
    const casual = shares.find((s) => s.value === 'casual')!;
    expect(formal.ownedShare).toBeCloseTo(0.75, 5);
    expect(formal.wornShare).toBeCloseTo(0.1, 5);
    expect(casual.wornShare).toBeCloseTo(0.9, 5);
  });

  it('counts wear events, not garments', () => {
    const items = [makeItem({ id: 'a', formality: 'casual' })];
    const wears = [wear('2026-09-01', ['a']), wear('2026-09-02', ['a'])];
    const { shares } = tagBreakdown(items, wears, options, read, TODAY);
    expect(shares.find((s) => s.value === 'casual')!.wornShare).toBe(1);
  });

  it('reports untagged separately rather than counting it as zero of everything', () => {
    // A half-tagged wardrobe should read "not enough tagged yet", not "0% formal".
    const items = [makeItem({ id: 'a', formality: 'formal' }), makeItem({ id: 'b' })];
    const { shares, untagged } = tagBreakdown(items, [], options, read, TODAY);
    expect(untagged).toBe(1);
    expect(shares.find((s) => s.value === 'formal')!.ownedShare).toBe(1);
  });
});

describe('colourPairings', () => {
  const black = [{ hex: '#141414', share: 1 }];
  const beige = [{ hex: '#d9cbb4', share: 1 }];
  const rust = [{ hex: '#b8714c', share: 1 }];

  it('counts every pair within a day', () => {
    const items = [
      makeItem({ id: 'a', palette: black }),
      makeItem({ id: 'b', palette: beige }),
      makeItem({ id: 'c', palette: rust }),
    ];
    const pairs = colourPairings(items, [wear('2026-09-01', ['a', 'b', 'c'])], TODAY);
    expect(pairs.reduce((n, p) => n + p.count, 0)).toBe(3);
  });

  it('adds up the same pairing across days, whichever order it appears in', () => {
    const items = [makeItem({ id: 'a', palette: black }), makeItem({ id: 'b', palette: beige })];
    const pairs = colourPairings(
      items,
      [wear('2026-09-01', ['a', 'b']), wear('2026-09-02', ['b', 'a'])],
      TODAY,
    );
    expect(pairs).toHaveLength(1);
    expect(pairs[0].count).toBe(2);
  });

  it('skips garments whose colours have not been read', () => {
    // Never counted as black: "not read yet" is not a colour.
    const items = [makeItem({ id: 'a', palette: [] }), makeItem({ id: 'b', palette: beige })];
    expect(colourPairings(items, [wear('2026-09-01', ['a', 'b'])], TODAY)).toEqual([]);
  });

  it('keeps a colour paired with itself', () => {
    // "Black with black" is a real habit, and hiding it would be flattering
    // rather than useful.
    const items = [makeItem({ id: 'a', palette: black }), makeItem({ id: 'b', palette: black })];
    const pairs = colourPairings(items, [wear('2026-09-01', ['a', 'b'])], TODAY);
    expect(pairs[0].label).toBe('black · black');
  });

  it('ignores days still ahead', () => {
    const items = [makeItem({ id: 'a', palette: black }), makeItem({ id: 'b', palette: beige })];
    expect(colourPairings(items, [wear('2026-09-30', ['a', 'b'])], TODAY)).toEqual([]);
  });
});

describe('monthsAgoKey', () => {
  it('steps back whole months, across a year boundary', () => {
    expect(monthsAgoKey('2026-09-10', 1)).toBe('2026-08-01');
    expect(monthsAgoKey('2026-01-15', 3)).toBe('2025-10-01');
  });
});
