import { ScreenTitle } from '../components/ScreenTitle';

/**
 * Placeholder — the real randomizer (spec §7.1, `pickOutfit`) lands in Phase 3.
 * This screen exists now only so the tab bar has somewhere to land.
 */
export default function Randomizer() {
  return (
    <div className="flex flex-col items-center gap-3 px-6 text-center">
      <ScreenTitle>randomizer</ScreenTitle>
      <p className="max-w-xs text-[13px] leading-relaxed text-muted">
        Coming in Phase 3 — pick a top and a bottom that go together.
      </p>
    </div>
  );
}
