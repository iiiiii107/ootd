import { useState } from 'react';
import { Link } from 'react-router';

import { useNeedsBackup } from '../db/hooks';

/**
 * Backup reminder (spec §12 R1): more than 30 days since the last export,
 * with new items added since. Dismissal is per-session only, not
 * remembered — unlike the install banner, this one is warning about actual
 * data loss risk, so it should come back next launch rather than stay
 * silenced indefinitely on a single tap.
 */
export function BackupNag() {
  const needsBackup = useNeedsBackup();
  const [dismissed, setDismissed] = useState(false);

  if (!needsBackup || dismissed) return null;

  return (
    <aside className="border-b border-rule bg-sunken px-5 py-4 text-[13px] leading-relaxed">
      <p className="text-ink">
        It&rsquo;s been a while since your last backup. Your wardrobe lives only on this device —
        back it up before something happens to it.
      </p>
      <div className="mt-3 flex gap-4">
        <Link
          to="/settings"
          className="min-h-11 text-[13px] tracking-wide text-ink underline underline-offset-4"
        >
          Back up now
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
