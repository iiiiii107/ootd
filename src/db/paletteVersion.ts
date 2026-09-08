/**
 * Bump when `extractPalette` changes in a way that would give a different
 * answer. The backfill re-reads only items whose stored version is behind,
 * which is what makes it resumable and cheap on every launch after the first.
 */
export const PALETTE_VERSION = 1;
