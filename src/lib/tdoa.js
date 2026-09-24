/**
 * Time Difference of Arrival (TDOA) and Hyperbolic Multilateration Library
 * Implements propagation delay modeling and well-conditioned iterative Gauss-Newton position solving.
 */

import { SPEED_OF_LIGHT, haversineDistance, latLngToLocalXY, localXYToLatLng } from './geodesy.js';
import { simulateClockOffset } from './clocks.js';

/**
 * Computes modeled arrival time (seconds) from a transmitter station to a receiver coordinate.
 * Incorporates geometric delay, station offset, clock bias/drift, ASF delay, and differential corrections.
 *
 * @param {object} station - Station parameters {lat, lng, clock, offsetSec, asfMeters, asfEvaluator, diffCorrections}
 * @param {number} lat - Receiver latitude in degrees
 * @param {number} lng - Receiver longitude in degrees
 * @param {number} [simTimeSec=0] - Simulation time in seconds
 * @returns {number} Arrival time in seconds
 */
export function computeArrivalSec(station, lat, lng, simTimeSec = 0) {
  const dist = haversineDistance({ lat: station.lat, lng: station.lng }, { lat, lng });
  const geoDelay = dist / SPEED_OF_LIGHT;
  const clockOffset = simulateClockOffset(station.clock, simTimeSec);
  const offsetSec = station.offsetSec || 0;

  let asfMeters = 0;
  if (typeof station.asfEvaluator === 'function') {
    try {
      asfMeters = station.asfEvaluator(lat, lng) || 0;
    } catch {
      asfMeters = 0;
    }
  } else if (typeof station.asfMeters === 'number') {
    asfMeters = station.asfMeters;
  }

  let diffCorrMeters = 0;
  if (station.diffCorrections && station.diffCorrections.enabled) {
    diffCorrMeters = station.diffCorrections.avgMeters || 0;
  }

  return geoDelay + offsetSec + clockOffset + (asfMeters - diffCorrMeters) / SPEED_OF_LIGHT;
}

/**
 * Computes raw uncorrected arrival time (used for differential reference calibration).
 * @param {object} station - Station parameters
 * @param {number} lat - Receiver latitude in degrees
 * @param {number} lng - Receiver longitude in degrees
 * @param {number} [simTimeSec=0] - Simulation time in seconds
 * @returns {number} Raw arrival time in seconds
 */
export function computeArrivalSecNoDiff(station, lat, lng, simTimeSec = 0) {
  const dist = haversineDistance({ lat: station.lat, lng: station.lng }, { lat, lng });
  const geoDelay = dist / SPEED_OF_LIGHT;
  const clockOffset = simulateClockOffset(station.clock, simTimeSec);
  const offsetSec = station.offsetSec || 0;

  let asfMeters = 0;
  if (typeof station.asfEvaluator === 'function') {
    try {
      asfMeters = station.asfEvaluator(lat, lng) || 0;
    } catch {
      asfMeters = 0;
    }
  } else if (typeof station.asfMeters === 'number') {
    asfMeters = station.asfMeters;
  }

  return geoDelay + offsetSec + clockOffset + asfMeters / SPEED_OF_LIGHT;
}

/**
 * Computes hyperbolic Time Difference of Arrival (TDOA) for a (Master, Slave) baseline pair.
 * TDOA = Arrival(Slave) - Arrival(Master)
 * @param {object} master - Master station
 * @param {object} slave - Secondary/slave station
 * @param {number} lat - Receiver latitude in degrees
 * @param {number} lng - Receiver longitude in degrees
 * @param {number} [simTimeSec=0] - Simulation time in seconds
 * @returns {number} TDOA in seconds
 */
export function computeTDOAPair(master, slave, lat, lng, simTimeSec = 0) {
  const arrivalM = computeArrivalSec(master, lat, lng, simTimeSec);
  const arrivalS = computeArrivalSec(slave, lat, lng, simTimeSec);
  return arrivalS - arrivalM;
}

/**
 * Solves geographic position (lat, lng) from observed TDOA measurements using iterative Gauss-Newton.
 * Uses meter-space range differentials for optimal numerical conditioning.
 *
 * @param {Array<{master: object, slave: object, tdoaSec: number}>} pairs - Baseline pairs and observed TDOA in seconds
 * @param {{lat: number, lng: number}} initialGuess - Initial coordinate guess in degrees
 * @param {number} [maxIter=30] - Maximum iterations
 * @returns {{lat: number, lng: number, covariance: number[][], hplMeters: number, iterations: number, converged: boolean, residualMeters: number}}
 */
