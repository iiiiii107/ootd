import { useState } from 'react';

import { useWardrobeItems } from '../db/hooks';
import type { Item } from '../db/types';
import { ItemImage } from './ItemImage';

/**
 * Choose garments from the wardrobe, full screen.
 *
 * Split out of `OutfitBuilder`, which was two things welded together: this
 * picker, and "save the result as an outfit". The calendar needs the first
 * without the second — logging what you wore on a Tuesday is not building an
 * outfit — so the picker is the part that is shared and the saving is the part
 * each caller supplies.
 */
export function WardrobePicker({
  initialIds = [],
  heading,
  saveLabel = 'save',
  onSave,
  onClose,
}: {
  initialIds?: string[];
  /** Shown when nothing is chosen yet; the count replaces it afterwards. */
  heading?: string;
  saveLabel?: string;
  onSave: (members: Item[]) => Promise<void> | void;
  onClose: () => void;
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
      await onSave(members);
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
          {chosen.length === 0 ? (heading ?? 'pick some pieces') : `${chosen.length} chosen`}
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
          {saving ? 'saving…' : saveLabel}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {items && items.length === 0 ? (
          <p className="py-16 text-center text-[13px] text-muted">
            Nothing in the wardrobe to pick from yet.
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
