import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';

import { CropStep } from '../components/CropStep';
import { ScreenTitle } from '../components/ScreenTitle';
import { TagChipRow } from '../components/TagChipRow';
import { useAutoDetectEnabled, useCutoutEnabled, useItem } from '../db/hooks';
import { createItem, suggestName, updateItem } from '../db/items';
import type { Category } from '../db/types';
import { FULL_FRAME, type CropRect } from '../images/crop';
import type { PhotoSegmentation } from '../images/pipeline';
import {
  finishPhotoAsync,
  modelUnavailable,
  prepPhotoAsync,
  segmentPhotoAsync,
} from '../images/pipelineClient';
import { useDebouncedText } from '../lib/useDebouncedText';
import { ItemImage } from '../components/ItemImage';
import { CATEGORY_GROUP } from '../tags/groups';
import { useGroups } from '../tags/useGroups';

interface SavedEntry {
  key: string;
  itemId?: string;
  error?: string;
}

interface CropTask {
  base: Blob;
  /** Resolves when the model is done. May well outlive the crop step. */
  segmentation: Promise<PhotoSegmentation>;
  index: number;
  total: number;
}

/** What the crop step hands back: a rectangle to keep, a photo to drop, or a screen that went away. */
type CropDecision = CropRect | 'discard' | 'abandoned';

const CATEGORIES: Category[] = ['top', 'bottom', 'other', 'outfit'];

/**
 * Camera or library picker, multi-select → per-photo crop → save → tag
 * (spec §7.4). Every photo goes through the same three beats:
 *
 *   1. prep    — decode and resize, ~60ms
 *   2. crop    — on screen immediately; the box snaps to the garment if the
 *                model finds it before you have touched it
 *   3. tag     — the full tag set, right here, while the garment is in hand
 *
 * **Nothing waits for the model.** Segmentation is ~9.5s and cannot be made
 * faster — measured across four input sizes and both backends — so a garment
 * is saved from its plain photo the moment you tap save, and the cutout is
 * applied to the item afterwards, whenever it arrives. Importing one garment
 * used to take ten seconds; it now takes about a tenth of one, and the
 * background disappears a few seconds later while you are already tagging.
 *
 * Tagging beyond category is still never mandatory: the item is already saved
 * by the time its card appears, so walking away mid-tagging loses nothing and
 * the rest can be finished from the wardrobe later. Doing it here is just far
 * more likely to actually happen than doing it from a grid a week later.
 *
 * Photos are processed strictly one at a time (spec R3) — a `for` loop that
 * awaits each photo, including the user's crop, before touching the next.
 * Never `Promise.all`: two full-resolution bitmaps at once is what kills the
 * tab on an iPhone.
 */
