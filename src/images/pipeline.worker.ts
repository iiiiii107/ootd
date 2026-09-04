/// <reference lib="webworker" />

import type { CropRect } from './crop';
import { finishPhoto, prepPhoto, segmentPhoto, type AnalyzeOptions } from './pipeline';

/**
 * The photo pipeline, off the main thread.
 *
 * Segmentation is ~9s per photo and no backend changes that — WebGPU measured
 * within a second of the CPU path. Run on the main thread it freezes the app
 * for the whole import, which is what made the page stop painting halfway
 * through a batch. Nothing here touches the DOM: every step is
 * `createImageBitmap` and `OffscreenCanvas`, both of which a worker has.
 *
 * The three messages exist separately because only one of them is slow.
 * `prep` is ~60ms and the crop step waits for it; `segment` is ~9.5s and
 * nothing waits for it at all — the garment is saved from the plain photo and
 * the cutout is applied whenever it lands (src/screens/Add.tsx). Bundling
 * them together, as one `analyze`, is what made importing a single garment
 * take ten seconds.
 */

/** Split from the id so callers can build a body without `Omit`, which doesn't distribute over a union. */
export type WorkerRequestBody =
  | { kind: 'prep'; file: Blob }
  | { kind: 'segment'; base: Blob; options: AnalyzeOptions }
  | { kind: 'finish'; source: Blob; crop: CropRect; cutout: Blob | null };

export type WorkerRequest = WorkerRequestBody & { id: number };

export type WorkerResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string };

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;
  try {
    const result =
      message.kind === 'prep'
        ? await prepPhoto(message.file)
        : message.kind === 'segment'
          ? await segmentPhoto(message.base, message.options)
          : await finishPhoto(message.source, message.crop, message.cutout);
    scope.postMessage({ id: message.id, ok: true, result } satisfies WorkerResponse);
  } catch (error) {
    scope.postMessage({
      id: message.id,
      ok: false,
      error: error instanceof Error ? error.message : 'Could not process this photo.',
    } satisfies WorkerResponse);
  }
};
