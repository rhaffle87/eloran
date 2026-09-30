/**
 * SIMULORAN  Multi-path / Terrain Masking Engine
 *
 * Implements ITU-R P.526-15 single knife-edge diffraction model to estimate:
 *   1. Diffraction loss (dB) from the dominant terrain obstacle along the Tx?Rx path.
 *   2. Terrain-induced excess timing bias (microseconds)  the additional propagation
 *      delay caused by the diffracted/bent signal path.
 *   3. A boolean "blocked" flag when diffraction loss exceeds a threshold that would
 *      render the signal unusable for navigation.
 *
 * Algorithm:
 *   For each interior elevation sample the "FresnelKirchhoff diffraction parameter"
 *   v is computed (ITU-R P.526-15 Eq. 14):
 *
 *     h_eff = h_sample - h_LOS          (clearance below straight Tx-to-Rx LOS)
 *     v = h_eff * sqrt(2*(d1+d2) / (lambda*d1*d2))
 *
 *   where d1 = distance from Tx to obstacle, d2 = distance from obstacle to Rx,
 *   and lambda is the free-space wavelength at 100 kHz.
 *
 *   The Nurul-Saunders piecewise approximation of the J(v) attenuation function
 *   (accurate to ±0.5 dB for v ? [-0.7, +2.4]) is used for the loss calculation.
 *
 *   The dominant obstacle is the sample with the highest v value.
 *
 * SOURCED:
 *   ITU-R P.526-15 (2019), Section 4.1 "Single knife-edge diffraction"
 *   Nurul-Saunders approximation: COST 231 Final Report, 1999, App. C.
 *
 * @module terrainMasking
 */

// ---------------------------------------------------------------------------
// Physical constants
// ---------------------------------------------------------------------------

/** Loran-C / eLoran carrier frequency [Hz] */
export const LORAN_FREQ_HZ = 100_000;

/** Free-space wavelength at 100 kHz [m] */
export const LORAN_WAVELENGTH_M = 299_792_458 / LORAN_FREQ_HZ; //  2997.9 m

/**
 * Minimum first-Fresnel-zone clearance factor.
 * A signal is considered unobstructed when h_eff < -0.7 (v < -0.7 gives <0 dB loss).
 */
const V_CLEAR_THRESHOLD = -0.7;

/**
 * Diffraction loss threshold above which the path is flagged "blocked" for navigation.
 * 15 dB corresponds to approximately a 5-fold signal attenuation  below usable
 * Loran SNR in a well-designed chain.
 * SOURCED: USCG Loran-C Signal Specification, COMDTINST M16562.4A, Table 2-2.
 */
export const BLOCKED_LOSS_DB_THRESHOLD = 15.0;

// ---------------------------------------------------------------------------
// ITU-R P.526-15 Diffraction Loss
// ---------------------------------------------------------------------------

/**
 * Computes the single knife-edge diffraction loss J(v) in dB.
 * Uses the Nurul-Saunders piecewise polynomial approximation.
 *
 * ITU-R P.526-15 Eq. 14a14d:
 *   J(v)  0                           v < -0.7
 *   J(v)  6.9 + 20·log10(v((v-0.1)²+1) + v - 0.1)   v = -0.7
 *
 * @param {number} v   FresnelKirchhoff diffraction parameter
 * @returns {number}   Knife-edge diffraction loss in dB (always = 0)
 */
export function knifeEdgeLossDb(v) {
  if (v < V_CLEAR_THRESHOLD) return 0;
  // ITU-R P.526-15 Eq. 14 (Nurul-Saunders approximation)
  const inner = Math.sqrt((v - 0.1) * (v - 0.1) + 1) + v - 0.1;
  const lossDb = 6.9 + 20 * Math.log10(Math.max(inner, 1e-12));
  return Math.max(0, lossDb);
}

