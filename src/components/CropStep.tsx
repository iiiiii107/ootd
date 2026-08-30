import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

import { FULL_FRAME, type CropRect } from '../images/crop';
import { useObjectUrl } from '../lib/useObjectUrl';

type DragMode = 'move' | 'nw' | 'ne' | 'sw' | 'se';

/** A crop can't be shrunk below this fraction of the frame — past it the handles overlap and become unusable. */
const MIN_SIZE = 0.08;

interface Drag {
  mode: DragMode;
  startX: number;
  startY: number;
  rect: CropRect;
  frameWidth: number;
  frameHeight: number;
}

/**
 * Crop before saving (not after) — the photo that lands in the database is
 * already the one you meant, so nothing has to be re-cropped later and no
 * uncropped original sits around eating storage.
 *
 * When automatic detection is on and finds a garment, the box arrives already
 * around it and this step is usually one tap. That's the point: the crop step
 * has to be skippable-by-default or a twenty-photo import becomes a chore.
 */
export function CropStep({
  image,
  initialCrop,
  detected,
  index,
  total,
  onConfirm,
  onDiscard,
}: {
  image: Blob;
  initialCrop: CropRect;
  detected: boolean;
  index: number;
  total: number;
  onConfirm: (crop: CropRect) => void;
  onDiscard: () => void;
}) {
  const url = useObjectUrl(image);
  const [rect, setRect] = useState<CropRect>(initialCrop);
  const frameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);

  function begin(event: ReactPointerEvent, mode: DragMode) {
    const frame = frameRef.current;
    if (!frame) return;
    event.preventDefault();
    event.stopPropagation();
    const bounds = frame.getBoundingClientRect();
    dragRef.current = {
      mode,
      startX: event.clientX,
      startY: event.clientY,
      rect,
      frameWidth: bounds.width,
      frameHeight: bounds.height,
    };
    // Capture keeps the drag alive when the finger strays outside the photo.
    // If the browser refuses it the drag still works while the pointer stays
    // over the frame, so this is a nice-to-have, never a hard requirement.
    try {
      frame.setPointerCapture(event.pointerId);
    } catch {
      /* not capturable — carry on uncaptured */
    }
  }

  function handleMove(event: ReactPointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = (event.clientX - drag.startX) / drag.frameWidth;
    const dy = (event.clientY - drag.startY) / drag.frameHeight;
    setRect(applyDrag(drag.rect, drag.mode, dx, dy));
  }

  function endDrag() {
    dragRef.current = null;
  }

  const isFullFrame = rect.width > 0.99 && rect.height > 0.99;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-paper">
      <div className="flex items-center justify-between border-b border-rule px-5 py-3">
        <p className="text-[12px] text-muted">
          crop {total > 1 ? `${index + 1} of ${total}` : ''}
        </p>
        <button
          type="button"
          onClick={() => setRect(FULL_FRAME)}
          disabled={isFullFrame}
          className="min-h-11 px-2 text-[13px] text-muted disabled:opacity-40"
        >
          use whole photo
        </button>
      </div>

      <div className="flex flex-1 items-center justify-center overflow-hidden p-4">
        <div
          ref={frameRef}
          onPointerMove={handleMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className="relative touch-none select-none"
        >
          {url && <img src={url} alt="" className="block max-h-[60vh] max-w-full" draggable={false} />}

          <div
            onPointerDown={(e) => begin(e, 'move')}
            className="absolute cursor-move border border-paper shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]"
            style={{
              left: `${rect.x * 100}%`,
              top: `${rect.y * 100}%`,
              width: `${rect.width * 100}%`,
              height: `${rect.height * 100}%`,
            }}
          >
            <Handle mode="nw" onDown={begin} className="-top-3 -left-3" />
            <Handle mode="ne" onDown={begin} className="-top-3 -right-3" />
            <Handle mode="sw" onDown={begin} className="-bottom-3 -left-3" />
            <Handle mode="se" onDown={begin} className="-right-3 -bottom-3" />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-rule px-5 pt-3 pb-8">
        <p className="text-center text-[12px] text-muted">
          {detected
            ? 'Found the garment — drag the corners if it missed anything.'
            : 'Drag the corners to crop.'}
        </p>
        <div className="flex gap-2">
          {/*
            Discarding here means the photo is never written at all. Before
            this, the only way out of a wrong photo was to let it save and
            then delete it from the wardrobe — which also burned a name and
            a slot in the numbering.
          */}
          <button
            type="button"
            onClick={onDiscard}
            className="min-h-12 flex-1 rounded-chip border border-rule text-[14px] tracking-wide text-accent"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={() => onConfirm(rect)}
            className="min-h-12 flex-[2] rounded-chip border text-[14px] font-medium"
            style={{
              backgroundColor: 'var(--color-accent)',
              borderColor: 'var(--color-accent)',
              color: 'var(--color-on-tag)',
            }}
          >
            {index + 1 < total ? 'Next photo' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Visually a small square, but with a 44px hit area around it — thumbs are not mice. */
function Handle({
  mode,
  onDown,
  className,
}: {
  mode: DragMode;
  onDown: (event: ReactPointerEvent, mode: DragMode) => void;
  className: string;
}) {
  return (
    <button
      type="button"
      aria-label={`Drag ${mode} corner`}
      onPointerDown={(e) => onDown(e, mode)}
      className={`absolute flex h-11 w-11 items-center justify-center ${className}`}
    >
      <span className="h-4 w-4 border-2 border-paper bg-ink" />
    </button>
  );
}

/** All geometry in normalised (0–1) units, clamped so the box can never leave the photo or invert. */
function applyDrag(rect: CropRect, mode: DragMode, dx: number, dy: number): CropRect {
  if (mode === 'move') {
    return {
      ...rect,
      x: clamp(rect.x + dx, 0, 1 - rect.width),
      y: clamp(rect.y + dy, 0, 1 - rect.height),
    };
  }

  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  const next = { ...rect };

  if (mode === 'nw' || mode === 'sw') {
    next.x = clamp(rect.x + dx, 0, right - MIN_SIZE);
    next.width = right - next.x;
  } else {
    next.width = clamp(rect.width + dx, MIN_SIZE, 1 - rect.x);
  }

  if (mode === 'nw' || mode === 'ne') {
    next.y = clamp(rect.y + dy, 0, bottom - MIN_SIZE);
    next.height = bottom - next.y;
  } else {
    next.height = clamp(rect.height + dy, MIN_SIZE, 1 - rect.y);
  }

  return next;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
