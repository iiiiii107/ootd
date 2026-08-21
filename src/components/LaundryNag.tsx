import { useState } from 'react';
import { Link } from 'react-router';

import { useWashCount } from '../db/hooks';

/** Enough of the wardrobe in the basket that the randomizer starts running out of options. */
const TOO_MANY = 15;

/**
 * The laundry reminder. Dismissal is per-session only, like the backup nag —
 * the pile doesn't go away because it was waved off once, and it stops
 * appearing the moment items actually come out of the wash.
 */
export function LaundryNag() {
  const washCount = useWashCount();
  const [dismissed, setDismissed] = useState(false);

  if (washCount < TOO_MANY || dismissed) return null;

  return (
    <aside className="border-b border-rule bg-sunken px-5 py-4 text-[13px] leading-relaxed">
      <p className="text-ink">
        So many items in the wash? You really should do your laundry! ({washCount} of them.)
      </p>
      <div className="mt-3 flex gap-4">
        <Link
          to="/wardrobe"
          className="min-h-11 text-[13px] tracking-wide text-ink underline underline-offset-4"
        >
          See what&rsquo;s in there
        </Link>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="min-h-11 text-left text-[13px] tracking-wide text-muted underline underline-offset-4 hover:text-ink"
        >
          Not now
        </button>
      </div>
    </aside>
  );
}
