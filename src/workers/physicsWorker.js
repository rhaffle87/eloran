console.log('>>> physicsWorker.js SCRIPT EXECUTING! <<<');
/**
 * SIMULORAN — Unified Physics Web Worker (physicsWorker.js)
 *
 * High-performance off-thread compute engine for:
 * 1. 2D Hyperbolic TDOA Grids & Marching Squares LOP Contours.
 * 2. High-Resolution GDOP (Geometric Dilution of Precision) Grids & Iso-GDOP Contours
 *    (1.5 Optimal, 3.0 Good, 7.7 Marginal, 10.92 USCG Operational Limit).
 * 3. Additional Secondary Factor (ASF) Millington mixed-path & groundwave phase delay rasters.
 * 4. Sandboxed mathematical expression evaluation for custom terrain formulas.
 *
 * All grid rasters are transferred via zero-copy ArrayBuffers.
 */

import { compileAsfExpression } from '../lib/asf.js';
import { computeGDOPGrid } from '../lib/gdop.js';

const SPEED_OF_LIGHT = 299792458; // m/s in vacuum (BIPM)

// Marching squares edge lookup table (cases 1..14)
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

/**
 * Universal 2D Marching Squares contour extractor.
 * Converts regular scalar grids into continuous vector polylines.
 */
function extractContours(grid, nx, ny, bounds, levels, minPoints = 2) {
  const contours = [];
  const cellDx = (bounds.maxX - bounds.minX) / (nx - 1);
  const cellDy = (bounds.maxY - bounds.minY) / (ny - 1);
  const quant = Math.max(cellDx, cellDy) * 0.25;

  const getVal = (i, j) => grid[j * nx + i];

  for (let li = 0; li < levels.length; li++) {
    const level = levels[li];
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
          if (poly.length >= minPoints) {
            contours.push({ level, levelSeconds: level / SPEED_OF_LIGHT, points: poly });
          }
        }
      }
    }

    for (let si = 0; si < segments.length; si++) {
      if (!used[si]) {
        const poly = walkPolyline(si, 0);
        if (poly.length >= minPoints) {
          contours.push({ level, levelSeconds: level / SPEED_OF_LIGHT, points: poly });
        }
      }
    }
  }

  return contours;
}

function haversineMeters(p1, p2) {
  const R = 6371000.0;
  const dLat = (p2.lat - p1.lat) * (Math.PI / 180.0);
  const dLng = (p2.lng - p1.lng) * (Math.PI / 180.0);
  const lat1 = p1.lat * (Math.PI / 180.0);
  const lat2 = p2.lat * (Math.PI / 180.0);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2.0 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1.0 - a)));
}

function computeSurfaceImpedance(freqMhz, sigma, epslon = 15.0) {
  const f = Math.max(1e-6, freqMhz);
  const sig = Math.max(1e-6, sigma);
  const eps = Math.max(1.0, epslon);

  const nr = eps;
  const ni = -1.8e4 * sig / f;
  const zr = eps - 1.0;
  const zi = ni;

  const magZ = Math.hypot(zr, zi);
  const angZ = Math.atan2(zi, zr);
  const sqrtMag = Math.sqrt(magZ);
  const sqrtAng = angZ / 2.0;
  const topR = sqrtMag * Math.cos(sqrtAng);
  const topI = sqrtMag * Math.sin(sqrtAng);

  const denom = nr * nr + ni * ni;
  const etaR = (topR * nr + topI * ni) / denom;
  const etaI = (topI * nr - topR * ni) / denom;

  const etaMag = Math.hypot(etaR, etaI);
  const phaseEta = Math.atan2(etaI, etaR);
  const lossAngleDeg = (2.0 * phaseEta * 180.0) / Math.PI;

  return { etaMag, lossAngleDeg };
}

