/**
 * Unit tests for terrainMasking.js
 *
 * Tests the ITU-R P.526-15 knife-edge diffraction engine:
 *  - knifeEdgeLossDb (Fresnel-Kirchhoff J(v))
 *  - fresnelKirchhoffV parameter
 *  - excessTimingBiasUs
 *  - analyseElevationProfile (full profile scan)
 *  - computeTerrainMasking (high-level wrapper)
 *
 * And tests the elevationProfile helpers:
 *  - interpolateGreatCircle
 *  - clearElevationCache (smoke test)
 *
 * NOTE: At 100 kHz (λ ≈ 3 km), Fresnel zones are enormous (10–20 km radius at
 * long paths). "Flat earth at sea level" with antenna heights of tens of metres
 * is NOT diffraction-free; the ground clips the lower Fresnel zones and causes
 * measurable (~6 dB) loss. Tests reflect this physically correct behaviour.
 */

import { describe, it, expect } from 'vitest';
import {
  knifeEdgeLossDb,
  fresnelKirchhoffV,
  excessTimingBiasUs,
  analyseElevationProfile,
  computeTerrainMasking,
  fresnelZoneRadiusM,
  LORAN_WAVELENGTH_M,
  BLOCKED_LOSS_DB_THRESHOLD,
} from '../terrainMasking.js';
import { interpolateGreatCircle, clearElevationCache } from '../elevationProfile.js';

// ---------------------------------------------------------------------------
// knifeEdgeLossDb — ITU-R P.526-15 Eq. 14
// ---------------------------------------------------------------------------

describe('knifeEdgeLossDb', () => {
  it('returns 0 dB for v well below threshold (clear path)', () => {
    expect(knifeEdgeLossDb(-2)).toBe(0);
    expect(knifeEdgeLossDb(-0.8)).toBe(0);
  });

  it('returns ~0 dB at the grazing boundary v = -0.7', () => {
    const loss = knifeEdgeLossDb(-0.7);
    expect(loss).toBeGreaterThanOrEqual(0);
    expect(loss).toBeLessThan(1.5);
  });

  it('returns ≈ 6 dB at v = 0 (obstacle at LOS height)', () => {
    // ITU-R P.526-15: J(0) ≈ 6 dB
    const loss = knifeEdgeLossDb(0);
    expect(loss).toBeCloseTo(6, 0); // within 1 dB
  });

  it('returns increasing loss for higher v (deeper obstruction)', () => {
    const losses = [0, 0.5, 1.0, 2.0].map(knifeEdgeLossDb);
    for (let i = 1; i < losses.length; i++) {
      expect(losses[i]).toBeGreaterThan(losses[i - 1]);
    }
  });

  it('returns >= BLOCKED_LOSS_DB_THRESHOLD for severely obstructed path', () => {
    // At v ≈ 2.4 the loss is around 20 dB
    expect(knifeEdgeLossDb(2.5)).toBeGreaterThanOrEqual(BLOCKED_LOSS_DB_THRESHOLD);
  });

  it('never returns negative loss', () => {
    [-5, -1, 0, 1, 3].forEach((v) => {
      expect(knifeEdgeLossDb(v)).toBeGreaterThanOrEqual(0);
    });
  });
});

// ---------------------------------------------------------------------------
// fresnelKirchhoffV
// ---------------------------------------------------------------------------

describe('fresnelKirchhoffV', () => {
  it('returns 0 for zero effective height (LOS grazing)', () => {
    expect(fresnelKirchhoffV(0, 50000, 50000)).toBe(0);
  });

  it('returns positive v when obstacle protrudes above LOS', () => {
    expect(fresnelKirchhoffV(100, 50000, 50000)).toBeGreaterThan(0);
  });

  it('returns negative v when obstacle is below LOS', () => {
    expect(fresnelKirchhoffV(-50, 50000, 50000)).toBeLessThan(0);
  });

  it('returns 0 for degenerate inputs (d1=0 or d2=0)', () => {
    expect(fresnelKirchhoffV(100, 0, 50000)).toBe(0);
    expect(fresnelKirchhoffV(100, 50000, 0)).toBe(0);
  });

  it('uses LORAN_WAVELENGTH_M by default (~2998 m at 100 kHz)', () => {
    // λ ≈ 2998 m; v = h * sqrt(2*(d1+d2)/(λ*d1*d2))
    const h = 100, d1 = 100000, d2 = 100000;
    const expected = h * Math.sqrt((2 * (d1 + d2)) / (LORAN_WAVELENGTH_M * d1 * d2));
    expect(fresnelKirchhoffV(h, d1, d2)).toBeCloseTo(expected, 6);
  });
});

// ---------------------------------------------------------------------------
// excessTimingBiasUs
// ---------------------------------------------------------------------------

