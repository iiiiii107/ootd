/**
 * Bump when `extractPalette` changes in a way that would give a different
 * answer. The backfill re-reads only items whose stored version is behind,
 * which is what makes it resumable and cheap on every launch after the first.
 */
export const PALETTE_VERSION = 1;

/**
 * Marks a palette the user set by hand.
 *
 * The backfill skips these entirely. Without that, correcting a colour would
 * hold only until the next version bump re-read the garment and quietly threw
 * the correction away — and the person who noticed the automatic answer was
 * wrong is the one person who knows better than it does.
 */
export const USER_SET_PALETTE = -1;
