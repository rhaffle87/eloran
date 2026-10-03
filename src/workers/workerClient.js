/**
 * Typed client wrapper for Unified SIMULORAN Physics Web Worker
 * Provides Promise-based APIs with job cancellation support and Node.js test fallbacks.
 */

import { computeGDOPGrid } from '../lib/gdop.js';
import { compileAsfExpression } from '../lib/asf.js';

let physicsWorkerInstance = null;

let currentGridJobId = 0;
let pendingGridResolve = null;
let pendingGridReject = null;

let currentAsfJobId = 1000000;
let pendingAsfResolve = null;
let pendingAsfReject = null;

let currentGdopJobId = 2000000;
let pendingGdopResolve = null;
let pendingGdopReject = null;

export function getPhysicsWorker() {
  if (typeof Worker === 'undefined') {
    return null;
  }

  if (!physicsWorkerInstance) {
    physicsWorkerInstance = new Worker(new URL('./physicsWorker.js', import.meta.url), { type: 'module' });
    physicsWorkerInstance.onmessage = (e) => {
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
        } else if (msg.jobId === currentGdopJobId && pendingGdopResolve) {
          pendingGdopResolve(msg.payload);
          pendingGdopResolve = null;
          pendingGdopReject = null;
        }
      } else if (msg.type === 'cancelled') {
        if (msg.jobId === currentGridJobId && pendingGridReject) {
          pendingGridReject(new Error('Grid job cancelled'));
          pendingGridResolve = null;
          pendingGridReject = null;
        } else if (msg.jobId === currentAsfJobId && pendingAsfReject) {
          pendingAsfReject(new Error('ASF job cancelled'));
          pendingAsfResolve = null;
          pendingAsfReject = null;
        } else if (msg.jobId === currentGdopJobId && pendingGdopReject) {
          pendingGdopReject(new Error('GDOP job cancelled'));
          pendingGdopResolve = null;
          pendingGdopReject = null;
        }
      } else if (msg.type === 'error') {
        const err = new Error(msg.payload?.message || 'Worker compute error');
        if (msg.jobId === currentGridJobId && pendingGridReject) {
          pendingGridReject(err);
          pendingGridResolve = null;
          pendingGridReject = null;
        } else if (msg.jobId === currentAsfJobId && pendingAsfReject) {
          pendingAsfReject(err);
          pendingAsfResolve = null;
          pendingAsfReject = null;
        } else if (msg.jobId === currentGdopJobId && pendingGdopReject) {
          pendingGdopReject(err);
          pendingGdopResolve = null;
          pendingGdopReject = null;
        }
      }
    };

    physicsWorkerInstance.onerror = (err) => {
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
      if (pendingGdopReject) {
        pendingGdopReject(err);
        pendingGdopResolve = null;
        pendingGdopReject = null;
      }
    };
  }
  return physicsWorkerInstance;
}

// Backward compatibility alias
export function getGridWorker() {
  return getPhysicsWorker();
}

/**
 * Computes 2D GDOP Grid and Iso-GDOP Contours in background worker.
 * Falls back to synchronous calculation in Node / non-Worker test environments.
 */
export function computeGdopAsync(payload) {
  const worker = getPhysicsWorker();

  // Synchronous Node.js fallback for unit tests
  if (!worker) {
    const {
      master,
      secondaries = [],
      bbox,
      nx = 80,
      ny = 80,
      _contourLevels = [1.5, 3.0, 7.7, 10.92],
      includeHeatmap = true,
      excludeIds = [],
    } = payload;

    const grid = computeGDOPGrid(master, secondaries, bbox, nx, ny, excludeIds);
    let heatmapGeoJson = null;
    if (includeHeatmap) {
      const features = [];
      const dLng = (bbox.maxLng - bbox.minLng) / (nx - 1);
      const dLat = (bbox.maxLat - bbox.minLat) / (ny - 1);
      for (let j = 0; j < ny; j++) {
        const lat = bbox.minLat + j * dLat;
        for (let i = 0; i < nx; i++) {
          const lng = bbox.minLng + i * dLng;
          const gdop = grid.data[j * nx + i];
          if (gdop <= 15.0 && Number.isFinite(gdop)) {
            features.push({
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [lng, lat] },
              properties: { gdop },
            });
          }
        }
      }
      heatmapGeoJson = { type: 'FeatureCollection', features };
    }

    return Promise.resolve({
      contoursGeoJson: { type: 'FeatureCollection', features: [] },
      heatmapGeoJson,
      buffer: grid.buffer,
      nx,
      ny,
      minVal: grid.minVal,
      maxVal: grid.maxVal,
      bbox,
    });
  }

  // Cancel prior active GDOP request
  if (pendingGdopReject) {
    worker.postMessage({ type: 'cancel', jobId: currentGdopJobId });
    pendingGdopReject(new Error('GDOP job cancelled by newer request'));
  }

  currentGdopJobId++;
  const jobId = currentGdopJobId;

  return new Promise((resolve, reject) => {
    pendingGdopResolve = resolve;
    pendingGdopReject = reject;
    worker.postMessage({ type: 'computeGdop', jobId, payload });
  });
}

/**
 * Computes 2D TDOA grid and marching squares contours in background worker.
 * Cancels any existing computation.
 */
export function computeGridAsync(payload) {
  const worker = getPhysicsWorker();
  if (!worker) {
    return Promise.resolve({ maps: [], contours: [], nx: payload.nx || 200, ny: payload.ny || 200, gridBounds: payload.gridBounds });
  }

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
  const worker = getPhysicsWorker();
  if (!worker) {
    return Promise.resolve({ buffer: new ArrayBuffer(0), nx: payload.nx || 40, ny: payload.ny || 40, minVal: 0, maxVal: 1 });
  }

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
  try {
    const evaluator = compileAsfExpression(formula);
    const count = (nx || 0) * (ny || 0) || lats.length;
    const out = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      out[i] = evaluator(lats[i], lngs[i]);
    }
    return Promise.resolve(out);
  } catch (err) {
    return Promise.reject(err);
  }
}
