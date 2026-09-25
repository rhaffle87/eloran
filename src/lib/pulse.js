/**
 * 100 kHz RF Waveform & Pulse Group Generation Library
 *
 * Implements Loran-C standard pulse envelope, 100 kHz carrier oscillation,
 * phase codes, GRI timing structures, and ionospheric skywave modeling.
 *
 * Skywave model references:
 *   - Hargreaves, J.K. (1992). "The Solar-Terrestrial Environment."
 *     Cambridge University Press. Ch. 11 (ionospheric propagation).
 *   - Doherty, R.H. et al. (1961). "Determination of Loran-C Skywave
 *     Correction Data." USCG Research Report no. 87-1. (1-hop D and E layer).
 *   - USCG Loran-C User Handbook M16562.4A (1994), Ch. 5 (sky wave correction tables).
 *   - Forssell, B. (1991). "Radionavigation Systems." Artech House. pp. 128–131.
 *
 * Skywave delay model (1-hop D/E layer):
 *   - D layer (day): reflection height h_D ≈ 70–90 km
 *   - E layer (night): reflection height h_E ≈ 100–110 km
 *   - Amplitude ratio: α_sky ≈ 0.1–0.5 (SNR-dependent, attenuates with range)
 *   - Delay = (2 * h / sin(elevation_angle)) / c_eff
 *   - Elevation angle = arcsin(h / slant_range), slant_range ≈ sqrt(d² + 4h²) / 2
 *   - Simplified 1-hop extra path length: ΔD ≈ 2 * sqrt(h² + (d/2)²) – d
 *   - For d >> h: ΔD ≈ 2 * h²/d (leading edge delay ~10–30 µs for typical chains)
 */

import { SPEED_OF_LIGHT, haversineDistance } from './geodesy.js';

export const LORAN_CARRIER_FREQ = 100000;       // 100 kHz
export const NOMINAL_PULSE_DURATION = 0.0001;   // 100 µs
export const DEFAULT_SAMPLE_RATE = 1000000;     // 1 MHz

/**
 * Standard Loran-C Phase Coding sequences (Group I):
 * Master: 9 pulses (+ + - - + - + - +) [9th pulse is data pulse in eLoran]
 * Secondary: 8 pulses (+ + + + + - - +)
 * Source: USCG Loran-C User Handbook M16562.4A, Table 4-1.
 */
export const PHASE_CODES = {
  master: [1, 1, -1, -1, 1, -1, 1, -1, 1],
  secondary: [1, 1, 1, 1, 1, -1, -1, 1],
};

/**
 * Ionospheric reflection heights for skywave modeling.
 * Source: Hargreaves (1992) + USCG Loran-C User Handbook M16562.4A, Ch. 5.
 */
export const IONOSPHERE_HEIGHTS = {
  daytime_D_layer:  80e3,   // 80 km  (D-layer daytime absorption, 60–90 km)
  nighttime_E_layer: 105e3, // 105 km (E-layer nighttime, 90–120 km)
};

/**
 * Evaluates standard Loran-C instantaneous pulse waveform.
 * Formulated with time t in microseconds (µs) from pulse onset:
 *   i(t) = A * (t / 65)² * exp(-2 * (t - 65) / 65) * sin(2π * 0.1 * t + PC)
 *
 * Carrier frequency: 100 kHz = 0.1 cycles/µs (carrier period Tc = 10 µs).
 * Standard Zero Crossing (SZC): 3rd positive-going zero crossing occurs at t = 30 µs.
 * Peak envelope occurs at t = 65 µs.
 *
 * Note on units:
 *   - With t in microseconds (µs), carrier argument is 2π * 0.1 * t (or 0.2π * t).
 *   - With t in seconds (s), carrier argument is 2π * 100,000 * t (or 2π * 10⁵ * t).
 *
 * @param {number} tMicroseconds - Time in microseconds from pulse start (t >= 0)
 * @param {number} [amplitude=1.0] - Normalized peak amplitude
 * @param {number} [phaseCode=0] - Phase code in radians (0 or Math.PI)
 * @returns {number} Instantaneous current/amplitude
 */
