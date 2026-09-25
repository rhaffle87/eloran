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
    const rawLat = Number.isFinite(eloranFix?.lat) ? eloranFix.lat : (truePos?.lat ?? 0);
    const rawLng = Number.isFinite(eloranFix?.lng) ? eloranFix.lng : (truePos?.lng ?? 0);
    const safeLat = Math.max(-90, Math.min(90, rawLat));
    const safeLng = ((((rawLng + 180) % 360) + 360) % 360) - 180;
    const safeFix = { ...eloranFix, lat: safeLat, lng: safeLng };
    const err = truePos ? haversineDistance(truePos, safeFix) : 0;
    return {
      lat: safeLat,
      lng: safeLng,
      covariance: eloranFix?.covariance || [[0, 0], [0, 0]],
      hplMeters: Number.isFinite(eloranFix?.hplMeters) ? eloranFix.hplMeters : 0,
      errorMeters: Number.isFinite(err) ? err : 0,
      mode: 'eLoran',
      weightingMethod: 'single-source',
      converged: eloranFix?.converged ?? true,
      noSolution: eloranFix?.noSolution ?? false,
    };
  }

  if (mode === 'GNSS' || !eloranFix) {
    const rawLat = Number.isFinite(gnssFix?.lat) ? gnssFix.lat : (truePos?.lat ?? 0);
    const rawLng = Number.isFinite(gnssFix?.lng) ? gnssFix.lng : (truePos?.lng ?? 0);
    const safeLat = Math.max(-90, Math.min(90, rawLat));
    const safeLng = ((((rawLng + 180) % 360) + 360) % 360) - 180;
    const safeFix = { ...gnssFix, lat: safeLat, lng: safeLng };
    const err = truePos ? haversineDistance(truePos, safeFix) : 0;
    const gnssTrace = (gnssFix?.covariance?.[0]?.[0] || 64) + (gnssFix?.covariance?.[1]?.[1] || 64);
    const gnssHpl = 3 * Math.sqrt(gnssTrace / 2);
    return {
      lat: safeLat,
      lng: safeLng,
      covariance: gnssFix?.covariance,
      hplMeters: Number.isFinite(gnssHpl) ? gnssHpl : 0,
      errorMeters: Number.isFinite(err) ? err : 0,
      mode: 'GNSS',
      weightingMethod: 'single-source',
      converged: true,
      noSolution: false,
    };
  }

  // If eLoran has no solution or diverged, rely purely on GNSS
  if (eloranFix.noSolution || eloranFix.converged === false) {
    const rawLat = Number.isFinite(gnssFix?.lat) ? gnssFix.lat : (truePos?.lat ?? 0);
    const rawLng = Number.isFinite(gnssFix?.lng) ? gnssFix.lng : (truePos?.lng ?? 0);
    const safeLat = Math.max(-90, Math.min(90, rawLat));
    const safeLng = ((((rawLng + 180) % 360) + 360) % 360) - 180;
    const safeFix = { ...gnssFix, lat: safeLat, lng: safeLng };
    const err = truePos ? haversineDistance(truePos, safeFix) : 0;
    return {
      lat: safeLat,
      lng: safeLng,
      covariance: gnssFix?.covariance,
      hplMeters: gnssFix?.hplMeters || 30,
      errorMeters: Number.isFinite(err) ? err : 0,
      mode: 'fusion-fallback-gnss',
      weightingMethod: 'gnss-only-fallback',
      converged: false,
      noSolution: false,
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

  const rawFusedLat = eloranFix.lat * nE + gnssFix.lat * nG;
  const rawFusedLng = eloranFix.lng * nE + gnssFix.lng * nG;
  const fusedLat = Number.isFinite(rawFusedLat) ? Math.max(-90, Math.min(90, rawFusedLat)) : gnssFix.lat;
  const fusedLng = Number.isFinite(rawFusedLng)
    ? ((((rawFusedLng + 180) % 360) + 360) % 360) - 180
    : gnssFix.lng;

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
