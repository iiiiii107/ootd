/**
 * The one heading style every screen uses (spec §8). A shared component
 * rather than a copy-pasted className string — that copy-paste is exactly
 * how Add's title ended up uncentered and out of step with the rest.
 */
export function ScreenTitle({ children }: { children: string }) {
  return (
    <h1 className="pt-6 text-center font-display font-extrabold text-3xl lowercase tracking-[0.1em] text-ink">
      {children}
    </h1>
  );
}
