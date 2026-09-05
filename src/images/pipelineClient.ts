import type { CropRect } from './crop';
import type {
  AnalyzeOptions,
  ImportedPhoto,
  PhotoSegmentation,
  PreparedPhoto,
} from './pipeline';
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

/**
 * Two workers, and the reason is the whole point of this file.
 *
 * A worker handles one message at a time. With a single worker, tapping save
 * queued the crop behind whatever segmentation was running — measured at
 * **15ms on an idle worker, 7467ms while the model was going**. The model is
 * started for every photo and runs ~9.5s, so that was very nearly always,
 * which made "the garment saves the moment you tap save" true only in a test
 * that had no model running. It was exactly that test.
 *
 * So the slow work gets its own worker and the fast work gets another. They
 * are the same module: the segmentation runtime is behind a dynamic import
 * (src/images/cutout.ts), as is the HEIC decoder, so the light worker never
 * loads either and nothing is bundled twice.
 */
type Role = 'model' | 'light';

interface Pending {
  resolve: (value: never) => void;
  reject: (error: Error) => void;
  /** Kept so the request can be sent again to a fresh worker if this one dies. */
  request: WorkerRequestBody;
  attempts: number;
}

interface Channel {
  worker: Worker | null | undefined;
  pending: Map<number, Pending>;
  deaths: number;
}

const channels: Record<Role, Channel> = {
  model: { worker: undefined, pending: new Map(), deaths: 0 },
  light: { worker: undefined, pending: new Map(), deaths: 0 },
};

/** Only the model pass is slow; everything else goes to the light worker. */
function roleFor(kind: WorkerRequestBody['kind']): Role {
  return kind === 'segment' ? 'model' : 'light';
}

let nextId = 1;

/** Marks a rejection as "the worker died", which is the one case worth retrying. */
class WorkerLost extends Error {
  constructor() {
    super('Photo processing stopped unexpectedly.');
  }
}

/**
 * How many times a worker may die before its work is given up on for this
 * session. A worker that dies once is bad luck — a phone reclaiming memory
 * while tens of megabytes of model and inference runtime are resident. One
 * that dies every time is a device that cannot run this at all, and retrying
 * forever would cost a crash per photo while never succeeding.
 */
const MAX_DEATHS = 3;

/** True once this device has proved it cannot keep the model alive. */
export function modelUnavailable(): boolean {
  return channels.model.deaths >= MAX_DEATHS;
}

function getWorker(role: Role): Worker | null {
  const channel = channels[role];
  if (channel.worker !== undefined) return channel.worker;
  try {
    const worker = new Worker(new URL('./pipeline.worker.ts', import.meta.url), {
      type: 'module',
    });
    channel.worker = worker;
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      const entry = channel.pending.get(message.id);
      if (!entry) return;
      channel.pending.delete(message.id);
      if (message.ok) entry.resolve(message.result as never);
      else entry.reject(new Error(message.error));
    };
    worker.onerror = () => handleDeath(role);
    // A module worker that fails to *load* — a bad chunk URL, a parse error —
    // reports through this rather than onerror, and used to leave every photo
    // hanging on a promise nobody would ever settle.
    worker.onmessageerror = () => handleDeath(role);
  } catch {
    channel.worker = null;
  }
  return channel.worker;
}

/**
 * A worker died. Rebuild it and put its work back on, rather than failing it.
 *
 * This is the difference between one bad moment and a ruined import. A worker
 * handles a queue, and the Add screen deliberately runs a photo ahead — so a
 * single death used to reject *every* in-flight photo at once, which is what
 * "four photos, four errors, nothing added" was. Re-posting them means a
 * death costs a pause, not the batch.
 *
 * Once each: a request that dies on a fresh worker too is a request this
 * device cannot process, and retrying it forever would crash the worker on a
 * loop while never succeeding.
 *
 * `undefined` rather than `null` when clearing — null is reserved for "this
 * browser cannot construct workers at all", which is permanent, while a death
 * is transient and the next call should build a fresh one.
 */
function handleDeath(role: Role): void {
  const channel = channels[role];
  channel.deaths++;
  channel.worker?.terminate();
  channel.worker = undefined;

  const orphaned = [...channel.pending.entries()];
  channel.pending.clear();

  for (const [, entry] of orphaned) {
    if (entry.attempts >= 2 || channel.deaths >= MAX_DEATHS) {
      entry.reject(new WorkerLost());
      continue;
    }
    // A fresh worker is built lazily by the next post; if that fails too, this
    // request comes back here with a higher count and is failed properly.
    repost(role, entry);
  }
}

/** Put an orphaned request onto a new worker, keeping the caller's promise. */
function repost(role: Role, entry: Pending): void {
  const active = getWorker(role);
  if (!active) {
    entry.reject(new Error('Photo processing is unavailable in this browser.'));
    return;
  }
  const id = nextId++;
  channels[role].pending.set(id, { ...entry, attempts: entry.attempts + 1 });
  active.postMessage({ ...entry.request, id } as WorkerRequest);
}

function post<T>(request: WorkerRequestBody): Promise<T> {
  const role = roleFor(request.kind);
  const active = getWorker(role);
  if (!active) return Promise.reject(new Error('Photo processing is unavailable in this browser.'));
  const id = nextId++;
  return new Promise<T>((resolve, reject) => {
    channels[role].pending.set(id, {
      resolve: resolve as (value: never) => void,
      reject,
      request,
      attempts: 1,
    });
    active.postMessage({ ...request, id } as WorkerRequest);
  });
}

/**
 * Send. Recovery from a death happens in `handleDeath`, which re-posts the
 * work onto a fresh worker rather than failing it — so by the time a
 * `WorkerLost` reaches here it has already been retried and is final.
 */
function send<T>(request: WorkerRequestBody): Promise<T> {
  return post<T>(request);
}

/** Decode and resize — fast, and the only step the crop screen waits on. */
export function prepPhotoAsync(file: Blob): Promise<PreparedPhoto> {
  return send<PreparedPhoto>({ kind: 'prep', file });
}

/** The ~9.5s model pass. Start it, don't await it on any path a person is watching. */
export function segmentPhotoAsync(base: Blob, options: AnalyzeOptions): Promise<PhotoSegmentation> {
  return send<PhotoSegmentation>({ kind: 'segment', base, options });
}

/** `source` is the full-resolution photo, not the working copy — see `finishPhoto`. */
export function finishPhotoAsync(
  source: Blob,
  crop: CropRect,
  cutout: Blob | null = null,
): Promise<ImportedPhoto> {
  return send<ImportedPhoto>({ kind: 'finish', source, crop, cutout });
}
