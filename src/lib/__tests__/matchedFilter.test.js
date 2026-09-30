import { describe, it, expect } from 'vitest';
import {
  PHASE_CODES,
  INTERPULSE_SPACING_US,
  generateTestSignal,
  buildFilterTemplate,
  correlateSingleEpoch,
  acquireSignal,
  correlationWaterfall,
  AcquisitionState,
} from '../matchedFilter.js';

describe('Cold-Start GRI Matched-Filter Acquisition (matchedFilter.js)', () => {
  // ─── Phase Code constants ──────────────────────────────────────────────────

  it('Phase Code A and B master sequences have exactly 9 elements with values ±1', () => {
    for (const key of ['masterA', 'masterB']) {
      expect(PHASE_CODES[key]).toHaveLength(9);
      for (const v of PHASE_CODES[key]) expect(Math.abs(v)).toBe(1);
    }
  });

  it('Phase Code A and B secondary sequences have exactly 8 elements with values ±1', () => {
    for (const key of ['secondaryA', 'secondaryB']) {
      expect(PHASE_CODES[key]).toHaveLength(8);
      for (const v of PHASE_CODES[key]) expect(Math.abs(v)).toBe(1);
    }
  });

  it('Phase Code A and B are orthogonal (dot product = 0 for secondary)', () => {
    // Standard Loran-C codes are constructed to be orthogonal over a 2-GRI period
    const dotSec = PHASE_CODES.secondaryA.reduce(
      (s, v, i) => s + v * PHASE_CODES.secondaryB[i], 0
    );
    expect(dotSec).toBe(0);
  });

  // ─── Template builder ──────────────────────────────────────────────────────

  it('buildFilterTemplate returns 9 pulses for master with correct spacings', () => {
    const tpl = buildFilterTemplate(true);
    expect(tpl).toHaveLength(9);
    // First 8 pulses: 1000 µs spacing
    for (let p = 0; p < 7; p++) {
      expect(tpl[p + 1].offsetUs - tpl[p].offsetUs).toBe(INTERPULSE_SPACING_US);
    }
    // 9th pulse: 2000 µs after 8th (index 7 -> index 8)
    expect(tpl[8].offsetUs - tpl[7].offsetUs).toBe(2000);
  });

  it('buildFilterTemplate returns 8 pulses for secondary with 1000 µs spacings', () => {
    const tpl = buildFilterTemplate(false);
    expect(tpl).toHaveLength(8);
    for (let p = 0; p < 7; p++) {
      expect(tpl[p + 1].offsetUs - tpl[p].offsetUs).toBe(INTERPULSE_SPACING_US);
    }
  });

  // ─── Signal generation ─────────────────────────────────────────────────────

  it('generateTestSignal returns Float32Array with correct total length', () => {
    const gri = 9007;
    const griUs = gri * 10;
    const numGris = 4;
    const sig = generateTestSignal({ griUs, epochOffsetUs: 0, numGris });
    expect(sig).toBeInstanceOf(Float32Array);
    expect(sig.length).toBe(numGris * griUs);
  });

  it('generateTestSignal is deterministic with same seed', () => {
    const params = { griUs: 74990, epochOffsetUs: 1000, numGris: 2, seed: 7 };
    const s1 = generateTestSignal(params);
    const s2 = generateTestSignal(params);
    expect(s1[0]).toBeCloseTo(s2[0], 10);
    expect(s1[100]).toBeCloseTo(s2[100], 10);
  });

  // ─── Single-epoch correlation ──────────────────────────────────────────────

  it('correlateSingleEpoch produces peak ≥ 0.8 at the true epoch (no noise, master)', () => {
    const epochUs = 500;
    const gri = 9007;
    const griUs = gri * 10;
    // Generate a noiseless signal by using a very high SNR
    const sig = generateTestSignal({ griUs, epochOffsetUs: epochUs, numGris: 6, snrDb: 40 });
    const corr = correlateSingleEpoch(sig, epochUs, true);
    expect(corr).toBeGreaterThan(0.8);
  });

  it('correlateSingleEpoch produces near-zero correlation at a random offset (no noise)', () => {
    const epochUs = 0;
    const wrongEpoch = 5000;
    const gri = 9007;
    const griUs = gri * 10;
    const sig = generateTestSignal({ griUs, epochOffsetUs: epochUs, numGris: 4, snrDb: 40 });
    const corr = correlateSingleEpoch(sig, wrongEpoch, true);
    expect(Math.abs(corr)).toBeLessThan(0.5); // significantly below detection threshold
  });

  // ─── Full acquisition sweep ────────────────────────────────────────────────

  it('acquireSignal locks onto the correct GRI (9007) with no noise', () => {
    const trueGri = 9007;
    const truePeriodUs = trueGri * 10;
    const trueEpoch = 0;
    const sig = generateTestSignal({
      griUs: truePeriodUs,
      epochOffsetUs: trueEpoch,
      isMaster: true,
      numGris: 4,
      snrDb: 40, // high SNR, near-noiseless
    });

    const result = acquireSignal(sig, {
      candidateGris: [7499, 9007, 9960],
      isMaster: true,
      peakThreshold: 0.25,
    });

    expect(result.state).toBe(AcquisitionState.LOCKED);
    expect(result.detectedGri).toBe(trueGri);
    expect(result.peakCorrelation).toBeGreaterThan(0.25);
  });

  it('acquireSignal locks onto GRI 7499 with realistic -5 dB SNR', () => {
    const trueGri = 7499;
    const truePeriodUs = trueGri * 10;
    const sig = generateTestSignal({
      griUs: truePeriodUs,
      epochOffsetUs: 2000,
      isMaster: true,
      numGris: 8, // More periods improves coherent averaging gain
      snrDb: -5,
      seed: 12345,
    });

    const result = acquireSignal(sig, {
      candidateGris: [7499, 9007, 9960],
      isMaster: true,
      peakThreshold: 0.10, // Lower threshold for noisy conditions
    });

    expect(result.state).toBe(AcquisitionState.LOCKED);
    expect(result.detectedGri).toBe(trueGri);
  });

  it('acquireSignal returns FAILED when signal is pure noise', () => {
    const sig = new Float32Array(500000).map(() => Math.random() * 2 - 1);
    const result = acquireSignal(sig, {
      candidateGris: [9960],
      peakThreshold: 0.5, // High threshold - should not trip on noise
    });
    expect(result.state).toBe(AcquisitionState.FAILED);
    expect(result.detectedGri).toBeNull();
  });

  it('correlationWaterfall returns array with epochUs and normCorr fields', () => {
    const trueGri = 9007;
    const sig = generateTestSignal({
      griUs: trueGri * 10,
      epochOffsetUs: 0,
      isMaster: true,
      numGris: 4,
      snrDb: 20,
    });

    const waterfall = correlationWaterfall(sig, trueGri, { stepUs: 500 });
    expect(waterfall.length).toBeGreaterThan(10);
    for (const pt of waterfall) {
      expect(typeof pt.epochUs).toBe('number');
      expect(typeof pt.normCorr).toBe('number');
      expect(Number.isFinite(pt.normCorr)).toBe(true);
    }
    // The peak of the waterfall should be near epoch 0
    const peakPt = waterfall.reduce((a, b) => b.normCorr > a.normCorr ? b : a);
    expect(peakPt.epochUs).toBeLessThan(2000); // within 2000 µs of true epoch 0
  });
});
