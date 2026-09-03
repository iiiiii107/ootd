import { useEffect } from 'react';
import { Outlet } from 'react-router';

import { migrateDensityDefault } from '../db/appearance';
import { purgeExpiredTrash } from '../db/items';
import { Notices } from './Notices';
import { TabBar } from './TabBar';

/**
 * App shell: one notice at most, routed content, tab bar.
 *
 * Settings isn't one of the four main tabs (spec §7), so it needs a way in
 * from everywhere. That entry point lives in `ScreenTitle`, which every
 * screen already renders — putting it there costs no vertical space, where a
 * row of its own here cost a 44px band at the top of every screen.
 *
 * `h-dvh` and not `min-h-dvh`: a minimum lets the shell grow past the screen,
 * and then the whole page scrolls and takes the tab bar with it. Pinned to the
 * viewport with `overflow-hidden`, only `main` scrolls and the bar cannot
 * leave. The safe-area insets moved here from `body` for the same reason —
 * on the body they added to a full-height box and pushed the bottom of it off
 * the screen by exactly the height of the home bar.
 */
export function Layout() {
  useEffect(() => {
    // Trash purges automatically after 30 days (spec §4.4) — check once per launch.
    void purgeExpiredTrash();
    void migrateDensityDefault();
  }, []);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-paper pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
      <Notices />
      <main className="min-h-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
      <TabBar />
    </div>
  );
}
