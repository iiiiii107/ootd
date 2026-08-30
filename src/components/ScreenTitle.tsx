import { Link, useLocation } from 'react-router';

import { GearIcon } from './icons';

/**
 * The one heading style every screen uses (spec §8). A shared component
 * rather than a copy-pasted className string — that copy-paste is exactly
 * how Add's title ended up uncentered and out of step with the rest.
 *
 * The settings gear rides along in this row, absolutely positioned, rather
 * than sitting in a row of its own in the app shell. A 44px row holding one
 * small icon cost every screen a band of empty space at the very top, and on
 * a phone that band came straight out of the grid. Absolute positioning also
 * keeps the title optically centred in the screen, which a flex row with an
 * icon on one side would not.
 */
export function ScreenTitle({ children }: { children: string }) {
  const { pathname } = useLocation();

  return (
    <div className="relative pt-4">
      <h1 className="text-center font-display font-semibold text-4xl lowercase tracking-[0.08em] text-ink">
        {children}
      </h1>
      {pathname !== '/settings' && (
        <Link
          to="/settings"
          aria-label="Settings"
          className="absolute top-0 right-0 flex min-h-11 min-w-11 items-center justify-center text-muted"
        >
          <GearIcon className="h-5 w-5" />
        </Link>
      )}
    </div>
  );
}
