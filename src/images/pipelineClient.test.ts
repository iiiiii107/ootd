import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The worker's death and recovery, which is the failure the app actually hit:
 * a phone reclaiming memory from the ~40MB model killed the worker, and the
 * dead instance stayed cached — so every photo after the first hung on a
 * promise that could never settle.
 */

interface FakeWorker {
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: (() => void) | null;
  onmessageerror: (() => void) | null;
  postMessage: (request: { id: number; kind: string }) => void;
  terminate: () => void;
}

let built: FakeWorker[] = [];
/** How many more times a newly-posted message should kill its worker. */
let deathsToStage = 0;

beforeEach(() => {
  built = [];
  deathsToStage = 0;
  vi.resetModules();

  vi.stubGlobal(
    'Worker',
    class {
      onmessage: FakeWorker['onmessage'] = null;
      onerror: FakeWorker['onerror'] = null;
      onmessageerror: FakeWorker['onmessageerror'] = null;
      terminated = false;

      constructor() {
        built.push(this as unknown as FakeWorker);
      }

      postMessage(request: { id: number; kind: string }) {
        queueMicrotask(() => {
          // A worker that has died stays dead and answers nothing ever again.
          // Modelling that is the whole point: the bug was not the failure, it
          // was that the corpse stayed cached and every later photo waited on
          // a reply that was never coming.
          if (this.terminated) return;
          if (deathsToStage > 0) {
            deathsToStage--;
            this.terminated = true;
            this.onerror?.();
            return;
          }
          this.onmessage?.({ data: { id: request.id, ok: true, result: `did ${request.kind}` } });
        });
      }

      terminate() {
        this.terminated = true;
      }
    },
  );
});

describe('the photo worker', () => {
  it('reuses one worker across requests', async () => {
    const { prepPhotoAsync } = await import('./pipelineClient');
    await prepPhotoAsync(new Blob());
    await prepPhotoAsync(new Blob());
    expect(built).toHaveLength(1);
  });

  it('rebuilds after a death and completes the request anyway', async () => {
    // The bug: the dead worker stayed cached, so this second request went to a
    // corpse and its promise never settled at all.
    const { prepPhotoAsync } = await import('./pipelineClient');
    deathsToStage = 1;
    await expect(prepPhotoAsync(new Blob())).resolves.toBe('did prep');
    expect(built).toHaveLength(2);
  });

  it('leaves later photos working after an earlier one died', async () => {
    const { prepPhotoAsync } = await import('./pipelineClient');
    deathsToStage = 1;
    await prepPhotoAsync(new Blob());
    await expect(prepPhotoAsync(new Blob())).resolves.toBe('did prep');
  });

  it('gives up on the model once the device has proved it cannot hold it', async () => {
    // Retrying forever would cost a crash per photo and still produce nothing.
    const { segmentPhotoAsync, modelUnavailable } = await import('./pipelineClient');
    expect(modelUnavailable()).toBe(false);

    for (let i = 0; i < 3; i++) {
      deathsToStage = 2; // dies on the attempt *and* on the retry
      await segmentPhotoAsync(new Blob(), { detect: true, cutout: true }).catch(() => undefined);
    }

    expect(modelUnavailable()).toBe(true);
  });

  it('runs the model on a separate worker from the fast work', async () => {
    // The bug this prevents: a worker handles one message at a time, so with a
    // single worker a save queued behind ~9.5s of segmentation. Measured at
    // 15ms idle and 7467ms with the model running.
    const { prepPhotoAsync, segmentPhotoAsync } = await import('./pipelineClient');
    await prepPhotoAsync(new Blob());
    expect(built).toHaveLength(1);

    await segmentPhotoAsync(new Blob(), { detect: true, cutout: true });
    expect(built).toHaveLength(2);

    // And each keeps using its own from then on.
    await prepPhotoAsync(new Blob());
    await segmentPhotoAsync(new Blob(), { detect: true, cutout: true });
    expect(built).toHaveLength(2);
  });

  it('keeps the fast worker alive when the model worker dies', async () => {
    // A phone reclaiming memory kills the model worker, which holds tens of
    // megabytes. Importing must carry on regardless — without cutouts.
    const { prepPhotoAsync, segmentPhotoAsync } = await import('./pipelineClient');
    await prepPhotoAsync(new Blob());

    deathsToStage = 2;
    await segmentPhotoAsync(new Blob(), { detect: true, cutout: true }).catch(() => undefined);

    await expect(prepPhotoAsync(new Blob())).resolves.toBe('did prep');
  });

  it('treats a load failure the same as a death', async () => {
    // A module worker that fails to load reports through onmessageerror, which
    // used to be unhandled — leaving the promise pending forever.
    const { prepPhotoAsync } = await import('./pipelineClient');
    const promise = prepPhotoAsync(new Blob());
    queueMicrotask(() => built[0].onmessageerror?.());
    await expect(promise).resolves.toBe('did prep');
  });
});