export function solvePositionFromTDOA(pairs, initialGuess, maxIter = 30) {
  if (!pairs || pairs.length === 0 || !initialGuess) {
    return {
      lat: initialGuess?.lat || 0,
      lng: initialGuess?.lng || 0,
      covariance: [[0, 0], [0, 0]],
      hplMeters: 0,
      iterations: 0,
      converged: false,
      residualMeters: 0,
    };
  }

  const refLat = initialGuess.lat;
  let { x: x0, y: y0 } = latLngToLocalXY(initialGuess.lat, initialGuess.lng, refLat);

  let converged = false;
  let iter = 0;
  let JTJ_final = [[0, 0], [0, 0]];
  let r_final = [];

  for (iter = 0; iter < maxIter; iter++) {
    const J = [];
    const r = [];

    for (const p of pairs) {
      const mxy = latLngToLocalXY(p.master.lat, p.master.lng, refLat);
      const sxy = latLngToLocalXY(p.slave.lat, p.slave.lng, refLat);

      const dM = Math.hypot(x0 - mxy.x, y0 - mxy.y);
      const dS = Math.hypot(x0 - sxy.x, y0 - sxy.y);

      const safeDM = Math.max(1.0, dM);
      const safeDS = Math.max(1.0, dS);

      const modeledDeltaMeters = safeDS - safeDM;
      const measuredDeltaMeters = p.tdoaSec * SPEED_OF_LIGHT;
      const ri = measuredDeltaMeters - modeledDeltaMeters;

      // Unitless directional gradients
      const ddx = (x0 - sxy.x) / safeDS - (x0 - mxy.x) / safeDM;
      const ddy = (y0 - sxy.y) / safeDS - (y0 - mxy.y) / safeDM;

      J.push([ddx, ddy]);
      r.push(ri);
    }

    const JTJ = [
      [0, 0],
      [0, 0],
    ];
    const JTr = [0, 0];

    for (let i = 0; i < J.length; i++) {
      const [j1, j2] = J[i];
      JTJ[0][0] += j1 * j1;
      JTJ[0][1] += j1 * j2;
      JTJ[1][0] += j2 * j1;
      JTJ[1][1] += j2 * j2;
      JTr[0] += j1 * r[i];
      JTr[1] += j2 * r[i];
    }

    const det = JTJ[0][0] * JTJ[1][1] - JTJ[0][1] * JTJ[1][0];
    if (Math.abs(det) < 1e-8) break; // Ill-conditioned or collinear

    const inv = [
      [JTJ[1][1] / det, -JTJ[0][1] / det],
      [-JTJ[1][0] / det, JTJ[0][0] / det],
    ];

    const dx = inv[0][0] * JTr[0] + inv[0][1] * JTr[1];
    const dy = inv[1][0] * JTr[0] + inv[1][1] * JTr[1];

    x0 += dx;
    y0 += dy;

    JTJ_final = JTJ;
    r_final = r.slice();

    if (Math.hypot(dx, dy) < 0.01) {
      converged = true;
      break;
    }
  }

  const { lat, lng } = localXYToLatLng(x0, y0, refLat);

  // Residual variance in meters^2
  const m = r_final.length;
  let sigma2Meters = 0;
  if (m > 2) {
    const ssum = r_final.reduce((sum, val) => sum + val * val, 0);
    sigma2Meters = ssum / (m - 2);
  } else {
    // 10 ns nominal timing uncertainty corresponds to ~3 meters
    sigma2Meters = Math.pow(3.0, 2);
  }

  // Error covariance in meters^2: Cov = sigma2 * inv(JTJ)
  const detF = JTJ_final[0][0] * JTJ_final[1][1] - JTJ_final[0][1] * JTJ_final[1][0];
  let cov = [
    [0, 0],
    [0, 0],
  ];

  if (Math.abs(detF) > 1e-8) {
    const invF = [
      [JTJ_final[1][1] / detF, -JTJ_final[0][1] / detF],
      [-JTJ_final[1][0] / detF, JTJ_final[0][0] / detF],
    ];
    cov = [
      [sigma2Meters * invF[0][0], sigma2Meters * invF[0][1]],
      [sigma2Meters * invF[1][0], sigma2Meters * invF[1][1]],
    ];
  }

  // Horizontal Protection Level (HPL)
  const trace = cov[0][0] + cov[1][1];
  const detC = cov[0][0] * cov[1][1] - cov[0][1] * cov[0][1];
  const discriminant = Math.sqrt(Math.max(0, (trace * trace) / 4 - detC));
  const lambda1 = Math.max(0, trace / 2 + discriminant);
  const hplMeters = 3 * Math.sqrt(lambda1);

  const meanSqResidual = r_final.length
    ? Math.sqrt(r_final.reduce((s, v) => s + v * v, 0) / r_final.length)
    : 0;

  return {
    lat,
    lng,
    covariance: cov,
    hplMeters,
    iterations: iter + 1,
    converged,
    residualMeters: meanSqResidual,
  };
}
