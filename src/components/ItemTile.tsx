import type { Item } from '../db/types';
import { useObjectUrl } from '../lib/useObjectUrl';

/**
 * One grid tile. Tapping opens the detail sheet from Phase 2 onward — for now
 * this is display-only, which is all the Phase 1 wardrobe grid needs.
 */
export function ItemTile({ item }: { item: Item }) {
  const url = useObjectUrl(item.thumb);

  return (
    <div className="relative aspect-square bg-sunken">
      {url && (
        <img src={url} alt={item.name} className="h-full w-full object-cover" loading="lazy" />
      )}
      {item.inWash && (
        <span
          className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-accent"
          title="In the wash"
        />
      )}
    </div>
  );
}