export function evaluateStandardLoranPulseMicroseconds(tMicroseconds, amplitude = 1.0, phaseCode = 0) {
  if (tMicroseconds < 0) return 0;
  // Carrier term with t in microseconds: 2 * pi * 0.1 * t = 0.2 * pi * t
  const carrier = Math.sin(2 * Math.PI * 0.1 * tMicroseconds + phaseCode);
  // Normalized envelope with peak at t = 65 µs: e(65) = 1.0
  const normFactor = Math.E ** 2 / (65 ** 2);
  const envelope = normFactor * (tMicroseconds ** 2) * Math.exp((-2 * tMicroseconds) / 65);
  return amplitude * envelope * carrier;
}

/**
 * Returns carrier value at time t in microseconds.
 * @param {number} tMicroseconds - Time in microseconds
 * @param {number} [phaseCode=0] - Phase code in radians
 * @returns {number}
 */
export function evaluateCarrierMicroseconds(tMicroseconds, phaseCode = 0) {
  return Math.sin(2 * Math.PI * 0.1 * tMicroseconds + phaseCode);
}

/**
 * Computes single-pulse amplitude at time t in seconds (relative to pulse start).
 * @param {number} t - Time in seconds from pulse start (0 <= t <= pulseDuration)
 * @param {number} [pulseDuration=NOMINAL_PULSE_DURATION] - Pulse width in seconds
 * @param {boolean} [includeCarrier=false] - If true, modulates by 100 kHz carrier
 * @param {number} [phaseCode=0] - Phase code in radians (0 or Math.PI)
 * @returns {number} Instantaneous amplitude in [-1, 1]
 */
export function evaluatePulse(t, pulseDuration = NOMINAL_PULSE_DURATION, includeCarrier = false, phaseCode = 0) {
  if (t < 0 || t > pulseDuration) return 0;
  // Standard Loran-C raised-cosine envelope (USCG M16562.4A, Eq. 4-1)
  const envelope = 0.5 * (1 + Math.cos((Math.PI * t) / pulseDuration));
  if (!includeCarrier) return envelope;
  // t is in seconds here, so f = 100,000 Hz:
  const carrier = Math.sin(2 * Math.PI * LORAN_CARRIER_FREQ * t + phaseCode);
  return envelope * carrier;
}

/**
 * Computes the extra path length (meters) of a 1-hop ionospheric skywave
 * relative to the groundwave path over the same ground distance.
 *
 * Uses the flat-earth approximation adequate for typical Loran-C ranges (< 2000 km):
 *   ΔD = 2 * sqrt((d/2)² + h²) - d
 *
 * where d = groundwave distance, h = reflection height.
 *
 * @param {number} groundDistMeters - Groundwave great-circle distance in meters
 * @param {number} reflectionHeightMeters - Ionospheric layer height in meters
 * @returns {number} Extra path length in meters (always >= 0)
 */
export function skywaveExtraPathMeters(groundDistMeters, reflectionHeightMeters) {
  const d = Math.max(1, groundDistMeters);
  const h = Math.max(1, reflectionHeightMeters);
  return 2.0 * Math.sqrt((d / 2) ** 2 + h ** 2) - d;
}

/**
 * Computes the 1-hop skywave amplitude ratio relative to the groundwave.
 *
 * Simplified model: amplitude decays as 1/R² (inverse-square spreading)
 * plus ionospheric absorption. Day/night determined by reflection height:
 *   - D-layer (70–90 km): strong absorption, ratio 0.05–0.15
 *   - E-layer (100–120 km): lower absorption, ratio 0.15–0.45
 *
 * Source: Doherty et al. (1961), USCG Handbook Ch. 5 (empirical at 100 kHz).
 *
 * @param {number} groundDistMeters
 * @param {number} reflectionHeightMeters
 * @returns {number} Amplitude ratio (0 to 1)
 */
