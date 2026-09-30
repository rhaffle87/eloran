/**
 * Dual-Antenna Interferometric Vessel Heading Engine for SIMULORAN
 *
 * Implements carrier phase differential interferometry across forward and aft
 * antenna baselines to measure vessel true heading independently of magnetic
 * compass deviation or GNSS satellite availability.
 *
 * Mathematical basis:
 * - Dykstra, D. (2005), "eLoran Carrier Phase Heading for Marine Navigation", IAIN Conference
 * - Elkaim, G. H. (1996), "Sensor Fusion for Marine Heading Using Carrier Phase GPS"
 * - Williams, P. (2010), "Carrier Phase Measurement for Heading Determination Using eLoran"
 * - Hargreaves, B. (2019), "Interferometric Heading with eLoran: Sea Trials"
 *
 * The carrier phase difference Delta_phi between two antennas separated by
 * baseline vector d is:
 *
 *   Delta_phi = (2*pi*d / lambda) * cos(theta_rel) + 2*pi*N
 *
 * where:
 *   lambda = c / f = 299792458 / 100000 = 2997.92 m  (at 100 kHz)
 *   theta_rel = angle between baseline and line-of-sight to transmitter
 *   N = integer cycle ambiguity (0 if baseline << lambda/2)
 *
 * Since vessel baselines d << lambda/2 = 1498.96 m, N = 0 (ambiguity-free).
 *
 * True heading = transmitter_bearing - arccos(Delta_phi * lambda / (2*pi*d))
 */

export const LORAN_FREQUENCY_HZ = 100_000; // 100 kHz carrier
export const SPEED_OF_LIGHT = 299_792_458; // m/s vacuum

/** Loran-C / eLoran carrier wavelength: c / f = 2997.924 m */
export const CARRIER_WAVELENGTH_M = SPEED_OF_LIGHT / LORAN_FREQUENCY_HZ; // ≈ 2997.92 m

/** Maximum unambiguous baseline (lambda / 2): 1498.96 m */
export const MAX_UNAMBIGUOUS_BASELINE_M = CARRIER_WAVELENGTH_M / 2;

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

/**
 * Validates that the antenna baseline is below the interferometric ambiguity limit.
 * @param {number} baselineMeters - Physical separation between antennas (meters)
 * @returns {{ valid: boolean, ambiguityFree: boolean, maxBaseline: number }}
 */
export function validateBaseline(baselineMeters) {
  if (baselineMeters <= 0) {
    return {
      valid: false,
      ambiguityFree: false,
      maxBaseline: MAX_UNAMBIGUOUS_BASELINE_M,
      message: 'Baseline must be positive.',
    };
  }
  const ambiguityFree = baselineMeters < MAX_UNAMBIGUOUS_BASELINE_M;
  return {
    valid: true,
    ambiguityFree,
    maxBaseline: MAX_UNAMBIGUOUS_BASELINE_M,
    baselineMeters,
    cycleAmbiguityN: ambiguityFree ? 0 : null,
    message: ambiguityFree
      ? `Ambiguity-free: baseline ${baselineMeters.toFixed(1)} m << lambda/2 = ${MAX_UNAMBIGUOUS_BASELINE_M.toFixed(1)} m`
      : `WARNING: Baseline exceeds lambda/2. Integer ambiguity N must be resolved.`,
  };
}

/**
 * Computes the theoretical carrier phase difference between two antennas
 * for a signal arriving from a given azimuth, given the vessel heading.
 *
 * @param {number} baselineMeters - Fore-to-aft antenna separation (meters)
 * @param {number} transmitterBearingDeg - True bearing from vessel to transmitter (degrees from N)
 * @param {number} vesselHeadingDeg - Vessel true heading (degrees from N)
 * @param {number} [cycleAmbiguity=0] - Integer cycle ambiguity N (always 0 for d < lambda/2)
 * @returns {number} Phase difference in radians
 */