function computeGroundwavePhaseProfile(distKm, freqMhz = 0.1, sigma = 5.0, epslon = 15.0) {
  if (distKm <= 0) return { timingDelayUs: 0 };
  const imp = computeSurfaceImpedance(freqMhz, sigma, epslon);
  const wavelengthKm = (SPEED_OF_LIGHT / (freqMhz * 1e6)) / 1000.0;
  const p = (Math.PI * distKm / wavelengthKm) * (imp.etaMag * imp.etaMag);
  const bRad = (imp.lossAngleDeg * Math.PI) / 180.0;

  const phaseLagRad = Math.atan(Math.sqrt(p) * Math.cos(bRad / 2.0)) + (p / (2.0 + p)) * Math.sin(bRad / 2.0);
  const omegaUs = 2.0 * Math.PI * freqMhz;
  return { timingDelayUs: phaseLagRad / omegaUs };
}

function computeHomogeneousAsfMicroseconds(distKm, sigma, epslon = 15.0, freqMhz = 0.1) {
  if (distKm <= 0 || sigma >= 5.0) return 0;
  const ground = computeGroundwavePhaseProfile(distKm, freqMhz, sigma, epslon);
  const sea = computeGroundwavePhaseProfile(distKm, freqMhz, 5.0, 70.0);
  return Math.max(0, ground.timingDelayUs - sea.timingDelayUs);
}

// ─────────────────────────────────────────────────────────────────────────────
// WORKER MESSAGE DISPATCHER
// ─────────────────────────────────────────────────────────────────────────────

