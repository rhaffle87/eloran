/**
 * Geometric Dilution of Precision (GDOP / HDOP) Library for Hyperbolic LORAN
 * Computes dilution metrics from hyperbolic line-of-sight unit vector differentials.
 */

import { latLngToLocalXY } from './geodesy.js';

/**
 * Computes horizontal Dilution of Precision (HDOP / GDOP) at a single geographic coordinate.
 *
 * @param {{lat: number, lng: number}} receiverPoint - Point to evaluate
 * @param {object} master - Master station {lat, lng}
 * @param {Array<object>} slaves - List of slave/secondary stations [{lat, lng}]
 * @returns {{gdop: number, hdop: number, valid: boolean}} Dilution values (smaller is better; < 2 excellent, > 10 poor)
 */
export function computeGDOPAtPoint(receiverPoint, master, slaves) {
  if (!master || !slaves || slaves.length < 2 || !receiverPoint) {
    return { gdop: 99.9, hdop: 99.9, valid: false };
  }

  const refLat = receiverPoint.lat;
  const refLng = receiverPoint.lng;
  const rx = latLngToLocalXY(receiverPoint.lat, receiverPoint.lng, refLat, refLng);
  const mxy = latLngToLocalXY(master.lat, master.lng, refLat, refLng);

  const dM = Math.hypot(rx.x - mxy.x, rx.y - mxy.y);
  if (dM < 10) {
    return { gdop: 99.9, hdop: 99.9, valid: false }; // Near antenna singularity
  }

  // Unit vector from receiver pointing toward master
  const uMx = (mxy.x - rx.x) / dM;
  const uMy = (mxy.y - rx.y) / dM;

  const H = []; // Geometry matrix rows: (u_S - u_M)

  for (const s of slaves) {
    const sxy = latLngToLocalXY(s.lat, s.lng, refLat, refLng);
    const dS = Math.hypot(rx.x - sxy.x, rx.y - sxy.y);
    if (dS < 10) continue;

    // Unit vector toward slave
    const uSx = (sxy.x - rx.x) / dS;
    const uSy = (sxy.y - rx.y) / dS;

    // Line of position gradient vector
    const hx = uSx - uMx;
    const hy = uSy - uMy;
    H.push([hx, hy]);
  }

  if (H.length < 2) {
    return { gdop: 99.9, hdop: 99.9, valid: false };
  }

  // H^T * H
  let h11 = 0;
  let h12 = 0;
  let h22 = 0;
  for (let i = 0; i < H.length; i++) {
    h11 += H[i][0] * H[i][0];
    h12 += H[i][0] * H[i][1];
    h22 += H[i][1] * H[i][1];
  }

  const det = h11 * h22 - h12 * h12;
  if (det <= 1e-6) {
    return { gdop: 99.9, hdop: 99.9, valid: false }; // Collinear or ill-conditioned
  }

  const inv11 = h22 / det;
  const inv22 = h11 / det;

  const hdop = Math.sqrt(Math.max(0, inv11 + inv22));
  const gdop = hdop; // In 2D horizontal plane, GDOP = HDOP

  return {
    gdop: Math.min(99.9, parseFloat(gdop.toFixed(2))),
    hdop: Math.min(99.9, parseFloat(hdop.toFixed(2))),
    valid: true,
  };
}

/**
 * Computes a 2D scalar grid of GDOP values across a bounding box for heatmap rendering.
 *
 * @param {object} master - Master station {lat, lng}
 * @param {Array<object>} slaves - List of slave stations [{lat, lng}]
 * @param {{minLng: number, minLat: number, maxLng: number, maxLat: number}} bbox - Bounding box
 * @param {number} nx - Grid columns
 * @param {number} ny - Grid rows
 * @returns {{buffer: ArrayBuffer, minVal: number, maxVal: number}} Float32Array buffer with GDOP values
 */
export function computeGDOPGrid(master, slaves, bbox, nx = 80, ny = 80) {
  const data = new Float32Array(nx * ny);
  const dLng = (bbox.maxLng - bbox.minLng) / (nx - 1);
  const dLat = (bbox.maxLat - bbox.minLat) / (ny - 1);

  let idx = 0;
  let minVal = Infinity;
  let maxVal = -Infinity;

  for (let j = 0; j < ny; j++) {
    const lat = bbox.minLat + j * dLat;
    for (let i = 0; i < nx; i++, idx++) {
      const lng = bbox.minLng + i * dLng;
      const { gdop, valid } = computeGDOPAtPoint({ lat, lng }, master, slaves);
      const val = valid ? gdop : 99.9;
      data[idx] = val;
      if (valid) {
        if (val < minVal) minVal = val;
        if (val > maxVal) maxVal = val;
      }
    }
  }

  return {
    data,
    buffer: data.buffer,
    nx,
    ny,
    minVal: Number.isFinite(minVal) ? minVal : 1,
    maxVal: Number.isFinite(maxVal) ? maxVal : 50,
  };
}
