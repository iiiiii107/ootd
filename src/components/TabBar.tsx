import { NavLink } from 'react-router';

/**
 * Bottom tab bar, thumb-reachable, four tabs (spec §7). Text-only labels —
 * typography does the fashion work here, not icon glyphs (spec §8).
 *
 * Extra bottom clearance beyond the safe-area inset, on top of the taller
 * tap targets below: Netlify's free-tier badge floats fixed over the
 * bottom-right corner and was covering the Add tab on an iPhone.
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
      className="grid grid-cols-4 border-t border-rule bg-paper pb-[calc(max(env(safe-area-inset-bottom),0px)+16px)]"
      aria-label="Main"
    >
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={'end' in tab ? tab.end : false}
          className={({ isActive }) =>
            `flex min-h-11 flex-col items-center justify-center gap-1 py-4 text-[13px] ${
              isActive ? 'font-medium text-accent' : 'text-muted'
            }`
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
