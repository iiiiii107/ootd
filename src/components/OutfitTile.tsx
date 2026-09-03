import type { Item } from '../db/types';
import { useOutfitComposite } from '../lib/useOutfitComposite';

/**
 * A larger card than the Wardrobe grid's plain ItemTile (spec §7.3) — a
 * whole look reads better bigger, and the name caption helps tell composites
 * apart at a glance, which a single garment's thumb doesn't need.
 */
export function OutfitTile({ item, onTap }: { item: Item; onTap: () => void }) {
  // Photographed looks show their photo; ones built from wardrobe pieces
  // are composed from those pieces here rather than stored (spec §7.3).
  const url = useOutfitComposite(item);

  return (
    <button type="button" onClick={onTap} className="flex flex-col overflow-hidden rounded-card border border-rule text-left">
      <div className="tile relative aspect-[2/3] bg-paper">
        {url && (
          <img src={url} alt={item.name} className="h-full w-full object-cover" loading="lazy" />
        )}
        {item.favorite && (
          <span className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center bg-paper text-[13px] text-ink">
            ♥
          </span>
        )}
      </div>
      <p className="truncate px-1.5 py-1 text-[11px] text-ink">{item.name}</p>
    </button>
  );
}
