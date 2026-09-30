/**
 * Stratum-1 Precision UTC Time & Frequency Transfer Engine for SIMULORAN
 *
 * Models eLoran as a sovereign, non-GNSS Stratum-1 timing reference capable of
 * synchronizing telecommunications, financial networks, and smart grids to UTC
 * within <50 ns using Time of Coincidence (TOC) pulse-per-second (1 PPS) locking.
 *
 * Mathematical basis:
 * - NIST Special Publication 1065 (2008): "Loran-C as a Timing Reference"
 * - USCG eLoran Timing Specification (2008), M-16500.3
 * - IEC 61850-9-3 (2013): Precision Time Protocol for Power Utility Automation
 * - Allan, D.W. (1966): "Statistics of Atomic Frequency Standards", Proc. IEEE
 *
 * Key concept: eLoran transmitters emit GRI-periodic pulse groups.
 * The "Time of Coincidence" (TOC) is the period after which a GRI epoch
 * aligns exactly with a 1-second UTC boundary:
 *
 *   TOC = lcm(GRI_period_µs, 1_000_000 µs) [in µs]
 *
 * At the TOC instant, the eLoran pulse-per-second (1 PPS) strobe
 * can be synchronized to UTC with sub-50 ns accuracy after ASF correction.
 */

/** Speed of light in vacuum (m/s) */
export const SPEED_OF_LIGHT = 299792458;

/** Nanoseconds per second */
export const NS_PER_SEC = 1e9;

/**
 * Computes the Greatest Common Divisor of two non-negative integers.
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
export function gcd(a, b) {
  a = Math.round(Math.abs(a));
  b = Math.round(Math.abs(b));
  while (b !== 0) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a;
}

/**
 * Computes the Least Common Multiple of two non-negative integers.
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
export function lcm(a, b) {
  if (a === 0 || b === 0) return 0;
  return Math.round(Math.abs(a) / gcd(a, b)) * Math.round(Math.abs(b));
}

/**
 * Computes the Time of Coincidence (TOC) for a given GRI.
 *
 * The TOC is the smallest number of microseconds after which a GRI epoch
 * falls exactly on a 1,000,000 µs (1-second UTC) boundary:
 *
 *   TOC_µs = lcm(GRI × 10,  1,000,000)
 *
 * @param {number} gri - GRI number (e.g., 7499, 9960)
 * @returns {Object} TOC descriptor
 */
export function computeTOC(gri) {
  if (!Number.isFinite(gri) || gri <= 0) {
    throw new RangeError(`Invalid GRI: ${gri}. Must be a positive number.`);
  }

  const griPeriodUs = gri * 10; // e.g., 7499 → 74,990 µs
  const oneSec_us = 1_000_000;   // 1,000,000 µs = 1 second

  const tocUs = lcm(griPeriodUs, oneSec_us);
  const tocSec = tocUs / oneSec_us;
  const tocGriPeriods = tocUs / griPeriodUs;

  return {
    gri,
    griPeriodUs,
    tocUs,
    tocSec,
    tocSeconds: tocSec,
    tocGriPeriods: Math.round(tocGriPeriods),
    description: `GRI ${gri}: TOC every ${tocSec.toFixed(1)} seconds (${Math.round(tocGriPeriods)} GRI periods)`,
  };
}

/**
 * Computes the propagation delay from an eLoran transmitter to a receiver,
 * including primary and secondary propagation factors (PF + SF),
 * and converts to a UTC offset correction.
 *
 * @param {number} distanceMeters - Great-circle distance from transmitter to receiver
 * @param {number} [eta=1.000338] - Effective refractive index (RTCM standard ground-wave)
 * @param {number} [asfSec=0] - Additional Secondary Factor in seconds (site-specific)
 * @returns {Object} Propagation delay descriptor
 */
export function computePropagationDelay(distanceMeters, eta = 1.000338, asfSec = 0) {
  if (distanceMeters < 0) throw new RangeError('Distance must be non-negative.');

  // Primary factor: free-space propagation at effective speed c/eta
  const pfSec = distanceMeters / (SPEED_OF_LIGHT / eta);

  // Secondary factor: atmospheric + terrain perturbation (~0.1 µs per 1000 km typical)
  // Approximated from CCIR Report 549 ground-wave attenuation model
  const sfSec = 0.1e-6 * (distanceMeters / 1e6); // 0.1 µs per 1000 km

  const totalDelaySec = pfSec + sfSec + asfSec;
  const totalDelayNs = totalDelaySec * NS_PER_SEC;

  return {
    distanceMeters,
    pfSec,
    pfNs: pfSec * NS_PER_SEC,
    sfSec,
    sfNs: sfSec * NS_PER_SEC,
    asfSec,
    asfNs: asfSec * NS_PER_SEC,
    totalDelaySec,
    totalDelayNs,
  };
}

/**
 * Computes the 1 PPS timing strobe alignment error after applying propagation
 * delay corrections. If the delay correction is exact, the residual error is
 * dominated by thermal noise and signal bandwidth.
 *
 * @param {number} measuredToaSec - Measured time-of-arrival of the TOC pulse (seconds)
 * @param {number} trueEmissionTimeSec - True UTC emission time of the pulse (seconds)
 * @param {number} propagationDelaySec - Estimated propagation delay (seconds)
 * @param {number} [correctionUncertaintySec=0] - Uncertainty in the correction (seconds)
 * @returns {Object} 1 PPS alignment descriptor
 */
