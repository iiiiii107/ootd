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
