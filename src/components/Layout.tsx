import { useEffect } from 'react';
import { Outlet } from 'react-router';

import { purgeExpiredTrash } from '../db/items';
import { InstallBanner } from './InstallBanner';
import { TabBar } from './TabBar';

/** App shell: banner, routed content, tab bar. Shared by every screen. */
export function Layout() {
  useEffect(() => {
    // Trash purges automatically after 30 days (spec §4.4) — check once per launch.
    void purgeExpiredTrash();
  }, []);

  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <InstallBanner />
      <main className="min-h-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
      <TabBar />
    </div>
  );
}