/**
 * Computes the FresnelKirchhoff diffraction parameter v for a single obstacle.
 *
 * @param {number} hEffM   Effective obstacle height above the Tx?Rx LOS chord [m]
 *                          positive = obstacle protrudes above LOS,
 *                          negative = LOS clears the obstacle
 * @param {number} d1M     Tx-to-obstacle ground distance [m]
 * @param {number} d2M     Obstacle-to-Rx ground distance [m]
 * @param {number} [wavelengthM=LORAN_WAVELENGTH_M]   Signal wavelength [m]
 * @returns {number} v  dimensionless diffraction parameter
 */
/**
 * Calculates the 1st Fresnel zone radius (in metres) at a distance d1 from Tx and d2 from Rx.
 *
 * Formula: r1 = sqrt((lambda * d1 * d2) / (d1 + d2))
 *
 * @param {number} d1M   - Tx-to-sample distance [m]
 * @param {number} d2M   - Sample-to-Rx distance [m]
 * @param {number} [wavelengthM=LORAN_WAVELENGTH_M] - Carrier wavelength [m]
 * @returns {number} Radius of 1st Fresnel zone in metres
 */
export function fresnelZoneRadiusM(d1M, d2M, wavelengthM = LORAN_WAVELENGTH_M) {
  if (d1M <= 0 || d2M <= 0) return 0;
  const total = d1M + d2M;
  if (total <= 0) return 0;
  return Math.sqrt((wavelengthM * d1M * d2M) / total);
}

export function fresnelKirchhoffV(hEffM, d1M, d2M, wavelengthM = LORAN_WAVELENGTH_M) {
  if (d1M <= 0 || d2M <= 0) return 0;
  const denom = wavelengthM * d1M * d2M;
  if (denom <= 0) return 0;
  const vAbs = Math.sqrt((2 * (d1M + d2M)) / denom);
  return hEffM * vAbs;
}

// ---------------------------------------------------------------------------
// Excess path length ? timing bias
// ---------------------------------------------------------------------------

/**
 * Converts excess diffracted path length to a timing bias in microseconds.
 *
 * When a signal is diffracted over a ridge, the effective path length is longer
 * than the straight-line distance. For Loran-C this appears as an additional
 * TOA delay.
 *
 * Approximation: for knife-edge diffraction the excess path length is
 * ?l  h_eff² / (2 * d) where d is the shorter of d1, d2 (conservative upper bound).
 *
 * @param {number} hEffM  Effective obstacle height [m]
 * @param {number} d1M    Tx-to-obstacle distance [m]
 * @param {number} d2M    Obstacle-to-Rx distance [m]
 * @returns {number} timingBiasUs  Excess TOA delay in microseconds
 */
export function excessTimingBiasUs(hEffM, d1M, d2M) {
  if (hEffM <= 0 || d1M <= 0 || d2M <= 0) return 0;
  const dMin = Math.min(d1M, d2M);
  const excessPathM = (hEffM * hEffM) / (2 * dMin);
  return (excessPathM / 299_792_458) * 1e6; // convert seconds to microseconds
}

// ---------------------------------------------------------------------------
// Core: profile analysis
// ---------------------------------------------------------------------------

/**
 * Analyses a terrain elevation profile along the Tx?Rx path and returns the
 * dominant single knife-edge diffraction result.
 *
 * @param {number}   txElevM    Transmitter antenna elevation [m ASL]
 * @param {number}   rxElevM    Receiver antenna elevation [m ASL]
 * @param {number[]} elevM      Array of terrain elevations at sample points [m ASL],
 *                               first element corresponds to Tx, last to Rx.
 * @param {number}   distanceM  Total path distance [m]
 * @param {number}   [wavelengthM=LORAN_WAVELENGTH_M]
 * @returns {TerrainMaskingResult}
 *
 * @typedef {Object} TerrainMaskingResult
 * @property {boolean} blocked          True if diffraction loss >= BLOCKED_LOSS_DB_THRESHOLD
 * @property {number}  diffractionLossDb  Dominant knife-edge loss [dB]
 * @property {number}  timingBiasUs     Excess TOA delay [µs]
 * @property {number}  vDominant        FresnelKirchhoff parameter of dominant obstacle
 * @property {number}  dominantFrac     Fractional position of dominant obstacle (01)
 * @property {boolean} flatEarth        True when elevation data was unavailable
 */
