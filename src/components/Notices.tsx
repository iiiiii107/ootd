import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';

import { useNeedsBackup, useWashCount } from '../db/hooks';
import { installMode } from '../lib/install';

const INSTALL_DISMISSED_KEY = 'ootd.installBannerDismissed';

/** Enough of the wardrobe in the basket that the randomizer starts running out of options. */
const TOO_MANY_IN_WASH = 15;

/**
 * The app's standing messages, and the rule that **at most one shows at a
 * time**. Three of these stacked — which is reachable, and was — pushed the
 * screen title most of the way down the phone and turned the top of the app
 * into a wall of grey advice nobody reads.
 *
 * They're ordered by what happens if the message goes unread, most severe
 * first, so the one on screen is always the one that matters most right now:
 *
 *   1. install  — everything added in this tab is going into storage the
 *                 installed app can't see, and iOS wipes it after 7 days
 *   2. backup   — the wardrobe exists in exactly one place
 *   3. laundry  — housekeeping
 *
 * Each is dismissed independently, so waving off the laundry reveals nothing
 * else, but dismissing the install warning lets a real backup warning through.
 */
export function Notices() {
  const install = useInstallWarning();
  const needsBackup = useNeedsBackup();
  const washCount = useWashCount();

  const [backupDismissed, setBackupDismissed] = useState(false);
  const [laundryDismissed, setLaundryDismissed] = useState(false);

  if (install.show) {
    return (
      <Notice
        body={
          <>
            Install ootd to your home screen and use the icon — items added here won&rsquo;t
            appear in the installed app.
          </>
        }
        detail={
          <>
            Tap the Share icon, then <span className="text-ink">Add to Home Screen</span>, then
            open ootd from the new icon.
          </>
        }
        onDismiss={install.dismiss}
      />
    );
  }

  if (needsBackup && !backupDismissed) {
    return (
      <Notice
        body={
          <>
            It&rsquo;s been a while since your last backup. Your wardrobe lives only on this
            device — back it up before something happens to it.
          </>
        }
        action={<Link to="/settings">Back up now</Link>}
        onDismiss={() => setBackupDismissed(true)}
      />
    );
  }

  if (washCount >= TOO_MANY_IN_WASH && !laundryDismissed) {
    return (
      <Notice
        body={<>So many items in the wash? You really should do your laundry! ({washCount} of them.)</>}
        action={<Link to="/wardrobe">See what&rsquo;s in there</Link>}
        onDismiss={() => setLaundryDismissed(true)}
      />
    );
  }

  return null;
}

/**
 * Whether ootd is running in an iOS browser tab rather than from the
 * home-screen icon (spec §3).
 *
 * Two reasons this outranks everything else on screen:
 *   1. Items added in the tab will not appear in the installed app —
 *      separate storage buckets.
 *   2. iOS clears unused site data after 7 days for tabs. Installed
 *      home-screen apps are exempt. A wardrobe left in a tab can evaporate.
 *
 * Dismissal is remembered here, unlike the other two: this one is a fact
 * about how the app was opened, not a changing condition, so re-nagging every
 * launch would be pure noise. It still returns on a fresh install, where
 * localStorage starts empty.
 */
function useInstallWarning(): { show: boolean; dismiss: () => void } {
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(INSTALL_DISMISSED_KEY) === '1',
  );
  const [mode, setMode] = useState(installMode);

  // display-mode can change without a reload (installing, or opening the icon
  // from a tab), so track it rather than reading once at mount.
  useEffect(() => {
    const query = window.matchMedia('(display-mode: standalone)');
    const sync = () => setMode(installMode());
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  return {
    show: mode === 'ios-browser-tab' && !dismissed,
    dismiss: () => {
      localStorage.setItem(INSTALL_DISMISSED_KEY, '1');
      setDismissed(true);
    },
  };
}

/** One notice, so all three read as the same kind of thing rather than three near-copies. */
function Notice({
  body,
  detail,
  action,
  onDismiss,
}: {
  body: ReactNode;
  detail?: ReactNode;
  action?: ReactNode;
  onDismiss: () => void;
}) {
  return (
    <aside className="border-b border-rule bg-sunken px-5 py-3 text-[13px] leading-relaxed">
      <p className="text-ink">{body}</p>
      {detail && <p className="mt-1.5 text-muted">{detail}</p>}
      <div className="mt-1.5 flex gap-4 [&_a]:min-h-11 [&_a]:text-ink [&_a]:underline [&_a]:underline-offset-4">
        {action}
        <button
          type="button"
          onClick={onDismiss}
          className="min-h-11 text-left text-[13px] tracking-wide text-muted underline underline-offset-4 hover:text-ink"
        >
          {action ? 'Not now' : 'Dismiss'}
        </button>
      </div>
    </aside>
  );
}
