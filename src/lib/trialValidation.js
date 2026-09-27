/**
 * Trial Validation Harness for LORAN LAB
 * 
 * Evaluates simulator accuracy predictions against published empirical field trial datasets:
 * 1. Korean Nationwide eLoran Testbed (Rhee et al., 2021, IEEE Access / arXiv:2108.06008)
 * 2. Maoming Inland Geodesic Test (Gao et al., 2025, Sensors / DOI: 10.3390/s25165110)
 * 
 * Provides verifiable comparison metrics (MAE, RMSE, residuals) without artificial tuning.
 */

import { computeGDOPAtPoint } from './gdop.js';
import { haversineDistance, latLngToLocalXY } from './geodesy.js';
import { KOREA_TRIAL_2021, MAOMING_TRIAL_2025 } from '../data/benchmarks/trialData.js';

/**
 * Computes Vincenty's inverse formula for ellipsoidal distance on WGS 84 ellipsoid.
 * Used for comparing ellipsoidal distance against spherical Haversine distance.
 * 
 * @param {{lat: number, lng: number}} p1 - Point 1
 * @param {{lat: number, lng: number}} p2 - Point 2
 * @returns {number} Distance in meters on WGS84 ellipsoid
 */
export function vincentyEllipsoidalDistance(p1, p2) {
  const a = 6378137.0; // semi-major axis (m)
  const b = 6356752.314245; // semi-minor axis (m)
  const f = 1 / 298.257223563; // flattening

  const toRad = (d) => (d * Math.PI) / 180;
  const L = toRad(p2.lng - p1.lng);
  const U1 = Math.atan((1 - f) * Math.tan(toRad(p1.lat)));
  const U2 = Math.atan((1 - f) * Math.tan(toRad(p2.lat)));
  const sinU1 = Math.sin(U1), cosU1 = Math.cos(U1);
  const sinU2 = Math.sin(U2), cosU2 = Math.cos(U2);

  let lambda = L;
  let lambdaP = 2 * Math.PI;
  let iterLimit = 100;
  let cosSqAlpha = 0;
  let sinSigma = 0;
  let cos2SigmaM = 0;
  let cosSigma = 0;
  let sigma = 0;

  while (Math.abs(lambda - lambdaP) > 1e-12 && --iterLimit > 0) {
    const sinLambda = Math.sin(lambda);
    const cosLambda = Math.cos(lambda);
    sinSigma = Math.sqrt(
      (cosU2 * sinLambda) * (cosU2 * sinLambda) +
      (cosU1 * sinU2 - sinU1 * cosU2 * cosLambda) * (cosU1 * sinU2 - sinU1 * cosU2 * cosLambda)
    );
    if (sinSigma === 0) return 0; // co-incident points
    cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda;
    sigma = Math.atan2(sinSigma, cosSigma);
    const sinAlpha = (cosU1 * cosU2 * sinLambda) / sinSigma;
    cosSqAlpha = 1 - sinAlpha * sinAlpha;
    cos2SigmaM = cosSqAlpha !== 0 ? cosSigma - (2 * sinU1 * sinU2) / cosSqAlpha : 0;
    const C = (f / 16) * cosSqAlpha * (4 + f * (4 - 3 * cosSqAlpha));
    lambdaP = lambda;
    lambda = L + (1 - C) * f * sinAlpha * (
      sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM))
    );
  }

  if (iterLimit === 0) return haversineDistance(p1, p2); // fallback if formula fails to converge

  const uSq = (cosSqAlpha * (a * a - b * b)) / (b * b);
  const A = 1 + (uSq / 16384) * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
  const B = (uSq / 1024) * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
  const deltaSigma = B * sinSigma * (
    cos2SigmaM + (B / 4) * (
      cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) -
      (B / 6) * cos2SigmaM * (-3 + 4 * sinSigma * sinSigma) * (-3 + 4 * cos2SigmaM * cos2SigmaM)
    )
  );

  return b * A * (sigma - deltaSigma);
}

/**
 * Builds the LOP geometry matrix H (n×2) for a receiver against one master and n slaves.
 * Each row is the unit-vector difference [uSx - uMx, uSy - uMy] in local Cartesian space.
 * This is the same construction used inside computeGDOPAtPoint in gdop.js.
 *
 * @param {{lat: number, lng: number}} receiverCoord
 * @param {object} master - {lat, lng}
 * @param {Array<object>} slaves - [{lat, lng}]
 * @returns {{H: number[][], valid: boolean}} rows of the geometry matrix
 */
