import { describe, expect, it } from 'vitest';

import { alphaOf, applyAlpha, brushErase, wandErase } from './erase';

/**
 * A tiny scene: a red garment down the middle, grey background either side,
 * and one stray grey speck floating in the top-left — the exact shape of the
 * problem, a patch the model failed to take.
 */
function scene(width = 20, height = 20) {
  const data = new Uint8ClampedArray(width * height * 4);
  const put = (x: number, y: number, r: number, g: number, b: number, a: number) => {
    const i = (y * width + x) * 4;
    data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const isGarment = x >= 8 && x < 12;
      if (isGarment) put(x, y, 200, 40, 30, 255);
      else put(x, y, 0, 0, 0, 0); // already removed
    }
  }
  // The leftover: a 3×3 patch of grey background the model missed.
  for (let y = 2; y < 5; y++) for (let x = 2; x < 5; x++) put(x, y, 150, 150, 150, 255);
  return { data, width, height };
}

const opaqueCount = (a: Uint8Array) => a.reduce((n, v) => n + (v > 0 ? 1 : 0), 0);

describe('wandErase', () => {
  it('takes the whole leftover patch from one tap', () => {
    const { data, width, height } = scene();
    const alpha = alphaOf(data, width, height);
    expect(opaqueCount(alpha)).toBe(20 * 4 + 9); // garment + speck

    const { alpha: next } = wandErase(data, alpha, width, height, 3, 3);
    expect(next).not.toBeNull();
    expect(opaqueCount(next!)).toBe(20 * 4); // speck gone, garment untouched
  });

  it('does not cross into a differently coloured garment', () => {
    const { data, width, height } = scene();
    const alpha = alphaOf(data, width, height);
    const { alpha: next } = wandErase(data, alpha, width, height, 3, 3);
    // Every garment pixel still opaque.
    for (let y = 0; y < height; y++) {
      for (let x = 8; x < 12; x++) expect(next![y * width + x]).toBe(255);
    }
  });

  it('flags a tap that takes a big piece, measured against what was visible', () => {
    // Tapping the garment. The first attempt at this measured the share of the
    // whole frame, so a garment covering a fifth of the picture was erased
    // without a word — the threshold fired in exactly the wrong cases. Against
    // visible pixels it is unambiguous: the garment *is* what is visible.
    const { data, width, height } = scene();
    const alpha = alphaOf(data, width, height);
    const result = wandErase(data, alpha, width, height, 10, 10);
    expect(result.large).toBe(true);
    // 80 garment pixels of 89 visible — nearly everything there was to take.
    expect(result.share).toBeGreaterThan(0.85);
  });

  it('does not flag taking a small leftover patch', () => {
    const { data, width, height } = scene();
    const alpha = alphaOf(data, width, height);
    const result = wandErase(data, alpha, width, height, 3, 3);
    expect(result.large).toBe(false);
  });

  it('still performs a large removal rather than refusing it', () => {
    // Undo is the safety net, not a veto: a legitimately large background
    // should not be blocked, and a mistake is one tap from being taken back.
    const { data, width, height } = scene();
    const alpha = alphaOf(data, width, height);
    const result = wandErase(data, alpha, width, height, 10, 10);
    expect(result.alpha).not.toBeNull();
  });

  it('does nothing when tapping a hole that is already transparent', () => {
    const { data, width, height } = scene();
    const alpha = alphaOf(data, width, height);
    const result = wandErase(data, alpha, width, height, 0, 18);
    expect(result.alpha).toBeNull();
    expect(result.large).toBe(false);
  });

  it('leaves the original alpha untouched, so undo has something to go back to', () => {
    const { data, width, height } = scene();
    const alpha = alphaOf(data, width, height);
    const before = opaqueCount(alpha);
    wandErase(data, alpha, width, height, 3, 3);
    expect(opaqueCount(alpha)).toBe(before);
  });
});

describe('brushErase', () => {
  it('clears the middle of its circle and leaves distant pixels alone', () => {
    const { data, width, height } = scene();
    const alpha = alphaOf(data, width, height);
    brushErase(alpha, width, height, 3, 3, 2);
    expect(alpha[3 * width + 3]).toBe(0);
    expect(alpha[10 * width + 10]).toBe(255); // far away, untouched
  });

  it('softens rather than cutting a hard edge', () => {
    const alpha = new Uint8Array(400).fill(255);
    brushErase(alpha, 20, 20, 10, 10, 5);
    const rim = alpha[10 * 20 + 14]; // one in from the rim
    expect(rim).toBeGreaterThan(0);
    expect(rim).toBeLessThan(255);
  });

  it('never restores alpha, however many strokes overlap', () => {
    const alpha = new Uint8Array(400).fill(255);
    brushErase(alpha, 20, 20, 10, 10, 5);
    const after = alpha[10 * 20 + 14];
    brushErase(alpha, 20, 20, 10, 10, 5);
    expect(alpha[10 * 20 + 14]).toBeLessThanOrEqual(after);
  });
});

describe('alpha round-trip', () => {
  it('puts an edited channel back without disturbing colour', () => {
    const { data, width, height } = scene();
    const alpha = alphaOf(data, width, height);
    alpha[0] = 123;
    applyAlpha(data, alpha);
    expect(data[3]).toBe(123);
    expect([data[0], data[1], data[2]]).toEqual([0, 0, 0]);
  });
});
