/**
 * Unit tests for src/lib/temporalAsf.js
 *
 * Tests cover:
 * 1. computeRefractivity — Smith & Weintraub formula spot checks
 * 2. refractivityDelayMicroseconds — scaling
 * 3. computeTemporalAsfMicroseconds — combined output, edge cases
 * 4. temporalAsfUsToMeters — unit conversion
 */

import { describe, it, expect } from 'vitest';
import {
  computeRefractivity,
  refractivityDelayMicroseconds,
  computeTemporalAsfMicroseconds,
  temporalAsfUsToMeters,
  N_STANDARD,
  STANDARD_ATMOSPHERE,
  SEASONAL_AMPLITUDE_US_PER_100KM,
} from '../temporalAsf.js';

const C = 299792458; // m/s

// ──────────────────────────────────────────────────────────────────────────────
// 1. computeRefractivity
// ──────────────────────────────────────────────────────────────────────────────
describe('computeRefractivity (Smith & Weintraub 1953)', () => {
  it('returns a positive N-value for standard atmosphere', () => {
    const N = computeRefractivity(1013.25, 15.0, 70.0);
    expect(N).toBeGreaterThan(0);
    // Typical sea-level N is around 290–330 N-units
    expect(N).toBeGreaterThan(280);
    expect(N).toBeLessThan(360);
  });

  it('increases with humidity (more water vapour = higher N)', () => {
    const N_dry = computeRefractivity(1013.25, 15.0, 0.0);
    const N_humid = computeRefractivity(1013.25, 15.0, 100.0);
    expect(N_humid).toBeGreaterThan(N_dry);
  });

  it('increases with pressure (denser air = higher N)', () => {
    const N_low = computeRefractivity(900.0, 15.0, 70.0);
    const N_high = computeRefractivity(1100.0, 15.0, 70.0);
    expect(N_high).toBeGreaterThan(N_low);
  });

  it('cold dry air has lower N than warm humid air (water vapour dominates)', () => {
    // Physical reality: N = N_dry + N_wet.
    // At 30°C, 70% RH: e_sat ≈ 42 hPa, so e_w ≈ 29.4 hPa → large N_wet.
    // At 0°C, 70% RH: e_sat ≈ 6.1 hPa, so e_w ≈ 4.3 hPa → tiny N_wet.
    // The warm+humid case dominates over the cold case at equal pressure and RH.
    const N_warm_humid = computeRefractivity(1013.25, 30.0, 70.0);
    const N_cold_dry = computeRefractivity(1013.25, 0.0, 70.0);
    // warm+humid N > cold-low-vapour N
    expect(N_warm_humid).toBeGreaterThan(N_cold_dry);
  });

  it('N_STANDARD is consistent with computeRefractivity at ISA conditions', () => {
    const N = computeRefractivity(
      STANDARD_ATMOSPHERE.pressureHpa,
      STANDARD_ATMOSPHERE.tempC,
      STANDARD_ATMOSPHERE.humidityPct
    );
    expect(N).toBeCloseTo(N_STANDARD, 6);
  });

  it('dry atmosphere (RH=0) N is approximately 77.6*P/T', () => {
    const P = 1000.0;
    const TC = 20.0;
    const T = TC + 273.15;
    const N = computeRefractivity(P, TC, 0.0);
    const Ndry = 77.6 * P / T;
    expect(N).toBeCloseTo(Ndry, 3);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 2. refractivityDelayMicroseconds
// ──────────────────────────────────────────────────────────────────────────────
describe('refractivityDelayMicroseconds', () => {
  it('returns 0 for zero distance', () => {
    expect(refractivityDelayMicroseconds(0, 100)).toBe(0);
  });

  it('returns 0 for negative distance', () => {
    expect(refractivityDelayMicroseconds(-10, 100)).toBe(0);
  });

  it('scales linearly with distance', () => {
    const N = 100;
    const d1 = refractivityDelayMicroseconds(100, N);
    const d2 = refractivityDelayMicroseconds(200, N);
    expect(d2).toBeCloseTo(2 * d1, 8);
  });

  it('scales linearly with refractivity', () => {
    const d50 = refractivityDelayMicroseconds(100, 50);
    const d100 = refractivityDelayMicroseconds(100, 100);
    expect(d100).toBeCloseTo(2 * d50, 8);
  });

  it('formula check: 100km at N=315 gives expected µs', () => {
    // Expected = 100*1000 * 315e-6 / C * 1e6
    const expected = (100000 * 315e-6 / C) * 1e6;
    expect(refractivityDelayMicroseconds(100, 315)).toBeCloseTo(expected, 8);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 3. computeTemporalAsfMicroseconds
// ──────────────────────────────────────────────────────────────────────────────
describe('computeTemporalAsfMicroseconds', () => {
  it('returns zero for zero distance', () => {
    const result = computeTemporalAsfMicroseconds({ distKm: 0 });
    expect(result.totalMicroseconds).toBe(0);
    expect(result.refractivityUs).toBe(0);
    expect(result.seasonalUs).toBe(0);
    expect(result.weatherUs).toBe(0);
  });

  it('returns zero for negative distance', () => {
    const result = computeTemporalAsfMicroseconds({ distKm: -50 });
    expect(result.totalMicroseconds).toBe(0);
  });

  it('exposes N in the result', () => {
    const result = computeTemporalAsfMicroseconds({ distKm: 100 });
    expect(typeof result.N).toBe('number');
    expect(result.N).toBeGreaterThan(0);
  });

  it('exposes provenance strings', () => {
    const result = computeTemporalAsfMicroseconds({ distKm: 100 });
    expect(result.provenance.refractivity).toContain('SOURCED');
    expect(result.provenance.seasonal).toContain('UNVERIFIED');
    expect(result.provenance.seasonal).toContain('Song');
  });

  it('at standard conditions, refractivityUs is near zero (ΔN ≈ 0)', () => {
    const result = computeTemporalAsfMicroseconds({
      distKm: 500,
      ...STANDARD_ATMOSPHERE,
    });
    // ΔN = N(ISA) - N_STANDARD ≈ 0, so refractivityUs ≈ 0
    expect(Math.abs(result.refractivityUs)).toBeLessThan(1e-10);
  });

  it('seasonal drift is zero at midsummer (day 172)', () => {
    const result = computeTemporalAsfMicroseconds({
      distKm: 100,
      ...STANDARD_ATMOSPHERE,
      dayOfYear: 172, // peak — sin(2π*(172-172)/365) = sin(0) = 0
      includeSeasonalDrift: true,
    });
    expect(Math.abs(result.seasonalUs)).toBeLessThan(1e-10);
  });

  it('seasonal drift peaks at winter solstice (day 355 ≈ day 172 + 183)', () => {
    // sin(2π*(355-172)/365) ≈ sin(2π*183/365) ≈ sin(3.147) ≈ near -1 (winter trough)
    const resultWinter = computeTemporalAsfMicroseconds({
      distKm: 100,
      ...STANDARD_ATMOSPHERE,
      dayOfYear: 355,
      includeSeasonalDrift: true,
    });
    const resultSummer = computeTemporalAsfMicroseconds({
      distKm: 100,
      ...STANDARD_ATMOSPHERE,
      dayOfYear: 172,
      includeSeasonalDrift: true,
    });
    // Winter seasonal should be more negative than summer (near zero)
    expect(resultWinter.seasonalUs).toBeLessThan(resultSummer.seasonalUs);
  });

  it('includeSeasonalDrift=false produces zero seasonal and weather components', () => {
    const result = computeTemporalAsfMicroseconds({
      distKm: 300,
      pressureHpa: 1013.25,
      tempC: 25.0, // deviation from 15°C would otherwise add weather drift
      humidityPct: 80.0,
      includeSeasonalDrift: false,
    });
    expect(result.seasonalUs).toBe(0);
    expect(result.weatherUs).toBe(0);
  });

  it('warm + very humid air has higher N (and delay) than cold + very dry air', () => {
    // At 30°C, 90% RH: e_sat ≈ 42 hPa, e_w ≈ 38 hPa → very large N_wet
    // At 0°C, 10% RH: e_sat ≈ 6.1 hPa, e_w ≈ 0.6 hPa → tiny N_wet
    // The wet term at warm+humid outweighs the dry-term advantage of cold air.
    const warm = computeTemporalAsfMicroseconds({
      distKm: 300,
      pressureHpa: 1013.25,
      tempC: 30.0,
      humidityPct: 90.0,
      dayOfYear: 180,
      includeSeasonalDrift: false, // isolate refractivity only
    });
    const cold = computeTemporalAsfMicroseconds({
      distKm: 300,
      pressureHpa: 1013.25,
      tempC: 0.0,
      humidityPct: 10.0,
      dayOfYear: 180,
      includeSeasonalDrift: false,
    });
    // warm+humid has higher N than cold+dry → more refractivity delay
    expect(warm.N).toBeGreaterThan(cold.N);
    expect(warm.totalMicroseconds).toBeGreaterThan(cold.totalMicroseconds);
  });

  it('seasonal drift is proportional to distance', () => {
    const d100 = computeTemporalAsfMicroseconds({
      distKm: 100,
      ...STANDARD_ATMOSPHERE,
      dayOfYear: 80, // spring
    });
    const d200 = computeTemporalAsfMicroseconds({
      distKm: 200,
      ...STANDARD_ATMOSPHERE,
      dayOfYear: 80,
    });
    expect(d200.seasonalUs).toBeCloseTo(2 * d100.seasonalUs, 8);
  });

  it('seasonal amplitude matches SEASONAL_AMPLITUDE_US_PER_100KM at sin=1 (day 263)', () => {
    // sin(2π*(263-172)/365) = sin(2π*91/365) ≈ 1 (autumnal peak)
    // More precisely, peak is at day 172 + 365/4 = 263.25 (day 263)
    const result = computeTemporalAsfMicroseconds({
      distKm: 100,
      ...STANDARD_ATMOSPHERE,
      dayOfYear: 263,
      includeSeasonalDrift: true,
    });
    // sin(2π*(263-172)/365) ≈ sin(1.565) ≈ 0.9994
    const expectedSeasonal = SEASONAL_AMPLITUDE_US_PER_100KM * (100 / 100) * Math.sin((2 * Math.PI * (263 - 172)) / 365);
    expect(result.seasonalUs).toBeCloseTo(expectedSeasonal, 8);
  });

  it('total is sum of components', () => {
    const result = computeTemporalAsfMicroseconds({
      distKm: 250,
      pressureHpa: 1000.0,
      tempC: 20.0,
      humidityPct: 60.0,
      dayOfYear: 100,
      includeSeasonalDrift: true,
    });
    const sum = result.refractivityUs + result.seasonalUs + result.weatherUs;
    expect(result.totalMicroseconds).toBeCloseTo(sum, 10);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 4. temporalAsfUsToMeters
// ──────────────────────────────────────────────────────────────────────────────
describe('temporalAsfUsToMeters', () => {
  it('converts 1 µs to ~299.8 m', () => {
    expect(temporalAsfUsToMeters(1.0)).toBeCloseTo(C / 1e6, 1);
  });

  it('converts 0 µs to 0 m', () => {
    expect(temporalAsfUsToMeters(0)).toBe(0);
  });

  it('scales linearly', () => {
    const m1 = temporalAsfUsToMeters(1.0);
    const m2 = temporalAsfUsToMeters(2.0);
    expect(m2).toBeCloseTo(2 * m1, 8);
  });

  it('end-to-end: compute ASF in metres for a real scenario', () => {
    const result = computeTemporalAsfMicroseconds({
      distKm: 500,
      pressureHpa: 1013.25,
      tempC: 25.0,
      humidityPct: 85.0,
      dayOfYear: 200,
    });
    const meters = temporalAsfUsToMeters(result.totalMicroseconds);
    // Should be a finite number (positive or negative deviation is fine)
    expect(Number.isFinite(meters)).toBe(true);
    // The order of magnitude: refractivity at 500km should be µs-order
    expect(Math.abs(meters)).toBeLessThan(10000); // sanity cap
  });
});
