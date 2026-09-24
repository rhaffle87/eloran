/**
 * Clock Models and Oscillator Physics for LORAN LAB
 *
 * Implements:
 *   1. Deterministic drift + bias model (first-order polynomial)
 *   2. Allan deviation / ITU-T G.811 noise model (Random Walk FM + Flicker FM)
 *
 * References:
 *   - ITU-T G.811 (1997), "Timing characteristics of primary reference clocks"
 *   - Allan, D.W. (1987). "Time and Frequency (Time-Domain) Characterization,
 *     Estimation, and Prediction of Precision Clocks and Oscillators."
 *     IEEE Trans. UFFC 34(6), pp. 647–654.
 *   - IEEE Std 1139-2008, "Standard Definitions of Physical Quantities for
 *     Fundamental Frequency and Time Metrology."
 *   - Pelgrum, W. (2006), TU Delft PhD thesis, Section 4.2 (eLoran clock budgets).
 */

export const OSCILLATOR_PRESETS = {
  'cesium': {
    name: 'Cesium Beam Standard',
    description: 'Ultra-stable primary atomic standard (Cs-133). Used in eLoran transmitters.',
    // Deterministic parameters
    typicalDriftSecPerSec: 1e-13,
    typicalBiasSec: 0,
    // Allan deviation noise parameters (σ_y in s/s)
    // Random Walk FM floor at τ=1s (RWFM)
    allanRwfmSqrtSec: 1e-14,    // h_{-2} term coeff: σ_rw ~ allanRwfmSqrtSec * sqrt(τ)
    // White Phase Modulation noise
    allanWpmSec: 5e-12,          // h_2 term coeff: σ_wpm ~ allanWpmSec / sqrt(τ)
    // Short-term noise floor
    noiseStdSec: 1e-10,
  },
  'rubidium': {
    name: 'Rubidium Atomic Clock',
    description: 'Compact secondary atomic standard (Rb-87 gas cell).',
    typicalDriftSecPerSec: 1e-11,
    typicalBiasSec: 0,
    allanRwfmSqrtSec: 1e-12,
    allanWpmSec: 1e-10,
    noiseStdSec: 5e-10,
  },
  'gps-disciplined': {
    name: 'GPS-Disciplined Oscillator (GPSDO)',
    description: 'Steered quartz/rubidium phase-locked to UTC(GNSS). Excellent short-term, GNSS-dependent.',
    typicalDriftSecPerSec: 1e-12,
    typicalBiasSec: 0,
    allanRwfmSqrtSec: 5e-13,
    allanWpmSec: 2e-9,
    noiseStdSec: 2e-9,
  },
  'local-ocxo': {
    name: 'Oven-Controlled Crystal Oscillator (OCXO)',
    description: 'High-grade maritime receiver crystal in temperature oven.',
    typicalDriftSecPerSec: 1e-9,
    typicalBiasSec: 1e-6,
    allanRwfmSqrtSec: 1e-10,
    allanWpmSec: 1e-8,
    noiseStdSec: 1e-8,
  },
  'local-quartz': {
    name: 'Standard TCXO / Quartz Crystal',
    description: 'Low-cost commercial receiver uncompensated crystal.',
    typicalDriftSecPerSec: 1e-7,
    typicalBiasSec: 5e-6,
    allanRwfmSqrtSec: 1e-9,
    allanWpmSec: 1e-7,
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
 * Deterministic component only: offset = bias + drift × t.
 * For stochastic component, use sampleAllanNoise().
 *
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

/**
 * Samples stochastic phase noise from an Allan deviation model at observation interval τ.
 *
 * Models two dominant noise processes per ITU-T G.811 and IEEE Std 1139-2008:
 *   1. Random Walk FM (RWFM): σ_rw ∝ sqrt(τ)    — long-term drift instability
 *   2. White Phase Modulation (WPM): σ_wpm ∝ 1/sqrt(τ) — short-term thermal noise floor
 *
 * Note: Flicker FM (σ_ffm ~ const vs τ) is omitted for simplicity; it would require
 * generating 1/f noise sequences, which is overkill for a real-time simulator.
 *
 * @param {string} clockType - Key from OSCILLATOR_PRESETS
 * @param {number} tau - Observation interval in seconds (typically 1 GRI ≈ 0.001–0.1 s)
 * @param {() => number} [rng=Math.random] - PRNG function
 * @returns {number} Stochastic phase offset sample in seconds
 */
export function sampleAllanNoise(clockType, tau = 1.0, rng = Math.random) {
  const preset = OSCILLATOR_PRESETS[clockType] || OSCILLATOR_PRESETS['local-quartz'];
  const safeTau = Math.max(1e-6, tau);

  // RWFM (Random Walk FM): time deviation σ_rw(τ) = allanRwfmSqrtSec * sqrt(τ)
  const sigmaRwfm = (preset.allanRwfmSqrtSec || 0) * Math.sqrt(safeTau);

  // WPM (White Phase Mod): time deviation σ_wpm(τ) = allanWpmSec / sqrt(τ)
  const sigmaWpm = (preset.allanWpmSec || 0) / Math.sqrt(safeTau);

  // Combined 1-sigma noise
  const totalSigma = Math.sqrt(sigmaRwfm ** 2 + sigmaWpm ** 2);

  return gaussianNoise(totalSigma, rng);
}

/**
 * Returns a human-readable Allan deviation summary string for a clock type at τ = 1 s.
 * @param {string} clockType
 * @returns {string}
 */
export function allanDeviationSummary(clockType) {
  const preset = OSCILLATOR_PRESETS[clockType];
  if (!preset) return 'Unknown clock type';
  const sigmaAt1s = Math.sqrt(
    (preset.allanRwfmSqrtSec || 0) ** 2 + (preset.allanWpmSec || 0) ** 2
  );
  return `${clockType}: σ_y(τ=1s) ≈ ${sigmaAt1s.toExponential(2)} s/s`;
}
