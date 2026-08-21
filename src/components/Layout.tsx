import { useEffect } from 'react';
import { Outlet } from 'react-router';

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
 */
export function Layout() {
  useEffect(() => {
    // Trash purges automatically after 30 days (spec §4.4) — check once per launch.
    void purgeExpiredTrash();
  }, []);

  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <Notices />
      <main className="min-h-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
      <TabBar />
    </div>
  );
}
