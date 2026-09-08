import { updateItem } from '../db/items';
import { PALETTE_VERSION, USER_SET_PALETTE } from '../db/paletteVersion';
import type { Item } from '../db/types';
import { paletteFromThumbAsync } from '../images/pipelineClient';
import type { Swatch } from '../logic/colour';

/**
 * A garment's colours, and a way to correct them.
 *
 * Reading colour off a photograph is a guess — a good one from a cutout, a
 * rougher one without — and the person holding the garment always knows
 * better. This is the same escape hatch the background eraser is: the
 * automatic answer is usually right, and when it is not you should not have to
 * re-photograph anything to fix it.
 *
 * A hand-set palette is stamped `USER_SET_PALETTE` so the backfill leaves it
 * alone forever after. "Read it again" is the way back to the automatic answer.
 */

/** Any more than this and it stops describing the garment and starts listing pixels. */
const MAX_SWATCHES = 4;

export function PaletteEditor({ item }: { item: Item }) {
  const edited = item.paletteVersion === USER_SET_PALETTE;

  /**
   * Shares are spread evenly whenever the palette is edited by hand.
   *
   * The automatic reader knows what proportion of the garment each colour
   * covers; a person naming colours is saying "it is these", not "it is 63%
   * this". Inventing proportions they did not give would be a worse lie than
   * treating them as equals, and matching only cares about the ordering.
   */
  function save(swatches: Swatch[]) {
    const even = swatches.map((s) => ({ ...s, share: 1 / swatches.length }));
    void updateItem(item.id, {
      palette: even,
      paletteVersion: USER_SET_PALETTE,
      dominantColor: even[0]?.hex ?? item.dominantColor,
    });
  }

  function change(index: number, hex: string) {
    save(item.palette.map((s, i) => (i === index ? { ...s, hex } : s)));
  }

  function remove(index: number) {
    const rest = item.palette.filter((_, i) => i !== index);
    // Never leave a garment with no colours: empty means "not read yet", which
    // would send the backfill round again and make the removal look broken.
    if (rest.length === 0) return;
    save(rest);
  }

  function add() {
    save([...item.palette, { hex: item.palette[0]?.hex ?? '#808080', share: 0 }]);
  }

  async function readAgain() {
    if (!item.thumb) return;
    const palette = await paletteFromThumbAsync(item.thumb, item.hasCutout);
    if (palette.length === 0) return;
    await updateItem(item.id, {
      palette,
      paletteVersion: PALETTE_VERSION,
      dominantColor: palette[0]?.hex ?? item.dominantColor,
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[12px] font-medium text-muted">Colours</p>

        {item.palette.length === 0 ? (
          <span className="text-[11px] text-muted">reading…</span>
        ) : (
          item.palette.map((swatch, index) => (
            <span key={index} className="relative inline-flex">
              <input
                type="color"
                value={swatch.hex}
                aria-label={`Colour ${index + 1} of this garment`}
                onChange={(e) => change(index, e.target.value)}
                className="h-6 w-6 cursor-pointer rounded-full border border-rule bg-transparent p-0"
              />
              {item.palette.length > 1 && (
                <button
                  type="button"
                  onClick={() => remove(index)}
                  aria-label={`Remove colour ${index + 1}`}
                  className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full border border-rule bg-paper text-[10px] leading-none text-muted"
                >
                  ×
                </button>
              )}
            </span>
          ))
        )}

        {item.palette.length > 0 && item.palette.length < MAX_SWATCHES && (
          <button
            type="button"
            onClick={add}
            aria-label="Add a colour"
            className="flex h-6 w-6 items-center justify-center rounded-full border border-rule text-[13px] leading-none text-muted"
          >
            +
          </button>
        )}
      </div>

      <p className="text-[11px] leading-relaxed text-muted">
        {edited ? (
          <>
            Set by you.{' '}
            <button
              type="button"
              onClick={() => void readAgain()}
              className="underline underline-offset-2"
            >
              read it again
            </button>{' '}
            to go back to the photo&rsquo;s own colours.
          </>
        ) : (
          <>
            Read from the photo — tap one to correct it if it looks wrong.
            {!item.hasCutout && ' Without a cutout this is a guess from the middle of the frame.'}
          </>
        )}
      </p>
    </div>
  );
}
