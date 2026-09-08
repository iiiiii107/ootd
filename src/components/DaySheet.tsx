import { useState } from 'react';

import { useWear, useWearMembers } from '../db/hooks';
import { logWear, removeWear } from '../db/wears';
import { formatDay } from '../logic/calendar';
import { ItemImage } from './ItemImage';
import { WardrobePicker } from './WardrobePicker';

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
          <div className="grid grid-cols-3 gap-3">
            {members.map((item) => (
              <div key={item.id} className="flex flex-col gap-1">
                <div className="aspect-[3/4]">
                  <ItemImage item={item} className="h-full w-full object-contain" />
                </div>
                <p className="truncate text-[11px] text-muted">{item.name}</p>
              </div>
            ))}
          </div>
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
