/**
 * Multi-GRI Cross-Rate Multilateration Engine for SIMULORAN
 * Sourced from:
 * - Offermans, G. W. A. (2003), "Integrated Navigation System Eurofix" (Cross-Rate / Dual-GRI Processing)
 * - Peterson, B. B. (2006), "Multi-chain eLoran Receiver Architectures"
 * - RTCM 10410.1 (All-in-View Terrestrial PNT Multilateration)
 *
 * Breaks the single-chain constraint by fusing pseudorange time-of-arrival (TOA)
 * observations from transmitters belonging to different Group Repetition Intervals (GRIs).
 */

import { initialBearing, SPEED_OF_LIGHT } from './geodesy.js';

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const EARTH_R = 6371000; // meters

/**
 * Compute distance in meters and ENU unit vector from receiver to station
 * using spherical-earth geometry.
 * @param {number} rxLat - Receiver latitude (degrees)
 * @param {number} rxLng - Receiver longitude (degrees)
 * @param {number} stLat - Station latitude (degrees)
 * @param {number} stLng - Station longitude (degrees)
 * @returns {{ dist: number, ue: number, un: number }} Distance, East & North unit vector components
 */
function sphereDistAndUnitVec(rxLat, rxLng, stLat, stLng) {
  const lat1 = rxLat * DEG2RAD;
  const lat2 = stLat * DEG2RAD;
  const dLat = (stLat - rxLat) * DEG2RAD;
  const dLng = (stLng - rxLng) * DEG2RAD;

  // Haversine distance
  const sinHLat = Math.sin(dLat / 2);
  const sinHLng = Math.sin(dLng / 2);
  const h = sinHLat * sinHLat + Math.cos(lat1) * Math.cos(lat2) * sinHLng * sinHLng;
  const dist = 2 * EARTH_R * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));

  // Bearing from receiver to station (azimuth clockwise from North)
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  const azRad = Math.atan2(y, x); // CW from North

  // ENU unit vector components pointing FROM receiver TOWARD station
  const ue = Math.sin(azRad);  // East  component
  const un = Math.cos(azRad);  // North component

  return { dist, ue, un };
}

/**
 * Scales to convert a position correction in ENU meters to lat/lng degrees.
 * @param {number} latDeg - Current latitude in degrees
 * @returns {{ mPerDegLat: number, mPerDegLng: number }}
 */
function metricScales(latDeg) {
  const latRad = latDeg * DEG2RAD;
  // WGS-84 parametric approximation (error < 0.01% over ±85°)
  const mPerDegLat = 111132.954 - 559.822 * Math.cos(2 * latRad) + 1.175 * Math.cos(4 * latRad);
  const mPerDegLng = 111412.84 * Math.cos(latRad) - 93.5 * Math.cos(3 * latRad);
  return { mPerDegLat, mPerDegLng };
}

/**
 * Solves an all-in-view multi-chain pseudorange multilateration fix using iterative Gauss-Newton.
 *
 * @param {Array<Object>} observations - Array of station observation objects:
 *   [{
 *     station: { id, label, lat, lng, gri, txPowerKw },
 *     pseudorangeMeters: number, // Observed range: true_dist + c * b_rx + noise
 *     sigmaMeters: number,       // Measurement uncertainty
 *   }]
 * @param {Object} [initialGuess] - Optional seed coordinates { lat, lng }
 * @param {Object} [options]
 * @param {number} [options.maxIterations=15]
 * @param {number} [options.toleranceMeters=0.01]
 * @returns {Object} Solution fix descriptor
 */
