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
import { haversineDistance } from './geodesy.js';
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
 * Evaluates the Korean Nationwide eLoran Testbed benchmark (Rhee et al., 2021).
 * Computes HDOP, predicted 95% repeatable accuracy, and deviations against measured field data.
 * 
 * @param {object} [options]
 * @param {number} [options.nominalJitterMeters=4.0] - Baseline pseudorange jitter (default: 4.0m)
 * @returns {object} Full benchmark evaluation results
 */
export function evaluateKoreaTrialBenchmark(options = {}) {
  const nominalJitter = options.nominalJitterMeters || 4.0;
  const master = KOREA_TRIAL_2021.transmitters.find((t) => t.role === 'master');
  const slaves = KOREA_TRIAL_2021.transmitters.filter((t) => t.role === 'slave');

  const evaluatedSites = KOREA_TRIAL_2021.sites.map((site) => {
    const receiverCoord = { lat: site.lat, lng: site.lng };
    const { hdop, gdop, valid } = computeGDOPAtPoint(receiverCoord, master, slaves);

    // Ranges to each TX
    const ranges = KOREA_TRIAL_2021.transmitters.map((tx) => ({
      id: tx.id,
      label: tx.label,
      distanceKm: parseFloat((haversineDistance(receiverCoord, { lat: tx.lat, lng: tx.lng }) / 1000).toFixed(1)),
    }));

    // Standard 2-sigma 95% repeatable horizontal positioning error: R95 = 2.0 * HDOP * sigma_jitter
    const loranLab95m = parseFloat((2.0 * hdop * nominalJitter).toFixed(2));
    const deltaMeters = parseFloat((loranLab95m - site.measured95m).toFixed(2));
    const absDeltaMeters = parseFloat(Math.abs(deltaMeters).toFixed(2));
    const percentDiff = parseFloat(((deltaMeters / site.measured95m) * 100).toFixed(1));

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
