/**
 * Time Difference of Arrival (TDOA) and Pseudorange Multilateration Library
 * Implements propagation delay modeling, atmospheric refraction, seawater secondary factor (SF),
 * cycle slip error detection, classical hyperbolic TDOA, and pseudorange solvers estimating
 * 2D position (x, y) plus receiver clock bias b_rx.
 *
 * HPL values produced here are simplified k×σ estimates, NOT formal RTCM MPS integrity bounds.
 */

import {
  SPEED_OF_LIGHT,
  DEFAULT_REFRACTIVE_INDEX,
  computePrimaryFactorSec,
  computeSecondaryFactorSec,
  haversineDistance,
  latLngToLocalXY,
  localXYToLatLng,
} from './geodesy.js';
import { simulateClockOffset } from './clocks.js';
import {
  computeAustronWrongCycleProbability,
  computeTheoreticalRiceWrongCycleProbability,
} from './pulse.js';

export const CARRIER_CYCLE_PERIOD_SEC = 10e-6; // 10 µs (100 kHz Loran-C carrier)
export const CYCLE_SLIP_DISTANCE_METERS = SPEED_OF_LIGHT * CARRIER_CYCLE_PERIOD_SEC; // ~2,998 meters (~3 km)

/**
 * Nominal TOA measurement error parameters sourced from Korean eLoran simulator:
 * Reference: Rhee, Kim, Son, & Seo, "Enhanced Accuracy Simulator for a Future Korean
 * Nationwide eLoran System," IEEE Access, 2021 / arXiv:2108.06008.
 * Formula: sigma_i^2 = J_i^2 + K^2 / (N_pulses * SNR_i)
 *   - J_i: Transmitter jitter (nominal 6.0 m ~ 20 ns, or 4.0 m ~ 13.3 ns) [SOURCED]
 *   - K: Measurement scaling constant (337.5 m ~ 1.126 µs) [SOURCED, Lo et al. 2008 / Rhee 2021]
 */
export const DEFAULT_TOA_NOISE_PARAMS = {
  jitterMeters: 6.0,
  kConstantMeters: 337.5,
  pulsesAveraged: 10,
  sourced: true,
  citation: 'Rhee, Kim, Son, & Seo (2021), IEEE Access / arXiv:2108.06008',
};

/**
 * Computes standard deviation of TOA measurement error in meters.
 * Sourced: Rhee et al. (2021, Eq. 1):
 *   sigma_i^2 = J_i^2 + K^2 / (N_pulses * SNR_i)
 *
 * @param {object} params
 * @param {number} params.snrDb - Signal-to-noise ratio in dB
 * @param {number} [params.pulsesAveraged=10] - Number of accumulated pulses (GRI-dependent)
 * @param {number} [params.jitterMeters=6.0] - Transmitter jitter J_i in meters
 * @param {number} [params.kConstantMeters=337.5] - Empirical scale constant K in meters
 * @returns {number} Standard deviation sigma_i in meters
 */
export function computeToaNoiseStdDevMeters({
  snrDb,
  pulsesAveraged = 10,
  jitterMeters = 6.0,
  kConstantMeters = 337.5,
}) {
  const snrLinear = Math.pow(10, Math.max(-30, Math.min(60, snrDb)) / 10);
  const n = Math.max(1, pulsesAveraged);
  const varianceM2 = (jitterMeters ** 2) + ((kConstantMeters ** 2) / (n * snrLinear));
  return Math.sqrt(Math.max(0, varianceM2));
}

/**
 * Computes standard deviation of TOA measurement error in seconds.
 * @param {object} params
 * @returns {number} Standard deviation in seconds
 */
export function computeToaNoiseStdDevSeconds(params) {
  return computeToaNoiseStdDevMeters(params) / SPEED_OF_LIGHT;
}

