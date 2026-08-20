import { ItemTile } from '../components/ItemTile';
import { useWardrobeItems } from '../db/hooks';

/**
 * The plain grid (spec §7.2). Search, filter chips, and the detail sheet
 * arrive in Phase 2 — this is deliberately just the grid and an empty state.
 */
export default function Wardrobe() {
  const items = useWardrobeItems();

  if (items === undefined) {
    return null; // first read from IndexedDB; avoids an empty-state flash
  }

  if (items.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="font-serif text-3xl lowercase tracking-[0.1em] text-ink">wardrobe</h1>
        <p className="max-w-xs text-[13px] leading-relaxed text-muted">
          Nothing here yet. Add a few photos to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-px sm:grid-cols-4 lg:grid-cols-6">
      {items.map((item) => (
        <ItemTile key={item.id} item={item} />
      ))}
    </div>
  );
}