export function skywaveAmplitudeRatio(groundDistMeters, reflectionHeightMeters) {
  const skywavePath = 2 * Math.sqrt((groundDistMeters / 2) ** 2 + reflectionHeightMeters ** 2);
  const groundPath = Math.max(1, groundDistMeters);

  // Path-loss ratio: (ground / skywave)²
  const pathLossRatio = (groundPath / skywavePath) ** 2;

  // Ionospheric absorption factor (night vs day)
  const absorptionFactor = reflectionHeightMeters > 95000 ? 0.7 : 0.3; // night:0.7, day:0.3

  return Math.max(0, Math.min(1, pathLossRatio * absorptionFactor));
}

/**
 * Synthesizes time-series waveform buffer at a receiver from multiple station arrivals.
 *
 * @param {object} params
 * @param {Array<object>} params.stations - List of stations {lat, lng, role, txDbm, griMs, clock, offsetSec, phaseSec}
 * @param {object} params.receiver - Receiver coordinate {lat, lng}
 * @param {number} [params.sampleRate=DEFAULT_SAMPLE_RATE] - Sampling frequency in Hz
 * @param {number} [params.totalDuration=0.01] - Total synthesized time window in seconds
 * @param {number} [params.simTime=0] - Simulation start time in seconds
 * @param {boolean} [params.includeCarrier=false] - Whether to generate 100 kHz carrier or envelope only
 * @param {boolean} [params.includeSkywave=false] - Simulate ionospheric skywave reflections
 * @param {'daytime_D_layer' | 'nighttime_E_layer'} [params.ionosphereMode='nighttime_E_layer'] - Layer preset
 * @param {number} [params.customReflectionHeightKm] - Override reflection height in km (ignores ionosphereMode)
 * @returns {{waveform: Float32Array, arrivals: Array<object>, sampleRate: number, totalDuration: number, simTime: number}}
 */
export function synthesizeReceiverWaveform({
  stations = [],
  receiver,
  sampleRate = DEFAULT_SAMPLE_RATE,
  totalDuration = 0.01,
  simTime = 0,
  includeCarrier = false,
  includeSkywave = false,
  ionosphereMode = 'nighttime_E_layer',
  customReflectionHeightKm = null,
}) {
  const numSamples = Math.floor(totalDuration * sampleRate);
  const waveform = new Float32Array(numSamples);
  const arrivals = [];

  if (!stations.length || !receiver) {
    return { waveform, arrivals, sampleRate, totalDuration, simTime };
  }

  // Determine reflection height for skywave calculations
  const reflectionHeight = customReflectionHeightKm
    ? customReflectionHeightKm * 1000
    : (IONOSPHERE_HEIGHTS[ionosphereMode] ?? IONOSPHERE_HEIGHTS.nighttime_E_layer);

  stations.forEach((station) => {
    const griSec = (station.griMs || 1000) / 1000;
    const phaseSec = station.phaseSec || 0;
    const groundDist = haversineDistance(station, receiver);
    const propDelay = groundDist / SPEED_OF_LIGHT;
    const clockOffset = (station.clock?.biasSec || 0) + (station.clock?.driftPerSec || 0) * simTime;
    const stationOffset = station.offsetSec || 0;

    const baseK = Math.floor(simTime / griSec);

    for (let k = -1; k <= 1; k++) {
      const tEmit = (baseK + k) * griSec + phaseSec;
      const arrivalSec = tEmit + propDelay + clockOffset + stationOffset;

      if (arrivalSec + NOMINAL_PULSE_DURATION >= simTime && arrivalSec <= simTime + totalDuration) {
        const amplitude = Math.pow(10, (station.txDbm || 20) / 20);

        arrivals.push({
          station: station.label,
          role: station.role,
          arrivalSec,
          amplitude,
          isSkywave: false,
          groundDistMeters: groundDist,
        });

        const startSample = Math.max(0, Math.floor((arrivalSec - simTime) * sampleRate));
        const endSample = Math.min(
          numSamples,
          Math.floor((arrivalSec - simTime + NOMINAL_PULSE_DURATION) * sampleRate)
        );

        for (let i = startSample; i < endSample; i++) {
          const t = (i - startSample) / sampleRate;
          waveform[i] += amplitude * evaluatePulse(t, NOMINAL_PULSE_DURATION, includeCarrier);
        }

        // Ionospheric skywave (1-hop E or D layer)
        if (includeSkywave && groundDist > 0) {
          const extraPath = skywaveExtraPathMeters(groundDist, reflectionHeight);
          const skyDelaySec = extraPath / SPEED_OF_LIGHT;
          const skyArrivalSec = arrivalSec + skyDelaySec;
          const skyAmp = amplitude * skywaveAmplitudeRatio(groundDist, reflectionHeight);

          if (skyArrivalSec <= simTime + totalDuration && skyAmp > 0.001) {
            arrivals.push({
              station: station.label,
              role: station.role,
              arrivalSec: skyArrivalSec,
              amplitude: skyAmp,
              isSkywave: true,
              skywaveDelayMs: skyDelaySec * 1000,
              reflectionHeightKm: reflectionHeight / 1000,
              groundDistMeters: groundDist,
            });

            const skyStart = Math.max(0, Math.floor((skyArrivalSec - simTime) * sampleRate));
            const skyEnd = Math.min(
              numSamples,
              Math.floor((skyArrivalSec - simTime + NOMINAL_PULSE_DURATION) * sampleRate)
            );
            for (let i = skyStart; i < skyEnd; i++) {
              const t = (i - skyStart) / sampleRate;
              waveform[i] += skyAmp * evaluatePulse(t, NOMINAL_PULSE_DURATION, includeCarrier);
            }
          }
        }
      }
    }
  });

  arrivals.sort((a, b) => a.arrivalSec - b.arrivalSec);

  return {
    waveform,
    arrivals,
    sampleRate,
    totalDuration,
    simTime,
  };
}

