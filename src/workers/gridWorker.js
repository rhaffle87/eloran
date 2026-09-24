/**
 * Off-thread Web Worker for heavy 2D TDOA Grid & Marching Squares Contour Extraction
 * Supports job cancellation, transferable Float32Array buffers, and per-station raster adjustments.
 */

const SPEED_OF_LIGHT = 299792458; // m/s

// Edge pairs for marching squares case table (1..14)
const EDGE_PAIRS = {
  1: [[0, 3]],
  2: [[0, 1]],
  3: [[1, 3]],
  4: [[1, 2]],
  5: [
    [0, 1],
    [2, 3],
  ],
  6: [[0, 2]],
  7: [[2, 3]],
  8: [[2, 3]],
  9: [[0, 2]],
  10: [
    [0, 3],
    [1, 2],
  ],
  11: [[1, 2]],
  12: [[1, 3]],
  13: [[0, 1]],
  14: [[0, 3]],
};

let currentJobId = null;
let isCancelled = false;

function interp(x1, y1, v1, x2, y2, v2, level) {
  const denom = v2 - v1;
  const t = Math.abs(denom) < 1e-12 ? 0.5 : (level - v1) / denom;
  return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
}

function extractContours(grid, nx, ny, bounds, levels) {
  const contours = [];
  const cellDx = (bounds.maxX - bounds.minX) / (nx - 1);
  const cellDy = (bounds.maxY - bounds.minY) / (ny - 1);
  const quant = Math.max(cellDx, cellDy) * 0.25;

  const getVal = (i, j) => grid[j * nx + i];

  for (const level of levels) {
    if (isCancelled) break;
    const segments = [];

    for (let j = 0; j < ny - 1; j++) {
      const y0 = bounds.minY + j * cellDy;
      const y1 = bounds.minY + (j + 1) * cellDy;
      for (let i = 0; i < nx - 1; i++) {
        const x0 = bounds.minX + i * cellDx;
        const x1 = bounds.minX + (i + 1) * cellDx;

        const v00 = getVal(i, j);
        const v10 = getVal(i + 1, j);
        const v11 = getVal(i + 1, j + 1);
        const v01 = getVal(i, j + 1);

        let caseIdx = 0;
        if (v00 >= level) caseIdx |= 1;
        if (v10 >= level) caseIdx |= 2;
        if (v11 >= level) caseIdx |= 4;
        if (v01 >= level) caseIdx |= 8;

        if (caseIdx === 0 || caseIdx === 15) continue;

        let pairs = EDGE_PAIRS[caseIdx];
        if (!pairs) continue;

        if ((caseIdx === 5 || caseIdx === 10) && pairs.length === 2) {
          const center = (v00 + v10 + v11 + v01) * 0.25;
          if (center >= level) {
            pairs = caseIdx === 5 ? [[0, 1]] : [[0, 3]];
          } else {
            pairs = caseIdx === 5 ? [[2, 3]] : [[1, 2]];
          }
        }

        const edgeCache = new Array(4);
        function getEdge(e) {
          if (edgeCache[e]) return edgeCache[e];
          switch (e) {
            case 0:
              return (edgeCache[0] = interp(x0, y0, v00, x1, y0, v10, level));
            case 1:
              return (edgeCache[1] = interp(x1, y0, v10, x1, y1, v11, level));
            case 2:
              return (edgeCache[2] = interp(x1, y1, v11, x0, y1, v01, level));
            case 3:
              return (edgeCache[3] = interp(x0, y1, v01, x0, y0, v00, level));
          }
        }

        for (const [eA, eB] of pairs) {
          const pA = getEdge(eA);
          const pB = getEdge(eB);
          segments.push([pA[0], pA[1], pB[0], pB[1]]);
        }
      }
    }

    if (segments.length === 0) continue;

    // Join segments into continuous polylines
    const endpointMap = new Map();
    const keyFor = (x, y) => `${Math.round(x / quant)}:${Math.round(y / quant)}`;

    for (let si = 0; si < segments.length; si++) {
      const s = segments[si];
      const k1 = keyFor(s[0], s[1]);
      const k2 = keyFor(s[2], s[3]);
      if (!endpointMap.has(k1)) endpointMap.set(k1, []);
      endpointMap.get(k1).push([si, 0]);
      if (!endpointMap.has(k2)) endpointMap.set(k2, []);
      endpointMap.get(k2).push([si, 1]);
    }

    const used = new Uint8Array(segments.length);

    function walkPolyline(startSegIdx, fromSide) {
      const poly = [];
      let curSeg = startSegIdx;
      let curSide = fromSide;
      const s = segments[curSeg];
      poly.push(curSide === 0 ? [s[0], s[1]] : [s[2], s[3]]);

      while (curSeg !== null && !used[curSeg]) {
        used[curSeg] = 1;
        const cur = segments[curSeg];
        const nextPt = curSide === 0 ? [cur[2], cur[3]] : [cur[0], cur[1]];
        poly.push(nextPt);

        const k = keyFor(nextPt[0], nextPt[1]);
        const candidates = endpointMap.get(k) || [];
        let next = null;
        for (const [candIdx, candSide] of candidates) {
          if (candIdx === curSeg) continue;
          if (!used[candIdx]) {
            next = [candIdx, candSide];
            break;
          }
        }
        if (!next) {
          break;
        } else {
          curSeg = next[0];
          curSide = next[1];
        }
      }
      return poly;
    }

    for (const [, candidates] of endpointMap) {
      if (candidates.length === 1) {
        const [segIdx, side] = candidates[0];
        if (!used[segIdx]) {
          const poly = walkPolyline(segIdx, side);
          if (poly.length > 1) {
            contours.push({ level, levelSeconds: level / SPEED_OF_LIGHT, points: poly });
          }
        }
      }
    }

    for (let si = 0; si < segments.length; si++) {
      if (!used[si]) {
        const poly = walkPolyline(si, 0);
        if (poly.length > 1) {
          contours.push({ level, levelSeconds: level / SPEED_OF_LIGHT, points: poly });
        }
      }
    }
  }

  return contours;
}

