import { useRef } from 'react';

import type { Item } from '../db/types';
import { ItemImage } from './ItemImage';

const LONG_PRESS_MS = 500;

/**
 * One grid tile. A tap opens the detail sheet; a long-press enters bulk
 * multi-select mode (spec §7.2) — after that, every tap toggles selection
 * instead. There's no pointer-events long-press primitive in the DOM, so
 * this times a `pointerdown`→`pointerup` gap by hand and swallows the
 * `click` that follows a fired long-press.
 */
export function ItemTile({
  item,
  selectMode,
  selected,
  onTap,
  onToggleSelect,
  onLongPress,
}: {
  item: Item;
  selectMode: boolean;
  selected: boolean;
  onTap: () => void;
  onToggleSelect: () => void;
  onLongPress: () => void;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedLongPress = useRef(false);

  function startPress() {
    firedLongPress.current = false;
    timer.current = setTimeout(() => {
      firedLongPress.current = true;
      onLongPress();
    }, LONG_PRESS_MS);
  }

  function cancelPress() {
    if (timer.current) clearTimeout(timer.current);
  }

  function handleClick() {
    if (firedLongPress.current) {
      firedLongPress.current = false;
      return;
    }
    if (selectMode) onToggleSelect();
    else onTap();
  }

  return (
    <button
      type="button"
      onPointerDown={startPress}
      onPointerUp={cancelPress}
      onPointerLeave={cancelPress}
      onClick={handleClick}
      className="tile relative aspect-[3/4]"
    >
      {/*
        `contain`, not `cover`. A square tile cropping a portrait photograph
        showed a slice of each garment and turned the grid into a wall of
        identical rectangles — the clothes were the one thing you couldn't
        see. Letting each photo keep its own proportions means a long coat
        reads as a long coat, and the paper between them is the page rather
        than a tile.
      */}
      <ItemImage item={item} className="h-full w-full object-contain" />
      {item.inWash && (
        <span
          className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-accent"
          title="In the wash"
        />
      )}
      {selectMode && (
        <span
          className={`absolute top-1.5 left-1.5 h-4 w-4 border ${
            selected ? '' : 'border-paper bg-paper/70'
          }`}
          style={
            selected
              ? { backgroundColor: 'var(--color-on)', borderColor: 'var(--color-on)' }
              : undefined
          }
        />
      )}
    </button>
  );
}
