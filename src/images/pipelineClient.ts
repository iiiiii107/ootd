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

/** Marks a rejection as "the worker died", which is the one case worth retrying. */
class WorkerLost extends Error {
  constructor() {
    super('Photo processing stopped unexpectedly.');
  }
}

/**
 * How many times the worker may die before the model is given up on for this
 * session. A worker that dies once is bad luck — a phone reclaiming memory
 * while ~40MB of model and ~24MB of inference runtime are resident. A worker
 * that dies every time is a device that cannot run this model at all, and
 * retrying forever would cost a crash per photo while never succeeding.
 */
const MAX_DEATHS = 3;
let deaths = 0;

/** True once this device has proved it cannot keep the model alive. */
export function modelUnavailable(): boolean {
  return deaths >= MAX_DEATHS;
}

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
    worker.onerror = handleDeath;
    // A module worker that fails to *load* — a bad chunk URL, a parse error —
    // reports through this rather than onerror, and used to leave every photo
    // hanging on a promise nobody would ever settle.
    worker.onmessageerror = handleDeath;
  } catch {
    worker = null;
  }
  return worker;
}

/**
 * A dead worker takes every in-flight photo with it.
 *
 * Clearing `worker` here is the part that was missing: without it the dead
 * instance stayed cached, so every subsequent photo posted a message to a
 * corpse and waited on a promise that could never settle. The first failure
 * showed an error; everything after it hung silently forever.
 *
 * `undefined` rather than `null` deliberately — null is reserved for "this
 * browser cannot construct workers at all", which is permanent, while a death
 * is transient and the next call should build a fresh one.
 */
function handleDeath(): void {
  deaths++;
  worker?.terminate();
  worker = undefined;
  for (const entry of pending.values()) entry.reject(new WorkerLost());
  pending.clear();
}

function post<T>(request: WorkerRequestBody): Promise<T> {
  const active = getWorker();
  if (!active) return Promise.reject(new Error('Photo processing is unavailable in this browser.'));
  const id = nextId++;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (value: never) => void, reject });
    active.postMessage({ ...request, id } as WorkerRequest);
  });
}

/**
 * Send, and rebuild the worker once if it dies mid-request.
 *
 * One retry, not a loop: the common case is a single collapse under memory
 * pressure that a fresh worker survives, and a device that genuinely cannot
 * run this should fail quickly rather than crash repeatedly.
 */
async function send<T>(request: WorkerRequestBody): Promise<T> {
  try {
    return await post<T>(request);
  } catch (error) {
    if (!(error instanceof WorkerLost) || modelUnavailable()) throw error;
    return post<T>(request);
  }
}

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
