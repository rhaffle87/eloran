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