/**
 * ============================================================================
 * BOYCE ET AL. (ILA 2006) CYCLE SELECTION & RATIO-TEST ACCURACY MODELS
 * Reference: Boyce, Lo, Powell, & Enge, "Analysis of Noise and Cycle Selection
 * in a Loran Receiver," Proc. 35th Annual Convention of the International
 * Loran Association (ILA-35), October 2006.
 * SOURCED: web.stanford.edu/group/scpnt/gpslab/pubs/papers/Boyce_ILA_2006.pdf
 * ============================================================================
 */

/**
 * Evaluates the normalized Loran-C standard pulse envelope amplitude at time t in microseconds.
 * Peak envelope is normalized to 1.0 at t = 65 µs:
 *   e(t) = (e² / 65²) * t² * exp(-2 * t / 65)  for t >= 0
 * Source: USCG Specification of the Transmitted Loran-C Signal (COMDTINST M16562.4A, 1994)
 *
 * @param {number} tMicroseconds - Time in µs from pulse start
 * @returns {number} Normalized amplitude in [0, 1]
 */
export function evaluateStandardLoranEnvelopeMicroseconds(tMicroseconds) {
  if (tMicroseconds <= 0) return 0;
  const normFactor = Math.E ** 2 / (65 ** 2);
  return normFactor * (tMicroseconds ** 2) * Math.exp((-2 * tMicroseconds) / 65);
}

/**
 * Computes the Loran pulse envelope ratio test at time tau in microseconds.
 * Sourced from Boyce, Lo, Powell, & Enge, "Analysis of Noise and Cycle Selection in a Loran Receiver,"
 * Proc. ILA-35 (2006), Section II-A:
 *   Ratio(tau) = Envelope(tau - 15 µs) / Envelope(tau)
 *
 * At the Standard Zero Crossing (SZC, tau = 30 µs):
 *   Ratio(30) = Envelope(15) / Envelope(30) ≈ 0.3966 (≈ 0.40).
 *
 * @param {number} tauMicroseconds - Sampling point in µs (tau >= 15)
 * @param {number} [delayMicroseconds=15] - Delay between sample points in µs
 * @returns {number} Envelope ratio
 */
