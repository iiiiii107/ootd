/**
 * The app's only icon glyphs — everywhere else is text (spec §8: typography
 * does the fashion work, not icon glyphs). Hairline stroke, no fill, sized
 * off `currentColor` so they inherit whatever text colour surrounds them.
 */

export function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="8.5" cy="8.5" r="6" />
      <line x1="17" y1="17" x2="13.2" y2="13.2" />
    </svg>
  );
}

/** The randomizer's lock-a-card control (spec §7.1) — shackle open vs. closed. */
export function LockIcon({ locked, className }: { locked: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="4.5" y="9" width="11" height="8" rx="1" />
      {locked ? (
        <path d="M7 9V6.5a3 3 0 0 1 6 0V9" />
      ) : (
        <path d="M7 9V6.5a3 3 0 0 1 5.7-1.3" />
      )}
    </svg>
  );
}

/**
 * The wardrobe's laundry shortcut — a basket with its weave suggested by two
 * crossing lines. Filled when the filter is on, so it reads as pressed at a
 * glance rather than needing a border.
 */
export function BasketIcon({ filled, className }: { filled?: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M2.5 7.5h15l-1.6 8.2a1.5 1.5 0 0 1-1.5 1.3H5.6a1.5 1.5 0 0 1-1.5-1.3Z" fill={filled ? 'currentColor' : 'none'} />
      <path d="M6.5 7.5 9 3M13.5 7.5 11 3" />
      {!filled && <path d="M7 11l1 3M13 11l-1 3M10 11v3" />}
    </svg>
  );
}

/** The wardrobe's favourites shortcut. Matches the heart already used in the detail sheet. */
export function HeartIcon({ filled, className }: { filled?: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M10 16.5S3 12.4 3 7.9A3.9 3.9 0 0 1 10 5.6a3.9 3.9 0 0 1 7 2.3c0 4.5-7 8.6-7 8.6Z" />
    </svg>
  );
}

/** Entry point to Settings (spec §7.5) — the only nav element outside the tab bar. */
export function GearIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="10" cy="10" r="2.75" />
      <path d="M10 3v2.2M10 14.8V17M17 10h-2.2M5.2 10H3M14.66 5.34l-1.56 1.56M6.9 13.1l-1.56 1.56M14.66 14.66l-1.56-1.56M6.9 6.9 5.34 5.34" />
    </svg>
  );
}
