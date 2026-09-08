import { describe, expect, it } from 'vitest';

import type { Item } from '../db/types';
import { DEFAULT_COLOUR_PREFERENCES } from './colour';
import {
  DEFAULT_RANDOMIZER_FILTERS,
  compatible,
  currentSeason,
  harmonyMultiplier,
  pickOutfit,
  styleMultiplier,
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
    palette: [],
    paletteVersion: 1,
    seasons: [],
    formality: null,
    location: null,
    elsewhereNote: '',
    vibe: null,
    pattern: null,
    fit: null,
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

// --- colour ---------------------------------------------------------------

const BLACK = [{ hex: '#141414', share: 1 }];
const RUST = [{ hex: '#b8714c', share: 1 }];
const OLIVE = [{ hex: '#5f6b4a', share: 1 }];

describe('harmonyMultiplier', () => {
  it('is exactly 1 when colour is not being considered', () => {
    const a = makeItem({ palette: RUST });
    const b = makeItem({ palette: OLIVE });
    expect(harmonyMultiplier(a, b, undefined)).toBe(1);
  });

  it('is exactly 1 when either garment has no palette', () => {
    // The single most important line in the feature. A garment the backfill
    // has not reached yet, or an outfit pooling members that have none, must
    // be treated as *no opinion* — never quietly penalised for it.
    const known = makeItem({ palette: RUST });
    const unread = makeItem({ palette: [] });
    expect(harmonyMultiplier(known, unread, DEFAULT_COLOUR_PREFERENCES)).toBe(1);
    expect(harmonyMultiplier(unread, known, DEFAULT_COLOUR_PREFERENCES)).toBe(1);
  });

  it('prefers a matching partner over a clashing one', () => {
    const rust = makeItem({ palette: RUST });
    const black = makeItem({ palette: BLACK });
    const olive = makeItem({ palette: OLIVE });
    expect(harmonyMultiplier(rust, black, DEFAULT_COLOUR_PREFERENCES)).toBeGreaterThan(
      harmonyMultiplier(rust, olive, DEFAULT_COLOUR_PREFERENCES),
    );
  });

  it('never reaches zero, however badly two garments clash', () => {
    // A lean, not a filter. If this could return 0 a colour could remove a
    // garment from the pool entirely and produce an empty shuffle.
    const rust = makeItem({ palette: RUST });
    const olive = makeItem({ palette: OLIVE });
    const score = harmonyMultiplier(rust, olive, DEFAULT_COLOUR_PREFERENCES);
    expect(score).toBeGreaterThanOrEqual(0.6);
    expect(score).toBeLessThanOrEqual(1.4);
  });

  it('treats every pair alike when all the rules are off', () => {
    const none = {
      ...DEFAULT_COLOUR_PREFERENCES,
      rules: { neutralWithAnything: false, analogous: false, complementary: false },
    };
    const rust = makeItem({ palette: RUST });
    const black = makeItem({ palette: BLACK });
    const olive = makeItem({ palette: OLIVE });
    expect(harmonyMultiplier(rust, black, none)).toBe(harmonyMultiplier(rust, olive, none));
  });
});

describe('weight with liked colours', () => {
  const history: ShuffleHistory = [];
  const now = Date.parse('2026-08-20');

  it('is unchanged when the user has named no colours', () => {
    // Guards the hot path: existing behaviour must be bit-identical, or a
    // subtle randomizer regression gets blamed on colour.
    const item = makeItem({ palette: RUST, lastWornAt: now });
    expect(weight(item, history, now, [])).toBe(weight(item, history, now));
  });

  it('leans toward a colour the user likes', () => {
    const item = makeItem({ palette: RUST, lastWornAt: now });
    expect(weight(item, history, now, ['#b8714c'])).toBeGreaterThan(weight(item, history, now));
  });

  it('never outweighs a favourite', () => {
    // The invariant: colour reorders within a band, it does not outrank the
    // signals that are about the wardrobe itself.
    const liked = makeItem({ palette: RUST, lastWornAt: now });
    const favourite = makeItem({ palette: OLIVE, lastWornAt: now, favorite: true });
    expect(weight(liked, history, now, ['#b8714c'])).toBeLessThan(
      weight(favourite, history, now, ['#b8714c']),
    );
  });
});

describe('pickOutfit with colour matching', () => {
  const base = { seasons: ['summer' as const], formality: 'casual' as const, vibe: null };

  it('changes which bottom comes up, on the same roll of the dice', () => {
    // The clashing bottom is listed first, and the seed is chosen so that
    // without colour it wins the weighted draw. Turning matching on has to
    // move the answer to the black one — same items, same rng, different
    // outcome, which is the only way to show the weighting did the work
    // rather than the ordering.
    const top = makeItem({ ...base, category: 'top', palette: RUST });
    const clashing = makeItem({ ...base, category: 'bottom', palette: OLIVE });
    const matching = makeItem({ ...base, category: 'bottom', palette: BLACK });
    const wardrobe = [top, clashing, matching];

    const without = pickOutfit(wardrobe, filters({ matchColours: false }), [], {
      rng: fixedRng(0.4),
      colour: DEFAULT_COLOUR_PREFERENCES,
    });
    const withColour = pickOutfit(wardrobe, filters({ matchColours: true }), [], {
      rng: fixedRng(0.4),
      colour: DEFAULT_COLOUR_PREFERENCES,
    });

    expect(without.status).toBe('ok');
    expect(withColour.status).toBe('ok');
    if (without.status === 'ok' && withColour.status === 'ok') {
      expect(without.outfit.bottom.id).toBe(clashing.id);
      expect(withColour.outfit.bottom.id).toBe(matching.id);
    }
  });

  it('still returns an outfit when nothing in the wardrobe matches', () => {
    // The user's guarantee, written down: colour is a preference, so a
    // wardrobe of clashing clothes still gets dressed.
    const top = makeItem({ ...base, category: 'top', palette: RUST });
    const bottom = makeItem({ ...base, category: 'bottom', palette: OLIVE });

    const result = pickOutfit([top, bottom], filters({ matchColours: true }), [], {
      rng: fixedRng(0),
      colour: DEFAULT_COLOUR_PREFERENCES,
    });

    expect(result.status).toBe('ok');
  });

  it('ignores colour entirely when the switch is off', () => {
    const top = makeItem({ ...base, category: 'top', palette: RUST });
    const matching = makeItem({ ...base, category: 'bottom', palette: BLACK });
    const clashing = makeItem({ ...base, category: 'bottom', palette: OLIVE });

    const off = pickOutfit([top, matching, clashing], filters({ matchColours: false }), [], {
      rng: fixedRng(0.99),
      colour: DEFAULT_COLOUR_PREFERENCES,
    });
    const noPreferences = pickOutfit([top, matching, clashing], filters({ matchColours: false }), [], {
      rng: fixedRng(0.99),
    });

    expect(off.status).toBe('ok');
    if (off.status === 'ok' && noPreferences.status === 'ok') {
      expect(off.outfit.bottom.id).toBe(noPreferences.outfit.bottom.id);
    }
  });

  it('dresses a wardrobe whose colours have not been read yet', () => {
    const top = makeItem({ ...base, category: 'top', palette: [] });
    const bottom = makeItem({ ...base, category: 'bottom', palette: [] });
    const result = pickOutfit([top, bottom], filters({ matchColours: true }), [], {
      rng: fixedRng(0),
      colour: DEFAULT_COLOUR_PREFERENCES,
    });
    expect(result.status).toBe('ok');
  });
});

// --- jackets, shoes and accessories ---------------------------------------

describe('the optional slots', () => {
  const summer = { seasons: ['summer' as const], formality: 'casual' as const, vibe: null };
  const winter = { seasons: ['winter' as const], formality: 'casual' as const, vibe: null };

  const wardrobe = (extra: Item[] = []) => [
    makeItem({ ...summer, category: 'top' }),
    makeItem({ ...summer, category: 'bottom' }),
    ...extra,
  ];

  it('leaves every slot empty when the switches are off', () => {
    const result = pickOutfit(
      wardrobe([
        makeItem({ ...summer, category: 'jacket' }),
        makeItem({ ...summer, category: 'shoes' }),
        makeItem({ ...summer, category: 'other' }),
      ]),
      filters(),
      [],
      { rng: fixedRng(0) },
    );
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.outfit.jacket).toBeNull();
      expect(result.outfit.shoes).toBeNull();
      expect(result.outfit.accessory).toBeNull();
    }
  });

  it('fills each slot when asked', () => {
    const result = pickOutfit(
      wardrobe([
        makeItem({ ...summer, category: 'jacket' }),
        makeItem({ ...summer, category: 'shoes' }),
        makeItem({ ...summer, category: 'other' }),
      ]),
      filters({ includeJacket: true, includeShoes: true, addAccessory: true }),
      [],
      { rng: fixedRng(0) },
    );
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.outfit.jacket).not.toBeNull();
      expect(result.outfit.shoes).not.toBeNull();
      expect(result.outfit.accessory).not.toBeNull();
    }
  });

  it('still returns an outfit when nothing fits the slot', () => {
    // The rule for all three: omit the piece, never fail the shuffle. Owning no
    // summer jacket must not stop you being dressed for summer.
    const result = pickOutfit(
      wardrobe([makeItem({ ...winter, category: 'jacket' })]),
      filters({ includeJacket: true, includeShoes: true }),
      [],
      { rng: fixedRng(0) },
    );
    expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(result.outfit.jacket).toBeNull();
  });

  it('holds a jacket to the season as well as the formality', () => {
    // A winter coat over a summer outfit is wrong in a way anyone would notice.
    const summerJacket = makeItem({ ...summer, category: 'jacket' });
    const result = pickOutfit(
      wardrobe([makeItem({ ...winter, category: 'jacket' }), summerJacket]),
      filters({ includeJacket: true }),
      [],
      { rng: fixedRng(0) },
    );
    if (result.status === 'ok') expect(result.outfit.jacket?.id).toBe(summerJacket.id);
  });

  it('does not hold shoes to the season', () => {
    // Trainers are not seasonal the way a coat is, and demanding a season
    // match would leave most wardrobes barefoot.
    const winterShoes = makeItem({ ...winter, category: 'shoes' });
    const result = pickOutfit(wardrobe([winterShoes]), filters({ includeShoes: true }), [], {
      rng: fixedRng(0),
    });
    if (result.status === 'ok') expect(result.outfit.shoes?.id).toBe(winterShoes.id);
  });

  it('holds shoes to the formality', () => {
    const formalShoes = makeItem({
      seasons: ['summer'], formality: 'formal', vibe: null, category: 'shoes',
    });
    const result = pickOutfit(wardrobe([formalShoes]), filters({ includeShoes: true }), [], {
      rng: fixedRng(0),
    });
    if (result.status === 'ok') expect(result.outfit.shoes).toBeNull();
  });

  it('lets an untagged piece into any outfit', () => {
    // Same leniency as `compatible`: untagged is not the same as wrong, and
    // tagging is never mandatory beyond category.
    const untagged = makeItem({ category: 'jacket', seasons: [], formality: null, vibe: null });
    const result = pickOutfit(wardrobe([untagged]), filters({ includeJacket: true }), [], {
      rng: fixedRng(0),
    });
    if (result.status === 'ok') expect(result.outfit.jacket?.id).toBe(untagged.id);
  });

  it('never puts a jacket in the top or bottom pools', () => {
    const result = pickOutfit(
      [
        makeItem({ ...summer, category: 'jacket' }),
        makeItem({ ...summer, category: 'shoes' }),
        makeItem({ ...summer, category: 'top' }),
        makeItem({ ...summer, category: 'bottom' }),
      ],
      filters(),
      [],
      { rng: fixedRng(0) },
    );
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.outfit.top.category).toBe('top');
      expect(result.outfit.bottom.category).toBe('bottom');
    }
  });
});