export function buildHMatrix(receiverCoord, master, slaves) {
  const refLat = receiverCoord.lat;
  const refLng = receiverCoord.lng;
  const rx = latLngToLocalXY(receiverCoord.lat, receiverCoord.lng, refLat, refLng);
  const mxy = latLngToLocalXY(master.lat, master.lng, refLat, refLng);
  const dM = Math.hypot(rx.x - mxy.x, rx.y - mxy.y);
  if (dM < 10) return { H: [], valid: false };
  const uMx = (mxy.x - rx.x) / dM;
  const uMy = (mxy.y - rx.y) / dM;
  const H = [];
  for (const s of slaves) {
    const sxy = latLngToLocalXY(s.lat, s.lng, refLat, refLng);
    const dS = Math.hypot(rx.x - sxy.x, rx.y - sxy.y);
    if (dS < 10) continue;
    H.push([((sxy.x - rx.x) / dS) - uMx, ((sxy.y - rx.y) / dS) - uMy]);
  }
  return { H, valid: H.length >= 2 };
}

/**
 * Computes the 95% repeatable horizontal error using per-station jitter variances.
 *
 * The covariance of the position estimate when each TD measurement has its own variance:
 *   C = (H^T H)^{-1} H^T Σ_τ H (H^T H)^{-1}
 * where Σ_τ = diag(σ_1², σ_2², ..., σ_n²) is the per-slave TD error covariance.
 *
 * R95 = 2 · sqrt(C_11 + C_22)
 *
 * This is the full WLS propagation; it reduces to R95 = 2·HDOP·σ when all σ_i are equal.
 *
 * @param {number[][]} H - Geometry matrix rows (n×2)
 * @param {number[]} sigmas - Per-slave jitter standard deviations (m), same order as H rows
 * @returns {number} R95 (meters), or NaN if ill-conditioned
 */
function computePerStationR95(H, sigmas) {
  const n = H.length;
  if (n < 2 || sigmas.length < n) return NaN;

  // H^T H  (2×2)
  let h11 = 0, h12 = 0, h22 = 0;
  for (let i = 0; i < n; i++) {
    h11 += H[i][0] * H[i][0];
    h12 += H[i][0] * H[i][1];
    h22 += H[i][1] * H[i][1];
  }
  const det = h11 * h22 - h12 * h12;
  if (det <= 1e-6) return NaN;

  // (H^T H)^{-1}  (2×2 symmetric)
  const inv11 = h22 / det;
  const inv12 = -h12 / det;
  const inv22 = h11 / det;

  // M = H^T Σ_τ H  (2×2): sum_i sigma_i^2 * [hx_i, hy_i]^T [hx_i, hy_i]
  let m11 = 0, m12 = 0, m22 = 0;
  for (let i = 0; i < n; i++) {
    const v2 = sigmas[i] * sigmas[i];
    m11 += v2 * H[i][0] * H[i][0];
    m12 += v2 * H[i][0] * H[i][1];
    m22 += v2 * H[i][1] * H[i][1];
  }

  // C = (H^T H)^{-1} M (H^T H)^{-1}  — compute trace (C_11 + C_22)
  // (H^T H)^{-1} M  (2×2)
  const t11 = inv11 * m11 + inv12 * m12;
  const t12 = inv11 * m12 + inv12 * m22;
  const t21 = inv12 * m11 + inv22 * m12;
  const t22 = inv12 * m12 + inv22 * m22;
  // C = T · (H^T H)^{-1}
  const c11 = t11 * inv11 + t12 * inv12;
  const c22 = t21 * inv12 + t22 * inv22;

  const posVar = c11 + c22;
  if (posVar <= 0) return NaN;
  return 2.0 * Math.sqrt(posVar);
}

/**
 * Evaluates the Korean Nationwide eLoran Testbed benchmark (Rhee et al., 2021).
 * Computes HDOP, predicted 95% repeatable accuracy, and deviations against measured field data.
 *
 * Two jitter modes are evaluated in parallel:
 *  - Flat jitter: R95 = 2·HDOP·σ_flat (σ=4.0m, matching prior-art UK simulator baseline)
 *  - Per-station: R95 via full covariance propagation using Rhee Table 3 per-TX jitter values
 *
 * @param {object} [options]
 * @param {number} [options.nominalJitterMeters=4.0] - Flat-baseline jitter (prior-art reference value)
 * @returns {object} Full benchmark evaluation results
 */