export function computePhaseDifference(
  baselineMeters,
  transmitterBearingDeg,
  vesselHeadingDeg,
  cycleAmbiguity = 0
) {
  // theta_rel: angle between baseline (heading direction) and line-of-sight to transmitter
  // When transmitter is exactly ahead (bearing = heading), theta_rel = 0, cos = 1 → max phase diff
  // When transmitter is abeam, theta_rel = 90, cos = 0 → zero phase diff
  const thetaRelDeg = transmitterBearingDeg - vesselHeadingDeg;
  const thetaRelRad = thetaRelDeg * DEG2RAD;

  return (2 * Math.PI * baselineMeters / CARRIER_WAVELENGTH_M) * Math.cos(thetaRelRad)
    + 2 * Math.PI * cycleAmbiguity;
}

/**
 * Solves for the vessel heading given a measured phase difference,
 * the transmitter bearing, and the antenna baseline.
 *
 * Heading = transmitter_bearing - arccos(Delta_phi * lambda / (2 * pi * d))
 *
 * There are two geometrically symmetric solutions (±arccos).
 * A second transmitter observation resolves the ambiguity.
 *
 * @param {number} measuredPhaseDiffRad - Measured carrier phase difference (radians)
 * @param {number} transmitterBearingDeg - True bearing to transmitter (degrees from N)
 * @param {number} baselineMeters - Antenna baseline length (meters)
 * @returns {Object} Heading solution descriptor with two candidate headings
 */
export function solveHeadingFromPhase(measuredPhaseDiffRad, transmitterBearingDeg, baselineMeters) {
  // Normalize phase ratio: must be in [-1, +1] for valid arccos
  const phaseRatio = (measuredPhaseDiffRad * CARRIER_WAVELENGTH_M) / (2 * Math.PI * baselineMeters);
  const clampedRatio = Math.max(-1, Math.min(1, phaseRatio));
  const acosRad = Math.acos(clampedRatio);

  // Two candidate theta_rel values: +arccos and -arccos
  const thetaRel1Deg = acosRad * RAD2DEG;
  const thetaRel2Deg = -acosRad * RAD2DEG;

  // Heading = bearing - theta_rel
  const heading1 = ((transmitterBearingDeg - thetaRel1Deg) % 360 + 360) % 360;
  const heading2 = ((transmitterBearingDeg - thetaRel2Deg) % 360 + 360) % 360;

  const isOverflow = Math.abs(phaseRatio) > 1;

  return {
    heading1Deg: parseFloat(heading1.toFixed(4)),
    heading2Deg: parseFloat(heading2.toFixed(4)),
    phaseRatio: parseFloat(phaseRatio.toFixed(6)),
    thetaRel1Deg: parseFloat(thetaRel1Deg.toFixed(4)),
    thetaRel2Deg: parseFloat(thetaRel2Deg.toFixed(4)),
    isAmbiguous: true, // always two solutions without disambiguation
    isOverflow, // phaseRatio outside [-1,1] → geometry infeasible
    baselineMeters,
    transmitterBearingDeg,
    measuredPhaseDiffRad,
  };
}

/**
 * Resolves the dual-solution heading ambiguity using observations from
 * two transmitters. The correct heading will be consistent with both.
 *
 * @param {Object} obs1 - Phase observation from transmitter 1:
 *   { measuredPhaseDiffRad, transmitterBearingDeg, baselineMeters }
 * @param {Object} obs2 - Phase observation from transmitter 2:
 *   { measuredPhaseDiffRad, transmitterBearingDeg, baselineMeters }
 * @param {number} [toleranceDeg=1.0] - Heading agreement tolerance (degrees)
 * @returns {Object} Resolved heading descriptor
 */
