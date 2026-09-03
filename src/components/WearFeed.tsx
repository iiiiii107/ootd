import { useWearMembers, useWears } from '../db/hooks';
import { removeWear } from '../db/wears';
import type { Item, Wear } from '../db/types';
import { ItemImage } from './ItemImage';

/**
 * What you have actually worn, most recent first (spec §7.6).
 *
 * Reads the wear log rather than the wardrobe: `Item.lastWornAt` knows when a
 * garment was last worn but not what it was worn *with*, so a feed of days
 * cannot be reconstructed from items at all — a top and a skirt worn together
 * on Tuesday look identical to the same two worn separately that week.
 */
export function WearFeed() {
  const wears = useWears();

  if (wears === undefined) return null; // first read; avoids an empty-state flash

  if (wears.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-center">
        <p className="max-w-xs text-[13px] leading-relaxed text-muted">
          Nothing logged yet. Shuffle an outfit and tap “wearing this today”, or open any garment
          and tap “I wore this”.
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col">
      {wears.map((entry) => (
        <WearRow key={entry.id} entry={entry} />
      ))}
    </ul>
  );
}

function WearRow({ entry }: { entry: Wear }) {
  const members = useWearMembers(entry.memberIds);

  return (
    <li className="flex items-center gap-3 border-b border-rule py-3">
      <div className="flex shrink-0 gap-px">
        {members?.map((member) => <MemberThumb key={member.id} item={member} />)}
        {members?.length === 0 && (
          // Every piece deleted since. The day still happened, so the entry
          // stays; there is simply nothing left to show for it.
          <div className="h-14 w-14 bg-sunken" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-[14px] text-ink">{formatDay(entry.id)}</p>
        <p className="truncate text-[12px] text-muted">
          {members && members.length > 0
            ? members.map((m) => m.name).join(' · ')
            : 'those pieces are gone now'}
        </p>
      </div>

      <button
        type="button"
        onClick={() => void removeWear(entry.id)}
        aria-label={`Remove ${formatDay(entry.id)} from your ootds`}
        className="min-h-11 shrink-0 px-2 text-[12px] text-muted"
      >
        remove
      </button>
    </li>
  );
}

function MemberThumb({ item }: { item: Item }) {
  return (
    <div className="h-14 w-14 shrink-0 bg-paper">
      <ItemImage item={item} className="h-full w-full object-cover" />
    </div>
  );
}

/**
 * `today` and `yesterday` by name, then the date. Parsed field by field
 * rather than through `new Date(id)`, which reads a bare `YYYY-MM-DD` as UTC
 * midnight and so shows the wrong day for anyone west of Greenwich.
 */
function formatDay(id: string): string {
  const [year, month, day] = id.split('-').map(Number);
  const date = new Date(year, month - 1, day);

  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const daysAgo = Math.round((midnight.getTime() - date.getTime()) / 86_400_000);

  if (daysAgo === 0) return 'today';
  if (daysAgo === 1) return 'yesterday';
  if (daysAgo < 7) return `${daysAgo} days ago`;

  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: date.getFullYear() === midnight.getFullYear() ? undefined : 'numeric',
  });
}
