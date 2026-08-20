import { ScreenTitle } from '../components/ScreenTitle';

/**
 * Placeholder — the dedicated outfits grid (spec §7.3) lands in Phase 4.
 * Outfit-category items are excluded from the Wardrobe grid outright (spec
 * §7.2, revised in Phase 2), so anything photographed as `outfit` has no
 * view of its own until this screen is built.
 */
export default function Outfits() {
  return (
    <div className="flex flex-col items-center gap-3 px-6 text-center">
      <ScreenTitle>outfits</ScreenTitle>
      <p className="max-w-xs text-[13px] leading-relaxed text-muted">
        Coming in Phase 4 — saved looks will live here.
      </p>
    </div>
  );
}
