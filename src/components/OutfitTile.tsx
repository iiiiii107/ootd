import type { Item } from '../db/types';
import { useObjectUrl } from '../lib/useObjectUrl';

/**
 * A larger card than the Wardrobe grid's plain ItemTile (spec §7.3) — a
 * whole look reads better bigger, and the name caption helps tell composites
 * apart at a glance, which a single garment's thumb doesn't need.
 */
export function OutfitTile({ item, onTap }: { item: Item; onTap: () => void }) {
  const url = useObjectUrl(item.thumb);

  return (
    <button type="button" onClick={onTap} className="flex flex-col border border-rule text-left">
      <div className="relative aspect-square bg-paper">
        {url && (
          <img src={url} alt={item.name} className="h-full w-full object-cover" loading="lazy" />
        )}
        {item.favorite && (
          <span className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center bg-paper text-[13px] text-ink">
            ♥
          </span>
        )}
      </div>
      <p className="truncate px-2 py-1.5 text-[13px] text-ink">{item.name}</p>
    </button>
  );
}