export default function Add() {
  const [saved, setSaved] = useState<SavedEntry[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [modelGaveUp, setModelGaveUp] = useState(false);
  const [cropTask, setCropTask] = useState<CropTask | null>(null);
  const navigate = useNavigate();
  const savedCount = saved.filter((entry) => entry.itemId).length;

  // Both switches live in Settings (spec §7.5); reading them live here means
  // a change there takes effect on the very next photo, no remount needed.
  const cutoutEnabled = useCutoutEnabled();
  const detectEnabled = useAutoDetectEnabled();

  // Carries the last-chosen category to the next photo, so five tops in a
  // row don't each need re-selecting (spec §7.4's "same tags as previous").
  const lastCategory = useRef<Category>('top');
  // Bridges the crop step back into the import loop: the loop awaits this,
  // CropStep's confirm resolves it.
  const cropResolver = useRef<((decision: CropDecision) => void) | null>(null);
  const abandoned = useRef(false);

  // Leaving the screen mid-import must not strand the loop on a promise that
  // can never resolve — release it and let the loop bail out.
  useEffect(() => {
    abandoned.current = false;
    return () => {
      abandoned.current = true;
      cropResolver.current?.('abandoned');
    };
  }, []);

  function awaitCrop(): Promise<CropDecision> {
    return new Promise((resolve) => {
      cropResolver.current = resolve;
    });
  }

  function addEntry(entry: SavedEntry) {
    setSaved((current) => [entry, ...current]);
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    const options = { detect: detectEnabled, cutout: cutoutEnabled };
    const wantsModel = detectEnabled || cutoutEnabled;

    /**
     * Kick off the model without waiting for it. The stray `.catch` keeps a
     * rejection from going unhandled while nobody is awaiting yet; the
     * original still rejects for whoever eventually does.
     *
     * A failure resolves to "no cutout, whole frame" rather than propagating
     * (spec R3): background removal is a nicety, and an import must never
     * fail because of it.
     */
    const startSegmentation = (base: Blob): Promise<PhotoSegmentation> => {
      // `modelUnavailable` means this device has already killed the worker
      // several times over — almost always a phone reclaiming memory from the
      // ~40MB model. Carrying on would cost a crash per photo and still
      // produce nothing, so the rest of the import proceeds without it.
      if (!wantsModel || modelUnavailable()) {
        return Promise.resolve({ cutout: null, suggestedCrop: FULL_FRAME, detected: false });
      }
      const work = segmentPhotoAsync(base, options).catch(
        (): PhotoSegmentation => ({ cutout: null, suggestedCrop: FULL_FRAME, detected: false }),
      );
      return work;
    };

    // The lookahead still earns its keep, but for prep rather than the model:
    // photo N+1 is decoded while you crop photo N, so a batch never pauses
    // between photos either.
    const prep = (file: Blob) => {
      const work = prepPhotoAsync(file);
      work.catch(() => {});
      return work;
    };
    let upcoming = prep(list[0]);

    for (let index = 0; index < list.length; index++) {
      if (abandoned.current) return;

      const current = upcoming;
      upcoming = index + 1 < list.length ? prep(list[index + 1]) : upcoming;

      setStatus('Reading the photo…');
      let base: Blob;
      try {
        base = await current;
      } catch (err) {
        addEntry({
          key: crypto.randomUUID(),
          error: err instanceof Error ? err.message : 'Could not read this photo.',
        });
        continue;
      }

      // Started here and deliberately not awaited: the crop step goes up now.
      const segmentation = startSegmentation(base);

      setStatus(null);
      setCropTask({ base, segmentation, index, total: list.length });
      const decision = await awaitCrop();
      setCropTask(null);
      if (decision === 'abandoned') return; // screen left mid-import
      if (decision === 'discard') continue; // wrong photo — never saved at all

      try {
        // Saved from the plain photo, immediately. This is the whole point:
        // the item exists and is tagagble within a frame or two of the tap.
        const photo = await finishPhotoAsync(base, decision);
        const item = await createItem({ category: lastCategory.current, ...photo });
        addEntry({ key: item.id, itemId: item.id });
        // And the cutout catches up in its own time.
        if (wantsModel) void applyCutoutWhenReady(item.id, base, decision, segmentation);
      } catch (err) {
        addEntry({
          key: crypto.randomUUID(),
          error: err instanceof Error ? err.message : 'Could not save this photo.',
        });
      }
    }

    setStatus(null);
    setModelGaveUp(modelUnavailable());
  }

  return (
    <div className="flex flex-col gap-5 px-5 pb-10">
      <ScreenTitle>add</ScreenTitle>

      <div className="flex gap-3">
        <PickerButton label="Take photo" capture accept="image/*" onFiles={handleFiles} />
        <PickerButton label="Choose photos" multiple accept="image/*" onFiles={handleFiles} />
      </div>

      {saved.length === 0 ? (
        <p className="text-[13px] leading-relaxed text-muted">
          You&rsquo;ll crop each photo, then tag it right away — everything saves as you go, and
          anything you skip can be finished later from the wardrobe.
          {detectEnabled && ' The crop box starts around the garment automatically.'}
          {cutoutEnabled && ' Backgrounds are removed automatically.'}
          {(detectEnabled || cutoutEnabled) &&
            ' The first photo downloads a one-time model file, so it may take a moment.'}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {saved.map((entry) =>
            entry.itemId ? (
              <TagCard
                key={entry.key}
                itemId={entry.itemId}
                onCategoryChosen={(category) => {
                  lastCategory.current = category;
                }}
              />
            ) : (
              <li key={entry.key} className="rounded-chip border border-rule p-3 text-[13px] text-accent">
                {entry.error}
              </li>
            ),
          )}
        </ul>
      )}

      {status && <p className="text-[13px] text-muted">{status}</p>}

      {/*
        Cutouts giving up is worth saying out loud. Everything still imports,
        and the photos are real photos rather than failures, so this is a note
        and not an error — but silently stopping a feature someone switched on
        is how an app gets a reputation for being broken.
      */}
      {modelGaveUp && (
        <p className="rounded-chip border border-rule p-3 text-[12px] leading-relaxed text-muted">
          Backgrounds aren’t being removed — this phone ran out of memory for the model. Your photos
          are saved and everything else works. Turning background removal off in Settings will stop
          it trying.
        </p>
      )}

      {/*
        Everything on this screen is already in the database — tags included,
        the moment you tap a chip. But "it saved while you weren't looking"
        is a promise you have to take on faith, so there's a real button to
        end the session on, and it says what already happened rather than
        pretending to be the thing that does it.
      */}
      {saved.length > 0 && !cropTask && !status && (
        <div className="flex flex-col gap-1.5 border-t border-rule pt-4">
          <button
            type="button"
            onClick={() => {
              setSaved([]);
              void navigate('/wardrobe');
            }}
            className="min-h-12 rounded-chip border text-[14px] font-medium"
            style={{
              backgroundColor: 'var(--color-accent)',
              borderColor: 'var(--color-accent)',
              color: 'var(--color-on-tag)',
            }}
          >
            Done · {savedCount} added
          </button>
          <p className="text-center text-[12px] text-muted">
            Already saved, tags and all. This just takes you to the wardrobe.
          </p>
        </div>
      )}

      {cropTask && (
        <CropStep
          key={cropTask.index}
          image={cropTask.base}
          segmentation={cropTask.segmentation}
          index={cropTask.index}
          total={cropTask.total}
          onConfirm={(crop) => cropResolver.current?.(crop)}
          onDiscard={() => cropResolver.current?.('discard')}
        />
      )}
    </div>
  );
}

function PickerButton({
  label,
  onFiles,
  multiple,
  capture,
  accept,
}: {
  label: string;
  onFiles: (files: FileList | null) => void;
  multiple?: boolean;
  capture?: boolean;
  accept: string;
}) {
  return (
    <label className="pressable flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-chip border border-rule text-[13px] tracking-wide text-ink">
      {label}
      <input
        type="file"
        accept={accept}
        multiple={multiple}
        capture={capture ? 'environment' : undefined}
        className="hidden"
        onChange={(e) => {
          const input = e.currentTarget;
          void onFiles(input.files);
          input.value = '';
        }}
      />
    </label>
  );
}

/**
 * One just-imported item, fully editable in place. Reads the item live from
 * the database rather than mirroring it in local state, so this card and the
 * detail sheet are the same data with no chance of drift.
 *
 * Category gets its own row instead of coming from `useGroups` because Add is
 * the one place `outfit` is offerable (spec §7.3) — photographing a whole
 * look directly. Every other group renders generically, so a custom group
 * created in Settings shows up here with no code change (spec §15).
 */
function TagCard({
  itemId,
  onCategoryChosen,
}: {
  itemId: string;
  onCategoryChosen: (category: Category) => void;
}) {
  const item = useItem(itemId);
  const groups = useGroups();
  const [expanded, setExpanded] = useState(true);
  const [name, setName] = useDebouncedText(item?.name ?? '', (value) =>
    void updateItem(itemId, { name: value }),
  );

  if (!item) return null;

  async function changeCategory(category: Category) {
    if (!item) return;
    onCategoryChosen(category);
    // The auto-generated name is category-derived ("Top 14"); re-suggest it
    // so it stays consistent, but only while it still looks auto-generated.
    const patch: { category: Category; name?: string } = { category };
    if (isSuggestedName(item.name)) patch.name = await suggestName(category);
    await updateItem(item.id, patch);
  }

  return (
    <li className="flex flex-col gap-3 rounded-chip border border-rule p-3">
      <div className="flex gap-3">
        <div className="h-20 w-20 shrink-0 bg-paper">
          <ItemImage item={item} alt="" className="h-full w-full object-cover" />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="min-h-11 border-b border-rule bg-transparent text-[15px] text-ink outline-none focus:border-ink"
          />
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => void changeCategory(category)}
                aria-pressed={item.category === category}
                className="rounded-chip min-h-8 border px-2.5 text-[12px]"
                style={
                  item.category === category
                    ? {
                        backgroundColor: `var(${CATEGORY_GROUP.hue})`,
                        borderColor: `var(${CATEGORY_GROUP.hue})`,
                        color: 'var(--color-on-tag)',
                      }
                    : {
                        borderColor: `color-mix(in oklab, var(${CATEGORY_GROUP.hue}) 38%, transparent)`,
                        color: 'var(--color-muted)',
                      }
                }
              >
                {category}
              </button>
            ))}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="min-h-9 w-fit text-[12px] text-muted underline underline-offset-4"
      >
        {expanded ? 'hide tags' : 'add tags'}
      </button>

      {expanded &&
        groups
          .filter((group) => group.id !== 'category')
          .map((group) => (
            <TagChipRow
              key={group.id}
              group={group}
              selected={group.getValues(item)}
              onToggle={(value) => void updateItem(item.id, group.toggle(item, value))}
            />
          ))}
    </li>
  );
}

