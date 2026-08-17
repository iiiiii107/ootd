import { InstallBanner } from './components/InstallBanner';
import { installMode } from './lib/install';

/**
 * Phase 0 (spec §10): the pipeline, not the app.
 *
 * The only job of this screen is to prove that an ootd icon lands on the home
 * screen, opens fullscreen with no address bar, and still loads in airplane
 * mode. The randomizer, wardrobe and the rest arrive in later phases.
 */
export default function App() {
  const mode = installMode();

  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <InstallBanner />

      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
        <h1 className="font-serif text-6xl lowercase tracking-[0.18em] text-ink">ootd</h1>
        <p className="max-w-xs text-center text-[13px] leading-relaxed text-muted">
          Outfit of the day. Your wardrobe lives on this device and nowhere else.
        </p>
      </main>

      <footer className="px-6 pb-8 text-center text-[11px] tracking-[0.14em] text-muted uppercase">
        {mode === 'installed' ? 'Installed' : 'Phase 0'}
      </footer>
    </div>
  );
}