/**
 * Computes modeled arrival time (seconds) from a transmitter station to a receiver coordinate.
 * t = PF + SF + ASF + ClockOffset + StationOffset - DiffCorrections
 *
 * @param {object} station - Station parameters {lat, lng, clock, offsetSec, asfMeters, asfEvaluator, diffCorrections}
 * @param {number} lat - Receiver latitude in degrees
 * @param {number} lng - Receiver longitude in degrees
 * @param {number} [simTimeSec=0] - Simulation time in seconds
 * @param {number} [eta=1.000338] - Atmospheric refractive index for Primary Factor
 * @param {boolean} [includeSF=true] - Whether to include seawater Secondary Factor
 * @returns {number} Arrival time in seconds
 */
export function computeArrivalSec(
  station,
  lat,
  lng,
  simTimeSec = 0,
  eta = DEFAULT_REFRACTIVE_INDEX,
  includeSF = false
) {
  const dist = haversineDistance({ lat: station.lat, lng: station.lng }, { lat, lng });
  const pfSec = computePrimaryFactorSec(dist, eta);
  const sfSec = includeSF ? computeSecondaryFactorSec(dist) : 0;
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

  const asfSec = (asfMeters - diffCorrMeters) / SPEED_OF_LIGHT;
  return pfSec + sfSec + offsetSec + clockOffset + asfSec;
}

/**
 * Computes raw uncorrected arrival time without differential corrections.
 */
export function computeArrivalSecNoDiff(
  station,
  lat,
  lng,
  simTimeSec = 0,
  eta = DEFAULT_REFRACTIVE_INDEX,
  includeSF = true
) {
  const dist = haversineDistance({ lat: station.lat, lng: station.lng }, { lat, lng });
  const pfSec = computePrimaryFactorSec(dist, eta);
  const sfSec = includeSF ? computeSecondaryFactorSec(dist) : 0;
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

  return pfSec + sfSec + offsetSec + clockOffset + asfMeters / SPEED_OF_LIGHT;
}

/**
 * Computes hyperbolic Time Difference of Arrival (TDOA) for a (Master, Slave) baseline pair.
 * TDOA = Arrival(Slave) - Arrival(Master)
 */
export function computeTDOAPair(
  master,
  slave,
  lat,
  lng,
  simTimeSec = 0,
  eta = DEFAULT_REFRACTIVE_INDEX
) {
  const arrivalM = computeArrivalSec(master, lat, lng, simTimeSec, eta);
  const arrivalS = computeArrivalSec(slave, lat, lng, simTimeSec, eta);
  return arrivalS - arrivalM;
}

/**
 * Simulates cycle slip error (wrong-cycle selection) based on Boyce (ILA 2006) model.
 * A wrong cycle selection causes the receiver to lock to an adjacent zero crossing (±1 carrier cycle = ±10 µs ~ 3 km step).
 * 
 * Supports:
 *   - 'boyce-ratio': Theoretical Rician envelope ratio model (Boyce 2006, Section II-D) [SOURCED]
 *   - 'austron-28': Modern Austron 28 µs empirical bound (Boyce 2006 Eq. 6) [SOURCED]
 *   - 'austron-42': Historical Austron 5000 42 µs bound (Boyce 2006 Eq. 5) [SOURCED]
 * 
 * @param {number} arrivalSec - True arrival time
 * @param {number} snrDb - Per-pulse signal-to-noise ratio in dB
 * @param {number} [pulsesAveraged=10] - Number of Loran pulses integrated
 * @param {() => number} [rng=Math.random] - PRNG function
 * @param {'boyce-ratio' | 'austron-28' | 'austron-42'} [model='boyce-ratio'] - Accuracy model
 * @returns {{ arrivalSec: number, slipped: boolean, cycleOffset: number, slipProbability: number, model: string }}
 */