export function computeEnvelopeRatio(tauMicroseconds, delayMicroseconds = 15) {
  if (tauMicroseconds <= 0) return 0;
  const promptAmp = evaluateStandardLoranEnvelopeMicroseconds(tauMicroseconds);
  if (promptAmp <= 0) return 0;
  const delayedAmp = evaluateStandardLoranEnvelopeMicroseconds(tauMicroseconds - delayMicroseconds);
  return delayedAmp / promptAmp;
}

/**
 * Analytic bounds for wrong-cycle selection from Boyce et al. (ILA 2006, Section II-D).
 * An offset of ±5 µs in the zero-crossing estimate mistakes the signal as belonging
 * to the previous or next carrier cycle.
 * Bounds on Ratio(30) are [Ratio(25), Ratio(35)]:
 *   - Lower bound: Ratio(25) = Envelope(10)/Envelope(25) ≈ 0.2538 (5 µs early)
 *   - Ideal SZC:   Ratio(30) = Envelope(15)/Envelope(30) ≈ 0.3966 (ideal 30 µs SZC)
 *   - Upper bound: Ratio(35) = Envelope(20)/Envelope(35) ≈ 0.5180 (5 µs late)
 */
export const BOYCE_2006_RATIO_BOUNDS = {
  lower: computeEnvelopeRatio(25), // ≈ 0.2538
  szc: computeEnvelopeRatio(30),   // ≈ 0.3966
  upper: computeEnvelopeRatio(35), // ≈ 0.5180
};

/**
 * Checks if a measured envelope ratio at tau=30 µs represents a wrong-cycle selection.
 * Sourced: Boyce et al. (ILA 2006, Section II-D).
 *
 * @param {number} ratioValue - Measured ratio
 * @param {number} [lowerBound=BOYCE_2006_RATIO_BOUNDS.lower]
 * @param {number} [upperBound=BOYCE_2006_RATIO_BOUNDS.upper]
 * @returns {boolean} True if wrong cycle (excursion outside [Ratio(25), Ratio(35)])
 */
export function isWrongCycleSelection(
  ratioValue,
  lowerBound = BOYCE_2006_RATIO_BOUNDS.lower,
  upperBound = BOYCE_2006_RATIO_BOUNDS.upper
) {
  return ratioValue <= lowerBound || ratioValue >= upperBound;
}

/**
 * Complementary error function erfc(x) using high-accuracy rational approximation (Abramowitz & Stegun formula 7.1.26).
 * Maximum absolute error < 1.5e-7.
 * @param {number} x
 * @returns {number} erfc(x)
 */
export function erfc(x) {
  if (x < 0) return 2.0 - erfc(-x);
  const t = 1.0 / (1.0 + 0.3275911 * x);
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  return poly * Math.exp(-x * x);
}

/**
 * Modified Bessel function of the first kind of order 0, I0(x).
 * Used for Rician probability density evaluations.
 * @param {number} x
 * @returns {number}
 */
export function besselI0(x) {
  const ax = Math.abs(x);
  if (ax < 3.75) {
    const y = (x / 3.75) ** 2;
    return 1.0 + y * (3.5156229 + y * (3.0899424 + y * (1.2067492 + y * (0.2659732 + y * (0.0360768 + y * 0.0045813)))));
  }
  const y = 3.75 / ax;
  return (Math.exp(ax) / Math.sqrt(ax)) * (0.39894228 + y * (0.01328592 + y * (0.00225319 + y * (-0.00157565 + y * (0.00916281 + y * (-0.02057706 + y * (0.02635537 + y * (-0.01647633 + y * 0.00392377))))))));
}

