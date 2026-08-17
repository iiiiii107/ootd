import { afterEach, describe, expect, it, vi } from 'vitest';

import { installMode, isIos, isStandalone } from './install';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1';
const MAC_CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

/**
 * @param standalone  what `display-mode: standalone` should report
 */
function stubEnv({
  userAgent = MAC_CHROME,
  platform = 'MacIntel',
  maxTouchPoints = 0,
  standalone,
  iosStandalone,
}: {
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
  standalone: boolean;
  iosStandalone?: boolean;
}) {
  vi.stubGlobal('navigator', { userAgent, platform, maxTouchPoints, standalone: iosStandalone });
  vi.stubGlobal('window', {
    matchMedia: (query: string) => ({ matches: standalone && query.includes('standalone') }),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isIos', () => {
  it('detects an iPhone', () => {
    stubEnv({ userAgent: IPHONE, platform: 'iPhone', standalone: false });
    expect(isIos()).toBe(true);
  });

  it('detects an iPad, which claims to be a Mac', () => {
    // iPadOS 13+ sends a desktop Mac user agent; touch points are the only tell.
    stubEnv({ userAgent: MAC_CHROME, platform: 'MacIntel', maxTouchPoints: 5, standalone: false });
    expect(isIos()).toBe(true);
  });

  it('does not mistake a real Mac for an iPad', () => {
    stubEnv({ userAgent: MAC_CHROME, platform: 'MacIntel', maxTouchPoints: 0, standalone: false });
    expect(isIos()).toBe(false);
  });
});

describe('isStandalone', () => {
  it('trusts the display-mode media query', () => {
    stubEnv({ standalone: true });
    expect(isStandalone()).toBe(true);
  });

  it('trusts navigator.standalone, which is all iOS Safari sets', () => {
    stubEnv({ userAgent: IPHONE, standalone: false, iosStandalone: true });
    expect(isStandalone()).toBe(true);
  });
});

describe('installMode', () => {
  it('warns when running in an iOS browser tab', () => {
    // The case the whole banner exists for: this tab has its own storage
    // bucket, so anything added here is invisible to the installed app.
    stubEnv({ userAgent: IPHONE, platform: 'iPhone', standalone: false });
    expect(installMode()).toBe('ios-browser-tab');
  });

  it('stays quiet once installed to the home screen', () => {
    stubEnv({ userAgent: IPHONE, platform: 'iPhone', standalone: false, iosStandalone: true });
    expect(installMode()).toBe('installed');
  });

  it('stays quiet in a desktop browser, where storage is not split', () => {
    stubEnv({ standalone: false });
    expect(installMode()).toBe('browser');
  });
});