export function solveCrossChainFix(observations, initialGuess = null, options = {}) {
  const maxIter = options.maxIterations || 15;
  const tol = options.toleranceMeters || 0.01;

  if (!Array.isArray(observations) || observations.length < 3) {
    return {
      converged: false,
      noSolution: true,
      reason: 'Cross-chain multilateration requires at least 3 transmitters in view',
      lat: initialGuess?.lat ?? 0,
      lng: initialGuess?.lng ?? 0,
      clockBiasMeters: 0,
      hdop: 99.9,
      gdop: 99.9,
      iterations: 0,
    };
  }

  // Initial estimate: centroid of stations if no initial guess provided
  let curLat = initialGuess?.lat;
  let curLng = initialGuess?.lng;

  if (curLat === undefined || curLng === undefined) {
    let sumLat = 0;
    let sumLng = 0;
    for (const obs of observations) {
      sumLat += obs.station.lat;
      sumLng += obs.station.lng;
    }
    curLat = sumLat / observations.length;
    curLng = sumLng / observations.length;
  }

  let curClockBiasM = 0;
  let converged = false;
  let iter = 0;

  // Track unique GRIs represented in the constellation
  const uniqueGris = new Set(observations.map((o) => o.station?.gri).filter(Boolean));
  const isMultiChain = uniqueGris.size > 1;


  let hdop = 99.9;
  let covariance = null;

  for (iter = 0; iter < maxIter; iter++) {
    const { mPerDegLat, mPerDegLng } = metricScales(curLat);

    const N = observations.length;
    const H = []; // N x 3 geometry matrix rows [partialE, partialN, 1]
    const deltaRho = []; // N x 1 residual vector
    const W = []; // N weights (1 / sigma^2)

    for (let i = 0; i < N; i++) {
      const obs = observations[i];
      const { dist, ue, un } = sphereDistAndUnitVec(
        curLat, curLng, obs.station.lat, obs.station.lng
      );

      if (dist < 1.0) continue; // Avoid singularity at co-located station

      // Jacobian: partial derivative of pseudorange w.r.t. [East_m, North_m, clockBias_m]
      // d(dist)/d(rxEast_m) = -ue  (receiver moves east -> dist decreases if st is east)
      // d(dist)/d(rxNorth_m) = -un
      // d(pseudorange)/d(clockBias_m) = +1
      H.push([-ue, -un, 1.0]);

      // Modeled pseudorange: distance + current clock bias
      const modeledRho = dist + curClockBiasM;
      const residual = obs.pseudorangeMeters - modeledRho;
      deltaRho.push(residual);

      const sigma = Math.max(0.5, obs.sigmaMeters || 5.0);
      W.push(1.0 / (sigma * sigma));
    }

    if (H.length < 3) break;

    // Normal equations: (H^T * W * H) * delta = H^T * W * deltaRho
    const A = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    const B = [0, 0, 0];

    for (let i = 0; i < H.length; i++) {
      const w = W[i];
      const h0 = H[i][0];
      const h1 = H[i][1];
      const h2 = H[i][2];
      const r = deltaRho[i];

      A[0][0] += h0 * w * h0;
      A[0][1] += h0 * w * h1;
      A[0][2] += h0 * w * h2;

      A[1][0] += h1 * w * h0;
      A[1][1] += h1 * w * h1;
      A[1][2] += h1 * w * h2;

      A[2][0] += h2 * w * h0;
      A[2][1] += h2 * w * h1;
      A[2][2] += h2 * w * h2;

      B[0] += h0 * w * r;
      B[1] += h1 * w * r;
      B[2] += h2 * w * r;
    }

    // Solve 3x3 linear system A * delta = B
    const invA = invert3x3(A);
    if (!invA) break; // Singular geometry

    // Corrections in ENU meters and clock bias meters
    const dEast  = invA[0][0] * B[0] + invA[0][1] * B[1] + invA[0][2] * B[2];
    const dNorth = invA[1][0] * B[0] + invA[1][1] * B[1] + invA[1][2] * B[2];
    const dClock = invA[2][0] * B[0] + invA[2][1] * B[1] + invA[2][2] * B[2];

    // Convert ENU meter corrections to geographic degree corrections
    curLat += dNorth / mPerDegLat;
    curLng += dEast  / mPerDegLng;
    curClockBiasM += dClock;

    // HDOP from ENU covariance (invA diagonal in m^2 / (m/m)^2 = m^2 before scale)
    // The invA diagonal entries are in m^2 units (East^2, North^2, Clock^2)
    covariance = invA;
    const q00 = Math.max(0, invA[0][0]);
    const q11 = Math.max(0, invA[1][1]);
    hdop = Math.min(99.9, Math.sqrt(q00 + q11));

    const stepMeters = Math.sqrt(dEast * dEast + dNorth * dNorth);
    if (stepMeters < tol) {
      converged = true;
      break;
    }
  }

  return {
    converged,
    noSolution: !converged,
    lat: Number.isFinite(curLat) ? Math.max(-90, Math.min(90, curLat)) : (initialGuess?.lat ?? 0),
    lng: Number.isFinite(curLng) ? ((((curLng + 180) % 360) + 360) % 360) - 180 : (initialGuess?.lng ?? 0),
    clockBiasMeters: curClockBiasM,
    clockBiasSec: curClockBiasM / SPEED_OF_LIGHT,
    hdop: Number.isFinite(hdop) ? parseFloat(hdop.toFixed(2)) : 99.9,
    gdop: Number.isFinite(hdop) ? parseFloat((hdop * 1.15).toFixed(2)) : 99.9,
    iterations: iter + 1,
    isMultiChain,
    chainsCount: uniqueGris.size,
    participatingGris: Array.from(uniqueGris),
    participatingTransmitters: observations.length,
    covariance,
  };
}

