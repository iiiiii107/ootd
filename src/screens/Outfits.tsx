/**
 * Placeholder — the dedicated outfits grid (spec §7.3) lands in Phase 4.
 * Outfit-category items are still visible in the Wardrobe grid until then.
 */
export default function Outfits() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="font-display font-extrabold text-3xl lowercase tracking-[0.1em] text-ink">outfits</h1>
      <p className="max-w-xs text-[13px] leading-relaxed text-muted">
        Coming in Phase 4 — saved looks live here. For now, find them in the wardrobe grid.
      </p>
    </div>
  );
}
