import { Link, useLocation, useNavigate } from 'react-router';

import { BackIcon, GearIcon } from './icons';

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
 *
 * Settings swaps that gear for a way back out, on the left where a back
 * control belongs. Without one the only exit was the tab bar, which meant
 * leaving Settings always landed you on some *other* screen rather than the
 * one you opened it from.
 */
export function ScreenTitle({ children }: { children: string }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isSettings = pathname === '/settings';

  function goBack() {
    // `navigate(-1)` on its own can walk out of the app entirely — reloading
    // while on #/settings, or opening the app to it, leaves nothing behind to
    // go back to. React Router stamps an index onto history state; at zero
    // there is no previous entry of ours, so fall back to the launch screen.
    const index = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (index > 0) void navigate(-1);
    else void navigate('/');
  }

  return (
    <div className="relative pt-4">
      <h1 className="text-center font-display font-semibold text-4xl lowercase tracking-[0.08em] text-ink">
        {children}
      </h1>

      {isSettings ? (
        <button
          type="button"
          onClick={goBack}
          aria-label="Back"
          className="rounded-chip absolute top-0 left-0 flex min-h-11 items-center gap-1 pr-2 text-[13px] text-muted"
        >
          <BackIcon className="h-5 w-5" />
          back
        </button>
      ) : (
        <Link
          to="/settings"
          aria-label="Settings"
          className="rounded-chip absolute top-0 right-0 flex min-h-11 min-w-11 items-center justify-center text-muted"
        >
          <GearIcon className="h-5 w-5" />
        </Link>
      )}
    </div>
  );
}