/**
 * Inverts a symmetric 3x3 positive-definite matrix.
 * @param {Array<Array<number>>} m
 * @returns {Array<Array<number>>|null} Inverted 3x3 matrix or null if singular
 */
function invert3x3(m) {
  const a = m[0][0], b = m[0][1], c = m[0][2];
  const d = m[1][0], e = m[1][1], f = m[1][2];
  const g = m[2][0], h = m[2][1], k = m[2][2];

  const det =
    a * (e * k - f * h) -
    b * (d * k - f * g) +
    c * (d * h - e * g);

  if (Math.abs(det) < 1e-12) return null;
  const invDet = 1.0 / det;

  return [
    [(e * k - f * h) * invDet, (c * h - b * k) * invDet, (b * f - c * e) * invDet],
    [(f * g - d * k) * invDet, (a * k - c * g) * invDet, (c * d - a * f) * invDet],
    [(d * h - e * g) * invDet, (g * b - a * h) * invDet, (a * e - b * d) * invDet],
  ];
}

/**
 * Computes the geometric dilution of precision improvement when combining
 * stations across multiple chains versus single-chain limitation.
 *
 * @param {Array<Object>} singleChainStations - Transmitters in primary chain
 * @param {Array<Object>} crossChainStations - Transmitters including adjacent chains
 * @param {{lat: number, lng: number}} receiverPos
 * @returns {Object} HDOP comparison and geometry gain
 */
export function evaluateCrossChainDopGain(singleChainStations, crossChainStations, receiverPos) {
  const calcHdop = (stList) => {
    if (!stList || stList.length < 3) return 99.9;
    const H = [];
    for (const st of stList) {
      const az = initialBearing(receiverPos, st) * DEG2RAD;
      H.push([Math.sin(az), Math.cos(az), 1.0]);
    }
    // H^T * H
    const A = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    for (const row of H) {
      A[0][0] += row[0] * row[0];
      A[0][1] += row[0] * row[1];
      A[0][2] += row[0] * row[2];

      A[1][0] += row[1] * row[0];
      A[1][1] += row[1] * row[1];
      A[1][2] += row[1] * row[2];

      A[2][0] += row[2] * row[0];
      A[2][1] += row[2] * row[1];
      A[2][2] += row[2] * row[2];
    }
    const invA = invert3x3(A);
    if (!invA) return 99.9;
    return Math.sqrt(Math.max(0, invA[0][0]) + Math.max(0, invA[1][1]));
  };

  const singleHdop = calcHdop(singleChainStations);
  const crossHdop = calcHdop(crossChainStations);
  const dopImprovementPct = singleHdop > 0 && singleHdop < 99.9
    ? Math.max(0, Math.min(100, ((singleHdop - crossHdop) / singleHdop) * 100))
    : 0;

  return {
    singleChainHdop: parseFloat(singleHdop.toFixed(2)),
    crossChainHdop: parseFloat(crossHdop.toFixed(2)),
    dopImprovementPct: parseFloat(dopImprovementPct.toFixed(1)),
    isImproved: crossHdop < singleHdop,
    stationsSingle: singleChainStations.length,
    stationsCross: crossChainStations.length,
  };
}