export function resolveHeadingAmbiguity(obs1, obs2, toleranceDeg = 1.0) {
  const sol1 = solveHeadingFromPhase(obs1.measuredPhaseDiffRad, obs1.transmitterBearingDeg, obs1.baselineMeters);
  const sol2 = solveHeadingFromPhase(obs2.measuredPhaseDiffRad, obs2.transmitterBearingDeg, obs2.baselineMeters);

  const candidates1 = [sol1.heading1Deg, sol1.heading2Deg];
  const candidates2 = [sol2.heading1Deg, sol2.heading2Deg];

  let bestMatch = null;
  let bestDiff = Infinity;

  for (const h1 of candidates1) {
    for (const h2 of candidates2) {
      // Angular difference (wrapped to ±180)
      let diff = Math.abs(h1 - h2);
      if (diff > 180) diff = 360 - diff;
      if (diff < bestDiff) {
        bestDiff = diff;
        bestMatch = (h1 + h2) / 2;
        // Handle wrap-around averaging
        if (Math.abs(h1 - h2) > 180) {
          bestMatch = ((h1 + h2 + 360) / 2) % 360;
        }
      }
    }
  }

  const resolved = bestDiff <= toleranceDeg;
  const resolvedHeading = resolved ? ((bestMatch % 360) + 360) % 360 : null;

  return {
    resolved,
    resolvedHeadingDeg: resolvedHeading !== null ? parseFloat(resolvedHeading.toFixed(2)) : null,
    residualDeg: parseFloat(bestDiff.toFixed(4)),
    toleranceDeg,
    sol1,
    sol2,
  };
}

/**
 * Full dual-antenna heading computation from two measured phase differences.
 *
 * Given:
 * - Two transmitter bearings
 * - Two carrier phase differences measured across the fore-aft antenna baseline
 *
 * Returns a fully resolved vessel true heading with uncertainty estimate.
 *
 * @param {Object} params
 * @param {number} params.baselineMeters - Antenna baseline (meters)
 * @param {number} params.phaseDiff1Rad - Phase difference from transmitter 1 (radians)
 * @param {number} params.bearing1Deg - True bearing to transmitter 1 (degrees)
 * @param {number} params.phaseDiff2Rad - Phase difference from transmitter 2 (radians)
 * @param {number} params.bearing2Deg - True bearing to transmitter 2 (degrees)
 * @param {number} [params.phaseNoiseRadRms=0.1] - Phase measurement noise 1σ (radians)
 * @returns {Object} Full heading solution
 */
export function computeInterferometricHeading({
  baselineMeters,
  phaseDiff1Rad,
  bearing1Deg,
  phaseDiff2Rad,
  bearing2Deg,
  phaseNoiseRadRms = 0.1,
}) {
  const baseline = validateBaseline(baselineMeters);
  if (!baseline.valid) {
    return { error: baseline.message, resolved: false, resolvedHeadingDeg: null };
  }

  const obs1 = { measuredPhaseDiffRad: phaseDiff1Rad, transmitterBearingDeg: bearing1Deg, baselineMeters };
  const obs2 = { measuredPhaseDiffRad: phaseDiff2Rad, transmitterBearingDeg: bearing2Deg, baselineMeters };

  const disambiguation = resolveHeadingAmbiguity(obs1, obs2);

  // Heading uncertainty from phase noise: sigma_heading = sigma_phi * lambda / (2*pi*d*sin(theta_rel))
  // Worst case at theta_rel = 90 deg (sin=1): sigma_heading = sigma_phi * lambda / (2*pi*d)
  const sigmaHeadingDeg = (phaseNoiseRadRms * CARRIER_WAVELENGTH_M / (2 * Math.PI * baselineMeters)) * RAD2DEG;

  return {
    ...disambiguation,
    baselineMeters,
    baselineValidation: baseline,
    headingUncertainty1SigmaDeg: parseFloat(sigmaHeadingDeg.toFixed(4)),
    headingUncertainty95PctDeg:  parseFloat((sigmaHeadingDeg * 1.96).toFixed(4)),
    carrierWavelengthM: CARRIER_WAVELENGTH_M,
    maxUnambiguousBaselineM: MAX_UNAMBIGUOUS_BASELINE_M,
  };
}
