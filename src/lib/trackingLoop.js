/**
 * Loran-C / eLoran Receiver Tracking Loop Simulation
 *
 * Implements standard closed-loop receiver architecture:
 *   1. Phase-Lock Loop (PLL) tracking of the Standard Zero Crossing (SZC) at 30 µs
 *   2. Envelope-to-Cycle Difference (ECD) monitoring via envelope ratio tests
 *   3. Wrong-cycle selection detection & cycle slip state machine (Boyce 2006)
 *   4. TOA tracking jitter injection (Rhee et al. 2021 empirical variance)
 *
 * References:
 *   - US Coast Guard Loran-C User Handbook (COMDTINST M16562.4A)
 *   - Boyce, C. O. L. (2006): "Atmospheric Noise and Wrong Cycle Identification"
 *   - Rhee et al. (2021): "An Analysis of Loran-C/eLoran TOA Noise Characteristics"
 */

import {
  computeAustronWrongCycleProbability,
  isWrongCycleSelection,
} from './pulse.js';

export const TRACKING_STATES = {
  ACQUIRING: 'ACQUIRING',
  LOCKED: 'LOCKED',
  SLIPPED: 'SLIPPED',
  LOST: 'LOST',
};

export const DEFAULT_TRACKING_CONFIG = {
  nominalSzcUs: 30.0,       // 30 µs standard zero crossing (cycle 3)
  carrierFreqHz: 100000,    // 100 kHz (10 µs period)
  pulsesAveraged: 10,       // Pulses integrated per GRI
  thresholdSnrDb: -10,      // Minimum SNR for signal lock
  maxHistoryGris: 50,       // Number of GRIs to keep in history
  loopGain: 0.15,           // PLL proportional tracking gain
};

/**
 * Creates a fresh tracking loop state.
 *
 * @param {object} [initialOptions]
 * @returns {object} Initialized tracking loop state
 */
export function createTrackingLoop(initialOptions = {}) {
  const config = { ...DEFAULT_TRACKING_CONFIG, ...initialOptions };
  return {
    state: TRACKING_STATES.ACQUIRING,
    cycleIndex: 3,            // Nominal cycle 3 (30 µs)
    phaseOffsetUs: 0.0,       // Carrier tracking error in µs
    estimatedSzcUs: 30.0,     // Total estimated SZC in µs
    ecdUs: 0.0,               // Envelope-to-Cycle Difference in µs
    snrDb: 18.0,
    lockConfidence: 0.0,      // [0..1]
    totalGris: 0,
    slipsCount: 0,
    config,
    history: [],              // Last N GRIs
    wrongCycleProb: computeAustronWrongCycleProbability(18.0),
  };
}

/**
 * Computes Gaussian random number with mean 0 and standard deviation sigma.
 */
