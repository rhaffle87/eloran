import { describe, it, expect } from 'vitest';
import { simulateGnssFix, computeCovarianceEllipse, fusePositions } from '../fusion.js';

describe('GNSS Simulation & Degradation (simulateGnssFix)', () => {
  const truePos = { lat: 52.0, lng: 4.5 };

  it('generates nominal GNSS fix with expected covariance and bounds', () => {
    const fix = simulateGnssFix(truePos, 8, () => 0.5);
    expect(fix.status).toBe('nominal');
    expect(fix.noSolution).toBe(false);
    expect(fix.stdDevMeters).toBe(8);
    expect(fix.covariance).toEqual([[64, 0], [0, 64]]);
    expect(fix.hplMeters).toBeCloseTo(24, 1); // 3 * 8m = 24m
    expect(fix.errorMeters).toBeGreaterThanOrEqual(0);
  });

  it('simulates jamming with elevated noise variance', () => {
    const fix = simulateGnssFix(truePos, 8, () => 0.5, { status: 'jammed', jammingNoiseMeters: 80 });
    expect(fix.status).toBe('jammed');
    expect(fix.stdDevMeters).toBe(80);
    expect(fix.covariance[0][0]).toBe(6400);
    expect(fix.hplMeters).toBeCloseTo(240, 1);
  });

  it('simulates spoofing attack with injected position offset and misleading covariance', () => {
    const fix = simulateGnssFix(truePos, 8, () => 0.5, { status: 'spoofed', spoofBiasMeters: 200 });
    expect(fix.status).toBe('spoofed');
    expect(fix.spoofBiasMeters).toBe(200);
    // Reported internal covariance remains deceptively low
    expect(fix.covariance[0][0]).toBe(64);
    // Actual true position error is large due to injected bias
    expect(fix.errorMeters).toBeGreaterThan(100);
  });

  it('simulates complete GNSS signal outage', () => {
    const fix = simulateGnssFix(truePos, 8, () => 0.5, { status: 'outage' });
    expect(fix.status).toBe('outage');
    expect(fix.noSolution).toBe(true);
    expect(fix.hplMeters).toBeGreaterThan(1000);
  });
});

describe('Covariance Error Ellipses (computeCovarianceEllipse)', () => {
  const center = { lat: 52.1, lng: 4.8 };

  it('returns null for missing or invalid center coordinates', () => {
    expect(computeCovarianceEllipse(null, [[64, 0], [0, 64]])).toBeNull();
    expect(computeCovarianceEllipse({ lat: NaN, lng: 4.8 }, [[64, 0], [0, 64]])).toBeNull();
  });

  it('computes symmetric circular ellipse for isotropic covariance', () => {
    const cov = [[100, 0], [0, 100]];
    const res = computeCovarianceEllipse(center, cov, 1, 36);
    expect(res).not.toBeNull();
    expect(res.semiMajorMeters).toBeCloseTo(10, 2);
    expect(res.semiMinorMeters).toBeCloseTo(10, 2);
    expect(res.coordinates).toHaveLength(37); // Closed polygon loop
    expect(res.coordinates[0]).toEqual(res.coordinates[36]);
  });

  it('computes anisotropic ellipse with correct eigenvalues and orientation', () => {
    const cov = [[100, 30], [30, 25]];
    const res = computeCovarianceEllipse(center, cov, 2.45, 36);
    expect(res).not.toBeNull();
    expect(res.semiMajorMeters).toBeCloseTo(25.76, 1);
    expect(res.semiMinorMeters).toBeCloseTo(9.32, 1);
    expect(res.orientationDeg).toBeCloseTo(19.3, 1);
    expect(res.coordinates[0][0]).toBeCloseTo(res.coordinates[36][0], 6);
    expect(res.coordinates[0][1]).toBeCloseTo(res.coordinates[36][1], 6);
  });

  it('scales axes proportionally with kSigma scale factor', () => {
    const cov = [[64, 0], [0, 64]];
    const res1 = computeCovarianceEllipse(center, cov, 1);
    const res3 = computeCovarianceEllipse(center, cov, 3);
    expect(res3.semiMajorMeters).toBeCloseTo(res1.semiMajorMeters * 3, 2);
    expect(res3.semiMinorMeters).toBeCloseTo(res1.semiMinorMeters * 3, 2);
  });
});

describe('Multi-Source Sensor Fusion (fusePositions)', () => {
  const truePos = { lat: 52.0, lng: 4.5 };
  const eloranFix = {
    lat: 52.0002,
    lng: 4.5002,
    covariance: [[256, 0], [0, 256]], // 16m std dev
    hplMeters: 48,
    converged: true,
    noSolution: false,
  };
  const gnssFix = {
    lat: 52.00005,
    lng: 4.50005,
    covariance: [[64, 0], [0, 64]],   // 8m std dev
    hplMeters: 24,
    converged: true,
    noSolution: false,
  };

  it('returns single-source eLoran solution when mode is eLoran', () => {
    const fused = fusePositions(eloranFix, gnssFix, 'eLoran', truePos);
    expect(fused.mode).toBe('eLoran');
    expect(fused.lat).toBeCloseTo(eloranFix.lat, 6);
    expect(fused.weights).toEqual({ eloran: 1, gnss: 0 });
  });

  it('returns single-source GNSS solution when mode is GNSS', () => {
    const fused = fusePositions(eloranFix, gnssFix, 'GNSS', truePos);
    expect(fused.mode).toBe('GNSS');
    expect(fused.lat).toBeCloseTo(gnssFix.lat, 6);
    expect(fused.weights).toEqual({ eloran: 0, gnss: 1 });
  });

  it('applies BLUE inverse-variance weighting in fusion mode', () => {
    // eloran var = 512, gnss var = 128 -> invVarE = 1/512, invVarG = 1/128
    // gnss has 4x higher weight (80% vs 20%)
    const fused = fusePositions(eloranFix, gnssFix, 'fusion', truePos);
    expect(fused.mode).toBe('fusion');
    expect(fused.weights.gnss).toBeCloseTo(0.8, 2);
    expect(fused.weights.eloran).toBeCloseTo(0.2, 2);
    // BLUE fused covariance is strictly lower than both individual sensors
    expect(fused.hplMeters).toBeLessThan(gnssFix.hplMeters);
  });

  it('smoothly falls back to eLoran when GNSS experiences an outage', () => {
    const outageGnss = { noSolution: true, status: 'outage', lat: 52.0, lng: 4.5 };
    const fused = fusePositions(eloranFix, outageGnss, 'fusion', truePos);
    expect(fused.mode).toBe('fusion-fallback-eloran');
    expect(fused.lat).toBeCloseTo(eloranFix.lat, 6);
    expect(fused.weights).toEqual({ eloran: 1, gnss: 0 });
  });

  it('smoothly falls back to GNSS when eLoran has no solution / constellation failure', () => {
    const failedEloran = { noSolution: true, converged: false, lat: 52.0, lng: 4.5 };
    const fused = fusePositions(failedEloran, gnssFix, 'fusion', truePos);
    expect(fused.mode).toBe('fusion-fallback-gnss');
    expect(fused.lat).toBeCloseTo(gnssFix.lat, 6);
    expect(fused.weights).toEqual({ eloran: 0, gnss: 1 });
  });
});
