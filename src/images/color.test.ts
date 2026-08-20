import { describe, expect, it } from 'vitest';

import { dominantColor } from './color';

function solid(r: number, g: number, b: number, pixels = 4): Uint8ClampedArray {
  const data = new Uint8ClampedArray(pixels * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  }
  return data;
}

describe('dominantColor', () => {
  it('reads back a solid colour exactly', () => {
    const data = solid(26, 43, 60);
    expect(dominantColor({ data, width: 2, height: 2 })).toBe('#1a2b3c');
  });

  it('averages two halves of the image', () => {
    const data = new Uint8ClampedArray([
      ...([255, 0, 0, 255] as const),
      ...([255, 0, 0, 255] as const),
      ...([0, 0, 0, 255] as const),
      ...([0, 0, 0, 255] as const),
    ]);
    expect(dominantColor({ data, width: 2, height: 2 })).toBe('#800000');
  });

  it('falls back to black for an empty image rather than dividing by zero', () => {
    expect(dominantColor({ data: new Uint8ClampedArray(0), width: 0, height: 0 })).toBe('#000000');
  });
});
