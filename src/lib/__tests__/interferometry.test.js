import { describe, it, expect } from 'vitest';
import {
  LORAN_FREQUENCY_HZ,
  CARRIER_WAVELENGTH_M,
  MAX_UNAMBIGUOUS_BASELINE_M,
  validateBaseline,
  computePhaseDifference,
  solveHeadingFromPhase,
  resolveHeadingAmbiguity,
  computeInterferometricHeading,
} from '../interferometry.js';

describe('Dual-Antenna Interferometric Heading (interferometry.js)', () => {
  // ─── Constants ────────────────────────────────────────────────────────────

  it('CARRIER_WAVELENGTH_M = c / 100 kHz ≈ 2997.92 m', () => {
    expect(CARRIER_WAVELENGTH_M).toBeCloseTo(2997.924, 1);
  });

  it('MAX_UNAMBIGUOUS_BASELINE_M = lambda/2 ≈ 1498.96 m', () => {
    expect(MAX_UNAMBIGUOUS_BASELINE_M).toBeCloseTo(1498.962, 1);
  });

  // ─── Baseline validation ──────────────────────────────────────────────────

  it('validateBaseline: 20m vessel baseline is ambiguity-free', () => {
    const r = validateBaseline(20);
    expect(r.valid).toBe(true);
    expect(r.ambiguityFree).toBe(true);
    expect(r.cycleAmbiguityN).toBe(0);
  });

  it('validateBaseline: 2000m > lambda/2 → NOT ambiguity-free', () => {
    const r = validateBaseline(2000);
    expect(r.valid).toBe(true);
    expect(r.ambiguityFree).toBe(false);
    expect(r.cycleAmbiguityN).toBeNull();
  });

  it('validateBaseline: 0 or negative → invalid', () => {
    expect(validateBaseline(0).valid).toBe(false);
    expect(validateBaseline(-5).valid).toBe(false);
  });

  // ─── Phase difference computation ─────────────────────────────────────────

  it('computePhaseDifference: transmitter dead ahead (bearing=heading) → max phase', () => {
    // theta_rel = 0 → cos(0) = 1 → Delta_phi = 2*pi*d/lambda
    const d = 50; // meters
    const phi = computePhaseDifference(d, 90, 90, 0); // bearing = heading = 90
    const expected = 2 * Math.PI * d / CARRIER_WAVELENGTH_M;
    expect(phi).toBeCloseTo(expected, 8);
  });

  it('computePhaseDifference: transmitter abeam (bearing = heading ± 90) → zero phase', () => {
    const d = 50;
    // theta_rel = 90 → cos(90) = 0
    const phi = computePhaseDifference(d, 180, 90, 0); // transmitter 90 deg off bow
    expect(Math.abs(phi)).toBeLessThan(1e-10);
  });

  it('computePhaseDifference: transmitter astern (bearing = heading + 180) → negative max phase', () => {
    const d = 50;
    // theta_rel = 180 → cos(180) = -1
    const phi = computePhaseDifference(d, 270, 90, 0);
    const expected = -2 * Math.PI * d / CARRIER_WAVELENGTH_M;
    expect(phi).toBeCloseTo(expected, 8);
  });

  // ─── Heading from phase ────────────────────────────────────────────────────

  it('solveHeadingFromPhase: recovers one of two correct heading candidates', () => {
    const trueHeading = 45.0; // NE
    const bearing = 120.0;    // transmitter at 120 deg true
    const d = 30;
    const truePhi = computePhaseDifference(d, bearing, trueHeading, 0);

    const sol = solveHeadingFromPhase(truePhi, bearing, d);
    // One of the two candidates should match true heading within 0.01 deg
    const match1 = Math.abs(sol.heading1Deg - trueHeading) < 0.01;
    const match2 = Math.abs(sol.heading2Deg - trueHeading) < 0.01;
    expect(match1 || match2).toBe(true);
  });

  it('solveHeadingFromPhase: isOverflow=false for valid geometry', () => {
    const phi = computePhaseDifference(20, 90, 45);
    const sol = solveHeadingFromPhase(phi, 90, 20);
    expect(sol.isOverflow).toBe(false);
  });

  it('solveHeadingFromPhase: isOverflow=true when phase ratio > 1 (impossible geometry)', () => {
    // Force an impossible phase ratio by passing an unrealistically large phase
    const sol = solveHeadingFromPhase(10 * Math.PI, 0, 5); // huge phase for tiny baseline
    expect(sol.isOverflow).toBe(true);
  });

  // ─── Ambiguity resolution ──────────────────────────────────────────────────

  it('resolveHeadingAmbiguity: resolves to correct heading from two transmitters', () => {
    const trueHeading = 270.0; // West
    const d = 25;

    // Two transmitters at different bearings
    const bear1 = 10;   // roughly ahead-left
    const bear2 = 200;  // roughly astern-right

    const phi1 = computePhaseDifference(d, bear1, trueHeading);
    const phi2 = computePhaseDifference(d, bear2, trueHeading);

    const result = resolveHeadingAmbiguity(
      { measuredPhaseDiffRad: phi1, transmitterBearingDeg: bear1, baselineMeters: d },
      { measuredPhaseDiffRad: phi2, transmitterBearingDeg: bear2, baselineMeters: d },
      1.0
    );

    expect(result.resolved).toBe(true);
    const headingErr = Math.abs(result.resolvedHeadingDeg - trueHeading);
    // Accept wrap-around
    const wrappedErr = Math.min(headingErr, 360 - headingErr);
    expect(wrappedErr).toBeLessThan(1.0);
  });

  // ─── Full interferometric heading computation ──────────────────────────────

  it('computeInterferometricHeading: recovers correct heading within 0.1 degrees (no noise)', () => {
    const trueHeading = 135.0; // SE
    const d = 40; // 40m vessel baseline

    // Two eLoran transmitters at known bearings
    const bear1 = 30;
    const bear2 = 280;

    const phi1 = computePhaseDifference(d, bear1, trueHeading);
    const phi2 = computePhaseDifference(d, bear2, trueHeading);

    const result = computeInterferometricHeading({
      baselineMeters: d,
      phaseDiff1Rad: phi1,
      bearing1Deg: bear1,
      phaseDiff2Rad: phi2,
      bearing2Deg: bear2,
      phaseNoiseRadRms: 0.0,
    });

    expect(result.resolved).toBe(true);
    expect(result.resolvedHeadingDeg).not.toBeNull();

    const err = Math.abs(result.resolvedHeadingDeg - trueHeading);
    const wrappedErr = Math.min(err, 360 - err);
    expect(wrappedErr).toBeLessThan(0.1);
  });

  it('computeInterferometricHeading: uncertainty is small for long baseline', () => {
    const result = computeInterferometricHeading({
      baselineMeters: 100,
      phaseDiff1Rad: 0.5,
      bearing1Deg: 45,
      phaseDiff2Rad: -0.3,
      bearing2Deg: 200,
      phaseNoiseRadRms: 0.1,
    });
    // sigma_heading = 0.1 rad * 2997.92 m / (2*pi*100 m) * (180/pi) = ~27.34 deg
    expect(result.headingUncertainty1SigmaDeg).toBeCloseTo(27.34, 0);
    expect(result.baselineValidation.ambiguityFree).toBe(true);
  });

  it('computeInterferometricHeading: returns error for invalid baseline', () => {
    const result = computeInterferometricHeading({
      baselineMeters: 0,
      phaseDiff1Rad: 0, bearing1Deg: 0, phaseDiff2Rad: 0, bearing2Deg: 90,
    });
    expect(result.resolved).toBe(false);
    expect(result.resolvedHeadingDeg).toBeNull();
    expect(result.error).toBeTruthy();
  });
});
