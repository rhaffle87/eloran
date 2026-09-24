/**
 * Typed client wrapper for Grid and ASF Web Workers
 * Provides Promise-based APIs with job cancellation support.
 */

let gridWorkerInstance = null;
let currentGridJobId = 0;
let pendingGridResolve = null;
let pendingGridReject = null;

export function getGridWorker() {
  if (!gridWorkerInstance) {
    gridWorkerInstance = new Worker(new URL('./gridWorker.js', import.meta.url), { type: 'module' });
    gridWorkerInstance.onmessage = (e) => {
      const msg = e.data;
      if (!msg) return;

      if (msg.type === 'result' && msg.jobId === currentGridJobId) {
        if (pendingGridResolve) {
          pendingGridResolve(msg.payload);
          pendingGridResolve = null;
          pendingGridReject = null;
        }
      } else if (msg.type === 'cancelled' && msg.jobId === currentGridJobId) {
        if (pendingGridReject) {
          pendingGridReject(new Error('Job cancelled'));
          pendingGridResolve = null;
          pendingGridReject = null;
        }
      }
    };
    gridWorkerInstance.onerror = (err) => {
      if (pendingGridReject) {
        pendingGridReject(err);
        pendingGridResolve = null;
        pendingGridReject = null;
      }
    };
  }
  return gridWorkerInstance;
}

/**
 * Computes 2D TDOA grid and marching squares contours in background worker.
 * Cancels any existing computation.
 */
export function computeGridAsync(payload) {
  const worker = getGridWorker();

  // Cancel prior job if active
  if (pendingGridReject) {
    worker.postMessage({ type: 'cancel', jobId: currentGridJobId });
    pendingGridReject(new Error('Job cancelled by newer request'));
  }

  currentGridJobId++;
  const jobId = currentGridJobId;

  return new Promise((resolve, reject) => {
    pendingGridResolve = resolve;
    pendingGridReject = reject;

    const transfer = [];
    if (payload.asfRasters) {
      payload.asfRasters.forEach((buf) => {
        if (buf instanceof ArrayBuffer) transfer.push(buf);
      });
    }

    worker.postMessage({ type: 'computeGrid', jobId, payload }, transfer);
  });
}

/**
 * Samples a safe ASF formula over a 2D coordinate grid using an isolated worker.
 */
export function sampleAsfRasterAsync(formula, lats, lngs, nx, ny) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./asfWorker.js', import.meta.url), { type: 'module' });
    const jobId = Math.random().toString(36).substring(7);

    const timeout = setTimeout(() => {
      worker.terminate();
      reject(new Error('ASF sampling timed out (15s limit)'));
    }, 15000);

    worker.onmessage = (e) => {
      clearTimeout(timeout);
      const msg = e.data;
      worker.terminate();
      if (msg.type === 'result' && msg.payload?.buffer) {
        resolve(new Float32Array(msg.payload.buffer));
      } else {
        reject(new Error(msg.payload?.message || 'ASF sampling failed'));
      }
    };

    worker.onerror = (err) => {
      clearTimeout(timeout);
      worker.terminate();
      reject(err);
    };

    worker.postMessage({
      type: 'sampleBatch',
      jobId,
      payload: { formula, lats, lngs, nx, ny },
    });
  });
}