function gaussianRandom(sigma, rng = Math.random) {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return sigma * Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/**
 * Calculates phase tracking jitter standard deviation in microseconds
 * based on Rhee et al. (2021) TOA noise model and pulse integration.
 *
 * @param {number} snrDb - Signal-to-noise ratio in dB
 * @param {number} pulsesAveraged - Number of pulses integrated
 * @returns {number} 1-sigma jitter in microseconds
 */
export function computeTrackingSigmaUs(snrDb, pulsesAveraged = 10) {
  const snrLinear = Math.pow(10, snrDb / 10.0);
  const nAvg = Math.max(1, pulsesAveraged);

  // Rhee 2021 model: sigma_m = sqrt(sigma_jitter^2 + k^2 / snr)
  // sigma_jitter = 6.0 m (~0.020 µs), k = 337.5 m (~1.126 µs)
  const jitterMeters = 6.0;
  const kMeters = 337.5;
  const varMeters = (jitterMeters * jitterMeters + (kMeters * kMeters) / Math.max(1e-4, snrLinear)) / nAvg;
  const sigmaMeters = Math.sqrt(varMeters);

  // Convert meters to microseconds: c ≈ 299.792458 m/µs
  return sigmaMeters / 299.792458;
}

/**
 * Steps the receiver tracking loop forward by 1 GRI.
 *
 * @param {object} prevState - Previous tracking loop state
 * @param {number} snrDb - Current measured SNR in dB
 * @param {object} [options]
 * @param {number} [options.trueEcdUs=0.0] - External physical ECD (e.g. from ground dispersion)
 * @param {function} [rng=Math.random] - RNG function
 * @returns {object} Updated tracking loop state
 */
export function stepTrackingLoop(prevState, snrDb, options = {}, rng = Math.random) {
  const config = prevState.config || DEFAULT_TRACKING_CONFIG;
  const totalGris = prevState.totalGris + 1;
  const trueEcd = options.trueEcdUs ?? 0.0;
  const sigmaUs = computeTrackingSigmaUs(snrDb, config.pulsesAveraged);

  let state = prevState.state;
  let cycleIndex = prevState.cycleIndex;
  let lockConfidence = prevState.lockConfidence;
  let slipsCount = prevState.slipsCount;

  // 1. Loss of Lock check
  if (snrDb < config.thresholdSnrDb) {
    state = TRACKING_STATES.LOST;
    lockConfidence = Math.max(0, lockConfidence - 0.2);
  } else if (state === TRACKING_STATES.LOST) {
    // Attempt reacquisition
    state = TRACKING_STATES.ACQUIRING;
    lockConfidence = 0.2;
  }

  // 2. Acquisition state progression
  if (state === TRACKING_STATES.ACQUIRING) {
    lockConfidence = Math.min(1.0, lockConfidence + 0.35);

    if (lockConfidence >= 1.0) {
      // Check if initial lock lands on wrong cycle
      const isWrong = isWrongCycleSelection(snrDb, config.pulsesAveraged, 'boyce-ratio', rng);
      if (isWrong) {
        cycleIndex = rng() > 0.5 ? 4 : 2; // Slipped to 40 µs or 20 µs
        state = TRACKING_STATES.SLIPPED;
        slipsCount += 1;
      } else {
        cycleIndex = 3; // Nominal 30 µs
        state = TRACKING_STATES.LOCKED;
      }
    }
  }

  // 3. Locked / Slipped state tracking & cycle slip check
  if (state === TRACKING_STATES.LOCKED || state === TRACKING_STATES.SLIPPED) {
    lockConfidence = 1.0;

    // Check spontaneous cycle slip probability
    // Boyce 2006: cycle slips increase sharply at SNR < 5 dB
    if (snrDb < 10) {
      const pSlipPerGri = Math.min(0.2, computeAustronWrongCycleProbability(snrDb) * 0.1);
      if (rng() < pSlipPerGri) {
        const slipDelta = rng() > 0.5 ? 1 : -1;
        cycleIndex = Math.max(1, Math.min(6, cycleIndex + slipDelta));
        slipsCount += 1;
        state = cycleIndex === 3 ? TRACKING_STATES.LOCKED : TRACKING_STATES.SLIPPED;
      }
    }
  }

  // 4. Closed-loop phase and ECD calculation
  const phaseNoise = gaussianRandom(sigmaUs, rng);
  const cycleOffsetUs = (cycleIndex - 3) * 10.0; // ±10 µs per cycle slip
  const phaseOffsetUs = prevState.phaseOffsetUs * (1.0 - config.loopGain) + phaseNoise * config.loopGain;

  // ECD tracking: tracks true physical ECD plus residual ratio error
  const ecdNoise = gaussianRandom(sigmaUs * 1.5, rng);
  const ecdUs = prevState.ecdUs * (1.0 - config.loopGain) + (trueEcd + ecdNoise) * config.loopGain;

  const estimatedSzcUs = config.nominalSzcUs + cycleOffsetUs + phaseOffsetUs;
  const wrongCycleProb = computeAustronWrongCycleProbability(snrDb);

  const historyItem = {
    gri: totalGris,
    state,
    cycleIndex,
    ecdUs: parseFloat(ecdUs.toFixed(3)),
    phaseOffsetUs: parseFloat(phaseOffsetUs.toFixed(3)),
    estimatedSzcUs: parseFloat(estimatedSzcUs.toFixed(3)),
    snrDb: parseFloat(snrDb.toFixed(1)),
  };

  const maxHistory = config.maxHistoryGris || 50;
  const history = [...(prevState.history || []), historyItem].slice(-maxHistory);

  return {
    ...prevState,
    state,
    cycleIndex,
    phaseOffsetUs: parseFloat(phaseOffsetUs.toFixed(4)),
    estimatedSzcUs: parseFloat(estimatedSzcUs.toFixed(3)),
    ecdUs: parseFloat(ecdUs.toFixed(3)),
    snrDb: parseFloat(snrDb.toFixed(1)),
    lockConfidence: parseFloat(lockConfidence.toFixed(2)),
    totalGris,
    slipsCount,
    wrongCycleProb: parseFloat(wrongCycleProb.toFixed(4)),
    history,
  };
}

/**
 * Deterministically forces a cycle slip for interactive testing and training.
 *
 * @param {object} currentState
 * @param {number} [direction=1] - +1 (slip to cycle 4 / 40 µs) or -1 (slip to cycle 2 / 20 µs)
 * @returns {object} Updated tracking state
 */
export function injectCycleSlip(currentState, direction = 1) {
  const newCycle = Math.max(1, Math.min(6, currentState.cycleIndex + (direction > 0 ? 1 : -1)));
  const state = newCycle === 3 ? TRACKING_STATES.LOCKED : TRACKING_STATES.SLIPPED;
  const slipsCount = currentState.slipsCount + (newCycle !== currentState.cycleIndex ? 1 : 0);

  return {
    ...currentState,
    cycleIndex: newCycle,
    state,
    slipsCount,
    estimatedSzcUs: currentState.config.nominalSzcUs + (newCycle - 3) * 10.0 + currentState.phaseOffsetUs,
  };
}

/**
 * Resets and forces reacquisition on the tracking loop.
 *
 * @param {object} currentState
 * @returns {object} Reset state
 */
export function reacquireTrackingLoop(currentState) {
  return {
    ...currentState,
    state: TRACKING_STATES.ACQUIRING,
    lockConfidence: 0.1,
    cycleIndex: 3,
  };
}
