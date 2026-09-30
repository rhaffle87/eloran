/**
 * Typed client wrapper for Grid and ASF Web Workers
 * Provides Promise-based APIs with job cancellation support.
 */

let gridWorkerInstance = null;
let currentGridJobId = 0;
let pendingGridResolve = null;
let pendingGridReject = null;

let currentAsfJobId = 1000000;
let pendingAsfResolve = null;
let pendingAsfReject = null;

export function getGridWorker() {
  if (!gridWorkerInstance) {
    gridWorkerInstance = new Worker(new URL('./gridWorker.js', import.meta.url), { type: 'module' });
    gridWorkerInstance.onmessage = (e) => {
      const msg = e.data;
      if (!msg) return;

      if (msg.type === 'result') {
        if (msg.jobId === currentGridJobId && pendingGridResolve) {
          pendingGridResolve(msg.payload);
          pendingGridResolve = null;
          pendingGridReject = null;
        } else if (msg.jobId === currentAsfJobId && pendingAsfResolve) {
          pendingAsfResolve(msg.payload);
          pendingAsfResolve = null;
          pendingAsfReject = null;
        }
      } else if (msg.type === 'cancelled') {
        if (msg.jobId === currentGridJobId && pendingGridReject) {
          pendingGridReject(new Error('Job cancelled'));
          pendingGridResolve = null;
          pendingGridReject = null;
        } else if (msg.jobId === currentAsfJobId && pendingAsfReject) {
          pendingAsfReject(new Error('ASF job cancelled'));
          pendingAsfResolve = null;
          pendingAsfReject = null;
        }
      }
    };
    gridWorkerInstance.onerror = (err) => {
      if (pendingGridReject) {
        pendingGridReject(err);
        pendingGridResolve = null;
        pendingGridReject = null;
      }
      if (pendingAsfReject) {
        pendingAsfReject(err);
        pendingAsfResolve = null;
        pendingAsfReject = null;
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
 * Computes 2D ASF or groundwave attenuation grid in background worker.
 * Cancels any prior pending ASF request.
 */
export function computeAsfGridAsync(payload) {
  const worker = getGridWorker();

  if (pendingAsfReject) {
    worker.postMessage({ type: 'cancel', jobId: currentAsfJobId });
    pendingAsfReject(new Error('ASF job cancelled by newer request'));
  }

  currentAsfJobId++;
  const jobId = currentAsfJobId;

  return new Promise((resolve, reject) => {
    pendingAsfResolve = resolve;
    pendingAsfReject = reject;

    worker.postMessage({ type: 'asfGrid', jobId, payload });
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
