import { useEffect, useState } from 'react';

import { installMode } from '../lib/install';

const DISMISSED_KEY = 'ootd.installBannerDismissed';

/**
 * Persistent, dismissible warning shown when ootd is running in an iOS browser
 * tab rather than from the home-screen icon (spec §3).
 *
 * Two reasons this earns a permanent place on screen:
 *   1. Items added in the tab will not appear in the installed app — separate
 *      storage buckets.
 *   2. iOS clears unused site data after 7 days for tabs. Installed
 *      home-screen apps are exempt. A wardrobe left in a tab can evaporate.
 *
 * Dismissal is remembered, but the banner is the only warning the user gets,
 * so it comes back on a fresh install where localStorage starts empty.
 */
export function InstallBanner() {
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(DISMISSED_KEY) === '1',
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

  if (mode !== 'ios-browser-tab' || dismissed) return null;

  return (
    <aside className="border-b border-rule bg-sunken px-5 py-4 text-[13px] leading-relaxed">
      <p className="text-ink">
        Install ootd to your home screen and use the icon — items added here
        won&rsquo;t appear in the installed app.
      </p>
      <p className="mt-2 text-muted">
        Tap the Share icon, then <span className="text-ink">Add to Home Screen</span>, then open
        ootd from the new icon.
      </p>
      <button
        type="button"
        onClick={() => {
          localStorage.setItem(DISMISSED_KEY, '1');
          setDismissed(true);
        }}
        className="mt-3 min-h-11 text-left text-[13px] tracking-wide text-muted underline underline-offset-4 hover:text-ink"
      >
        Dismiss
      </button>
    </aside>
  );
}
