/**
 * GNSS-eLoran Multi-Source PNT Fusion Library
 * Simulates GNSS measurements, jamming/spoofing outages, error covariance ellipses,
 * and Best Linear Unbiased Estimator (BLUE) sensor fusion algorithms.
 */

import { haversineDistance, EARTH_RADIUS, latLngToLocalXY, localXYToLatLng } from './geodesy.js';
import { gaussianNoise } from './clocks.js';

/**
 * Simulates a GNSS position fix with configured Gaussian receiver noise and degradation modes.
 * Under jamming, noise variance is dramatically elevated.
 * Under spoofing, an undetected spatial offset bias is injected while internal reported covariance remains low.
 * Under outage, the GNSS receiver loses tracking lock completely.
 *
 * @param {{lat: number, lng: number}} truePos - True physical receiver coordinate
 * @param {number} [stdDevMeters=8] - GNSS 1-sigma standard deviation (e.g. 5-10m for standard GPS SPS)
 * @param {() => number} [rng=Math.random] - Random number generator
 * @param {object} [options={}] - Degradation options
 * @param {'nominal'|'jammed'|'spoofed'|'outage'} [options.status='nominal'] - Operational status
 * @param {number} [options.jammingNoiseMeters=75] - Elevated noise under RF interference
 * @param {number} [options.spoofBiasMeters=150] - Position bias injected under spoofing attack
 * @returns {{lat: number, lng: number, covariance: number[][], stdDevMeters: number, hplMeters: number, status: string, errorMeters: number, noSolution: boolean, spoofBiasMeters?: number}}
 */
export function simulateGnssFix(truePos, stdDevMeters = 8, rng = Math.random, options = {}) {
  const status = options.status || (options.isOutage ? 'outage' : options.isSpoofed ? 'spoofed' : options.isJammed ? 'jammed' : 'nominal');

  if (status === 'outage') {
    return {
      lat: truePos?.lat ?? 0,
      lng: truePos?.lng ?? 0,
      covariance: [[1e6, 0], [0, 1e6]],
      stdDevMeters: 1000,
      hplMeters: 9999,
      status: 'outage',
      errorMeters: 0,
      noSolution: true,
      error: 'GNSS Signal Lost / Receiver Jammed Outage',
    };
  }

  const effectiveStdDev = status === 'jammed'
    ? (options.jammingNoiseMeters || 75)
    : stdDevMeters;

  let noiseNorth = gaussianNoise(effectiveStdDev, rng);
  let noiseEast = gaussianNoise(effectiveStdDev, rng);

  if (status === 'spoofed') {
    const bias = options.spoofBiasMeters || 150;
    noiseNorth += bias * 0.8;
    noiseEast += bias * 0.6;
  }

  const dLat = (noiseNorth / EARTH_RADIUS) * (180 / Math.PI);
  const cosLat = Math.cos(((truePos?.lat ?? 0) * Math.PI) / 180);
  const safeCos = Math.abs(cosLat) < 1e-6 ? 1e-6 : cosLat;
  const dLng = (noiseEast / (EARTH_RADIUS * safeCos)) * (180 / Math.PI);

  // In spoofing attacks, reported receiver covariance is deceptively small (still 8m)
  // while the physical fix is offset. In jamming, receiver covariance is elevated.
  const reportedVar = status === 'spoofed' ? stdDevMeters * stdDevMeters : effectiveStdDev * effectiveStdDev;
  const cov = [
    [reportedVar, 0],
    [0, reportedVar],
  ];

  const hplMeters = 3 * Math.sqrt(reportedVar);
  const fixLat = (truePos?.lat ?? 0) + dLat;
  const fixLng = (truePos?.lng ?? 0) + dLng;
  const err = truePos ? haversineDistance(truePos, { lat: fixLat, lng: fixLng }) : 0;

  return {
    lat: fixLat,
    lng: fixLng,
    covariance: cov,
    stdDevMeters: effectiveStdDev,
    hplMeters,
    status,
    errorMeters: err,
    noSolution: false,
    spoofBiasMeters: status === 'spoofed' ? (options.spoofBiasMeters || 150) : 0,
  };
}

/**
 * Computes the 2D error ellipse geometry (GeoJSON Polygon coordinates) from a 2x2 horizontal covariance matrix.
 *
 * @param {{lat: number, lng: number}} center - Geographic center of the fix
 * @param {number[][]} covariance - 2x2 covariance matrix in meters^2 [[cxx, cxy], [cyx, cyy]]
 * @param {number} [kSigma=1] - Scale factor (1 = 1-sigma, 2.4477 = 95% confidence, 3 = 3-sigma / HPL)
 * @param {number} [numPoints=36] - Number of boundary points on the ellipse
 * @returns {{
 *   semiMajorMeters: number,
 *   semiMinorMeters: number,
 *   orientationDeg: number,
 *   coordinates: [number, number][]
 * } | null}
 */