export function simulateCycleSlip(
  arrivalSec,
  snrDb,
  pulsesAveraged = 10,
  rng = Math.random,
  model = 'boyce-ratio'
) {
  // Total SNR in dB = 10 * log10(N * SNR) = snrDb + 10 * log10(N)
  const totalSnrDb = snrDb + 10 * Math.log10(Math.max(1, pulsesAveraged));

  let slipProbability = 0;
  if (model === 'austron-42') {
    slipProbability = computeAustronWrongCycleProbability(totalSnrDb, 'old');
  } else if (model === 'austron-28') {
    slipProbability = computeAustronWrongCycleProbability(totalSnrDb, 'new');
  } else {
    // 'boyce-ratio' default theoretical Rician model
    slipProbability = computeTheoreticalRiceWrongCycleProbability(totalSnrDb);
  }

  if (rng() < slipProbability) {
    // 1 carrier cycle slip = ±10 microseconds
    const direction = rng() > 0.5 ? 1 : -1;
    return {
      arrivalSec: arrivalSec + direction * CARRIER_CYCLE_PERIOD_SEC,
      slipped: true,
      cycleOffset: direction,
      slipProbability,
      model,
    };
  }

  return {
    arrivalSec,
    slipped: false,
    cycleOffset: 0,
    slipProbability,
    model,
  };
}

/**
 * Classical Hyperbolic TDOA Gauss-Newton Position Solver.
 * Solves 2D horizontal coordinates [x, y] from pair-wise differential arrivals.
 */
export function solvePositionFromTDOA(pairs, initialGuess, maxIterOrOptions = 30) {
  let maxIter = 30;
  let eta = DEFAULT_REFRACTIVE_INDEX;
  if (typeof maxIterOrOptions === 'number') {
    maxIter = maxIterOrOptions;
  } else if (typeof maxIterOrOptions === 'object' && maxIterOrOptions !== null) {
    maxIter = maxIterOrOptions.maxIter || 30;
    if (typeof maxIterOrOptions.eta === 'number') {
      eta = maxIterOrOptions.eta;
    }
  }

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

  const propSpeed = SPEED_OF_LIGHT / eta;
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
      const measuredDeltaMeters = p.tdoaSec * propSpeed;
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

    if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.hypot(dx, dy) > 1e7) {
      converged = false;
      break;
    }

    x0 += dx;
    y0 += dy;

    if (Math.hypot(x0, y0) > 20000000) {
      converged = false;
      break;
    }

    JTJ_final = JTJ;
    r_final = r.slice();

    if (Math.hypot(dx, dy) < 0.01) {
      converged = true;
      break;
    }
  }

  // Safe coordinate conversion with bounded validation
  let lat = initialGuess.lat;
  let lng = initialGuess.lng;

  if (Number.isFinite(x0) && Number.isFinite(y0) && Math.hypot(x0, y0) < 10000000) {
    const converted = localXYToLatLng(x0, y0, refLat);
    if (Number.isFinite(converted.lat) && Number.isFinite(converted.lng)) {
      lat = Math.max(-90, Math.min(90, converted.lat));
      lng = ((((converted.lng + 180) % 360) + 360) % 360) - 180;
    }
  }

  // Residual variance in meters^2
  const m = r_final.length;
  let sigma2Meters = 0;
  if (m > 2) {
    const ssum = r_final.reduce((sum, val) => sum + val * val, 0);
    sigma2Meters = ssum / (m - 2);
  } else {
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
  const rawHpl = 3 * Math.sqrt(lambda1);
  const hplMeters = Number.isFinite(rawHpl) ? Math.min(99999, rawHpl) : 99999;

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
    noSolution: !converged,
    residualMeters: Number.isFinite(meanSqResidual) ? meanSqResidual : 999999,
  };
}

/**
 * 3x3 Matrix Inverter using Cramer's Rule
 * @param {number[][]} M - 3x3 matrix
 * @returns {number[][] | null} Inverted 3x3 matrix or null if singular
 */
function invert3x3(M) {
  const a = M[0][0], b = M[0][1], c = M[0][2];
  const d = M[1][0], e = M[1][1], f = M[1][2];
  const g = M[2][0], h = M[2][1], k = M[2][2];

  const A = e * k - f * h;
  const B = -(d * k - f * g);
  const C = d * h - e * g;

  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return null;

  const invDet = 1 / det;

  return [
    [A * invDet, (c * h - b * k) * invDet, (b * f - c * e) * invDet],
    [B * invDet, (a * k - c * g) * invDet, (c * d - a * f) * invDet],
    [C * invDet, (b * g - a * h) * invDet, (a * e - b * d) * invDet],
  ];
}

