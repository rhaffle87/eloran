/**
 * Sandboxed Worker for batch ASF (Additional Secondary Factor) Rasterization
 * Evaluates whitelisted mathematical formulas across lat/lng grids without eval.
 */

import { compileAsfExpression } from '../lib/asf.js';

self.onmessage = function (e) {
  const msg = e.data;
  if (!msg) return;

  const { type, jobId, payload } = msg;

  if (type === 'sampleBatch') {
    const { formula, lats, lngs, nx, ny } = payload;
    try {
      const evaluator = compileAsfExpression(formula);

      const latArr = lats instanceof Float64Array ? lats : new Float64Array(lats);
      const lngArr = lngs instanceof Float64Array ? lngs : new Float64Array(lngs);
      const count = (nx || 0) * (ny || 0) || latArr.length;

      const out = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        out[i] = evaluator(latArr[i], lngArr[i]);
      }

      self.postMessage(
        {
          type: 'result',
          jobId,
          payload: {
            buffer: out.buffer,
            nx,
            ny,
          },
        },
        [out.buffer]
      );
    } catch (err) {
      self.postMessage({
        type: 'error',
        jobId,
        payload: { message: err?.message || String(err) },
      });
    }
  }
};