self.onmessage = function (e) {
  const msg = e.data;
  if (!msg) return;

  if (msg.type === 'cancel') {
    if (!msg.jobId || msg.jobId === currentJobId) {
      isCancelled = true;
    }
    return;
  }

  if (msg.type === 'computeGrid') {
    const { jobId, payload } = msg;
    currentJobId = jobId;
    isCancelled = false;

    const {
      masters = [],
      slaves = [],
      gridBounds,
      nx = 200,
      ny = 200,
      simTimeSec = 0,
      asfRasters = [],
      levelsMeters,
    } = payload;

    const dx = (gridBounds.maxX - gridBounds.minX) / (nx - 1);
    const dy = (gridBounds.maxY - gridBounds.minY) / (ny - 1);

    const levels =
      Array.isArray(levelsMeters) && levelsMeters.length
        ? levelsMeters
        : [0];

    const maps = [];
    const allContours = [];
    const transferBuffers = [];

    const asfArrays = Array.isArray(asfRasters)
      ? asfRasters.map((b) => (b ? new Float32Array(b) : null))
      : [];

    for (let mi = 0; mi < masters.length; mi++) {
      if (isCancelled) break;
      const m = masters[mi];

      for (let si = 0; si < slaves.length; si++) {
        if (isCancelled) break;
        const s = slaves[si];

        const grid = new Float32Array(nx * ny);

        const mClockOffset = (m.clock?.biasSec || 0) + (m.clock?.driftPerSec || 0) * simTimeSec;
        const sClockOffset = (s.clock?.biasSec || 0) + (s.clock?.driftPerSec || 0) * simTimeSec;
        const mOffset = m.offsetSec || 0;
        const sOffset = s.offsetSec || 0;
        const pairConstSec = sClockOffset + sOffset - (mClockOffset + mOffset);

        const mDiff = m.diffCorrections?.enabled ? m.diffCorrections.avgMeters || 0 : 0;
        const sDiff = s.diffCorrections?.enabled ? s.diffCorrections.avgMeters || 0 : 0;

        let idx = 0;
        for (let j = 0; j < ny; j++) {
          const y = gridBounds.minY + j * dy;
          for (let i = 0; i < nx; i++, idx++) {
            const x = gridBounds.minX + i * dx;

            const distM = Math.hypot(m.x - x, m.y - y);
            const distS = Math.hypot(s.x - x, s.y - y);

            const asfM = asfArrays[mi] ? asfArrays[mi][idx] || 0 : m.asfMeters || 0;
            const asfS = s.asfMeters || 0;

            const arrM = distM / SPEED_OF_LIGHT + (asfM - mDiff) / SPEED_OF_LIGHT;
            const arrS = distS / SPEED_OF_LIGHT + (asfS - sDiff) / SPEED_OF_LIGHT;

            // TDOA in seconds, with geometric distance difference in meters: (arrS - arrM) * c
            const tdoaSec = arrS - arrM - pairConstSec;
            grid[idx] = tdoaSec * SPEED_OF_LIGHT; // store in meters
          }
        }

        if (isCancelled) break;

        const contours = extractContours(grid, nx, ny, gridBounds, levels);
        contours.forEach((c) => {
          allContours.push({
            masterIndex: mi,
            slaveIndex: si,
            levelMeters: c.level,
            levelSeconds: c.levelSeconds,
            points: c.points,
          });
        });

        maps.push({
          masterIndex: mi,
          slaveIndex: si,
          nx,
          ny,
          gridBuffer: grid.buffer,
        });
        transferBuffers.push(grid.buffer);
      }
    }

    if (isCancelled) {
      self.postMessage({ type: 'cancelled', jobId });
      return;
    }

    self.postMessage(
      {
        type: 'result',
        jobId,
        payload: {
          maps,
          contours: allContours,
          gridBounds,
        },
      },
      transferBuffers
    );
  }
};
