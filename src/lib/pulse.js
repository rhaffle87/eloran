/**
 * 100 kHz RF Waveform & Pulse Group Generation Library
 * Implements Loran-C standard pulse envelope, 100 kHz carrier oscillation,
 * phase codes, and GRI timing structures.
 */

import { SPEED_OF_LIGHT, haversineDistance } from './geodesy.js';

export const LORAN_CARRIER_FREQ = 100000; // 100 kHz
export const NOMINAL_PULSE_DURATION = 0.0001; // 100 microseconds
export const DEFAULT_SAMPLE_RATE = 1000000; // 1 MHz sampling

/**
 * Standard Loran-C Phase Coding sequences (Group I):
 * Master: 9 pulses (+ + - - + - + - +)
 * Secondary: 8 pulses (+ + + + + - - +)
 */
export const PHASE_CODES = {
  master: [1, 1, -1, -1, 1, -1, 1, -1, 1],
  secondary: [1, 1, 1, 1, 1, -1, -1, 1],
};

/**
 * Computes single-pulse amplitude at time t (relative to pulse start).
 * @param {number} t - Time in seconds from pulse start (0 <= t <= pulseDuration)
 * @param {number} [pulseDuration=NOMINAL_PULSE_DURATION] - Pulse width in seconds
 * @param {boolean} [includeCarrier=false] - If true, modulates by 100 kHz carrier; else envelope only
 * @returns {number} Instantaneous amplitude in [-1, 1]
 */
export function evaluatePulse(t, pulseDuration = NOMINAL_PULSE_DURATION, includeCarrier = false) {
  if (t < 0 || t > pulseDuration) return 0;
  // Standard raised-cosine envelope
  const envelope = 0.5 * (1 + Math.cos((Math.PI * t) / pulseDuration));
  if (!includeCarrier) return envelope;
  // 100 kHz carrier sinusoid
  const carrier = Math.sin(2 * Math.PI * LORAN_CARRIER_FREQ * t);
  return envelope * carrier;
}

/**
 * Synthesizes time-series waveform buffer at a receiver from multiple station arrivals.
 *
 * @param {object} params
 * @param {Array<object>} params.stations - List of stations {lat, lng, role, txDbm, griMs}
 * @param {object} params.receiver - Receiver coordinate {lat, lng}
 * @param {number} [params.sampleRate=DEFAULT_SAMPLE_RATE] - Sampling frequency in Hz
 * @param {number} [params.totalDuration=0.01] - Total synthesized time window in seconds
 * @param {number} [params.simTime=0] - Simulation start time in seconds
 * @param {boolean} [params.includeCarrier=false] - Whether to generate 100 kHz carrier or envelope
 * @param {boolean} [params.includeSkywave=false] - Simulate ionospheric skywave reflections
 * @param {number} [params.skywaveDelayMs=1.5] - Delay of first skywave hop
 * @param {number} [params.skywaveAmpRatio=0.3] - Relative amplitude of skywave
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
  skywaveDelayMs = 1.5,
  skywaveAmpRatio = 0.3,
}) {
  const numSamples = Math.floor(totalDuration * sampleRate);
  const waveform = new Float32Array(numSamples);
  const arrivals = [];

  if (!stations.length || !receiver) {
    return { waveform, arrivals, sampleRate, totalDuration, simTime };
  }

  stations.forEach((station) => {
    const griSec = (station.griMs || 1000) / 1000;
    const phaseSec = station.phaseSec || 0;
    const propDelay = haversineDistance(station, receiver) / SPEED_OF_LIGHT;
    const clockOffset = (station.clock?.biasSec || 0) + (station.clock?.driftPerSec || 0) * simTime;
    const stationOffset = station.offsetSec || 0;

    // Base repetition index
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
        });

        // Add to composite waveform
        const startSample = Math.max(0, Math.floor((arrivalSec - simTime) * sampleRate));
        const endSample = Math.min(
          numSamples,
          Math.floor((arrivalSec - simTime + NOMINAL_PULSE_DURATION) * sampleRate)
        );

        for (let i = startSample; i < endSample; i++) {
          const t = (i - startSample) / sampleRate;
          waveform[i] += amplitude * evaluatePulse(t, NOMINAL_PULSE_DURATION, includeCarrier);
        }

        // Optional ionospheric skywave arrival
        if (includeSkywave) {
          const skyArrivalSec = arrivalSec + skywaveDelayMs / 1000;
          const skyAmp = amplitude * skywaveAmpRatio;

          if (skyArrivalSec <= simTime + totalDuration) {
            arrivals.push({
              station: station.label,
              role: station.role,
              arrivalSec: skyArrivalSec,
              amplitude: skyAmp,
              isSkywave: true,
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
