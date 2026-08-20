/**
 * Placeholder — the real randomizer (spec §7.1, `pickOutfit`) lands in Phase 3.
 * This screen exists now only so the tab bar has somewhere to land.
 */
export default function Randomizer() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="font-display font-extrabold text-3xl lowercase tracking-[0.1em] text-ink">randomizer</h1>
      <p className="max-w-xs text-[13px] leading-relaxed text-muted">
        Coming in Phase 3 — pick a top and a bottom that go together.
      </p>
    </div>
  );
}
