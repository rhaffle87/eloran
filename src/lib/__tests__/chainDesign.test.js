import { describe, it, expect } from 'vitest';
import {
  SPEED_OF_LIGHT,
  USCG_TD_SIGMA_SEC,
  USCG_SPEC_2DRMS_METERS,
  USCG_SPEC_GDOP,
  PROPAGATION_RATE_US_PER_NM,
  computeBaselineTravelTime,
  computeEmissionDelay,
  computeMinimumFeasibleGRI,
  evaluateChainFeasibility,
  computeLOPGradient,
  computeCrossingAngle,
  computeHyperbolicGDOP,
  isInsideBaselineExtension,
  generateBaselineExtensionSectors,
} from '../chainDesign.js';

describe('Chain Design & Planning Math (USCG Loran-C Specifications)', () => {
  describe('USCG Handbook Golden Worked Example (400-mile baseline)', () => {
    it('reproduces 400 nautical mile baseline travel time of ~2472 µs at 6.18 µs/nm', () => {
      const baselineNm = 400;
      const baselineMeters = baselineNm * 1852; // 740,800 m

      // Using standard Loran atmospheric rate (approx 6.18 µs per nautical mile)
      const travelTimeUs = computeBaselineTravelTime(baselineMeters);

      // Sourced USCG Handbook value: 400 mi * 6.18 µs/mi = 2472 µs
      expect(travelTimeUs).toBeCloseTo(2472, 0); // Within ~1 µs of 2472
      expect(travelTimeUs / baselineNm).toBeCloseTo(PROPAGATION_RATE_US_PER_NM, 1);
    });

    it('calculates Emission Delay = Baseline Travel Time + Coding Delay', () => {
      const baselineMeters = 400 * 1852; // 740,800 m -> Tb ≈ 2472 µs
      const codingDelayUs = 11000; // Standard Secondary 1 coding delay (e.g. 11,000 µs)

      const result = computeEmissionDelay(baselineMeters, codingDelayUs);
      expect(result.travelTimeUs).toBeCloseTo(2472, 0);
      expect(result.codingDelayUs).toBe(11000);
      expect(result.emissionDelayUs).toBeCloseTo(2472 + 11000, 0); // ~13,472 µs
    });
  });

  describe('Coding Delay & GRI Feasibility Calculator', () => {
    const master = { id: 'M', name: 'Master', lat: 35.0, lng: 135.0 };
    const secondaries = [
      { id: 'W', name: 'Secondary W', lat: 36.5, lng: 133.5, codingDelayUs: 11000 },
      { id: 'X', name: 'Secondary X', lat: 33.5, lng: 137.0, codingDelayUs: 25000 },
      { id: 'Y', name: 'Secondary Y', lat: 37.0, lng: 138.5, codingDelayUs: 40000 },
    ];

    it('computes feasible emission delays and recommended minimum GRI for a 3-secondary chain', () => {
      const plan = evaluateChainFeasibility(master, secondaries, 50000);

      expect(plan.secondaries).toHaveLength(3);
      expect(plan.secondaries[0].emissionDelayUs).toBeGreaterThan(plan.secondaries[0].travelTimeUs);
      expect(plan.secondaries[1].emissionDelayUs).toBeGreaterThan(plan.secondaries[0].emissionDelayUs);
      expect(plan.secondaries[2].emissionDelayUs).toBeGreaterThan(plan.secondaries[1].emissionDelayUs);

      // Minimum GRI should account for last secondary emission delay + pulse group + coverage transit + guard
      expect(plan.minFeasibleGRI).toBeGreaterThan(plan.secondaries[2].emissionDelayUs);
      expect(plan.minFeasibleGRI % 10).toBe(0); // Loran GRI is in multiples of 10 µs
    });

    it('computes minimum feasible GRI directly given secondary timings', () => {
      const minGRI = computeMinimumFeasibleGRI(
        [{ emissionDelayUs: 13472 }, { emissionDelayUs: 27472 }],
        800000,
        2000
      );
      expect(minGRI).toBeGreaterThan(27472 + 7000);
      expect(minGRI % 10).toBe(0);
    });

    it('flags infeasible GRI when user sets GRI shorter than minimum feasible interval', () => {
      // GRI 4000 (40,000 µs) is too short for a chain whose last emission is at ~42,500 µs
      const plan = evaluateChainFeasibility(master, secondaries, 40000);
      expect(plan.isFeasible).toBe(false);
      expect(plan.violations.some(v => v.code === 'GRI_TOO_SHORT')).toBe(true);
    });

    it('flags coding delay collision when secondary coding delays are spaced too close', () => {
      const collidingSecondaries = [
        { id: 'W', name: 'Secondary W', lat: 36.5, lng: 133.5, codingDelayUs: 11000 },
        { id: 'X', name: 'Secondary X', lat: 33.5, lng: 137.0, codingDelayUs: 12000 }, // Only 1,000 µs later! Group is 7,000 µs
      ];
      const plan = evaluateChainFeasibility(master, collidingSecondaries, 79900);
      expect(plan.isFeasible).toBe(false);
      expect(plan.violations.some(v => v.code === 'SECONDARY_COLLISION')).toBe(true);
    });

    it('flags coding delay below USCG minimum (10,000 µs)', () => {
      const invalidSecondaries = [
        { id: 'W', name: 'Secondary W', lat: 36.5, lng: 133.5, codingDelayUs: 5000 }, // < 10,000 µs
      ];
      const plan = evaluateChainFeasibility(master, invalidSecondaries, 79900);
      expect(plan.violations.some(v => v.code === 'CODING_DELAY_TOO_LOW')).toBe(true);
    });
  });

  describe('Hyperbolic LOP Gradient K & GDOP', () => {
    const master = { lat: 35.0, lng: 135.0 };
    const sec1 = { lat: 35.0, lng: 138.0 }; // East
    const sec2 = { lat: 38.0, lng: 135.0 }; // North

    it('derives baseline gradient K from physical propagation speed, matching ~150 m/µs (492 ft/µs)', () => {
      // At the midpoint on the baseline between Master and Sec1:
      const midpoint = { lat: 35.0, lng: 136.5 };
      const grad = computeLOPGradient(midpoint, master, sec1);

      // On baseline, psi = 180°, so lane width Gamma = c / 2 ≈ 149.896 m/µs
      // Gradient magnitude ||g|| = 2 / c ≈ 6.671e-9 s/m = 1 / 149.896 µs/m
      const laneWidthMetersPerUs = grad.laneWidthMetersPerUs;
      expect(laneWidthMetersPerUs).toBeCloseTo(149.9, 0); // ~150 m/µs

      // Convert to feet/µs: 149.896 m * 3.28084 ft/m ≈ 491.8 ft/µs ≈ 492.1 ft/µs
      const feetPerUs = laneWidthMetersPerUs * 3.28084;
      expect(feetPerUs).toBeCloseTo(492.1, 0);
    });

    it('computes 90-degree optimal crossing angle between orthogonal baseline pairs', () => {
      // Receiver at (lat 37.0, lng 137.0)
      const rx = { lat: 37.0, lng: 137.0 };
      const angle = computeCrossingAngle(rx, master, sec1, sec2);

      // For stations East and North, crossing angle should be well within favorable bounds [45°, 135°]
      expect(angle.angleDeg).toBeGreaterThan(45);
      expect(angle.angleDeg).toBeLessThan(135);
      expect(angle.isFavorable).toBe(true);
    });

    it('reproduces USCG operational spec accuracy GDOP = 10.92 corresponding to 0.25 nmi 2drms at 0.1 µs sigma', () => {
      // Ideal fix 2drms* at sigma = 0.1 µs is 2 * sqrt(2) * 0.1 µs * (c/2) ≈ 42.4 m
      // Spec 2drms = 0.25 nmi = 463 m
      // Spec GDOP = 463 m / 42.4 m = 10.92
      const specGdop = USCG_SPEC_2DRMS_METERS / (2 * Math.SQRT2 * USCG_TD_SIGMA_SEC * (SPEED_OF_LIGHT / 2));
      expect(specGdop).toBeCloseTo(USCG_SPEC_GDOP, 2); // 10.92
    });

    it('reproduces Sitterly (1948, MIT Rad Lab Vol. 4 p. 429) golden formula verbatim: D = csc(theta) * sqrt(s1^2 + s2^2)', () => {
      // Test cases with master at origin, sec1 on East axis, and sec2 positioned to yield distinct crossing angles
      const originMaster = { lat: 0, lng: 0 };
      const secEast = { lat: 0, lng: 2 };
      const rxPoint = { lat: 1, lng: 1 };
      const sigmaTdUs = 0.1;

      const cases = [
        { name: 'Orthogonal (theta = 90°)', sec: { lat: 2, lng: 0 } },
        { name: 'Oblique (theta ≈ 67.5°)', sec: { lat: 1.732, lng: 1.0 } },
        { name: 'Acute (theta ≈ 22.5°)', sec: { lat: 1.0, lng: 1.732 } },
      ];

      for (const { sec } of cases) {
        const g1 = computeLOPGradient(rxPoint, originMaster, secEast);
        const g2 = computeLOPGradient(rxPoint, originMaster, sec);
        const angleResult = computeCrossingAngle(rxPoint, originMaster, secEast, sec);
        const thetaRad = (angleResult.angleDeg * Math.PI) / 180;

        // Per-LOP distance standard deviations: s_i = K_i * sigma_TD = laneWidth * sigma_TD
        const s1 = g1.laneWidthMetersPerUs * sigmaTdUs;
        const s2 = g2.laneWidthMetersPerUs * sigmaTdUs;

        // Literal Sitterly formula: D = csc(theta) * sqrt(s1^2 + s2^2)
        const expectedD = (1 / Math.sin(thetaRad)) * Math.sqrt(s1 * s1 + s2 * s2);
        const expected2drms = 2 * expectedD;

        // Actual code execution via normal matrix covariance
        const actualResult = computeHyperbolicGDOP(rxPoint, originMaster, [secEast, sec], sigmaTdUs);

        expect(actualResult.valid).toBe(true);
        // Code rounds twoDrmsMeters to 1 decimal place; assert exact agreement within 0.1 m
        expect(actualResult.twoDrmsMeters).toBeCloseTo(expected2drms, 0);
        expect(Math.abs(actualResult.twoDrmsMeters - expected2drms)).toBeLessThan(0.1);
      }
    });

    it('calculates realistic GDOP using dynamically derived gradient K and configurable sigma', () => {
      const rx = { lat: 36.0, lng: 136.0 };
      const gdopResult = computeHyperbolicGDOP(rx, master, [sec1, sec2], 0.1);

      expect(gdopResult.valid).toBe(true);
      expect(gdopResult.gdop).toBeGreaterThan(1.0);
      expect(gdopResult.gdop).toBeLessThan(50.0);
      expect(gdopResult.twoDrmsMeters).toBeGreaterThan(0);
    });

    it('demonstrates that GDOP varies inversely with crossing angle and degrades near baseline extension', () => {
      // 1. Near-orthogonal crossing angle (~80.4°) inside triad: GDOP is low and well-conditioned
      const rxOptimal = { lat: 36.0, lng: 136.5 };
      const gdopOpt = computeHyperbolicGDOP(rxOptimal, master, [sec1, sec2]);
      const angleOpt = computeCrossingAngle(rxOptimal, master, sec1, sec2);
      expect(angleOpt.angleDeg).toBeGreaterThan(60);
      expect(gdopOpt.gdop).toBeLessThan(2.0); // GDOP ≈ 1.33

      // 2. Degraded crossing angle (~43°): GDOP increases
      const rxDegraded = { lat: 34.0, lng: 136.0 };
      const gdopDeg = computeHyperbolicGDOP(rxDegraded, master, [sec1, sec2]);
      const angleDeg = computeCrossingAngle(rxDegraded, master, sec1, sec2);
      expect(angleDeg.angleDeg).toBeLessThan(60);
      expect(gdopDeg.gdop).toBeGreaterThan(gdopOpt.gdop); // GDOP ≈ 3.77 > 1.33

      // 3. Near baseline extension zone: GDOP expands dramatically (> 10.92 USCG spec limit)
      const rxExtension = { lat: 34.9, lng: 134.0 };
      const gdopExt = computeHyperbolicGDOP(rxExtension, master, [sec1, sec2]);
      expect(gdopExt.gdop).toBeGreaterThan(10.92);
      expect(gdopExt.twoDrmsMeters).toBeGreaterThan(USCG_SPEC_2DRMS_METERS);
    });
  });

  describe('Configurable Planning Thresholds & Heuristics', () => {
    const master = { lat: 35.0, lng: 135.0 };
    const secondaries = [
      { id: 'W', name: 'Sec-W', lat: 35.0, lng: 143.1353, codingDelayUs: 11000 },
      { id: 'X', name: 'Sec-X', lat: 41.6622, lng: 135.0, codingDelayUs: 25000 },
    ];

    it('allows custom minCodingDelayUs threshold to flag violations', () => {
      // With default threshold (10,000 µs), 11,000 µs is feasible
      const planDefault = evaluateChainFeasibility(master, secondaries, 80000);
      expect(planDefault.violations.some(v => v.code === 'CODING_DELAY_TOO_LOW')).toBe(false);

      // With strict threshold (15,000 µs), 11,000 µs is flagged as CODING_DELAY_TOO_LOW
      const planStrict = evaluateChainFeasibility(master, secondaries, 80000, { minCodingDelayUs: 15000 });
      expect(planStrict.isFeasible).toBe(false);
      expect(planStrict.violations.some(v => v.code === 'CODING_DELAY_TOO_LOW')).toBe(true);
    });

    it('allows custom maxBaselineKm threshold to flag excessive baseline length', () => {
      // Baseline length is ~741 km (400 nmi).
      // With default limit (1,800 km), no baseline warning
      const planDefault = evaluateChainFeasibility(master, secondaries, 80000);
      expect(planDefault.warnings.some(w => w.code === 'BASELINE_EXCESSIVE_LENGTH')).toBe(false);

      // With tight limit (500 km), baseline is flagged as BASELINE_EXCESSIVE_LENGTH
      const planTight = evaluateChainFeasibility(master, secondaries, 80000, { maxBaselineKm: 500 });
      expect(planTight.warnings.some(w => w.code === 'BASELINE_EXCESSIVE_LENGTH')).toBe(true);
    });

    it('adjusts baseline extension hazard detection sensitivity with configurable halfWidthDeg', () => {
      const sec = secondaries[0];
      // A point located ~8° off the baseline extension
      const pt8Deg = { lat: 35.2, lng: 144.5 };
      const statusTight = isInsideBaselineExtension(pt8Deg, master, sec, 5); // 5° cone
      const statusWide = isInsideBaselineExtension(pt8Deg, master, sec, 15); // 15° cone

      expect(statusWide.isExtension).toBe(true);
      expect(statusTight.isExtension).toBe(false);
    });
  });

  describe('Baseline Extension Hazard Zone Detection', () => {
    const master = { lat: 35.0, lng: 135.0 };
    const sec = { lat: 35.0, lng: 137.0 }; // Due East baseline

    it('detects points situated directly behind the secondary on the baseline extension', () => {
      // Point further East at lat 35.0, lng 139.0 is on the secondary baseline extension
      const rxBehindSec = { lat: 35.0, lng: 139.0 };
      const statusSec = isInsideBaselineExtension(rxBehindSec, master, sec, 10); // 10° half-width

      expect(statusSec.isExtension).toBe(true);
      expect(statusSec.stationRole).toBe('SECONDARY');
    });

    it('detects points situated directly behind the master on the baseline extension', () => {
      // Point further West at lat 35.0, lng 133.0 is on the master baseline extension
      const rxBehindMaster = { lat: 35.0, lng: 133.0 };
      const statusMaster = isInsideBaselineExtension(rxBehindMaster, master, sec, 10);

      expect(statusMaster.isExtension).toBe(true);
      expect(statusMaster.stationRole).toBe('MASTER');
    });

    it('returns false for points safely broadside to the baseline', () => {
      // Point North at lat 37.0, lng 136.0 is broadside (near bisector)
      const rxBroadside = { lat: 37.0, lng: 136.0 };
      const status = isInsideBaselineExtension(rxBroadside, master, sec, 10);

      expect(status.isExtension).toBe(false);
    });

    it('generates GeoJSON hazard sectors for baseline extensions', () => {
      const geojson = generateBaselineExtensionSectors(master, [sec], 500000, 10);
      expect(geojson.type).toBe('FeatureCollection');
      expect(geojson.features.length).toBe(2); // 1 for Master extension, 1 for Secondary extension
      expect(geojson.features[0].geometry.type).toBe('Polygon');
    });
  });
});

