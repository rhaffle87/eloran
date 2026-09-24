/**
 * Clock Models and Oscillator Physics for LORAN LAB
 * Simulates timing discipline, oscillator bias, aging/temperature drift, and noise.
 */

export const OSCILLATOR_PRESETS = {
  'cesium': {
    name: 'Cesium Beam Standard',
    description: 'Ultra-stable primary atomic standard (Cs-133)',
    typicalDriftSecPerSec: 1e-13,
    typicalBiasSec: 0,
    noiseStdSec: 1e-10,
  },
  'rubidium': {
    name: 'Rubidium Atomic Clock',
    description: 'Compact secondary atomic standard',
    typicalDriftSecPerSec: 1e-11,
    typicalBiasSec: 0,
    noiseStdSec: 5e-10,
  },
  'gps-disciplined': {
    name: 'GPS-Disciplined Oscillator (GPSDO)',
    description: 'Steered quartz/rubidium phase-locked to UTC(GNSS)',
    typicalDriftSecPerSec: 1e-12,
    typicalBiasSec: 0,
    noiseStdSec: 2e-9,
  },
  'local-ocxo': {
    name: 'Oven-Controlled Crystal Oscillator (OCXO)',
    description: 'High-grade maritime receiver crystal in temperature oven',
    typicalDriftSecPerSec: 1e-9,
    typicalBiasSec: 1e-6,
    noiseStdSec: 1e-8,
  },
  'local-quartz': {
    name: 'Standard TCXO / Quartz Crystal',
    description: 'Low-cost commercial receiver uncompensated crystal',
    typicalDriftSecPerSec: 1e-7,
    typicalBiasSec: 5e-6,
    noiseStdSec: 1e-7,
  },
};

/**
 * Creates a deterministic seedable pseudo-random number generator (Mulberry32).
 * @param {number} seed - Integer seed
 * @returns {() => number} RNG function returning float in [0, 1)
 */
export function createMulberry32(seed = 1337) {
  let a = (seed >>> 0) || 1;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generates Gaussian (normal) noise with zero mean and given standard deviation using Box-Muller.
 * @param {number} stdDev - Standard deviation
 * @param {() => number} [rng=Math.random] - Uniform random generator
 * @returns {number} Sample from N(0, stdDev^2)
 */
export function gaussianNoise(stdDev, rng = Math.random) {
  if (stdDev <= 0) return 0;
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return stdDev * Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/**
 * Computes the total effective clock timing offset at time tSec.
 * @param {{type?: string, biasSec?: number, driftPerSec?: number}} clock - Clock descriptor
 * @param {number} simTimeSec - Simulation elapsed time in seconds
 * @returns {number} Time offset in seconds
 */
export function simulateClockOffset(clock, simTimeSec) {
  if (!clock) return 0;
  const bias = Number(clock.biasSec) || 0;
  const drift = Number(clock.driftPerSec) || 0;
  return bias + drift * simTimeSec;
}