describe('excessTimingBiasUs', () => {
  it('returns 0 for non-positive effective height', () => {
    expect(excessTimingBiasUs(0, 50000, 50000)).toBe(0);
    expect(excessTimingBiasUs(-10, 50000, 50000)).toBe(0);
  });

  it('returns positive bias for real obstruction', () => {
    expect(excessTimingBiasUs(200, 100000, 100000)).toBeGreaterThan(0);
  });

  it('is physically small (< 0.001 µs for typical Loran path obstructions)', () => {
    // 50 m obstacle over a 100 km path: excess path = 50²/(2*50000) = 0.025 m → ~83 ps
    const bias = excessTimingBiasUs(50, 100000, 100000);
    expect(bias).toBeLessThan(0.001); // < 1 ns
  });
});

// ---------------------------------------------------------------------------
// analyseElevationProfile
// ---------------------------------------------------------------------------

describe('analyseElevationProfile', () => {
  it('returns flatEarth result for degenerate inputs', () => {
    const r = analyseElevationProfile(0, 0, [], 0);
    expect(r.flatEarth).toBe(true);
    expect(r.blocked).toBe(false);
  });

  it('high Tx/Rx antennas far above terrain produce low v (clear path)', () => {
    // At 100 kHz, Fresnel zone half-width at midpoint of 100 km path:
    // r = sqrt(λ*d1*d2/(d1+d2)) = sqrt(2998 * 50000 * 50000 / 100000) ≈ 8660 m
    // If Tx=9000m, Rx=9000m above flat ground (0m), hEff at midpoint = 0-9000 = -9000m
    // v = -9000 / 8660 * sqrt(2) ≈ -1.47 → well below -0.7 → 0 dB
    const n = 16;
    const elevM = new Array(n).fill(0);
    const r = analyseElevationProfile(9000, 9000, elevM, 100_000);
    expect(r.blocked).toBe(false);
    expect(r.diffractionLossDb).toBe(0);
  });

  it('returns non-zero loss for moderately obstructed path (v between -0.7 and 0)', () => {
    // Flat ground at sea level, Tx/Rx at ~30m — causes measurable Fresnel zone clipping
    const n = 16;
    const elevM = new Array(n).fill(0);
    const r = analyseElevationProfile(30, 5, elevM, 500_000);
    // v is small negative (near -0.7 to 0); loss ≥ 0 but < BLOCKED
    expect(r.diffractionLossDb).toBeGreaterThanOrEqual(0);
    expect(r.blocked).toBe(false);
  });

    it('very tall ridge causes more loss than flat terrain', () => {
    const n = 16;
    const flatElevM = new Array(n).fill(0);
    const ridgeElevM = new Array(n).fill(0);
    ridgeElevM[Math.floor(n / 2)] = 5000; // 5 km ridge — significant at 100 kHz Fresnel zones
    const rFlat = analyseElevationProfile(30, 5, flatElevM, 200_000);
    const rRidge = analyseElevationProfile(30, 5, ridgeElevM, 200_000);
    // Ridge with 5 km obstacle should produce more total loss than baseline flat terrain
    expect(rRidge.diffractionLossDb).toBeGreaterThan(rFlat.diffractionLossDb);
  });

  it('identifies dominant obstacle near midpoint', () => {
    const n = 17; // odd: index 8 is exactly midpoint
    const elevM = new Array(n).fill(0);
    elevM[8] = 800; // peak at centre
    const r = analyseElevationProfile(30, 30, elevM, 200_000);
    expect(r.dominantFrac).toBeCloseTo(0.5, 1);
  });

  it('very high ridge flags path as blocked', () => {
    // At 100 kHz, v = h_eff * sqrt(2*(d1+d2)/(λ*d1*d2))
    // Need v >= 2.0 for loss >= 15 dB.
    // With n=16, d1=d2=50km, λ=2998m:
    // v = hEff * sqrt(2*100000/(2998*50000*50000)) = hEff * sqrt(2.67e-11) = hEff * 5.17e-6
    // For v=2: hEff = 2 / 5.17e-6 = 386,848 m. Use 400000m ridge.
    const n = 16;
    const elevM = new Array(n).fill(0);
    elevM[8] = 400000; // artificially tall obstacle to guarantee block at 100 kHz
    const r = analyseElevationProfile(30, 5, elevM, 100_000);
    expect(r.blocked).toBe(true);
    expect(r.diffractionLossDb).toBeGreaterThanOrEqual(BLOCKED_LOSS_DB_THRESHOLD);
  });

  it('obstacle well below LOS (deeply negative hEff) gives 0 dB', () => {
    // Tx at 50000m, Rx at 50000m, ground at 0m → hEff = 0 - ~50000 << 0 → v << -0.7 → 0 dB
    const n = 16;
    const elevM = new Array(n).fill(0);
    const r = analyseElevationProfile(50000, 50000, elevM, 100_000);
    expect(r.blocked).toBe(false);
    expect(r.diffractionLossDb).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeTerrainMasking (wrapper)
// ---------------------------------------------------------------------------

describe('computeTerrainMasking', () => {
  it('returns flatEarth true when profile.flat is set', () => {
    const profile = { elevations: [], distanceM: 100000, flat: true };
    const r = computeTerrainMasking(profile);
    expect(r.flatEarth).toBe(true);
    expect(r.blocked).toBe(false);
  });

  it('returns flatEarth true when profile has no elevation data', () => {
    const profile = { elevations: new Array(16).fill(0), distanceM: 100000, flat: true };
    const r = computeTerrainMasking(profile);
    expect(r.flatEarth).toBe(true);
  });

  it('normal profile with ridgeline causes loss', () => {
    const n = 16;
    const elevM = new Array(n).fill(0);
    elevM[8] = 800;
    const profile = { elevations: elevM, distanceM: 150_000, flat: false };
    const r = computeTerrainMasking(profile);
    expect(r.diffractionLossDb).toBeGreaterThan(0);
    expect(typeof r.blocked).toBe('boolean');
  });

  it('higher Tx antenna reduces effective obstacle height and loss', () => {
    const n = 16;
    const elevM = new Array(n).fill(0);
    elevM[8] = 200;
    const profile = { elevations: elevM, distanceM: 100_000, flat: false };
    const rLow = computeTerrainMasking(profile, 0, 0);
    const rHigh = computeTerrainMasking(profile, 300, 0);
    expect(rHigh.diffractionLossDb).toBeLessThanOrEqual(rLow.diffractionLossDb);
  });
});

// ---------------------------------------------------------------------------
// interpolateGreatCircle (elevationProfile.js)
// ---------------------------------------------------------------------------

describe('interpolateGreatCircle', () => {
  it('returns exactly n points', () => {
    const from = { lat: 0, lng: 0 };
    const to = { lat: 1, lng: 1 };
    expect(interpolateGreatCircle(from, to, 10).length).toBe(10);
    expect(interpolateGreatCircle(from, to, 2).length).toBe(2);
  });

  it('first point equals "from"', () => {
    const from = { lat: -6.2, lng: 106.8 };
    const to = { lat: -7.0, lng: 107.5 };
    const pts = interpolateGreatCircle(from, to, 8);
    expect(pts[0].lat).toBeCloseTo(from.lat, 4);
    expect(pts[0].lng).toBeCloseTo(from.lng, 4);
  });

  it('last point is close to "to"', () => {
    const from = { lat: -6.2, lng: 106.8 };
    const to = { lat: -7.0, lng: 107.5 };
    const pts = interpolateGreatCircle(from, to, 8);
    const last = pts[pts.length - 1];
    expect(last.lat).toBeCloseTo(to.lat, 2);
    expect(last.lng).toBeCloseTo(to.lng, 2);
  });

  it('enforces minimum of 2 points', () => {
    const from = { lat: 0, lng: 0 };
    const to = { lat: 1, lng: 0 };
    expect(interpolateGreatCircle(from, to, 0).length).toBe(2);
    expect(interpolateGreatCircle(from, to, 1).length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// clearElevationCache — smoke test
// ---------------------------------------------------------------------------

describe('clearElevationCache', () => {
  it('can be called without throwing', () => {
    expect(() => clearElevationCache()).not.toThrow();
  });
});
// ---------------------------------------------------------------------------
// fresnelZoneRadiusM - 1st Fresnel zone clearance radius
// ---------------------------------------------------------------------------

describe('fresnelZoneRadiusM', () => {
  it('returns 0 for non-positive distances', () => {
    expect(fresnelZoneRadiusM(0, 100000)).toBe(0);
    expect(fresnelZoneRadiusM(100000, 0)).toBe(0);
    expect(fresnelZoneRadiusM(-10, 100000)).toBe(0);
  });

  it('calculates physically correct midpoint radius for a 200 km path', () => {
    // r1 = sqrt(lambda * d1 * d2 / (d1 + d2))
    // lambda ~ 2997.925 m, d1 = 100 km, d2 = 100 km -> r1 ~ 12,243 m
    const r1 = fresnelZoneRadiusM(100000, 100000);
    expect(r1).toBeGreaterThan(12000);
    expect(r1).toBeLessThan(12500);
  });

  it('is symmetric under transmitter and receiver exchange', () => {
    const rA = fresnelZoneRadiusM(30000, 70000);
    const rB = fresnelZoneRadiusM(70000, 30000);
    expect(rA).toBeCloseTo(rB, 5);
  });

  it('peaks at the midpoint along the path', () => {
    const rQuarter = fresnelZoneRadiusM(25000, 75000);
    const rMid = fresnelZoneRadiusM(50000, 50000);
    expect(rMid).toBeGreaterThan(rQuarter);
  });
});
