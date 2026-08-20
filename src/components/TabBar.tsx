import { NavLink } from 'react-router';

/**
 * Bottom tab bar, thumb-reachable, four tabs (spec §7). Text-only labels —
 * typography does the fashion work here, not icon glyphs (spec §8).
 */
const TABS = [
  { to: '/', label: 'Randomizer', end: true },
  { to: '/wardrobe', label: 'Wardrobe' },
  { to: '/outfits', label: 'Outfits' },
  { to: '/add', label: 'Add' },
] as const;

export function TabBar() {
  return (
    <nav
      className="grid grid-cols-4 border-t border-rule bg-paper pb-[max(env(safe-area-inset-bottom),0px)]"
      aria-label="Main"
    >
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={'end' in tab ? tab.end : false}
          className={({ isActive }) =>
            `flex min-h-11 flex-col items-center justify-center gap-1 py-3 text-[11px] tracking-[0.08em] uppercase ${
              isActive ? 'text-ink' : 'text-muted'
            }`
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