// --- switched-off dimensions ----------------------------------------------

describe('a tag group the user has hidden', () => {
  const ALL = { season: true, formality: true, vibe: true, pattern: true, fit: true };
  const OFF_VIBE = { ...ALL, vibe: false };
  const OFF_SEASON = { ...ALL, season: false };

  it('stops constraining which garments go together', () => {
    // Masculine with feminine is normally refused. Hidden, vibe imposes no
    // rule at all — a rule you cannot see shaping your outfits is exactly what
    // makes an app feel arbitrary.
    const top = makeItem({ category: 'top', vibe: 'masculine', seasons: ['summer'], formality: 'casual' });
    const bottom = makeItem({ category: 'bottom', vibe: 'feminine', seasons: ['summer'], formality: 'casual' });

    expect(pickOutfit([top, bottom], filters(), [], { rng: fixedRng(0) }).status).toBe('empty');
    expect(
      pickOutfit([top, bottom], filters(), [], { rng: fixedRng(0), dimensions: OFF_VIBE }).status,
    ).toBe('ok');
  });

  it('stops filtering, even when a stale saved filter still holds values', () => {
    // Hiding a group must not leave an invisible filter quietly excluding half
    // the wardrobe — the saved filters outlive the switch.
    const top = makeItem({ category: 'top', vibe: 'masculine' });
    const bottom = makeItem({ category: 'bottom', vibe: 'masculine' });
    const stale = filters({ vibe: ['feminine'] });

    expect(pickOutfit([top, bottom], stale, [], { rng: fixedRng(0) }).status).toBe('empty');
    expect(
      pickOutfit([top, bottom], stale, [], { rng: fixedRng(0), dimensions: OFF_VIBE }).status,
    ).toBe('ok');
  });

  it('stops holding a jacket to the season', () => {
    const summer = { seasons: ['summer' as const], formality: 'casual' as const, vibe: null };
    const wardrobe = [
      makeItem({ ...summer, category: 'top' }),
      makeItem({ ...summer, category: 'bottom' }),
      makeItem({ seasons: ['winter'], formality: 'casual', vibe: null, category: 'jacket' }),
    ];

    const on = pickOutfit(wardrobe, filters({ includeJacket: true }), [], { rng: fixedRng(0) });
    const off = pickOutfit(wardrobe, filters({ includeJacket: true }), [], {
      rng: fixedRng(0),
      dimensions: OFF_SEASON,
    });

    if (on.status === 'ok') expect(on.outfit.jacket).toBeNull();
    if (off.status === 'ok') expect(off.outfit.jacket).not.toBeNull();
  });

  it('leaves everything exactly as it was when no dimensions are given', () => {
    // Existing callers pass nothing; the default must be all-on, or hiding
    // would silently become the norm.
    const top = makeItem({ category: 'top', vibe: 'masculine', seasons: ['summer'], formality: 'casual' });
    const bottom = makeItem({ category: 'bottom', vibe: 'feminine', seasons: ['summer'], formality: 'casual' });
    expect(pickOutfit([top, bottom], filters(), [], { rng: fixedRng(0) }).status).toBe('empty');
  });
});

