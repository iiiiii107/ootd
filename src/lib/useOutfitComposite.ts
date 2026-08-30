import { useEffect, useState } from 'react';

import { getItem } from '../db/items';
import type { Item } from '../db/types';
import { composeOutfitThumb } from '../images/composite';
import { useItemImageUrl } from './useObjectUrl';

/**
 * What an outfit looks like — from its own photograph if it has one, or
 * composed from its members if it doesn't.
 *
 * Outfits built by hand out of the wardrobe store no image (src/db/items.ts):
 * they *are* their members, whose pictures are already in the database, so a
 * stored composite would be both a second copy and a stale one. Composing at
 * render time costs a canvas draw over thumbs that are already decoded, and it
 * means re-cropping a garment updates every outfit it appears in for free.
 *
 * An outfit photographed as a whole look through Add keeps its own image and
 * takes the first branch, so both kinds render through one call site.
 */

// Composites are keyed by outfit id *and* the member list, so adding or
// removing a piece rebuilds while a rename does not. Kept across unmounts:
// scrolling a grid of outfits would otherwise recompose on every pass.
const cache = new Map<string, string>();
const MAX_COMPOSITES = 120;

function remember(key: string, url: string): void {
  cache.set(key, url);
  if (cache.size > MAX_COMPOSITES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) {
      const stale = cache.get(oldest);
      if (stale) URL.revokeObjectURL(stale);
      cache.delete(oldest);
    }
  }
}

export function useOutfitComposite(
  item: Item | undefined,
  /** Which stored blob to prefer when the item has one of its own. */
  prefer: 'thumb' | 'image' = 'thumb',
): string | undefined {
  const stored = prefer === 'image' ? item?.image : item?.thumb;
  const own = useItemImageUrl(item?.id ?? '', stored ?? undefined);
  const key = item && !stored ? `${item.id}:${item.memberIds.join(',')}` : null;
  const [composed, setComposed] = useState<string | undefined>(() =>
    key ? cache.get(key) : undefined,
  );

  useEffect(() => {
    if (!key || !item) return;

    const cached = cache.get(key);
    if (cached) {
      setComposed(cached);
      return;
    }

    let live = true;
    void (async () => {
      const members = (await Promise.all(item.memberIds.map((id) => getItem(id)))).filter(
        (member): member is Item => member != null && member.thumb != null,
      );
      // Every member gone — deleted since, or a backup restored without them.
      // Nothing to draw, and a blank tile is more honest than a broken one.
      if (members.length === 0) {
        if (live) setComposed(undefined);
        return;
      }
      const blob = await composeOutfitThumb(members);
      const url = URL.createObjectURL(blob);
      // Losing the race means another render already composed this one; keep
      // theirs and release ours rather than leaking a blob nobody points at.
      const won = !cache.has(key);
      if (won) remember(key, url);
      else URL.revokeObjectURL(url);
      if (live) setComposed(cache.get(key));
    })();

    return () => {
      live = false;
    };
  }, [key, item]);

  return stored ? own : composed;
}