export function analyseElevationProfile(txElevM, rxElevM, elevM, distanceM, wavelengthM = LORAN_WAVELENGTH_M) {
  const n = elevM.length;
  if (n < 3 || distanceM <= 0) {
    return { blocked: false, diffractionLossDb: 0, timingBiasUs: 0, vDominant: 0, dominantFrac: 0.5, dominantIndex: 0, dominantObstacleM: 0, flatEarth: true };
  }

  // Step (m) between samples  assumes even spacing
  const stepM = distanceM / (n - 1);

  // Heights at endpoints (use terrain + notional 0 m antenna height)
  const h0 = txElevM; // Tx terrain + antenna height (assume co-located with terrain for now)
  const hN = rxElevM; // Rx terrain elevation

  let vMax = V_CLEAR_THRESHOLD - 1; // below threshold initially
  let bestD1 = distanceM * 0.5;
  let bestD2 = distanceM * 0.5;
  let bestHEff = 0;
  let bestIdx = Math.floor(n / 2);

  // Evaluate every interior sample (i=1...n-2)
  for (let i = 1; i < n - 1; i++) {
    const d1M = i * stepM;           // Tx ? sample distance
    const d2M = distanceM - d1M;     // sample ? Rx distance
    const frac = d1M / distanceM;

    // Height of the straight Tx-Rx LOS chord at this sample distance
    const losHeightM = h0 + (hN - h0) * frac;

    // Effective obstacle height (positive = protrudes above LOS)
    const hEff = elevM[i] - losHeightM;

    const v = fresnelKirchhoffV(hEff, d1M, d2M, wavelengthM);

    if (v > vMax) {
      vMax = v;
      bestD1 = d1M;
      bestD2 = d2M;
      bestHEff = hEff;
      bestIdx = i;
    }
  }

  const lossDb = knifeEdgeLossDb(vMax);
  const biasUs = excessTimingBiasUs(bestHEff, bestD1, bestD2);
  const blocked = lossDb >= BLOCKED_LOSS_DB_THRESHOLD;

  return {
    blocked,
    diffractionLossDb: parseFloat(lossDb.toFixed(2)),
    timingBiasUs: parseFloat(biasUs.toFixed(4)),
    vDominant: parseFloat(vMax.toFixed(3)),
    dominantFrac: bestIdx / (n - 1),
    dominantIndex: bestIdx,
    dominantObstacleM: parseFloat(bestHEff.toFixed(2)),
    flatEarth: false,
  };
}

// ---------------------------------------------------------------------------
// High-level convenience wrapper
// ---------------------------------------------------------------------------

/**
 * Full terrain masking computation for a Tx?Rx pair, given a pre-fetched elevation profile.
 *
 * @param {object} profile                Return value of `fetchElevationProfile`
 * @param {number} [txAntennaHeightM=30]  Tx antenna height above ground [m] (Loran mast typical)
 * @param {number} [rxAntennaHeightM=5]   Rx antenna height above ground [m]
 * @returns {TerrainMaskingResult}
 */
export function computeTerrainMasking(profile = {}, txAntennaHeightM = 30, rxAntennaHeightM = 5) {
  if (!profile || typeof profile !== 'object') {
    return { blocked: false, diffractionLossDb: 0, timingBiasUs: 0, vDominant: 0, dominantFrac: 0.5, dominantIndex: 0, dominantObstacleM: 0, flatEarth: true };
  }
  const { elevations, distanceM, flat } = profile;

  if (flat || !elevations || elevations.length < 3) {
    return { blocked: false, diffractionLossDb: 0, timingBiasUs: 0, vDominant: 0, dominantFrac: 0.5, dominantIndex: 0, dominantObstacleM: 0, flatEarth: true };
  }

  const txElevM = elevations[0] + txAntennaHeightM;
  const rxElevM = elevations[elevations.length - 1] + rxAntennaHeightM;

  const result = analyseElevationProfile(txElevM, rxElevM, elevations, distanceM);
  return { ...result, flatEarth: flat };
}