export function evaluateKoreaTrialBenchmark(options = {}) {
  const nominalJitter = options.nominalJitterMeters || 4.0;
  const master = KOREA_TRIAL_2021.transmitters.find((t) => t.role === 'master');
  const slaves = KOREA_TRIAL_2021.transmitters.filter((t) => t.role === 'slave');

  // Per-slave jitter sigmas (Rhee Table 3), same order as slaves array
  // Can override with options.perStationJitters for consistency testing
  const slaveJitterSigmas = options.perStationJitters
    ? options.perStationJitters
    : slaves.map((s) => s.estimatedJitterMeters);

  const evaluatedSites = KOREA_TRIAL_2021.sites.map((site) => {
    const receiverCoord = { lat: site.lat, lng: site.lng };
    const { hdop, gdop, valid } = computeGDOPAtPoint(receiverCoord, master, slaves);

    // Ranges to each TX
    const ranges = KOREA_TRIAL_2021.transmitters.map((tx) => ({
      id: tx.id,
      label: tx.label,
      distanceKm: parseFloat((haversineDistance(receiverCoord, { lat: tx.lat, lng: tx.lng }) / 1000).toFixed(1)),
    }));

    // Mode 1: Flat-jitter baseline — R95 = 2·HDOP·σ_flat
    // σ=4.0m matches the prior-art UK simulator value quoted in Rhee §I as a reference
    const loranLab95m = parseFloat((2.0 * hdop * nominalJitter).toFixed(2));
    const deltaMeters = parseFloat((loranLab95m - site.measured95m).toFixed(2));
    const absDeltaMeters = parseFloat(Math.abs(deltaMeters).toFixed(2));
    const percentDiff = parseFloat(((deltaMeters / site.measured95m) * 100).toFixed(1));

    // Mode 2: Per-station jitter — full covariance propagation C=(H^TH)^{-1}H^TΣH(H^TH)^{-1}
    // Uses per-TX jitter from Rhee Table 3 (already stored in trialData.js)
    const { H, valid: hValid } = buildHMatrix(receiverCoord, master, slaves);
    const perStationR95m = (hValid && H.length === slaves.length)
      ? parseFloat(computePerStationR95(H, slaveJitterSigmas).toFixed(2))
      : null;
    const perStationDeltaMeters = perStationR95m !== null
      ? parseFloat((perStationR95m - site.measured95m).toFixed(2))
      : null;
    const perStationAbsDeltaMeters = perStationDeltaMeters !== null
      ? parseFloat(Math.abs(perStationDeltaMeters).toFixed(2))
      : null;

    return {
      name: site.name,
      lat: site.lat,
      lng: site.lng,
      hdop,
      gdop,
      valid,
      ranges,
      measured95m: site.measured95m,
      loranLab95m,
      perStationR95m,
      perStationDeltaMeters,
      perStationAbsDeltaMeters,
      rheeSim4mMeters: site.rheeSim4mMeters,
      rheeSim6mMeters: site.rheeSim6mMeters,
      rheeProposedMeters: site.rheeProposedMeters,
      deltaMeters,
      absDeltaMeters,
      percentDiff,
    };
  });

  const n = evaluatedSites.length;
  const sumMeasured = evaluatedSites.reduce((acc, s) => acc + s.measured95m, 0);
  const sumSimulated = evaluatedSites.reduce((acc, s) => acc + s.loranLab95m, 0);
  const sumAbsDelta = evaluatedSites.reduce((acc, s) => acc + s.absDeltaMeters, 0);
  const sumSqDelta = evaluatedSites.reduce((acc, s) => acc + s.deltaMeters * s.deltaMeters, 0);

  const meanMeasured95m = parseFloat((sumMeasured / n).toFixed(2));
  const meanSimulated95m = parseFloat((sumSimulated / n).toFixed(2));
  const meanAbsoluteErrorMeters = parseFloat((sumAbsDelta / n).toFixed(2));
  const rmseMeters = parseFloat(Math.sqrt(sumSqDelta / n).toFixed(2));

  // Per-station jitter summary (only when all sites computed successfully)
  const perStationSites = evaluatedSites.filter((s) => s.perStationR95m !== null);
  let perStationSummary = null;
  if (perStationSites.length === n) {
    const psAbsDelta = perStationSites.reduce((acc, s) => acc + s.perStationAbsDeltaMeters, 0);
    const psSqDelta = perStationSites.reduce((acc, s) => acc + s.perStationDeltaMeters * s.perStationDeltaMeters, 0);
    const psMean = perStationSites.reduce((acc, s) => acc + s.perStationR95m, 0);
    perStationSummary = {
      meanSimulated95m: parseFloat((psMean / n).toFixed(2)),
      meanAbsoluteErrorMeters: parseFloat((psAbsDelta / n).toFixed(2)),
      rmseMeters: parseFloat(Math.sqrt(psSqDelta / n).toFixed(2)),
      jitterSource: 'Rhee et al. (2021) Table 3 per-station TOR estimates',
    };
  }

  return {
    benchmarkId: KOREA_TRIAL_2021.id,
    name: KOREA_TRIAL_2021.name,
    citation: KOREA_TRIAL_2021.citation,
    url: KOREA_TRIAL_2021.url,
    status: KOREA_TRIAL_2021.status,
    validationTier: KOREA_TRIAL_2021.validationTier,
    nominalJitterMeters: nominalJitter,
    summaryMetrics: {
      siteCount: n,
      meanMeasured95m,
      meanSimulated95m,
      meanAbsoluteErrorMeters,
      rmseMeters,
      agreementSummary: `LORAN LAB model predicts mean 95% repeatable accuracy of ${meanSimulated95m}m vs published field measurements of ${meanMeasured95m}m (RMSE: ${rmseMeters}m, MAE: ${meanAbsoluteErrorMeters}m).`,
    },
    perStationSummary,
    sites: evaluatedSites,
  };
}

