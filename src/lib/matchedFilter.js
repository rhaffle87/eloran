/**
 * Autonomous Cold-Start GRI Matched-Filter Signal Acquisition Engine for SIMULORAN
 *
 * Implements the sliding-window cross-correlator against Loran-C/eLoran
 * Phase Code sequences (Phase Code A and B, master and secondary).
 *
 * Mathematical basis:
 * - Offermans, G. W. A. (2007), "eLoran Definition Document", GLA/IALA
 * - USCG Light List Vol. I (2002), Appendix B: Loran-C Signal Characteristics
 * - Peterson, B. B. (2006), "Multi-chain eLoran Receiver Architectures"
 *
 * A Loran-C transmitter emits groups of 9 pulses (master) or 8 pulses (secondary)
 * with phase-coded phase modulation (0 or pi radians) repeating every 2 GRI periods:
 *
 *   Phase Code A (even GRI): Master [+,-,-,+,+,+,-,+,+]  Secondary [+,+,+,-,+,+,-,-]
 *   Phase Code B (odd GRI):  Master [+,+,-,-,+,-,+,-,+]  Secondary [+,-,+,-,-,+,+,+]
 *
 * The correlation peak at the correct epoch offset identifies both the GRI period
 * and station epoch timing for sub-microsecond synchronization.
 */

// Standard Loran-C / eLoran Phase Code sequences (USCG specification)
// Each element: +1 (zero phase) or -1 (pi phase)
export const PHASE_CODES = {
  /** Master station 9-pulse Phase Code A (even GRI period) */
  masterA:    [ 1, -1, -1,  1,  1,  1, -1,  1,  1],
  /** Master station 9-pulse Phase Code B (odd GRI period) */
  masterB:    [ 1,  1, -1, -1,  1, -1,  1, -1,  1],
  /** Secondary station 8-pulse Phase Code A (even GRI period) */
  secondaryA: [ 1,  1,  1, -1,  1,  1, -1, -1],
  /** Secondary station 8-pulse Phase Code B (odd GRI period) */
  secondaryB: [ 1, -1,  1, -1, -1,  1,  1,  1],
};

/** Interpulse spacing within a pulse group: 1000 µs between each pulse */
export const INTERPULSE_SPACING_US = 1000;

/** Ninth pulse (master only) additional offset: 2000 µs after 8th */
export const MASTER_NINTH_PULSE_OFFSET_US = 2000;

/**
 * Generates a synthetic noisy Loran-C signal time-series for testing.
 *
 * The signal is a sequence of unit impulses at the expected phase-coded
 * pulse positions, repeated over `numGris` GRI periods, with additive
 * white Gaussian noise at the specified SNR.
 *
 * @param {Object} params
 * @param {number} params.griUs - GRI value in microseconds (e.g., 74990 for GRI 7499)
 * @param {number} params.epochOffsetUs - True epoch offset of the signal within [0, griUs)
 * @param {boolean} [params.isMaster=true] - True for master (9-pulse), false for secondary (8-pulse)
 * @param {number} [params.numGris=4] - Number of GRI periods to generate
 * @param {number} [params.sampleRateUs=1] - Sample period in microseconds (default: 1 µs)
 * @param {number} [params.snrDb=-5] - Signal-to-noise ratio in dB (default: -5 dB)
 * @param {number} [params.seed=42] - PRNG seed for reproducibility
 * @returns {Float32Array} Signal samples at `sampleRateUs` resolution
 */