/**
 * Modern Pseudorange Solver with Receiver Clock Bias (b_rx).
 * Directly estimates state vector: x = [x, y, c * b_rx]^T from raw pseudoranges.
 * 
 * Sourced from Pelgrum PhD (TU Delft 2006) and Gao et al. (Sensors 2025).
 * Enables multi-chain reception without requiring a shared common master.
 *
 * @param {Array<{station: object, pseudorangeMeters: number, weight?: number}>} observations
 * @param {{lat: number, lng: number}} initialGuess - Initial coordinate guess in degrees
 * @param {object} [options] - Solver options
 * @returns {{lat: number, lng: number, clockBiasSec: number, hdop: number, tdop: number, gdop: number, covariance: number[][], hplMeters: number, iterations: number, converged: boolean, residualMeters: number}}
 */
export function solvePositionPseudorange(observations, initialGuess, options = {}) {
  const maxIter = options.maxIter || 30;
  const eta = options.eta || 1.0; // 1.0 for geometric pseudorange; pass refractive index when modeling atmospheric PF
  const includeSF = options.includeSF || false;

  if (!observations || observations.length < 3 || !initialGuess) {
    return {
      lat: initialGuess?.lat || 0,
      lng: initialGuess?.lng || 0,
      clockBiasSec: 0,
      hdop: 99.9,
      tdop: 99.9,
      gdop: 99.9,
      covariance: [[0, 0], [0, 0]],
      hplMeters: 0,
      iterations: 0,
      converged: false,
      residualMeters: 0,
    };
  }

  const refLat = initialGuess.lat;
  let { x: x0, y: y0 } = latLngToLocalXY(initialGuess.lat, initialGuess.lng, refLat);
  let cbrx = 0; // c * b_rx in meters

  let converged = false;
  let iter = 0;
  let HTH_final = null;
  let r_final = [];

  for (iter = 0; iter < maxIter; iter++) {
    const H = []; // N x 3
    const r = []; // N

    for (const obs of observations) {
      const st = obs.station;
      const sxy = latLngToLocalXY(st.lat, st.lng, refLat);

      const geomDist = Math.hypot(x0 - sxy.x, y0 - sxy.y);
      const safeDist = Math.max(1.0, geomDist);

      // Model propagation delays (PF atmospheric refraction + SF seawater + ASF land)
      const pfExtraMeters = (eta - 1.0) * safeDist;
      const sfMeters = includeSF ? computeSecondaryFactorSec(safeDist) * SPEED_OF_LIGHT : 0;
      const asfMeters = (typeof st.asfMeters === 'number') ? st.asfMeters : 0;
      const diffMeters = (st.diffCorrections && st.diffCorrections.enabled)
        ? (st.diffCorrections.avgMeters || 0)
        : 0;

      const modeledPseudo = safeDist + pfExtraMeters + sfMeters + asfMeters - diffMeters + cbrx;
      const ri = obs.pseudorangeMeters - modeledPseudo;

      // Unit vector line-of-sight from station to receiver
      const ux = (x0 - sxy.x) / safeDist;
      const uy = (y0 - sxy.y) / safeDist;

      // Row of H: [ux, uy, 1]
      H.push([ux, uy, 1.0]);
      r.push(ri);
    }

    // Compute H^T * H (3x3) and H^T * r (3x1)
    const HTH = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    const HTr = [0, 0, 0];

    for (let i = 0; i < H.length; i++) {
      const [h0, h1, h2] = H[i];
      const ri = r[i];

      HTH[0][0] += h0 * h0;
      HTH[0][1] += h0 * h1;
      HTH[0][2] += h0 * h2;

      HTH[1][0] += h1 * h0;
      HTH[1][1] += h1 * h1;
      HTH[1][2] += h1 * h2;

      HTH[2][0] += h2 * h0;
      HTH[2][1] += h2 * h1;
      HTH[2][2] += h2 * h2;

      HTr[0] += h0 * ri;
      HTr[1] += h1 * ri;
      HTr[2] += h2 * ri;
    }

    const invHTH = invert3x3(HTH);
    if (!invHTH) break; // Singular / ill-conditioned matrix

    const dx = invHTH[0][0] * HTr[0] + invHTH[0][1] * HTr[1] + invHTH[0][2] * HTr[2];
    const dy = invHTH[1][0] * HTr[0] + invHTH[1][1] * HTr[1] + invHTH[1][2] * HTr[2];
    const dcbrx = invHTH[2][0] * HTr[0] + invHTH[2][1] * HTr[1] + invHTH[2][2] * HTr[2];

    if (
      !Number.isFinite(dx) ||
      !Number.isFinite(dy) ||
      !Number.isFinite(dcbrx) ||
      Math.hypot(dx, dy) > 1e7
    ) {
      converged = false;
      break;
    }

    x0 += dx;
    y0 += dy;
    cbrx += dcbrx;

    if (Math.hypot(x0, y0) > 20000000) {
      converged = false;
      break;
    }

    HTH_final = HTH;
    r_final = r.slice();

    if (Math.hypot(dx, dy) < 0.01 && Math.abs(dcbrx) < 0.01) {
      converged = true;
      break;
    }
  }

  // Safe coordinate conversion with bounded validation
  let lat = initialGuess.lat;
  let lng = initialGuess.lng;

  if (Number.isFinite(x0) && Number.isFinite(y0) && Math.hypot(x0, y0) < 10000000) {
    const converted = localXYToLatLng(x0, y0, refLat);
    if (Number.isFinite(converted.lat) && Number.isFinite(converted.lng)) {
      lat = Math.max(-90, Math.min(90, converted.lat));
      lng = ((((converted.lng + 180) % 360) + 360) % 360) - 180;
    }
  }

  const clockBiasSec = Number.isFinite(cbrx) ? cbrx / SPEED_OF_LIGHT : 0;

  let hdop = 99.9;
  let tdop = 99.9;
  let gdop = 99.9;
  let cov2D = [[0, 0], [0, 0]];
  let hplMeters = 0;

  if (HTH_final) {
    const invHTH = invert3x3(HTH_final);
    if (invHTH) {
      const rawHdop = Math.sqrt(Math.max(0, invHTH[0][0] + invHTH[1][1]));
      const rawTdop = Math.sqrt(Math.max(0, invHTH[2][2]));
      const rawGdop = Math.sqrt(Math.max(0, invHTH[0][0] + invHTH[1][1] + invHTH[2][2]));

      hdop = Number.isFinite(rawHdop) ? Math.min(99.9, rawHdop) : 99.9;
      tdop = Number.isFinite(rawTdop) ? Math.min(99.9, rawTdop) : 99.9;
      gdop = Number.isFinite(rawGdop) ? Math.min(99.9, rawGdop) : 99.9;

      // 1-sigma timing variance (assume 10 ns nominal Loran receiver jitter ~3 meters)
      const sigma2 = Math.pow(3.0, 2);
      cov2D = [
        [sigma2 * invHTH[0][0], sigma2 * invHTH[0][1]],
        [sigma2 * invHTH[1][0], sigma2 * invHTH[1][1]],
      ];

      const trace = cov2D[0][0] + cov2D[1][1];
      const detC = cov2D[0][0] * cov2D[1][1] - cov2D[0][1] * cov2D[0][1];
      const discriminant = Math.sqrt(Math.max(0, (trace * trace) / 4 - detC));
      const lambda1 = Math.max(0, trace / 2 + discriminant);
      const rawHpl = 3 * Math.sqrt(lambda1);
      hplMeters = Number.isFinite(rawHpl) ? Math.min(99999, rawHpl) : 99999;
    }
  }

  const meanSqResidual = r_final.length
    ? Math.sqrt(r_final.reduce((s, v) => s + v * v, 0) / r_final.length)
    : 0;

  return {
    lat,
    lng,
    clockBiasSec,
    hdop: Number(hdop.toFixed(2)),
    tdop: Number(tdop.toFixed(2)),
    gdop: Number(gdop.toFixed(2)),
    covariance: cov2D,
    hplMeters,
    iterations: iter + 1,
    converged,
    noSolution: !converged,
    residualMeters: Number.isFinite(meanSqResidual) ? meanSqResidual : 999999,
  };
}
