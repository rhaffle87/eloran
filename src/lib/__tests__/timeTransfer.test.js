import { describe, it, expect } from 'vitest';
import {
  gcd,
  lcm,
  computeTOC,
  computePropagationDelay,
  compute1PPSAlignment,
  computeAllanDeviationCurve,
  computeTimingAccuracy,
  SPEED_OF_LIGHT,
} from '../timeTransfer.js';

describe('Stratum-1 UTC Time Transfer Engine (timeTransfer.js)', () => {
  // ─── GCD / LCM utilities ──────────────────────────────────────────────────

  it('gcd(12, 8) = 4', () => expect(gcd(12, 8)).toBe(4));
  it('gcd(74990, 1000000) = 10', () => expect(gcd(74990, 1000000)).toBe(10));
  it('gcd(0, 5) = 5', () => expect(gcd(0, 5)).toBe(5));
  it('lcm(12, 8) = 24', () => expect(lcm(12, 8)).toBe(24));
  it('lcm(74990, 1000000) = 74990000000 / 10 = 7499000000', () => {
    // lcm(74990, 1000000) = 74990 * 1000000 / gcd(74990, 1000000) = 74990 * 100000 = 7,499,000,000
    expect(lcm(74990, 1_000_000)).toBe(7_499_000_000);
  });

  // ─── Time of Coincidence ──────────────────────────────────────────────────

  it('computeTOC(7499): GRI 7499 (74990 µs period) → TOC ≈ 7499 seconds', () => {
    const toc = computeTOC(7499);
    expect(toc.gri).toBe(7499);
    expect(toc.griPeriodUs).toBe(74990);
    // TOC_us = lcm(74990, 1000000)
    const expectedTocUs = lcm(74990, 1_000_000);
    expect(toc.tocUs).toBe(expectedTocUs);
    expect(toc.tocSec).toBeCloseTo(expectedTocUs / 1_000_000, 3);
  });

  it('computeTOC(9960): GRI 9960 (99600 µs period) → TOC = 249 seconds', () => {
    // lcm(99600, 1000000): gcd(99600, 1000000) = gcd(99600, 1000000)
    // 99600 = 2^4 × 3 × 5^2 × 83; 1000000 = 2^6 × 5^6
    // gcd = 2^4 × 5^2 = 400
    // lcm = 99600 * 1000000 / 400 = 249000000 µs = 249 s
    const toc = computeTOC(9960);
    expect(toc.tocSec).toBeCloseTo(249, 1);
    expect(toc.griPeriodUs).toBe(99600);
  });

  it('computeTOC(9007): result has required fields', () => {
    const toc = computeTOC(9007);
    expect(toc).toHaveProperty('gri', 9007);
    expect(toc).toHaveProperty('tocUs');
    expect(toc).toHaveProperty('tocSec');
    expect(toc).toHaveProperty('tocGriPeriods');
    expect(toc).toHaveProperty('description');
    expect(toc.tocUs).toBeGreaterThan(0);
    expect(toc.tocGriPeriods).toBeGreaterThanOrEqual(1);
  });

  it('computeTOC throws on invalid GRI', () => {
    expect(() => computeTOC(-1)).toThrow(RangeError);
    expect(() => computeTOC(0)).toThrow(RangeError);
  });

  // ─── Propagation delay ────────────────────────────────────────────────────

  it('computePropagationDelay: 500 km distance → delay ≈ 1.668 ms', () => {
    const delay = computePropagationDelay(500_000);
    // Free-space: 500000 / (299792458 / 1.000338) ≈ 1668 µs
    expect(delay.totalDelayNs).toBeGreaterThan(1_660_000); // > 1.66 ms in ns
    expect(delay.totalDelayNs).toBeLessThan(1_700_000);    // < 1.70 ms in ns
  });

  it('computePropagationDelay: zero distance → near-zero delay', () => {
    const delay = computePropagationDelay(0);
    expect(delay.totalDelaySec).toBe(0);
    expect(delay.pfNs).toBe(0);
  });

  it('computePropagationDelay: includes PF, SF, and ASF components', () => {
    const asfSec = 50e-9; // 50 ns ASF
    const delay = computePropagationDelay(100_000, 1.000338, asfSec);
    expect(delay.asfNs).toBeCloseTo(50, 1);
    expect(delay.pfNs).toBeGreaterThan(0);
    expect(delay.sfNs).toBeGreaterThan(0);
    expect(delay.totalDelayNs).toBeGreaterThan(delay.pfNs);
  });

  it('computePropagationDelay throws on negative distance', () => {
    expect(() => computePropagationDelay(-1)).toThrow(RangeError);
  });

  // ─── 1 PPS alignment ──────────────────────────────────────────────────────

  it('compute1PPSAlignment: zero delay error → near-zero 1PPS offset', () => {
    // True emission at exactly t=0, measured at t=propagation delay
    const propDelaySec = 1.668e-3;
    const measuredToa = propDelaySec; // perfect measurement
    const result = compute1PPSAlignment(measuredToa, 0, propDelaySec);
    expect(Math.abs(result.ppErrorNs)).toBeLessThan(1); // effectively zero
    expect(result.isWithin50ns).toBe(true);
  });

  it('compute1PPSAlignment: 30 ns residual → within 50 ns Stratum-1 target', () => {
    const propDelaySec = 1.668e-3;
    const residualErrorSec = 30e-9;
    const result = compute1PPSAlignment(
      propDelaySec + residualErrorSec, 0, propDelaySec
    );
    expect(Math.abs(result.ppErrorNs)).toBeCloseTo(30, 0);
    expect(result.isWithin50ns).toBe(true);
    expect(result.isWithin1us).toBe(true);
  });

  it('compute1PPSAlignment: 500 ns error within 1us but not 50 ns', () => {
    const trueEmissionSec = 5.0;
    const propDelaySec = 1.668e-3;
    const residualSec = 500e-9;
    const result = compute1PPSAlignment(
      trueEmissionSec + propDelaySec + residualSec,
      trueEmissionSec,
      propDelaySec
    );
    expect(Math.abs(result.ppErrorNs)).toBeCloseTo(500, 0);
    expect(result.isWithin50ns).toBe(false);
    expect(result.isWithin1us).toBe(true);
  });

  // ─── Allan deviation ──────────────────────────────────────────────────────

  it('computeAllanDeviationCurve returns correct length array', () => {
    const taus = [1, 10, 100, 1000];
    const curve = computeAllanDeviationCurve(taus, 'eloran');
    expect(curve).toHaveLength(4);
    for (const pt of curve) {
      expect(pt).toHaveProperty('tau');
      expect(pt).toHaveProperty('allanDev');
      expect(pt.allanDev).toBeGreaterThan(0);
      expect(Number.isFinite(pt.allanDev)).toBe(true);
    }
  });

  it('computeAllanDeviationCurve: cesium is better than OCXO at τ=1000s', () => {
    const taus = [1000];
    const cesium = computeAllanDeviationCurve(taus, 'cesium')[0].allanDev;
    const ocxo   = computeAllanDeviationCurve(taus, 'ocxo')[0].allanDev;
    expect(cesium).toBeLessThan(ocxo);
  });

  it('computeAllanDeviationCurve: unknown source falls back to eloran', () => {
    const curve = computeAllanDeviationCurve([1, 10], 'unknown_source');
    expect(curve).toHaveLength(2);
    expect(curve[0].allanDev).toBeGreaterThan(0);
  });

  // ─── Timing accuracy ──────────────────────────────────────────────────────

  it('computeTimingAccuracy: 1 sample → dominated by raw jitter (50 ns)', () => {
    const acc = computeTimingAccuracy(1, 50, 0);
    expect(acc.averagedJitterNs).toBeCloseTo(50, 1);
    expect(acc.meetsStratum1).toBe(true);
  });

  it('computeTimingAccuracy: averaging over 100 samples improves jitter by sqrt(100)', () => {
    const acc = computeTimingAccuracy(100, 500, 0);
    // 500 / sqrt(100) = 50 ns
    expect(acc.averagedJitterNs).toBeCloseTo(50, 1);
    expect(acc.meetsHighPrecision).toBe(true);
  });

  it('computeTimingAccuracy: ASF uncertainty dominates at large N', () => {
    const acc = computeTimingAccuracy(10000, 50, 30);
    // Jitter floor ≈ 0, total ≈ 30 ns ASF
    expect(acc.total1sigmaNs).toBeGreaterThanOrEqual(30);
    expect(acc.meetsHighPrecision).toBe(true);
  });

  it('computeTimingAccuracy throws on nSamples < 1', () => {
    expect(() => computeTimingAccuracy(0)).toThrow(RangeError);
  });
});

