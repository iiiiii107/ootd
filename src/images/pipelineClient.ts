import type { CropRect } from './crop';
import type { AnalyzeOptions, ImportedPhoto, PhotoSegmentation } from './pipeline';
import type { WorkerRequest, WorkerRequestBody, WorkerResponse } from './pipeline.worker';

/**
 * Talks to the photo pipeline worker.
 *
 * There is deliberately no run-it-on-the-main-thread fallback. One was built
 * and then removed: because the worker is compiled as its own Rollup graph,
 * a main-thread copy meant the HEIC decoder and the segmentation runtime were
 * bundled *twice*, which took the day-one precache from 4.4MB to 8.2MB. That
 * is a real cost on a phone, paid for a path that cannot realistically run —
 * this app already needs `OffscreenCanvas.convertToBlob`, which no browser
 * has shipped without module workers. A worker that genuinely fails to start
 * surfaces as a per-photo error instead of silently freezing the UI.
 */

let worker: Worker | null | undefined;
let nextId = 1;
const pending = new Map<number, { resolve: (value: never) => void; reject: (error: Error) => void }>();

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL('./pipeline.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      const entry = pending.get(message.id);
      if (!entry) return;
      pending.delete(message.id);
      if (message.ok) entry.resolve(message.result as never);
      else entry.reject(new Error(message.error));
    };
    // A worker that dies takes every in-flight photo with it; fail them all
    // rather than leaving the import loop awaiting a promise forever.
    worker.onerror = () => {
      for (const entry of pending.values()) entry.reject(new Error('Photo processing stopped unexpectedly.'));
      pending.clear();
    };
  } catch {
    worker = null;
  }
  return worker;
}

function send<T>(request: WorkerRequestBody): Promise<T> {
  const active = getWorker();
  if (!active) return Promise.reject(new Error('Photo processing is unavailable in this browser.'));
  const id = nextId++;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (value: never) => void, reject });
    active.postMessage({ ...request, id } as WorkerRequest);
  });
}

/** Decode and resize — fast, and the only step the crop screen waits on. */
export function prepPhotoAsync(file: Blob): Promise<Blob> {
  return send<Blob>({ kind: 'prep', file });
}

/** The ~9.5s model pass. Start it, don't await it on any path a person is watching. */
export function segmentPhotoAsync(base: Blob, options: AnalyzeOptions): Promise<PhotoSegmentation> {
  return send<PhotoSegmentation>({ kind: 'segment', base, options });
}

export function finishPhotoAsync(
  base: Blob,
  crop: CropRect,
  cutout: Blob | null = null,
): Promise<ImportedPhoto> {
  return send<ImportedPhoto>({ kind: 'finish', base, crop, cutout });
}