export function compute1PPSAlignment(
  measuredToaSec,
  trueEmissionTimeSec,
  propagationDelaySec,
  correctionUncertaintySec = 0
) {
  // Corrected TOA estimate
  const correctedToaSec = measuredToaSec - propagationDelaySec;

  // True UTC second boundary (floor to nearest second)
  const utcBoundarySec = Math.round(trueEmissionTimeSec);

  // 1 PPS error: difference between corrected TOA and nearest UTC boundary
  const ppErrorSec = correctedToaSec - utcBoundarySec;
  const ppErrorNs = ppErrorSec * NS_PER_SEC;

  // Combined uncertainty (RSS of propagation correction uncertainty + signal jitter)
  const signalJitterNs = 50; // Typical eLoran 100 kHz carrier phase resolution ≈ 10 µs / sqrt(SNR)
  const totalUncertaintyNs = Math.sqrt(
    (correctionUncertaintySec * NS_PER_SEC) ** 2 + signalJitterNs ** 2
  );

  return {
    measuredToaSec,
    correctedToaSec,
    utcBoundarySec,
    ppErrorSec,
    ppErrorNs,
    totalUncertaintyNs,
    isWithin50ns: Math.abs(ppErrorNs) <= 50,
    isWithin100ns: Math.abs(ppErrorNs) <= 100,
    isWithin1us: Math.abs(ppErrorNs) <= 1000,
  };
}

/**
 * Allan deviation model for eLoran-derived frequency standard.
 *
 * The Allan deviation σ_y(τ) characterizes the fractional frequency stability
 * of an oscillator or timing reference as a function of averaging time τ.
 *
 * eLoran-calibrated OCXO model:
 *   - White phase noise (τ < 1s):     σ_y ≈ h_{-1} / τ (flicker phase)
 *   - White frequency noise (1-100s): σ_y ≈ h_0 / sqrt(τ)
 *   - Random walk (τ > 100s):         σ_y ≈ h_1 × sqrt(τ)
 *
 * Reference values from Allan (1987) for GPS-disciplined OCXO:
 *   h_{-1} = 7×10⁻¹⁴, h_0 = 2.5×10⁻²⁸ × 2/τ → 5×10⁻¹³ at τ=1s
 *
 * @param {number[]} taus - Array of averaging times in seconds
 * @param {string} [source='eloran'] - Source: 'eloran', 'gpsdo', 'rubidium', 'cesium'
 * @returns {Array<{tau: number, allanDev: number}>} Allan deviation curve points
 */
export function computeAllanDeviationCurve(taus, source = 'eloran') {
  // Noise floor parameters per source (empirically derived, NIST SP 1065)
  const params = {
    eloran:   { h_neg1: 1.0e-13, h_0: 5.0e-13, h_1: 1.0e-20, crossover: 10 },
    gpsdo:    { h_neg1: 5.0e-14, h_0: 2.0e-13, h_1: 1.0e-22, crossover: 100 },
    rubidium: { h_neg1: 3.0e-12, h_0: 3.0e-12, h_1: 1.0e-20, crossover: 1 },
    cesium:   { h_neg1: 1.0e-13, h_0: 5.0e-14, h_1: 5.0e-23, crossover: 1000 },
    ocxo:     { h_neg1: 1.0e-12, h_0: 1.0e-11, h_1: 1.0e-19, crossover: 1 },
  };

  const p = params[source] || params.eloran;

  return taus.map((tau) => {
    let allanDev;
    if (tau <= p.crossover) {
      // White phase + flicker phase regime
      allanDev = Math.sqrt(p.h_neg1 / tau + p.h_0 / (2 * tau));
    } else {
      // White frequency + random walk regime
      allanDev = Math.sqrt(p.h_0 / (2 * tau) + p.h_1 * tau / 3);
    }
    return { tau, allanDev: Math.max(1e-16, allanDev) };
  });
}

/**
 * Computes eLoran timing accuracy statistics for a given number of
 * correction-averaged PPS samples.
 *
 * The 1σ timing accuracy improves as 1/sqrt(N) with sequential averaging.
 * ASF uncertainty limits the long-term floor.
 *
 * @param {number} nSamples - Number of TOC pulses averaged
 * @param {number} [rawJitterNs=50] - Single-pulse 1σ jitter (nanoseconds)
 * @param {number} [asfUncertaintyNs=30] - Residual ASF uncertainty (nanoseconds)
 * @returns {Object} Timing accuracy estimate
 */
export function computeTimingAccuracy(nSamples, rawJitterNs = 50, asfUncertaintyNs = 30) {
  if (nSamples < 1) throw new RangeError('nSamples must be at least 1.');

  // Statistical averaging improves jitter floor
  const averagedJitterNs = rawJitterNs / Math.sqrt(nSamples);

  // Total uncertainty: RSS of jitter and systematic ASF floor
  const total1sigmaNs = Math.sqrt(averagedJitterNs ** 2 + asfUncertaintyNs ** 2);
  const total95pctNs = total1sigmaNs * 1.96;

  return {
    nSamples,
    rawJitterNs,
    asfUncertaintyNs,
    averagedJitterNs: parseFloat(averagedJitterNs.toFixed(2)),
    total1sigmaNs: parseFloat(total1sigmaNs.toFixed(2)),
    total95pctNs: parseFloat(total95pctNs.toFixed(2)),
    meetsStratum1: total1sigmaNs <= 100, // ITU-T G.811: Stratum-1 ≤ 1 µs; practical eLoran target ≤ 100 ns
    meetsHighPrecision: total1sigmaNs <= 50, // eLoran target for critical infrastructure
  };
}
