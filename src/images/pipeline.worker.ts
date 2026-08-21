/// <reference lib="webworker" />

import type { CropRect } from './crop';
import { analyzePhoto, finishPhoto, type AnalyzeOptions, type PhotoAnalysis } from './pipeline';

/**
 * The photo pipeline, off the main thread.
 *
 * Segmentation is ~9s per photo and no backend changes that — WebGPU measured
 * within a second of the CPU path. Run on the main thread it freezes the app
 * for the whole import, which is what made the page stop painting halfway
 * through a batch. Nothing here touches the DOM: every step is
 * `createImageBitmap` and `OffscreenCanvas`, both of which a worker has.
 *
 * Being off the main thread is also what makes lookahead safe — the Add
 * screen analyses the next photo while you crop the current one, which is
 * where most of the waiting actually disappears.
 */

/** Split from the id so callers can build a body without `Omit`, which doesn't distribute over a union. */
export type WorkerRequestBody =
  | { kind: 'analyze'; file: Blob; options: AnalyzeOptions }
  | { kind: 'finish'; analysis: PhotoAnalysis; crop: CropRect };

export type WorkerRequest = WorkerRequestBody & { id: number };

export type WorkerResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string };

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;
  try {
    const result =
      message.kind === 'analyze'
        ? await analyzePhoto(message.file, message.options)
        : await finishPhoto(message.analysis, message.crop);
    scope.postMessage({ id: message.id, ok: true, result } satisfies WorkerResponse);
  } catch (error) {
    scope.postMessage({
      id: message.id,
      ok: false,
      error: error instanceof Error ? error.message : 'Could not process this photo.',
    } satisfies WorkerResponse);
  }
};
