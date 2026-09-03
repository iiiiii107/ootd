import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

import { updateItem } from '../db/items';
import type { Item } from '../db/types';
import { cropToThumb } from '../images/cutout';
import { encodeWithAlpha } from '../images/encode';
import { alphaOf, applyAlpha, brushErase, wandErase } from '../images/erase';

/**
 * Rub out background the model left behind.
 *
 * Two tools, because leftover background comes in two shapes. A patch the
 * model missed is usually a flat region of one colour, and tapping it takes
 * the whole thing at once — far better than brushing it away a fingertip at a
 * time on a phone. A brush handles the rest: background fused to the garment,
 * where no automatic rule can tell where one ends and the other begins.
 *
 * All editing is on the alpha channel (src/images/erase.ts). Colour is never
 * touched, which keeps an undo step to one byte per pixel instead of four —
 * the difference between an affordable history and none.
 */

/** Undo depth. Each step is width×height bytes: ~1.4MB on a 1200px photo, so this is ~11MB. */
const MAX_UNDO = 8;

type Tool = 'tap' | 'brush';

export function BackgroundEraser({ item, onClose }: { item: Item; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageDataRef = useRef<ImageData | null>(null);
  const alphaRef = useRef<Uint8Array | null>(null);
  const undoRef = useRef<Uint8Array[]>([]);
  const drawingRef = useRef(false);

  const [tool, setTool] = useState<Tool>('tap');
  const [brushSize, setBrushSize] = useState(40);
  const [ready, setReady] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Load the stored photo into a canvas once.
  useEffect(() => {
    let live = true;
    void (async () => {
      if (!item.image) return;
      const bitmap = await createImageBitmap(item.image);
      if (!live) {
        bitmap.close();
        return;
      }
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();

      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      imageDataRef.current = data;
      alphaRef.current = alphaOf(data.data, canvas.width, canvas.height);
      setReady(true);
    })();
    return () => {
      live = false;
    };
  }, [item.image]);

  function repaint() {
    const canvas = canvasRef.current;
    const data = imageDataRef.current;
    const alpha = alphaRef.current;
    if (!canvas || !data || !alpha) return;
    applyAlpha(data.data, alpha);
    canvas.getContext('2d')?.putImageData(data, 0, 0);
  }

  /** Snapshot before a change, so it can be taken back. */
  function remember() {
    const alpha = alphaRef.current;
    if (!alpha) return;
    undoRef.current.push(Uint8Array.from(alpha));
    if (undoRef.current.length > MAX_UNDO) undoRef.current.shift();
    setCanUndo(true);
  }

  function undo() {
    const previous = undoRef.current.pop();
    if (!previous) return;
    alphaRef.current = previous;
    repaint();
    setCanUndo(undoRef.current.length > 0);
    setDirty(true);
  }

  /** Pointer position → pixel in the image, which is drawn scaled to fit. */
  function toImagePoint(event: ReactPointerEvent): { x: number; y: number } | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const box = canvas.getBoundingClientRect();
    const x = Math.round(((event.clientX - box.left) / box.width) * canvas.width);
    const y = Math.round(((event.clientY - box.top) / box.height) * canvas.height);
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return null;
    return { x, y };
  }

  function handleDown(event: ReactPointerEvent) {
    if (!ready) return;
    const point = toImagePoint(event);
    const data = imageDataRef.current;
    const alpha = alphaRef.current;
    const canvas = canvasRef.current;
    if (!point || !data || !alpha || !canvas) return;
    event.preventDefault();
    setNote(null);

    if (tool === 'tap') {
      remember();
      const result = wandErase(data.data, alpha, canvas.width, canvas.height, point.x, point.y);
      if (!result.alpha) {
        // Nothing there. Drop the snapshot rather than leaving an undo step
        // that would appear to do nothing when pressed.
        undoRef.current.pop();
        setCanUndo(undoRef.current.length > 0);
        setNote('Nothing to remove there.');
        return;
      }
      alphaRef.current = result.alpha;
      repaint();
      setDirty(true);
      // Tapping the garment by mistake is easy and the result is drastic, so
      // say so. The erase still happens — it is visible, and undo is one tap
      // away — because a tool that second-guesses you is worse than one that
      // simply lets you take it back.
      if (result.large) setNote('That took a big piece — undo if it caught the garment.');
      return;
    }

    drawingRef.current = true;
    remember();
    paintAt(point);
  }

  function handleMove(event: ReactPointerEvent) {
    if (!drawingRef.current || tool !== 'brush') return;
    const point = toImagePoint(event);
    if (point) paintAt(point);
  }

  function paintAt(point: { x: number; y: number }) {
    const alpha = alphaRef.current;
    const canvas = canvasRef.current;
    if (!alpha || !canvas) return;
    // Brush size is in screen pixels; scale it into image pixels so the brush
    // stays the size it looks whatever the photo's resolution is.
    const scale = canvas.width / (canvas.getBoundingClientRect().width || canvas.width);
    brushErase(alpha, canvas.width, canvas.height, point.x, point.y, (brushSize / 2) * scale);
    repaint();
    setDirty(true);
  }

  function endStroke() {
    drawingRef.current = false;
  }

  async function save() {
    const canvas = canvasRef.current;
    if (!canvas || !dirty) return onClose();
    setSaving(true);
    try {
      const off = new OffscreenCanvas(canvas.width, canvas.height);
      const ctx = off.getContext('2d');
      const data = imageDataRef.current;
      if (!ctx || !data) return;
      ctx.putImageData(data, 0, 0);

      const image = await encodeWithAlpha(off);
      const thumb = await cropToThumb(image, true);
      // hasCutout regardless of how it got here: the stored photo now has
      // transparency, and that is what the flag actually means.
      await updateItem(item.id, { image, thumb, hasCutout: true });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-paper">
      <div className="flex items-center justify-between border-b border-rule px-4 py-3">
        <button type="button" onClick={onClose} className="min-h-11 text-[13px] text-muted">
          cancel
        </button>
        <button
          type="button"
          onClick={undo}
          disabled={!canUndo}
          className="min-h-11 px-2 text-[13px] text-ink disabled:opacity-40"
        >
          undo
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="rounded-chip min-h-11 border px-3 text-[13px]"
          style={{
            backgroundColor: 'var(--color-accent)',
            borderColor: 'var(--color-accent)',
            color: 'var(--color-on-tag)',
          }}
        >
          {saving ? 'saving…' : 'save'}
        </button>
      </div>

      {/*
        The chequerboard is what makes this usable: on a plain ground you
        cannot tell removed background from background that is simply a
        similar colour to the page.
      */}
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-3">
        <div className="checkerboard max-h-full">
          <canvas
            ref={canvasRef}
            onPointerDown={handleDown}
            onPointerMove={handleMove}
            onPointerUp={endStroke}
            onPointerLeave={endStroke}
            onPointerCancel={endStroke}
            className="block max-h-[62vh] max-w-full touch-none select-none"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-rule px-4 pt-3 pb-8">
        {note && <p className="text-center text-[12px] text-accent">{note}</p>}

        <div className="flex gap-1.5">
          {(['tap', 'brush'] as Tool[]).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setTool(id)}
              aria-pressed={tool === id}
              className="rounded-chip min-h-10 flex-1 border text-[13px]"
              style={
                tool === id
                  ? {
                      backgroundColor: 'var(--color-on)',
                      borderColor: 'var(--color-on)',
                      color: 'var(--color-on-tag)',
                    }
                  : { borderColor: 'var(--color-rule)', color: 'var(--color-ink)' }
              }
            >
              {id === 'tap' ? 'tap a patch' : 'brush'}
            </button>
          ))}
        </div>

        {tool === 'brush' && (
          <label className="flex items-center gap-3 text-[12px] text-muted">
            size
            <input
              type="range"
              min={10}
              max={120}
              value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
              className="flex-1"
            />
          </label>
        )}

        <p className="text-center text-[12px] text-muted">
          {tool === 'tap'
            ? 'Tap any background the model left behind.'
            : 'Drag to rub background away.'}
        </p>
      </div>
    </div>
  );
}
