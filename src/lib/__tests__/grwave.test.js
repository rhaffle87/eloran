import { describe, it, expect } from 'vitest';
import {
  SPEED_OF_LIGHT,
  ITU_GROUND_TYPES,
  computeSurfaceImpedance,
  computeGroundwavePhaseProfile,
  computeHomogeneousAsfMicroseconds,
  computeMillingtonAsfMicroseconds,
  computeMixedPathAsfMeters,
} from '../grwave.js';

import referenceData from './fixtures/grwave-reference.json';

describe('ITU-R P.368 / GRWAVE Groundwave Propagation Engine', () => {
  describe('Complex Surface Impedance & Constitutive Parameters (ITU-R P.368-9)', () => {
    it('computes surface impedance matching GRWAVE native reference fixtures at 100 kHz', () => {
      for (const refGround of Object.values(referenceData.homogeneous)) {
        const imp = computeSurfaceImpedance(0.1, refGround.sigma, refGround.epslon);
        const refImp = refGround.surface_impedance;

        expect(imp.etaR).toBeCloseTo(refImp.eta_real, 4);
        expect(imp.etaI).toBeCloseTo(refImp.eta_imag, 4);
        expect(imp.etaMag).toBeCloseTo(refImp.eta_mag, 4);
        expect(imp.lossAngleDeg).toBeCloseTo(refImp.loss_angle_deg, 2);
        expect(imp.skinDepthM).toBeCloseTo(refImp.skin_depth_m, 1);
      }
    });

    it('verifies skin depth scales inversely with sqrt(conductivity)', () => {
      const seaImp = computeSurfaceImpedance(0.1, 5.0, 70.0);
      const dryImp = computeSurfaceImpedance(0.1, 0.001, 15.0);

      // Sea water skin depth is ~0.7 m at 100 kHz; dry ground is ~50 m
      expect(seaImp.skinDepthM).toBeLessThan(1.0);
      expect(dryImp.skinDepthM).toBeGreaterThan(45.0);
      expect(dryImp.skinDepthM / seaImp.skinDepthM).toBeCloseTo(Math.sqrt(5.0 / 0.001), 0);
    });
  });

  describe('Groundwave Phase Lag & Sommerfeld Numerical Distance', () => {
    it('computes phase lag and timing delay matching GRWAVE reference curves within 0.0001 µs', () => {
      for (const refGround of Object.values(referenceData.homogeneous)) {
        for (const pt of refGround.points) {
          const profile = computeGroundwavePhaseProfile(pt.distance_km, 0.1, refGround.sigma, refGround.epslon);

          expect(profile.numericalDistanceP).toBeCloseTo(pt.numerical_distance_p, 4);
          expect(profile.phaseLagRad).toBeCloseTo(pt.phase_lag_rad, 4);
          expect(profile.timingDelayUs).toBeCloseTo(pt.phase_delay_us, 4);
        }
      }
    });

    it('confirms seawater has zero ASF by definition relative to reference standard', () => {
      for (const d of [10, 50, 100, 200, 500]) {
        const asfSea = computeHomogeneousAsfMicroseconds(d, 5.0, 70.0, 0.1);
        expect(asfSea).toBe(0);
      }
    });

    it('confirms lower ground conductivity produces larger phase delay', () => {
      const distKm = 200;
      const asfWet = computeHomogeneousAsfMicroseconds(distKm, ITU_GROUND_TYPES.wet_ground.sigma, 30.0);
      const asfMed = computeHomogeneousAsfMicroseconds(distKm, ITU_GROUND_TYPES.medium_ground.sigma, 15.0);
      const asfDry = computeHomogeneousAsfMicroseconds(distKm, ITU_GROUND_TYPES.dry_ground.sigma, 15.0);

      expect(asfWet).toBeGreaterThan(0);
      expect(asfMed).toBeGreaterThan(asfWet);
      expect(asfDry).toBeGreaterThan(asfMed);
    });

    it('confirms monotonic increase of phase delay with distance across homogeneous terrain', () => {
      let prevDelay = 0;
      for (const d of [25, 50, 100, 200, 400, 800]) {
        const delay = computeHomogeneousAsfMicroseconds(d, ITU_GROUND_TYPES.medium_ground.sigma, 15.0);
        expect(delay).toBeGreaterThan(prevDelay);
        prevDelay = delay;
      }
    });
  });

  describe('Multi-Boundary Inhomogeneous Millington Mixed-Path Solver (ITU-R P.368-10)', () => {
    it('strictly satisfies electromagnetic reciprocity (Forward path = Reverse path total)', () => {
      const segmentsForward = [
        { distKm: 120, sigma: 5.0, epslon: 70 },
        { distKm: 80, sigma: 0.005, epslon: 15 },
      ];
      const segmentsReverse = [
        { distKm: 80, sigma: 0.005, epslon: 15 },
        { distKm: 120, sigma: 5.0, epslon: 70 },
      ];

      const delayForward = computeMillingtonAsfMicroseconds(segmentsForward);
      const delayReverse = computeMillingtonAsfMicroseconds(segmentsReverse);

      expect(delayForward).toBeCloseTo(delayReverse, 8);
      expect(delayForward).toBeGreaterThan(0);
    });

    it('handles 3-segment inhomogeneous island crossing with exact reciprocity', () => {
      const islandPath = [
        { distKm: 100, sigma: 5.0, epslon: 70 },
        { distKm: 50, sigma: 0.001, epslon: 15 },
        { distKm: 100, sigma: 5.0, epslon: 70 },
      ];
      const revIslandPath = [...islandPath].reverse();

      const asfFwd = computeMillingtonAsfMicroseconds(islandPath);
      const asfRev = computeMillingtonAsfMicroseconds(revIslandPath);

      expect(asfFwd).toBeCloseTo(asfRev, 8);
      expect(asfFwd).toBeGreaterThan(0);
    });

    it('converts mixed path delay correctly to distance delay meters', () => {
      const asfMeters = computeMixedPathAsfMeters({
        totalDistMeters: 200000, // 200 km
        landFraction: 0.5,
        landSigma: 0.003,
      });

      // At 200 km with 50% land (0.003 S/m), typical Loran-C ASF is in the 100 to 500 meter range
      expect(asfMeters).toBeGreaterThan(50);
      expect(asfMeters).toBeLessThan(1000);
    });
  });
});
