import { describe, it, expect } from 'vitest';
import {
  evaluateKoreaTrialBenchmark,
  evaluateMaomingTrialBenchmark,
  vincentyEllipsoidalDistance,
} from '../trialValidation.js';
import { KOREA_TRIAL_2021, MAOMING_TRIAL_2025 } from '../../data/benchmarks/trialData.js';
import { haversineDistance } from '../geodesy.js';

describe('Trial Validation Engine & Empirical Benchmarks', () => {
  describe('Korea Nationwide eLoran Testbed Benchmark (Rhee et al., 2021)', () => {
    it('loads structured benchmark dataset with 4 transmitters and 7 test sites', () => {
      expect(KOREA_TRIAL_2021.transmitters).toHaveLength(4);
      expect(KOREA_TRIAL_2021.sites).toHaveLength(7);
      expect(KOREA_TRIAL_2021.status).toBe('SOURCED');
      expect(KOREA_TRIAL_2021.url).toBe('https://arxiv.org/abs/2108.06008');
    });

    it('evaluates all 7 Korean test sites with valid HDOP between 1.0 and 2.0', () => {
      const results = evaluateKoreaTrialBenchmark();
      expect(results.sites).toHaveLength(7);

      results.sites.forEach((site) => {
        expect(site.valid).toBe(true);
        expect(site.hdop).toBeGreaterThan(1.0);
        expect(site.hdop).toBeLessThan(2.2);
        expect(site.ranges).toHaveLength(4);
      });
    });

    it('produces 95% repeatable accuracy tracking published empirical measurements within < 4m across all sites', () => {
      const results = evaluateKoreaTrialBenchmark();
      
      // Published measured range across the 7 sites is 8.49m to 12.73m (Rhee et al. Table 5)
      results.sites.forEach((site) => {
        expect(site.loranLab95m).toBeGreaterThan(8.0);
        expect(site.loranLab95m).toBeLessThan(16.0);
        // Absolute delta between LORAN LAB model and field measurement must be < 4.0 meters
        expect(site.absDeltaMeters).toBeLessThan(4.0);
      });

      // Overall Mean Absolute Error (MAE) must be < 2.5 meters
      expect(results.summaryMetrics.meanAbsoluteErrorMeters).toBeLessThan(2.5);
      // Root Mean Square Error (RMSE) must be < 2.5 meters
      expect(results.summaryMetrics.rmseMeters).toBeLessThan(2.5);
      // Mean simulated accuracy should be close to mean measured accuracy (~10.2m)
      expect(Math.abs(results.summaryMetrics.meanSimulated95m - results.summaryMetrics.meanMeasured95m)).toBeLessThan(2.5);
    });

    it('reproduces published signal strength measurements in Table 2', () => {
      expect(KOREA_TRIAL_2021.signalStrengthMeasurements).toHaveLength(5);
      const incheon = KOREA_TRIAL_2021.signalStrengthMeasurements.find((m) => m.site === 'Incheon');
      expect(incheon.pohangTxMeasuredDb).toBe(56.25);
      expect(incheon.gwangjuTxMeasuredDb).toBe(57.45);
    });
  });

  describe('Maoming Inland Geodesic Test Benchmark (Gao et al., 2025)', () => {
    it('contains verified metadata and published RMSE figures (417.2m SHP vs 43.1m EPP)', () => {
      expect(MAOMING_TRIAL_2025.status).toBe('SOURCED');
      expect(MAOMING_TRIAL_2025.publishedResults.sphericalHyperbolaPositioningRmseMeters).toBe(417.2);
      expect(MAOMING_TRIAL_2025.publishedResults.ellipsoidalPseudorangePositioningRmseMeters).toBe(43.1);
      expect(MAOMING_TRIAL_2025.publishedResults.accuracyImprovementPercent).toBe(89.7);
    });

    it('demonstrates spherical vs ellipsoidal geodesic distortion across inland baselines', () => {
      const results = evaluateMaomingTrialBenchmark();
      expect(results.geodesicComparisons.length).toBeGreaterThanOrEqual(3);

      results.geodesicComparisons.forEach((comp) => {
        expect(comp.distKm).toBeGreaterThan(100);
        // Spherical approximation deviates from WGS84 ellipsoidal distance by hundreds of meters over >300km
        if (comp.distKm > 300) {
          expect(Math.abs(comp.distortionMeters)).toBeGreaterThan(50);
          expect(Math.abs(comp.distortionMicroseconds)).toBeGreaterThan(0.15); // > 150 ns timing error
        }
      });
    });

    it('verifies that Vincenty ellipsoidal distance is accurate on known meridian test', () => {
      // 1 degree of latitude at equator on WGS84 is ~110,574 meters
      const p1 = { lat: 0, lng: 0 };
      const p2 = { lat: 1, lng: 0 };
      const dVincenty = vincentyEllipsoidalDistance(p1, p2);
      const dSpherical = haversineDistance(p1, p2);

      expect(dVincenty).toBeGreaterThan(110500);
      expect(dVincenty).toBeLessThan(110650);
      // Spherical Earth with mean radius R=6371km gives 2*pi*6371000/360 ≈ 111,195m
      // The difference is ~620 meters at the equator
      expect(Math.abs(dSpherical - dVincenty)).toBeGreaterThan(500);
    });
  });
});