describe('styleMultiplier', () => {
  const ALL = { season: true, formality: true, vibe: true, pattern: true, fit: true };

  it('is neutral when either garment is untagged', () => {
    // Tagging is never mandatory beyond category. A garment nobody has got
    // round to describing must not be quietly penalised for it.
    const tagged = makeItem({ pattern: 'floral', fit: 'loose' });
    const bare = makeItem();
    expect(styleMultiplier(tagged, bare, ALL)).toBe(1);
    expect(styleMultiplier(bare, tagged, ALL)).toBe(1);
  });

  it('lets plain go with anything, the way a neutral colour does', () => {
    const plain = makeItem({ pattern: 'plain' });
    const busy = makeItem({ pattern: 'floral' });
    expect(styleMultiplier(plain, busy, ALL)).toBe(1);
  });

  it('discourages two busy patterns without forbidding them', () => {
    const floral = makeItem({ pattern: 'floral' });
    const striped = makeItem({ pattern: 'striped' });
    const score = styleMultiplier(floral, striped, ALL);
    expect(score).toBeLessThan(1);
    expect(score).toBeGreaterThan(0); // a lean, never a veto
  });

  it('prefers one relaxed piece with one closer-cut', () => {
    const loose = makeItem({ fit: 'loose' });
    const fitted = makeItem({ fit: 'fitted' });
    const alsoLoose = makeItem({ fit: 'loose' });
    expect(styleMultiplier(loose, fitted, ALL)).toBeGreaterThan(1);
    expect(styleMultiplier(loose, alsoLoose, ALL)).toBeLessThan(1);
  });

  it('leaves regular quarrelling with nothing', () => {
    const regular = makeItem({ fit: 'regular' });
    expect(styleMultiplier(regular, makeItem({ fit: 'loose' }), ALL)).toBe(1);
    expect(styleMultiplier(regular, makeItem({ fit: 'fitted' }), ALL)).toBe(1);
  });

  it('ignores a dimension the user has switched off', () => {
    const floral = makeItem({ pattern: 'floral', fit: 'loose' });
    const striped = makeItem({ pattern: 'striped', fit: 'loose' });
    expect(styleMultiplier(floral, striped, { ...ALL, pattern: false, fit: false })).toBe(1);
  });

  it('never produces an empty shuffle, however badly two garments clash', () => {
    // Leans, not rules: a wardrobe of clashing patterns still gets dressed.
    const top = makeItem({ category: 'top', pattern: 'floral', fit: 'loose', seasons: ['summer'], formality: 'casual' });
    const bottom = makeItem({ category: 'bottom', pattern: 'striped', fit: 'loose', seasons: ['summer'], formality: 'casual' });
    expect(pickOutfit([top, bottom], filters(), [], { rng: fixedRng(0) }).status).toBe('ok');
  });
});