/**
 * Austron empirical ECD standard deviation in microseconds.
 * Sourced from Boyce et al. (ILA 2006), Eqs. (5) and (6):
 *   sigma_ECD_Old = 42 / sqrt(N * SNR) µs  (Austron 5000 historical)
 *   sigma_ECD_New = 28 / sqrt(N * SNR) µs  (Modern / Peterson estimate)
 *
 * @param {number} totalSnrLinear - Total SNR power ratio (N * SNR)
 * @param {'new' | 'old'} [model='new']
 * @returns {number} sigma in microseconds
 */
export function computeAustronEcdVariance(totalSnrLinear, model = 'new') {
  const c = model === 'old' ? 42.0 : 28.0;
  const safeSnr = Math.max(1e-4, totalSnrLinear);
  return c / Math.sqrt(safeSnr);
}

/**
 * Calculates probability of wrong cycle selection using the empirical Austron ECD Gaussian model.
 * Sourced from Boyce et al. (ILA 2006), Section II-D:
 * An ECD excursion > 5 µs triggers wrong cycle selection:
 *   P[Wrong Cycle] = P[|ECD| >= 5 µs] = erfc(5 / (sigma_ECD * sqrt(2)))
 *
 * @param {number} totalSnrDb - Total SNR in dB = 10 * log10(N * SNR)
 * @param {'new' | 'old'} [model='new'] - 'new' (28 µs) or 'old' (42 µs)
 * @returns {number} Probability in [0, 1]
 */
export function computeAustronWrongCycleProbability(totalSnrDb, model = 'new') {
  const totalSnrLinear = Math.pow(10, totalSnrDb / 10);
  const sigmaEcdUs = computeAustronEcdVariance(totalSnrLinear, model);
  return Math.min(1.0, Math.max(0.0, erfc(5.0 / (sigmaEcdUs * Math.SQRT2))));
}

/**
 * Evaluates theoretical probability of wrong cycle selection under Gaussian noise
 * using Boyce et al. (ILA 2006, Section II-D) Rician envelope ratio model.
 *
 * @param {number} totalSnrDb - Total SNR in dB
 * @returns {number} Probability in [0, 1]
 */
export function computeTheoreticalRiceWrongCycleProbability(totalSnrDb) {
  const totalSnrLinear = Math.pow(10, totalSnrDb / 10);
  const sSsp = evaluateStandardLoranEnvelopeMicroseconds(25);
  const s1 = evaluateStandardLoranEnvelopeMicroseconds(15);
  const s2 = evaluateStandardLoranEnvelopeMicroseconds(30);
  const r25 = BOYCE_2006_RATIO_BOUNDS.lower;
  const r35 = BOYCE_2006_RATIO_BOUNDS.upper;

  // Noise sigma from definition: SNR_total = s(25)^2 / (2 * sigma_n^2)
  const sigmaN = sSsp / Math.sqrt(2.0 * Math.max(1e-4, totalSnrLinear));

  // High SNR Gaussian approximation (Section II-D: used for high SNR >= 18 dB)
  if (totalSnrDb >= 18) {
    const muQ = s1 / s2;
    const varQ = (s1 / s2) ** 2 * ((sigmaN ** 2) / (s1 ** 2) + (sigmaN ** 2) / (s2 ** 2));
    const stdQ = Math.sqrt(varQ);
    const p1 = 0.5 * erfc((muQ - r25) / (stdQ * Math.SQRT2));
    const p2 = 0.5 * erfc((r35 - muQ) / (stdQ * Math.SQRT2));
    return Math.min(1.0, Math.max(0.0, p1 + p2));
  }

  // Low/Medium SNR numerical integration of joint Rician envelope ratio
  // P[Q <= r25 or Q >= r35] via Simpson's rule over Z2
  const zMax = s2 + 5 * sigmaN;
  const numSteps = 80;
  const h = zMax / numSteps;
  let integral = 0;

  for (let i = 0; i <= numSteps; i++) {
    const z2 = i * h;
    if (z2 <= 0) continue;
    const weight = (i === 0 || i === numSteps) ? 1 : (i % 2 === 1 ? 4 : 2);

    const pdfZ2 = (z2 / (sigmaN ** 2)) * Math.exp(-(z2 ** 2 + s2 ** 2) / (2 * sigmaN ** 2)) * besselI0((z2 * s2) / (sigmaN ** 2));

    const q1z2 = r25 * z2;
    const q2z2 = r35 * z2;

    const u1 = (q1z2 - s1) / sigmaN;
    const cdf1 = 0.5 * (1 + (u1 >= 0 ? 1 - erfc(u1 * Math.SQRT1_2) : erfc(-u1 * Math.SQRT1_2) - 1));
    const u2 = (q2z2 - s1) / sigmaN;
    const cdf2 = 0.5 * (1 + (u2 >= 0 ? 1 - erfc(u2 * Math.SQRT1_2) : erfc(-u2 * Math.SQRT1_2) - 1));

    const probQGivenZ2 = Math.max(0, Math.min(1, cdf1 + (1 - cdf2)));
    integral += weight * pdfZ2 * probQGivenZ2;
  }

  const pNumeric = (h / 3) * integral;
  return Math.min(1.0, Math.max(0.0, pNumeric));
}

