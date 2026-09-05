import { describe, expect, it } from 'vitest';

import { interiorCells } from './cutout';

/**
 * The rule that keeps garments opaque.
 *
 * Every garment was coming out grey — a black tee and a white tee both
 * reaching the same mid-grey — because the alpha ramp meant for softening an
 * *edge* was applied to every pixel. Wherever the model was less than certain
 * inside a garment, the garment turned translucent and the beige page showed
 * through it. Measured at alpha 156 in the middle of a solid black tee.
 */

/** A `w`×`h` grid with a filled rectangle, as `solidRegions` produces. */
function grid(w: number, h: number, x0: number, y0: number, x1: number, y1: number) {
  const keep = new Uint8Array(w * h);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) keep[y * w + x] = 1;
  return keep;
}

describe('interiorCells', () => {
  it('marks the middle of a shape as inside', () => {
    const keep = grid(10, 10, 2, 2, 8, 8);
    const interior = interiorCells(keep, 10, 10);
    expect(interior[5 * 10 + 5]).toBe(1);
  });

  it('does not mark the boundary as inside, so edges can still soften', () => {
    const keep = grid(10, 10, 2, 2, 8, 8);
    const interior = interiorCells(keep, 10, 10);
    expect(keep[2 * 10 + 5]).toBe(1); // kept…
    expect(interior[2 * 10 + 5]).toBe(0); // …but on the edge
  });

  it('marks nothing outside the shape', () => {
    const keep = grid(10, 10, 2, 2, 8, 8);
    const interior = interiorCells(keep, 10, 10);
    expect(interior[0]).toBe(0);
    expect(interior[9 * 10 + 9]).toBe(0);
  });

  it('leaves a one-cell-wide sliver entirely edge, never inside', () => {
    // A thin strap has no interior at this scale, so it stays governed by the
    // ramp rather than being forced solid — which is right: it is all edge.
    const keep = grid(10, 10, 5, 1, 6, 9);
    const interior = interiorCells(keep, 10, 10);
    expect([...interior].every((v) => v === 0)).toBe(true);
  });

  it('never marks a cell the region did not keep', () => {
    const keep = grid(10, 10, 2, 2, 8, 8);
    const interior = interiorCells(keep, 10, 10);
    for (let i = 0; i < keep.length; i++) if (!keep[i]) expect(interior[i]).toBe(0);
  });

  it('handles a shape touching the border without reading outside the grid', () => {
    const keep = grid(6, 6, 0, 0, 6, 6);
    const interior = interiorCells(keep, 6, 6);
    expect(interior[0]).toBe(0); // the border row is edge
    expect(interior[2 * 6 + 2]).toBe(1); // well inside
  });
});
