import { useEffect } from 'react';
import { Link, Outlet } from 'react-router';

import { purgeExpiredTrash } from '../db/items';
import { BackupNag } from './BackupNag';
import { GearIcon } from './icons';
import { InstallBanner } from './InstallBanner';
import { LaundryNag } from './LaundryNag';
import { TabBar } from './TabBar';

/**
 * App shell: banner, a settings entry point, routed content, tab bar.
 * Settings isn't one of the four main tabs (spec §7), so it needs a way in
 * from everywhere — a small persistent icon here is that way in, rather
 * than duplicating a link on every one of the four screens.
 */
export function Layout() {
  useEffect(() => {
    // Trash purges automatically after 30 days (spec §4.4) — check once per launch.
    void purgeExpiredTrash();
  }, []);

  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <InstallBanner />
      <BackupNag />
      <LaundryNag />
      <div className="flex justify-end px-4 pt-2">
        <Link
          to="/settings"
          aria-label="Settings"
          className="flex min-h-11 min-w-11 items-center justify-center text-muted"
        >
          <GearIcon className="h-5 w-5" />
        </Link>
      </div>
      <main className="min-h-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
      <TabBar />
    </div>
  );
}