self.onmessage = function (e) {
  console.log(">>> physicsWorker RECEIVED MSG:", e.data?.type, "jobId:", e.data?.jobId);
  const msg = e.data;
  if (!msg) return;

  if (msg.type === 'cancel') {
    if (!msg.jobId || msg.jobId === currentJobId) {
      isCancelled = true;
    }
    return;
  }

  // 1. HIGH-RESOLUTION GDOP GRID & ISO-GDOP CONTOURS
  if (msg.type === 'computeGdop') {
    const { jobId, payload } = msg;
    currentJobId = jobId;
    isCancelled = false;

    try {
      const {
        master,
        secondaries = [],
        bbox,
        nx = 80,
        ny = 80,
        contourLevels = [1.5, 3.0, 7.7, 10.92],
        includeHeatmap = true,
        excludeIds = [],
      } = payload;

      const grid = computeGDOPGrid(master, secondaries, bbox, nx, ny, excludeIds);
      if (isCancelled) {
        self.postMessage({ type: 'cancelled', jobId });
        return;
      }

      // Extract vector contours
      const bounds = { minX: bbox.minLng, maxX: bbox.maxLng, minY: bbox.minLat, maxY: bbox.maxLat };
      const rawContours = extractContours(grid.data, nx, ny, bounds, contourLevels, 3);

      const contourFeatures = rawContours.map((c, idx) => {
        let label = `GDOP ${c.level}`;
        let category = 'good';
        let color = '#3b82f6';
        let dash = [];

        if (c.level <= 1.5) {
          label = 'GDOP 1.5 (Optimal Fix)';
          category = 'optimal';
          color = '#10b981';
        } else if (c.level <= 3.0) {
          label = 'GDOP 3.0 (Good)';
          category = 'good';
          color = '#38bdf8';
        } else if (c.level <= 7.7) {
          label = 'GDOP 7.7 (Marginal)';
          category = 'marginal';
          color = '#f59e0b';
        } else {
          label = 'GDOP 10.92 (USCG Limit)';
          category = 'limit';
          color = '#ef4444';
          dash = [4, 2];
        }

        return {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: c.points,
          },
          properties: {
            id: `iso-gdop-${c.level}-${idx}`,
            level: c.level,
            label,
            category,
            color,
            dash,
          },
        };
      });

      const contoursGeoJson = {
        type: 'FeatureCollection',
        features: contourFeatures,
      };

      // Optional Point features for MapLibre heatmap
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

      self.postMessage(
        {
          type: 'result',
          jobId,
          payload: {
            contoursGeoJson,
            heatmapGeoJson,
            buffer: grid.buffer,
            nx,
            ny,
            minVal: grid.minVal,
            maxVal: grid.maxVal,
            bbox,
          },
        },
        [grid.buffer]
      );
    } catch (err) {
      self.postMessage({
        type: 'error',
        jobId,
        payload: { message: err?.message || String(err) },
      });
    }
    return;
  }

  // 2. 2D TDOA GRID & MARCHING SQUARES LOP CONTOURS
  if (msg.type === 'computeGrid') {
    const { jobId, payload } = msg;
    try {
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
        const _pairConstSec = sClockOffset + sOffset - (mClockOffset + mOffset);

        const mDiff = m.diffCorrections?.enabled ? m.diffCorrections.avgMeters || 0 : 0;
        const sDiff = s.diffCorrections?.enabled ? s.diffCorrections.avgMeters || 0 : 0;
        const diffCorrectionMeters = sDiff - mDiff;

        const mAsf = m.asfCorrectionUs || 0;
        const sAsf = s.asfCorrectionUs || 0;
        const stationAsfDiffUs = sAsf - mAsf;

        const asfArray = asfArrays[si] || null;

        for (let j = 0; j < ny; j++) {
          const y = gridBounds.minY + j * dy;
          for (let i = 0; i < nx; i++) {
            const x = gridBounds.minX + i * dx;
            const distM = Math.hypot(x - m.x, y - m.y);
            const distS = Math.hypot(x - s.x, y - s.y);

            let asfUs = stationAsfDiffUs;
            if (asfArray) {
              asfUs += asfArray[j * nx + i] || 0;
            }

            const geomDiffMeters = distS - distM;
            const asfMeters = (asfUs * 1e-6) * SPEED_OF_LIGHT;

            // Geometric hyperbolic range difference (meters) consistent with levelsMeters
            const tdoaMeters = geomDiffMeters + diffCorrectionMeters + asfMeters;
            grid[j * nx + i] = tdoaMeters;
          }
        }

                const contours = extractContours(grid, nx, ny, gridBounds, levels, 2);
                for (const c of contours) {
          allContours.push({
            masterIndex: mi,
            slaveIndex: si,
            levelMeters: c.level,
            levelSeconds: c.levelSeconds,
            points: c.points,
          });
        }

        maps.push({
          masterIndex: mi,
          slaveIndex: si,
          buffer: grid.buffer,
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
          nx,
          ny,
          gridBounds,
        },
      },
      transferBuffers
    );
    return;
    } catch (err) {
      console.error('>>> physicsWorker computeGrid FATAL ERROR:', err);
      self.postMessage({ type: 'error', jobId, payload: { message: err?.message || String(err) } });
    }
  }

  // 3. ASF RASTER GRID
  if (msg.type === 'asfGrid') {
    const { jobId, payload } = msg;
    currentJobId = jobId;
    isCancelled = false;

    const {
      bounds,
      nx = 40,
      ny = 40,
      master = { lat: 0, lng: 0 },
      _mode = 'us',
      landSigma = 0.003,
      landEpslon = 15.0,
      fallbackLandFraction = 0.5,
    } = payload;

    const grid = new Float32Array(nx * ny);
    const dLng = (bounds.maxLng - bounds.minLng) / (nx - 1);
    const dLat = (bounds.maxLat - bounds.minLat) / (ny - 1);

    let idx = 0;
    let minVal = Infinity;
    let maxVal = -Infinity;

    for (let j = 0; j < ny; j++) {
      if (isCancelled) break;
      const lat = bounds.minLat + j * dLat;
      for (let i = 0; i < nx; i++, idx++) {
        const lng = bounds.minLng + i * dLng;
        const distKm = haversineMeters(master, { lat, lng }) / 1000.0;

        const effectiveLandDist = distKm * fallbackLandFraction;
        const val = computeHomogeneousAsfMicroseconds(effectiveLandDist, landSigma, landEpslon);

        grid[idx] = val;
        if (val < minVal) minVal = val;
        if (val > maxVal) maxVal = val;
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
          buffer: grid.buffer,
          nx,
          ny,
          minVal: Number.isFinite(minVal) ? minVal : 0,
          maxVal: Number.isFinite(maxVal) ? maxVal : 1,
        },
      },
      [grid.buffer]
    );
    return;
  }

  // 4. FORMULA BATCH SAMPLING
  if (msg.type === 'sampleBatch') {
    const { jobId, payload } = msg;
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
    return;
  }
};
