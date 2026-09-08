import type { Swatch } from '../logic/colour';

/**
 * Data model (spec §4). Every field beyond `category` is optional at save
 * time — tagging is never mandatory beyond category (spec §7.4) — so most
 * fields here are nullable or default to an empty value rather than absent.
 */

/**
 * `outfit` is not a garment — it is a saved combination, and it never appears
 * in the wardrobe grid or the randomizer's pools (spec §7.3).
 *
 * `other` covers everything that is worn but is not one of the four places on
 * the body: a bag, a belt, jewellery.
 */
export type Category = 'top' | 'bottom' | 'jacket' | 'shoes' | 'other' | 'outfit';

/** No "transitional", no "all-year" value — a year-round item gets all four. */
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

/** Single-select. Black jeans worn both at home and out get exactly one value. */
export type Formality = 'formal' | 'casual' | 'home';

/**
 * Where a garment physically is right now (spec §4.2). `linh` is a named
 * place like the other two — its stored value stays this plain slug while
 * the label reads "@Linh", so renaming the label later never has to touch
 * stored items or backups.
 */
export type Location = 'university' | 'linh' | 'home' | 'elsewhere';

export type Vibe = 'masculine' | 'androgynous' | 'feminine';

export interface Item {
  /** Primary key, UUID. */
  id: string;
  /** Short human name. Auto-prefilled on import, always editable. */
  name: string;
  /** The only mandatory tag at save time. */
  category: Category;
  /**
   * Processed JPEG, ~1200px longest edge, quality 0.82.
   *
   * Null only for an outfit built by hand out of garments already in the
   * wardrobe (spec §7.3). Such an outfit *is* its members — there is no
   * photograph of it, and storing a composite would be a second copy of
   * pictures the database already holds. What it looks like is composed at
   * render time instead (`useOutfitComposite`). An outfit photographed as a
   * whole look through Add still carries its own image like anything else.
   */
  image: Blob | null;
  /** 400×400 centre-cropped JPEG for grid scrolling. Null for the same reason as `image`. */
  thumb: Blob | null;
  /** Whether background removal succeeded (spec Phase 5). Always false until then. */
  hasCutout: boolean;
  /**
   * The photograph as it was before the background was taken off, kept so it
   * can be put back.
   *
   * Removal is destructive — the cut pixels are gone from `image`, and no
   * amount of cleverness recovers them — so the only way to offer "put the
   * background back" is to have kept the original. Null when there is nothing
   * to go back to: the background was never removed, or the item predates
   * this being kept.
   *
   * Only the full-size version is held. The thumbnail is derived and cheap to
   * rebuild, so storing it too would be a second copy for nothing.
   */
  originalImage: Blob | null;
  /** Multi-select. Empty means untagged, not "no season". */
  seasons: Season[];
  formality: Formality | null;
  location: Location | null;
  /** Free text, only meaningful when `location === 'elsewhere'`. */
  elsewhereNote: string;
  vibe: Vibe | null;
  /** Standalone toggle, independent of every other tag. */
  favorite: boolean;
  /** Availability toggle (spec §6) — excluded from the randomizer by default. */
  inWash: boolean;
  /** IDs into the `tags` store. */
  customTags: string[];
  /**
   * Legacy single colour, now just `palette[0]`.
   *
   * Kept because it is in every backup archive ever written and in
   * `NewItemInput`. Do not use it for matching: for its whole life it was the
   * average of the *entire* crop including the wall behind the garment, which
   * stored a black top on a white wall as mid grey.
   */
  dominantColor: string;
  /**
   * The colours the garment is actually made of, largest share first.
   *
   * Read from the *cutout* where there is one, skipping transparent pixels, so
   * the background contributes nothing. One to three swatches rather than a
   * single average, because averaging a striped shirt gives you the mush
   * between its stripes — red and white becomes pink.
   *
   * Empty means "not read yet" — backfill pending, or an item from an older
   * archive. It never means black, and matching must treat it as no opinion.
   */
  palette: Swatch[];
  /** Which extraction produced `palette`, so a future change re-reads only stale items. */
  paletteVersion: number;
  /** Only populated for `category: 'outfit'` items created from the randomizer. */
  memberIds: string[];
  notes: string;
  /** Epoch ms. Set by "wearing this today". */
  lastWornAt: number | null;
  wearCount: number;
  /** No longer owned. Hidden everywhere except the Archived view. Photo retained. */
  archived: boolean;
  /** Trash timestamp; purged automatically after 30 days (spec §4.4). */
  deletedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

/** True once every non-mandatory tag group is filled in. Derived, not stored. */
export function needsTagging(item: Item): boolean {
  return item.seasons.length === 0 || !item.formality || !item.location || !item.vibe;
}

/** A single value inside a user-extensible tag group (spec §4.2). */
export interface CustomTag {
  id: string;
  groupName: string;
  label: string;
  /** Whether an item can hold several values from this group. Same for every
   *  row sharing a `groupName` — it describes the group, not the value. */
  multiSelect: boolean;
  sortOrder: number;
}

/**
 * One day's outfit — what was actually worn, as opposed to what is owned.
 *
 * The local date is the primary key, which is what makes "one entry per day,
 * logging again replaces it" true by construction rather than by a
 * read-modify-write that could race or drift. It has to be the *local* date:
 * derived from UTC, anything logged late in the evening would file itself
 * under tomorrow.
 *
 * This log is the source of truth for wear. `Item.lastWornAt` and
 * `Item.wearCount` are caches derived from it (src/db/wears.ts) — kept because
 * the randomizer weights by neglect and the wardrobe sorts by last worn, and
 * both would otherwise have to scan the whole log on every read.
 */
export interface Wear {
  /** Local calendar date, `YYYY-MM-DD`. Also the primary key. */
  id: string;
  /**
   * Midday on the day itself — not the moment it was logged.
   *
   * It is the source of `Item.lastWornAt`, so a back-dated entry stamped with
   * the current time would tell the wardrobe and the randomizer that a
   * month-old outfit was worn today. Midday so a daylight-saving shift cannot
   * move it across a day boundary.
   */
  wornAt: number;
  /** The garments worn. References, never copies. */
  memberIds: string[];
  /** The saved outfit this came from, if it came from one. */
  outfitId: string | null;
  note: string;
}

/** Key-value store: `lastBackupAt`, `lastFilterState`, `schemaVersion`, `settings`. */
export interface MetaEntry<T = unknown> {
  key: string;
  value: T;
}