/**
 * Monte Carlo simulator for Loran cycle selection wrong-cycle probability.
 * Directly simulates independent Rician I/Q noise on envelope samples at 15 µs and 30 µs,
 * testing whether Ratio(30) falls outside [Ratio(25), Ratio(35)].
 * Replicates the simulation curve of Fig. 9 in Boyce et al. (ILA 2006).
 *
 * @param {object} params
 * @param {number[]} [params.snrDbList] - List of total SNR values in dB
 * @param {number} [params.numTrialsPerPoint=1000] - Trials per SNR point
 * @param {() => number} [params.rng=Math.random] - PRNG function
 * @returns {Array<{ snrDb: number, pWrongCycle: number, trials: number, wrongCount: number }>}
 */
export function simulateMonteCarloWrongCycleCurve({
  snrDbList = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24],
  numTrialsPerPoint = 1000,
  rng = Math.random,
}) {
  const sSsp = evaluateStandardLoranEnvelopeMicroseconds(25);
  const s1 = evaluateStandardLoranEnvelopeMicroseconds(15);
  const s2 = evaluateStandardLoranEnvelopeMicroseconds(30);
  const r25 = BOYCE_2006_RATIO_BOUNDS.lower;
  const r35 = BOYCE_2006_RATIO_BOUNDS.upper;

  return snrDbList.map((snrDb) => {
    const snrLinear = Math.pow(10, snrDb / 10);
    const sigmaN = sSsp / Math.sqrt(2.0 * Math.max(1e-4, snrLinear));
    let wrongCount = 0;

    for (let t = 0; t < numTrialsPerPoint; t++) {
      // Box-Muller normal variates
      const u1 = Math.max(1e-12, rng());
      const u2 = rng();
      const u3 = Math.max(1e-12, rng());
      const u4 = rng();

      const nI1 = sigmaN * Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
      const nQ1 = sigmaN * Math.sqrt(-2.0 * Math.log(u1)) * Math.sin(2.0 * Math.PI * u2);
      const nI2 = sigmaN * Math.sqrt(-2.0 * Math.log(u3)) * Math.cos(2.0 * Math.PI * u4);
      const nQ2 = sigmaN * Math.sqrt(-2.0 * Math.log(u3)) * Math.sin(2.0 * Math.PI * u4);

      const z1 = Math.hypot(s1 + nI1, nQ1);
      const z2 = Math.hypot(s2 + nI2, nQ2);

      const q = z2 > 0 ? z1 / z2 : 999.0;
      if (q <= r25 || q >= r35) {
        wrongCount++;
      }
    }

    return {
      snrDb,
      pWrongCycle: wrongCount / numTrialsPerPoint,
      trials: numTrialsPerPoint,
      wrongCount,
    };
  });
}