export function generateTestSignal({
  griUs,
  epochOffsetUs,
  isMaster = true,
  numGris = 4,
  sampleRateUs = 1,
  snrDb = -5,
  seed = 42,
}) {
  const totalSamples = Math.ceil((numGris * griUs) / sampleRateUs);
  const signal = new Float32Array(totalSamples);

  // Phase code alternates A on even GRI periods, B on odd GRI periods
  const codeA = isMaster ? PHASE_CODES.masterA : PHASE_CODES.secondaryA;
  const codeB = isMaster ? PHASE_CODES.masterB : PHASE_CODES.secondaryB;
  const numPulses = codeA.length;

  // Add phase-coded pulse impulses
  for (let g = 0; g < numGris; g++) {
    const code = g % 2 === 0 ? codeA : codeB;
    const griStartUs = g * griUs;

    for (let p = 0; p < numPulses; p++) {
      let pulseOffsetUs = epochOffsetUs + p * INTERPULSE_SPACING_US;
      // Master station: 9th pulse is 2000 µs after the 8th
      if (isMaster && p === 8) {
        pulseOffsetUs = epochOffsetUs + 7 * INTERPULSE_SPACING_US + MASTER_NINTH_PULSE_OFFSET_US;
      }
      const sampleIdx = Math.round((griStartUs + pulseOffsetUs) / sampleRateUs);
      if (sampleIdx >= 0 && sampleIdx < totalSamples) {
        signal[sampleIdx] += code[p];
      }
    }
  }

  // Add Gaussian noise proportional to SNR
  const snrLinear = Math.pow(10, snrDb / 10);
  const signalPower = signal.reduce((s, v) => s + v * v, 0) / totalSamples;
  const noisePower = signalPower / snrLinear;
  const noiseStd = Math.sqrt(noisePower);

  // Seeded PRNG (Mulberry32)
  let prng = seed >>> 0;
  const rand = () => {
    prng += 0x6D2B79F5;
    let t = Math.imul(prng ^ (prng >>> 15), 1 | prng);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // Box-Muller transform for Gaussian noise
  for (let i = 0; i < totalSamples - 1; i += 2) {
    const u1 = Math.max(1e-10, rand());
    const u2 = rand();
    const mag = noiseStd * Math.sqrt(-2 * Math.log(u1));
    signal[i]     += mag * Math.cos(2 * Math.PI * u2);
    signal[i + 1] += mag * Math.sin(2 * Math.PI * u2);
  }

  return signal;
}

/**
 * Builds the matched filter template for one GRI period.
 *
 * The template is a sparse array of (offset_us, phase) pairs representing
 * the expected pulse positions within a single GRI period using Phase Code A.
 *
 * @param {boolean} [isMaster=true] - True for 9-pulse master, false for 8-pulse secondary
 * @returns {Array<{offsetUs: number, phase: number}>} Pulse template
 */
export function buildFilterTemplate(isMaster = true) {
  const code = isMaster ? PHASE_CODES.masterA : PHASE_CODES.secondaryA;
  const numPulses = code.length;
  const template = [];

  for (let p = 0; p < numPulses; p++) {
    let offsetUs = p * INTERPULSE_SPACING_US;
    if (isMaster && p === 8) {
      offsetUs = 7 * INTERPULSE_SPACING_US + MASTER_NINTH_PULSE_OFFSET_US;
    }
    template.push({ offsetUs, phase: code[p] });
  }
  return template;
}

/**
 * Computes the normalized cross-correlation of the signal against the
 * Phase Code A matched filter template at a specific hypothesized epoch offset.
 *
 * R(t) = S_p signal[t + offset_p] × phase_p  /  N_pulses
 *
 * @param {Float32Array} signal - Input signal samples (1 µs/sample)
 * @param {number} epochHypothesisUs - Hypothesized epoch start in µs
 * @param {boolean} [isMaster=true] - Template type
 * @returns {number} Normalized correlation value in [-1, +1]
 */
export function correlateSingleEpoch(signal, epochHypothesisUs, isMaster = true) {
  if (!signal || typeof signal.length !== 'number' || signal.length === 0) return 0;
  const template = buildFilterTemplate(isMaster);
  let sum = 0;
  let count = 0;

  for (const { offsetUs, phase } of template) {
    const sampleIdx = Math.round(epochHypothesisUs + offsetUs);
    if (sampleIdx >= 0 && sampleIdx < signal.length) {
      sum += signal[sampleIdx] * phase;
      count++;
    }
  }

  return count > 0 ? sum / count : 0;
}

/**
 * Acquisition state enumeration
 */
export const AcquisitionState = Object.freeze({
  SEARCHING: 'SEARCHING',
  DETECTING: 'DETECTING',
  LOCKED:    'LOCKED',
  FAILED:    'FAILED',
});

/**
 * Performs autonomous GRI sweeping and cold-start signal acquisition.
 *
 * Sweeps a list of candidate GRIs, computing the sliding cross-correlation
 * profile for each and searching for periodic peaks at the GRI repetition rate.
 *
 * @param {Float32Array} signal - Input signal samples (assumed 1 µs/sample resolution)
 * @param {Object} [options]
 * @param {number[]} [options.candidateGris] - GRI values to search (default: common eLoran GRIs)
 * @param {boolean} [options.isMaster=true] - Template type
 * @param {number} [options.peakThreshold=0.25] - Minimum normalized correlation for detection
 * @param {number} [options.searchWindowUs=1000] - Coarse epoch search step size in µs
 * @returns {Object} Acquisition result descriptor
 */
export function acquireSignal(signal, options = {}) {
  const candidateGris = options.candidateGris ?? [
    6731, 7499, 7970, 8000, 9007, 9940, 9960, 5930, 5990,
  ];
  const isMaster = options.isMaster ?? true;
  const peakThreshold = options.peakThreshold ?? 0.25;
  const searchWindowUs = options.searchWindowUs ?? 1000;

  if (!signal || typeof signal.length !== 'number' || signal.length === 0) {
    return {
      state: AcquisitionState.SEARCHING,
      locked: false,
      bestGri: null,
      bestEpochUs: 0,
      peakCorrelation: 0,
      snrEstimateDb: -Infinity,
      candidateGris,
      profiles: {},
      totalCorrelations: 0,
    };
  }

  let bestGri = null;
  let bestEpoch = 0;
  let bestPeak = -Infinity;
  let bestProfile = [];
  let totalCorrelations = 0;

  for (const gri of candidateGris) {
    const griUs = gri * 10; // GRI number × 10 µs = actual period

    // Sweep candidate epochs from 0 to griUs with step = searchWindowUs
    const numEpochs = Math.ceil(griUs / searchWindowUs);
    const profile = [];
    let localBestPeak = -Infinity;
    let localBestEpoch = 0;

    for (let e = 0; e < numEpochs; e++) {
      const epochUs = e * searchWindowUs;

      // Coherently average correlation over multiple GRI periods (improves SNR)
      let cohSum = 0;
      let cohCount = 0;
      let periodOffset = epochUs;

      while (periodOffset + (isMaster ? 9000 : 8000) < signal.length) {
        // Alternate Phase Code A / B for coherent detection across GRI pairs
        // For Phase Code A template: even-period contributions add, odd-period flip
        const griPeriodIndex = Math.round((periodOffset - epochUs) / griUs);
        const phaseSign = griPeriodIndex % 2 === 0 ? 1 : -1; // code alternation
        cohSum += phaseSign * correlateSingleEpoch(signal, periodOffset, isMaster);
        cohCount++;
        periodOffset += griUs;
        totalCorrelations++;
      }

      const normCorr = cohCount > 0 ? cohSum / cohCount : 0;
      profile.push({ epochUs, normCorr });

      if (normCorr > localBestPeak) {
        localBestPeak = normCorr;
        localBestEpoch = epochUs;
      }
    }

    if (localBestPeak > bestPeak) {
      bestPeak = localBestPeak;
      bestGri = gri;
      bestEpoch = localBestEpoch;
      bestProfile = profile;
    }
  }

  const detected = bestPeak >= peakThreshold;

  return {
    state: detected ? AcquisitionState.LOCKED : AcquisitionState.FAILED,
    detectedGri: detected ? bestGri : null,
    epochOffsetUs: detected ? bestEpoch : null,
    peakCorrelation: parseFloat(bestPeak.toFixed(4)),
    threshold: peakThreshold,
    correlationProfile: bestProfile,
    searchedGris: candidateGris,
    totalCorrelations,
  };
}

/**
 * Computes a high-resolution correlation profile (waterfall sweep) for a given GRI,
 * suitable for display in the waveform acquisition panel.
 *
 * @param {Float32Array} signal - Input signal
 * @param {number} gri - GRI number (e.g., 7499)
 * @param {Object} [options]
 * @param {boolean} [options.isMaster=true]
 * @param {number} [options.stepUs=100] - Step size in µs for fine sweep
 * @returns {Array<{epochUs: number, normCorr: number}>} Correlation waterfall
 */
export function correlationWaterfall(signal, gri, options = {}) {
  if (!signal || typeof signal.length !== 'number' || signal.length === 0) return [];
  const isMaster = options.isMaster ?? true;
  const stepUs = options.stepUs ?? 100;
  const griUs = gri * 10;
  const result = [];

  const numSteps = Math.ceil(griUs / stepUs);
  for (let e = 0; e <= numSteps; e++) {
    const epochUs = e * stepUs;
    let cohSum = 0;
    let cohCount = 0;
    let periodOffset = epochUs;

    while (periodOffset + (isMaster ? 9000 : 8000) < signal.length) {
      const griPeriodIndex = Math.round((periodOffset - epochUs) / griUs);
      const phaseSign = griPeriodIndex % 2 === 0 ? 1 : -1;
      cohSum += phaseSign * correlateSingleEpoch(signal, periodOffset, isMaster);
      cohCount++;
      periodOffset += griUs;
    }

    result.push({
      epochUs,
      normCorr: cohCount > 0 ? cohSum / cohCount : 0,
    });
  }

  return result;
}