/**
 * Apply the cutout to an already-saved item, once the model gets there.
 *
 * Deliberately module-level rather than a method on the component: this
 * routinely outlives the Add screen. Someone imports a garment, taps Done and
 * walks to the wardrobe long before ~9.5s of inference is finished, and the
 * background should still come off. It is only a database write, so nothing
 * needs the screen to still be mounted — the wardrobe's live query picks the
 * change up wherever the user happens to be.
 *
 * Every failure is silent by design (spec R3). The item is already saved and
 * already correct with its plain photo; a cutout that could not be produced
 * is a missing nicety, not something worth interrupting anyone over.
 */
async function applyCutoutWhenReady(
  itemId: string,
  base: Blob,
  crop: CropRect,
  segmentation: Promise<PhotoSegmentation>,
): Promise<void> {
  try {
    const { cutout } = await segmentation;
    if (!cutout) return;
    const photo = await finishPhotoAsync(base, crop, cutout);
    if (!photo.hasCutout) return;
    await updateItem(itemId, {
      image: photo.image,
      thumb: photo.thumb,
      hasCutout: true,
      dominantColor: photo.dominantColor,
    });
  } catch {
    // Keeps the plain photo, which was never wrong.
  }
}

/** Matches the `Top 14` shape `suggestName` produces — anything else is the user's own wording. */
function isSuggestedName(name: string): boolean {
  return /^(Top|Bottom|Other|Outfit) \d+$/.test(name);
}