export function computeCovarianceEllipse(center, covariance, kSigma = 1, numPoints = 36) {
  if (!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lng)) {
    return null;
  }
  const cxx = covariance?.[0]?.[0] || 0;
  const cxy = covariance?.[0]?.[1] || 0;
  const cyx = covariance?.[1]?.[0] || 0;
  const cyy = covariance?.[1]?.[1] || 0;
  const cSym = (cxy + cyx) / 2;

  // Eigenvalues of 2x2 symmetric matrix
  const trace = cxx + cyy;
  const det = cxx * cyy - cSym * cSym;
  const disc = Math.sqrt(Math.max(0, (trace * trace) / 4 - det));
  const lambda1 = Math.max(0, trace / 2 + disc);
  const lambda2 = Math.max(0, trace / 2 - disc);

  const semiMajorMeters = Math.max(0.1, kSigma * Math.sqrt(lambda1));
  const semiMinorMeters = Math.max(0.1, kSigma * Math.sqrt(lambda2));

  // Orientation angle in radians (from East towards North)
  const orientationRad = 0.5 * Math.atan2(2 * cSym, cxx - cyy);
  const orientationDeg = (orientationRad * 180) / Math.PI;

  const cosTh = Math.cos(orientationRad);
  const sinTh = Math.sin(orientationRad);

  const coordinates = [];
  const { x: cx, y: cy } = latLngToLocalXY(center.lat, center.lng, center.lat);

  for (let i = 0; i <= numPoints; i++) {
    const phi = (i / numPoints) * 2 * Math.PI;
    const ex = semiMajorMeters * Math.cos(phi);
    const ey = semiMinorMeters * Math.sin(phi);

    // Rotate into local tangent plane
    const rotX = ex * cosTh - ey * sinTh;
    const rotY = ex * sinTh + ey * cosTh;

    const pt = localXYToLatLng(cx + rotX, cy + rotY, center.lat);
    coordinates.push([pt.lng, pt.lat]);
  }

  return {
    semiMajorMeters,
    semiMinorMeters,
    orientationDeg,
    coordinates,
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
  const isGnssUnavailable = !gnssFix || gnssFix.noSolution;
  const isEloranUnavailable = !eloranFix || eloranFix.noSolution || eloranFix.converged === false;

  if (mode === 'eLoran' || isGnssUnavailable) {
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
      mode: isGnssUnavailable && mode === 'fusion' ? 'fusion-fallback-eloran' : 'eLoran',
      weightingMethod: isGnssUnavailable && mode === 'fusion' ? 'eloran-only-fallback' : 'single-source',
      converged: eloranFix?.converged ?? true,
      noSolution: eloranFix?.noSolution ?? false,
      weights: { eloran: 1, gnss: 0 },
    };
  }

  if (mode === 'GNSS' || isEloranUnavailable) {
    const rawLat = Number.isFinite(gnssFix?.lat) ? gnssFix.lat : (truePos?.lat ?? 0);
    const rawLng = Number.isFinite(gnssFix?.lng) ? gnssFix.lng : (truePos?.lng ?? 0);
    const safeLat = Math.max(-90, Math.min(90, rawLat));
    const safeLng = ((((rawLng + 180) % 360) + 360) % 360) - 180;
    const safeFix = { ...gnssFix, lat: safeLat, lng: safeLng };
    const err = truePos ? haversineDistance(truePos, safeFix) : 0;
    const gnssTrace = (gnssFix?.covariance?.[0]?.[0] || 64) + (gnssFix?.covariance?.[1]?.[1] || 64);
    const gnssHpl = Number.isFinite(gnssFix?.hplMeters) ? gnssFix.hplMeters : 3 * Math.sqrt(gnssTrace / 2);
    return {
      lat: safeLat,
      lng: safeLng,
      covariance: gnssFix?.covariance,
      hplMeters: Number.isFinite(gnssHpl) ? gnssHpl : 0,
      errorMeters: Number.isFinite(err) ? err : 0,
      mode: mode === 'GNSS' ? 'GNSS' : 'fusion-fallback-gnss',
      weightingMethod: mode === 'GNSS' ? 'single-source' : 'gnss-only-fallback',
      converged: true,
      noSolution: false,
      weights: { eloran: 0, gnss: 1 },
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
