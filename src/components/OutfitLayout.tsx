import type { ReactNode } from 'react';

/**
 * An outfit arranged like a body.
 *
 * The pair holds the centre because it is the outfit; the jacket hangs to the
 * left of the top, shoes sit under the bottom, and an accessory sits at the
 * waist on the right, spanning both garment rows so it lands on the seam where
 * top and bottom meet.
 *
 * Shared rather than duplicated: the randomizer and the calendar are showing
 * the same thing — an outfit — and an outfit that rearranged itself depending
 * on which screen you were looking at would be a strange app. Each caller
 * still supplies its own cards, because the randomizer's carry locks and the
 * calendar's do not; what is shared is the arrangement, which is the part that
 * would drift.
 *
 * Empty slots collapse. An outfit with no jacket should look like an outfit,
 * not like one with a hole in it.
 */
export function OutfitLayout({
  jacket,
  top,
  accessory,
  bottom,
  shoes,
}: {
  jacket?: ReactNode;
  top: ReactNode;
  accessory?: ReactNode;
  bottom: ReactNode;
  shoes?: ReactNode;
}) {
  return (
    <div
      className="mx-auto grid w-full max-w-[340px] items-center gap-2"
      style={{ gridTemplateColumns: '1fr 1.6fr 1fr' }}
    >
      <div className="col-start-1 row-start-1">{jacket}</div>
      <div className="col-start-2 row-start-1">{top}</div>
      <div className="col-start-3 row-span-2 row-start-1 self-center">{accessory}</div>

      <div className="col-start-2 row-start-2">{bottom}</div>

      {/* Narrowed rather than left to fill the centre column: shoes are a
          supporting piece, and at the pair's full width they read as important
          as the outfit itself. */}
      <div className="col-start-2 row-start-3 mx-auto w-3/5">{shoes}</div>
    </div>
  );
}
