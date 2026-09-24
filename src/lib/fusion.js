/**
 * GNSS-eLoran Multi-Source PNT Fusion Library
 * Simulates GNSS measurements, jamming/spoofing outages, and sensor fusion algorithms.
 */

import { haversineDistance, EARTH_RADIUS } from './geodesy.js';
import { gaussianNoise } from './clocks.js';

/**
 * Simulates a GNSS position fix with configured Gaussian receiver noise.
 * @param {{lat: number, lng: number}} truePos - True physical receiver coordinate
 * @param {number} [stdDevMeters=8] - GNSS 1-sigma standard deviation (e.g. 5-10m for standard GPS)
 * @param {() => number} [rng=Math.random] - Random number generator
 * @returns {{lat: number, lng: number, covariance: number[][], stdDevMeters: number}}
 */
export function simulateGnssFix(truePos, stdDevMeters = 8, rng = Math.random) {
  const noiseNorth = gaussianNoise(stdDevMeters, rng);
  const noiseEast = gaussianNoise(stdDevMeters, rng);

  const dLat = (noiseNorth / EARTH_RADIUS) * (180 / Math.PI);
  const dLng = (noiseEast / (EARTH_RADIUS * Math.cos((truePos.lat * Math.PI) / 180))) * (180 / Math.PI);

  const cov = [
    [stdDevMeters * stdDevMeters, 0],
    [0, stdDevMeters * stdDevMeters],
  ];

  return {
    lat: truePos.lat + dLat,
    lng: truePos.lng + dLng,
    covariance: cov,
    stdDevMeters,
  };
}

/**
 * Fuses eLoran navigation solution with GNSS fix using inverse-covariance weighting
 * (Best Linear Unbiased Estimator / BLUE). If fixed weights are explicitly passed,
 * they are treated as an educational demo mode.
 *
 * @param {object} eloranFix - {lat, lng, covariance, hplMeters}
 * @param {object} gnssFix - {lat, lng, covariance}
 * @param {'fusion'|'eLoran'|'GNSS'} mode - Selected positioning mode
 * @param {{lat: number, lng: number}} [truePos] - True ground coordinate for error metric
 * @param {{eloran: number, gnss: number}|null} [weights=null] - Optional manual weights (demo mode)
 * @returns {object} Fused fix object with {lat, lng, errorMeters, covariance, hplMeters, mode, weightingMethod, weights}
 */
export function fusePositions(
  eloranFix,
  gnssFix,
  mode = 'fusion',
  truePos = null,
  weights = null
) {
  if (mode === 'eLoran' || !gnssFix) {
    const err = truePos ? haversineDistance(truePos, eloranFix) : 0;
    return {
      lat: eloranFix.lat,
      lng: eloranFix.lng,
      covariance: eloranFix.covariance || [[0, 0], [0, 0]],
      hplMeters: eloranFix.hplMeters || 0,
      errorMeters: err,
      mode: 'eLoran',
      weightingMethod: 'single-source',
    };
  }

  if (mode === 'GNSS' || !eloranFix) {
    const err = truePos ? haversineDistance(truePos, gnssFix) : 0;
    const gnssTrace = (gnssFix.covariance?.[0]?.[0] || 64) + (gnssFix.covariance?.[1]?.[1] || 64);
    const gnssHpl = 3 * Math.sqrt(gnssTrace / 2);
    return {
      lat: gnssFix.lat,
      lng: gnssFix.lng,
      covariance: gnssFix.covariance,
      hplMeters: gnssHpl,
      errorMeters: err,
      mode: 'GNSS',
      weightingMethod: 'single-source',
    };
  }

  // Covariances
  const covE = eloranFix.covariance || [[64, 0], [0, 64]];
  const covG = gnssFix.covariance || [[64, 0], [0, 64]];

  let nE, nG;
  let weightingMethod = 'inverse-covariance';

  if (weights && typeof weights.eloran === 'number' && typeof weights.gnss === 'number') {
    // Explicit fixed weights mode (educational demo)
    weightingMethod = 'fixed-weights-demo';
    const norm = weights.eloran + weights.gnss > 0 ? weights.eloran + weights.gnss : 1;
    nE = weights.eloran / norm;
    nG = weights.gnss / norm;
  } else {
    // Optimal inverse-variance / inverse-covariance weighting (BLUE)
    // Variance proxy from trace of horizontal covariance:
    const traceE = Math.max(1e-4, (covE[0][0] || 0) + (covE[1][1] || 0));
    const traceG = Math.max(1e-4, (covG[0][0] || 0) + (covG[1][1] || 0));
    const invVarE = 1 / traceE;
    const invVarG = 1 / traceG;
    const sumInv = invVarE + invVarG;
    nE = invVarE / sumInv;
    nG = invVarG / sumInv;
  }

  const fusedLat = eloranFix.lat * nE + gnssFix.lat * nG;
  const fusedLng = eloranFix.lng * nE + gnssFix.lng * nG;

  // Covariance combination: Cov_fused = nE^2 * Cov_E + nG^2 * Cov_G
  const fusedCov = [
    [nE * nE * covE[0][0] + nG * nG * covG[0][0], nE * nE * covE[0][1] + nG * nG * covG[0][1]],
    [nE * nE * covE[1][0] + nG * nG * covG[1][0], nE * nE * covE[1][1] + nG * nG * covG[1][1]],
  ];

  // HPL from fused covariance maximum eigenvalue (simplified 3-sigma bound)
  const trace = fusedCov[0][0] + fusedCov[1][1];
  const det = fusedCov[0][0] * fusedCov[1][1] - fusedCov[0][1] * fusedCov[1][0];
  const disc = Math.sqrt(Math.max(0, (trace * trace) / 4 - det));
  const lambda1 = Math.max(0, trace / 2 + disc);
  const fusedHpl = 3 * Math.sqrt(lambda1);

  const errorMeters = truePos ? haversineDistance(truePos, { lat: fusedLat, lng: fusedLng }) : 0;

  return {
    lat: fusedLat,
    lng: fusedLng,
    covariance: fusedCov,
    hplMeters: fusedHpl,
    errorMeters,
    mode: 'fusion',
    weightingMethod,
    weights: { eloran: nE, gnss: nG },
  };
}