/**
 * Evaluates the Maoming Inland Geodesic Test benchmark (Gao et al., 2025).
 * Compares spherical vs ellipsoidal geodesic distortion across inland baselines.
 * 
 * @returns {object} Maoming trial validation summary and baseline comparison
 */
export function evaluateMaomingTrialBenchmark() {
  const maoming = { lat: MAOMING_TRIAL_2025.location.lat, lng: MAOMING_TRIAL_2025.location.lng };
  
  // Test typical inland stations across China (e.g. Hexian, Chongzuo, Xuancheng)
  const testTransmitters = [
    { name: 'Hexian (GRI 6780 Master)', lat: 24.4167, lng: 111.5500 },
    { name: 'Chongzuo (GRI 6780 Secondary)', lat: 22.4167, lng: 107.3667 },
    { name: 'Xuancheng (GRI 7430 Secondary)', lat: 31.0667, lng: 118.8833 },
  ];

  const geodesicComparisons = testTransmitters.map((tx) => {
    const txCoord = { lat: tx.lat, lng: tx.lng };
    const sphericalDist = haversineDistance(maoming, txCoord);
    const ellipsoidalDist = vincentyEllipsoidalDistance(maoming, txCoord);
    const diffMeters = parseFloat((sphericalDist - ellipsoidalDist).toFixed(2));
    const distKm = parseFloat((ellipsoidalDist / 1000).toFixed(1));

    return {
      transmitter: tx.name,
      distKm,
      sphericalDistMeters: parseFloat(sphericalDist.toFixed(1)),
      ellipsoidalDistMeters: parseFloat(ellipsoidalDist.toFixed(1)),
      distortionMeters: diffMeters,
      distortionMicroseconds: parseFloat(((diffMeters / 299792458) * 1e6).toFixed(3)),
    };
  });

  return {
    benchmarkId: MAOMING_TRIAL_2025.id,
    name: MAOMING_TRIAL_2025.name,
    citation: MAOMING_TRIAL_2025.citation,
    url: MAOMING_TRIAL_2025.url,
    status: MAOMING_TRIAL_2025.status,
    validationTier: MAOMING_TRIAL_2025.validationTier,
    publishedResults: MAOMING_TRIAL_2025.publishedResults,
    theoreticalMechanism: MAOMING_TRIAL_2025.theoreticalMechanism,
    geodesicComparisons,
  };
}
