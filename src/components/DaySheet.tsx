import { useState } from 'react';

import { useWear, useWearMembers } from '../db/hooks';
import { logWear, removeWear } from '../db/wears';
import { formatDay } from '../logic/calendar';
import type { Item } from '../db/types';
import { ItemImage } from './ItemImage';
import { OutfitLayout } from './OutfitLayout';
import { WardrobePicker } from './WardrobePicker';

/**
 * A day's clothes, arranged the way the randomizer arranges an outfit.
 *
 * The log stores a flat list of garments, not slots, so they are sorted into
 * the body's positions here. First of each category takes its place; anything
 * left over — a second top, a second accessory — is shown beneath rather than
 * dropped, because the log is a record of what was worn and quietly hiding
 * half of it would make the record wrong.
 */
function WornOutfit({ members }: { members: Item[] }) {
  const firstOf = (category: Item['category']) => members.find((m) => m.category === category);
  const top = firstOf('top');
  const bottom = firstOf('bottom');
  const jacket = firstOf('jacket');
  const shoes = firstOf('shoes');
  const accessory = firstOf('other');

  const slotted = new Set([top, bottom, jacket, shoes, accessory].filter(Boolean).map((i) => i!.id));
  const extras = members.filter((m) => !slotted.has(m.id));

  // Nothing recognisable as a top or bottom — an accessories-only day, or a
  // wardrobe tagged differently. Fall back to a plain row rather than an
  // outfit with two empty middles.
  if (!top && !bottom) {
    return (
      <div className="grid grid-cols-3 gap-3">
        {members.map((item) => (
          <WornPiece key={item.id} item={item} />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <OutfitLayout
        jacket={jacket && <WornPiece item={jacket} small />}
        top={top ? <WornPiece item={top} /> : <EmptySlot label="no top logged" />}
        accessory={accessory && <WornPiece item={accessory} small />}
        bottom={bottom ? <WornPiece item={bottom} /> : <EmptySlot label="no bottom logged" />}
        shoes={shoes && <WornPiece item={shoes} small />}
      />
      {extras.length > 0 && (
        <div className="grid grid-cols-3 gap-3 border-t border-rule pt-3">
          {extras.map((item) => (
            <WornPiece key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function WornPiece({ item, small = false }: { item: Item; small?: boolean }) {
  return (
    <div className="rounded-chip border border-rule">
      <div className="aspect-square bg-paper">
        <ItemImage item={item} className="h-full w-full object-contain" />
      </div>
      <p className={`truncate px-1 py-0.5 text-center text-muted ${small ? 'text-[10px]' : 'text-[11px]'}`}>
        {item.name}
      </p>
    </div>
  );
}

/** A gap in the record, said out loud rather than shown as blank space. */
function EmptySlot({ label }: { label: string }) {
  return (
    <div className="rounded-chip flex aspect-square items-center justify-center border border-dashed border-rule">
      <p className="px-2 text-center text-[11px] text-muted">{label}</p>
    </div>
  );
}

/**
 * One day of the log: what was worn, and the ways to change it.
 *
 * A day with nothing logged opens straight into the picker — there is nothing
 * to look at first, and making someone tap "add" on an empty sheet is a step
 * that earns nothing.
 */
export function DaySheet({
  dateKey,
  todayKey,
  onClose,
}: {
  dateKey: string;
  todayKey: string;
  onClose: () => void;
}) {
  const wear = useWear(dateKey);
  const members = useWearMembers(wear?.memberIds ?? []);
  const [picking, setPicking] = useState(false);

  // Still reading. Nothing is worse here than flashing "nothing logged" at
  // someone who logged something.
  if (wear === undefined && members === undefined) return null;

  if (picking || !wear) {
    return (
      <WardrobePicker
        initialIds={wear?.memberIds ?? []}
        heading={`what you wore ${formatDay(dateKey, todayKey)}`}
        saveLabel="log it"
        onClose={() => (picking ? setPicking(false) : onClose())}
        onSave={async (chosen) => {
          await logWear(
            chosen.map((item) => item.id),
            null,
            dateKey,
          );
        }}
      />
    );
  }

  async function forget() {
    if (!window.confirm(`Remove ${formatDay(dateKey, todayKey)} from your ootds?`)) return;
    await removeWear(dateKey);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-paper">
      <div className="flex items-center justify-between border-b border-rule px-5 py-3">
        <p className="text-[15px] text-ink">{formatDay(dateKey, todayKey)}</p>
        <button type="button" onClick={onClose} className="min-h-11 px-2 text-[13px] text-muted">
          close
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {members && members.length > 0 ? (
          <WornOutfit members={members} />
        ) : (
          // The day happened and was logged; the clothes have since been
          // deleted. Saying so is more honest than an empty panel.
          <p className="py-10 text-center text-[13px] text-muted">
            Those pieces are gone from your wardrobe now.
          </p>
        )}
      </div>

      <div className="flex gap-2 border-t border-rule px-5 pt-3 pb-8">
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="rounded-chip min-h-11 flex-1 border border-rule text-[13px] text-ink"
        >
          change
        </button>
        <button
          type="button"
          onClick={() => void forget()}
          className="rounded-chip min-h-11 flex-1 border border-rule text-[13px] text-accent"
        >
          remove
        </button>
      </div>
    </div>
  );
}
