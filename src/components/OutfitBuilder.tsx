import { useState } from 'react';

import { useWardrobeItems } from '../db/hooks';
import { createOutfitFromMembers } from '../db/items';
import type { Item } from '../db/types';
import { ItemImage } from './ItemImage';

/**
 * Build an outfit from garments already in the wardrobe (spec §7.3).
 *
 * Nothing is photographed and nothing is copied: the outfit is a list of
 * member ids, and what it looks like is composed from their existing thumbs
 * when it is shown. Costs a few dozen bytes rather than a second picture of
 * clothes the database already holds.
 */
export function OutfitBuilder({
  initialIds = [],
  onClose,
  onCreated,
}: {
  initialIds?: string[];
  onClose: () => void;
  onCreated?: (id: string) => void;
}) {
  const items = useWardrobeItems();
  const [chosen, setChosen] = useState<string[]>(initialIds);
  const [saving, setSaving] = useState(false);

  function toggle(id: string) {
    setChosen((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  }

  async function save() {
    if (!items || chosen.length === 0) return;
    setSaving(true);
    try {
      // In the order they were picked, not the order they sit in the grid —
      // a top chosen first should stack above the trousers chosen second.
      const members = chosen
        .map((id) => items.find((item) => item.id === id))
        .filter((item): item is Item => item != null);
      const outfit = await createOutfitFromMembers(members);
      onCreated?.(outfit.id);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-paper">
      <div className="flex items-center justify-between border-b border-rule px-4 py-3">
        <button type="button" onClick={onClose} className="min-h-11 text-[13px] text-muted">
          cancel
        </button>
        <p className="text-[14px] text-ink">
          {chosen.length === 0 ? 'pick some pieces' : `${chosen.length} chosen`}
        </p>
        <button
          type="button"
          onClick={() => void save()}
          disabled={chosen.length === 0 || saving}
          className="rounded-chip min-h-11 border px-3 text-[13px] disabled:opacity-40"
          style={
            chosen.length > 0
              ? {
                  backgroundColor: 'var(--color-accent)',
                  borderColor: 'var(--color-accent)',
                  color: 'var(--color-on-tag)',
                }
              : { borderColor: 'var(--color-rule)', color: 'var(--color-muted)' }
          }
        >
          {saving ? 'saving…' : 'save'}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {items && items.length === 0 ? (
          <p className="py-16 text-center text-[13px] text-muted">
            Nothing in the wardrobe to build from yet.
          </p>
        ) : (
          <div className="wardrobe-grid grid gap-3">
            {items?.map((item) => (
              <PickTile
                key={item.id}
                item={item}
                order={chosen.indexOf(item.id)}
                onTap={() => toggle(item.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * A wardrobe tile in picking mode. Shows the *position* rather than a tick:
 * the order pieces are chosen in is the order they stack, so it is worth
 * being able to see it before saving.
 */
function PickTile({ item, order, onTap }: { item: Item; order: number; onTap: () => void }) {
  const chosen = order >= 0;

  return (
    <button type="button" onClick={onTap} aria-pressed={chosen} className="tile relative aspect-[3/4]">
      <ItemImage item={item} className="h-full w-full object-contain" />
      {chosen && (
        <span
          className="absolute top-1.5 left-1.5 flex h-5 w-5 items-center justify-center rounded-full text-[11px]"
          style={{ backgroundColor: 'var(--color-on)', color: 'var(--color-on-tag)' }}
        >
          {order + 1}
        </span>
      )}
    </button>
  );
}
