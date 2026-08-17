/**
 * How the app is currently being run.
 *
 * This matters more here than in most PWAs. On iOS an installed home-screen
 * app gets its own private storage bucket, separate from the Chrome tab it was
 * installed from — so items added in a tab simply do not exist in the
 * installed app. It is effectively a second, empty copy. iOS sandboxes web
 * apps this way and it cannot be worked around, so the app has to tell the
 * user which copy they are looking at (spec §3).
 */

export type InstallMode = 'installed' | 'ios-browser-tab' | 'browser';

/** Safari and iOS Chrome both set this on the home-screen copy only. */
interface IosNavigator extends Navigator {
  standalone?: boolean;
}

export function isIos(): boolean {
  const ua = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS 13+ reports itself as a Mac; the touch points give it away.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    (navigator as IosNavigator).standalone === true
  );
}

export function installMode(): InstallMode {
  if (isStandalone()) return 'installed';
  // Only iOS splits storage per install, so only iOS needs the warning.
  return isIos() ? 'ios-browser-tab' : 'browser';
}
