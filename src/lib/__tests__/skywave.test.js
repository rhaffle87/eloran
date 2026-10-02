import { describe, it, expect } from 'vitest';
import {
  getDiurnalReflectionHeight,
  compute1HopPathMeters,
  compute2HopPathMeters,
  computeSkywaveDelayUs,
  computeSignalToSkywaveRatio,
  canonicalPulseEnvelope,
  canonicalRfPulse,
  synthesizeCompositeWaveform,
  evaluateSkywaveInterference,
  D_LAYER_DAY_HEIGHT_M,
  E_LAYER_NIGHT_HEIGHT_M,
} from '../skywave.js';

describe('Spherical-Earth Skywave & Ionospheric Hop Physics Engine', () => {
  describe('Diurnal Reflection Heights', () => {
    it('returns exact daytime D-layer altitude (70 km) at solar noon', () => {
      const hNoon = getDiurnalReflectionHeight(12.0);
      expect(hNoon).toBeCloseTo(D_LAYER_DAY_HEIGHT_M, 1);
    });

    it('returns exact nighttime E-layer altitude (90 km) at midnight', () => {
      const hMidnight = getDiurnalReflectionHeight(0.0);
      expect(hMidnight).toBeCloseTo(E_LAYER_NIGHT_HEIGHT_M, 1);
    });

    it('produces smooth intermediate transition at dawn (06:00) and dusk (18:00)', () => {
      const hDawn = getDiurnalReflectionHeight(6.0);
      const hDusk = getDiurnalReflectionHeight(18.0);
      expect(hDawn).toBeCloseTo(80000.0, 1);
      expect(hDusk).toBeCloseTo(80000.0, 1);
    });
  });

  describe('Spherical-Earth Ionospheric Hop Geometry', () => {
    it('calculates 1-hop slant path strictly greater than ground geodesic distance', () => {
      const distM = 500000.0; // 500 km
      const slantM = compute1HopPathMeters(distM, D_LAYER_DAY_HEIGHT_M);
      expect(slantM).toBeGreaterThan(distM);
      expect(slantM).toBeLessThan(distM + 2.0 * D_LAYER_DAY_HEIGHT_M);
    });

    it('calculates 2-hop slant path strictly greater than 1-hop path', () => {
      const distM = 1500000.0; // 1500 km
      const slant1 = compute1HopPathMeters(distM, E_LAYER_NIGHT_HEIGHT_M);
      const slant2 = compute2HopPathMeters(distM, E_LAYER_NIGHT_HEIGHT_M);
      expect(slant2).toBeGreaterThan(slant1);
    });

    it('yields spherical-Earth delay conforming to physical Loran propagation', () => {
      // At 1000 km, spherical Earth delay is ~50 µs for Day (70 km) and ~76 µs for Night (90 km)
      const dayDelay = computeSkywaveDelayUs(1000000.0, D_LAYER_DAY_HEIGHT_M);
      const nightDelay = computeSkywaveDelayUs(1000000.0, E_LAYER_NIGHT_HEIGHT_M);

      expect(dayDelay).toBeGreaterThan(45.0);
      expect(dayDelay).toBeLessThan(55.0);

      expect(nightDelay).toBeGreaterThan(70.0);
      expect(nightDelay).toBeLessThan(82.0);
    });
  });

  describe('Signal-to-Skywave Ratio (SSR) and Ionospheric Absorption', () => {
    it('demonstrates that daytime D-layer absorption keeps groundwave dominant at 500 km', () => {
      const daySsr = computeSignalToSkywaveRatio(500.0, false);
      expect(daySsr.ssrDb).toBeGreaterThan(15.0); // Groundwave is > 15 dB stronger
      expect(daySsr.ampRatio).toBeLessThan(0.2);
    });

    it('demonstrates nighttime skywave emergence where skywave exceeds groundwave at 1500 km', () => {
      const nightSsr = computeSignalToSkywaveRatio(1500.0, true);
      expect(nightSsr.ssrDb).toBeLessThan(5.0); // Groundwave advantage collapses
      expect(nightSsr.ampRatio).toBeGreaterThan(0.5);
    });
  });

  describe('Canonical RF Pulse & Waveform Synthesis', () => {
    it('peaks at tau = 65 µs with normalized value 1.0', () => {
      const peak = canonicalPulseEnvelope(65.0);
      expect(peak).toBeCloseTo(1.0, 5);
    });

    it('reaches Standard Zero Crossing near 30 µs', () => {
      const valBefore = canonicalRfPulse(29.9);
      const valAfter = canonicalRfPulse(30.1);
      // Changes sign across 30 µs (SZC)
      expect(valBefore * valAfter).toBeLessThanOrEqual(0.0);
    });

    it('synthesizes composite waveform with delayed and attenuated components', () => {
      const t = [0, 10, 20, 30, 40, 50, 60, 70, 80];
      const wf = synthesizeCompositeWaveform(t, 40.0, 0.3);

      expect(wf.groundwave.length).toBe(t.length);
      expect(wf.skywave.length).toBe(t.length);
      expect(wf.composite.length).toBe(t.length);

      // Skywave at t=20 µs should be 0 because tau=40 µs
      expect(wf.skywave[2]).toBe(0.0);
      // Composite at t=20 µs should equal groundwave
      expect(wf.composite[2]).toBe(wf.groundwave[2]);
    });
  });

  describe('Operational Skywave Interference Assessment', () => {
    it('flags benign conditions with NONE or LOW cycle slip risk in daytime short range', () => {
      const res = evaluateSkywaveInterference(300.0, 12.0);
      expect(['NONE', 'LOW']).toContain(res.cycleSlipRisk);
      expect(res.cycleSlipProb).toBeLessThan(0.05);
      expect(res.timingShiftUs).toBeCloseTo(0.0, 2);
    });

    it('flags severe cycle slip risk at night at extended range (> 1200 km)', () => {
      const res = evaluateSkywaveInterference(1400.0, 0.0); // Midnight
      expect(['HIGH', 'CRITICAL']).toContain(res.cycleSlipRisk);
      expect(res.cycleSlipProb).toBeGreaterThan(0.2);
    });
  });
});
