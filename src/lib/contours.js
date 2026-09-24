/**
 * Marching Squares Contour Extraction & Ramer–Douglas–Peucker (RDP) Simplification
 * Generates smooth hyperbolic Lines of Position (LOP) from 2D TDOA scalar fields.
 */

// Edge indices: 0=bottom (v00-v10), 1=right (v10-v11), 2=top (v11-v01), 3=left (v01-v00)
const EDGE_PAIRS_BY_CASE = {
  1: [[0, 3]],
  2: [[0, 1]],
  3: [[1, 3]],
  4: [[1, 2]],
  5: [
    [0, 1],
    [2, 3],
  ], // Ambiguous saddle
  6: [[0, 2]],
  7: [[2, 3]],
  8: [[2, 3]],
  9: [[0, 2]],
  10: [
    [0, 3],
    [1, 2],
  ], // Ambiguous saddle
  11: [[1, 2]],
  12: [[1, 3]],
  13: [[0, 1]],
  14: [[0, 3]],
};

/**
 * Linearly interpolates coordinate between two points where scalar value crosses target level.
 */
function interp(x1, y1, v1, x2, y2, v2, level) {
  const denom = v2 - v1;
  const t = Math.abs(denom) < 1e-12 ? 0.5 : (level - v1) / denom;
  return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
}

/**
 * Ramer–Douglas–Peucker polyline simplification.
 * Reduces vertex count of contours while preserving geometric fidelity within epsilon tolerance.
 *
 * @param {Array<[number, number]>} points - Array of [x, y] coordinates
 * @param {number} epsilon - Maximum allowed perpendicular distance error in meters
 * @returns {Array<[number, number]>} Simplified points array
 */
export function simplifyRDP(points, epsilon) {
  if (!points || points.length < 3) return points ? points.slice() : [];
  if (!epsilon || epsilon <= 0) return points.slice();

  function perpDistance(pt, a, b) {
    const x = pt[0],
      y = pt[1];
    const x1 = a[0],
      y1 = a[1];
    const x2 = b[0],
      y2 = b[1];
    const dx = x2 - x1;
    const dy = y2 - y1;
    if (dx === 0 && dy === 0) return Math.hypot(x - x1, y - y1);
    const t = ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy);
    const px = x1 + t * dx;
    const py = y1 + t * dy;
    return Math.hypot(x - px, y - py);
  }

  const stack = [[0, points.length - 1]];
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  while (stack.length) {
    const [first, last] = stack.pop();
    if (last <= first + 1) continue;
    let maxDist = -1;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const d = perpDistance(points[i], points[first], points[last]);
      if (d > maxDist) {
        maxDist = d;
        index = i;
      }
    }
    if (maxDist > epsilon) {
      keep[index] = 1;
      stack.push([first, index]);
      stack.push([index, last]);
    }
  }

  const out = [];
  for (let i = 0; i < points.length; i++) {
    if (keep[i]) out.push(points[i]);
  }
  return out;
}

/**
 * Extracts contour polylines from a 2D Float32Array grid using Marching Squares.
 *
 * @param {Float32Array} grid - 1D array representing regular 2D scalar field
 * @param {number} nx - Columns count
 * @param {number} ny - Rows count
 * @param {{minX: number, minY: number, maxX: number, maxY: number}} bounds - Physical coordinates extent
 * @param {number[]} levelsArr - Array of isocontour values to extract
 * @returns {Array<{level: number, points: Array<[number, number]>}>} Extracted polylines
 */
export function extractContoursFromGrid(grid, nx, ny, bounds, levelsArr) {
  const contoursOut = [];
  const cellDx = (bounds.maxX - bounds.minX) / (nx - 1);
  const cellDy = (bounds.maxY - bounds.minY) / (ny - 1);
  const quant = Math.max(cellDx, cellDy) * 0.25;

  const getVal = (i, j) => grid[j * nx + i];

  for (const level of levelsArr) {
    const segments = [];

    // Process all cells in the grid
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

        let pairs = EDGE_PAIRS_BY_CASE[caseIdx];
        if (!pairs) continue;

        // Disambiguate saddle cases using cell center average
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

    // Join line segments into continuous polylines
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

    // Connect open polylines first (degree == 1)
    for (const [, candidates] of endpointMap) {
      if (candidates.length === 1) {
        const [segIdx, side] = candidates[0];
        if (!used[segIdx]) {
          const poly = walkPolyline(segIdx, side);
          if (poly.length > 1) {
            contoursOut.push({ level, points: poly });
          }
        }
      }
    }

    // Connect remaining closed loops
    for (let si = 0; si < segments.length; si++) {
      if (!used[si]) {
        const poly = walkPolyline(si, 0);
        if (poly.length > 1) {
          contoursOut.push({ level, points: poly });
        }
      }
    }
  }

  return contoursOut;
}
