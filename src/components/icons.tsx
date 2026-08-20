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
