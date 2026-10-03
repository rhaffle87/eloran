import { describe, it, expect } from 'vitest';
import {
  toLngLat,
  isPointInBbox,
  findCoveredRegion,
  segmentGreatCirclePath,
  computeGeoMillingtonAsf,
  COASTLINE_REGIONS,
} from '../geoAsf.js';

describe('GIS Coastline Ray-Tracing & Geo-ASF Engine', () => {
  describe('Coordinate Normalization & Region Discovery', () => {
    it('normalizes various coordinate representations', () => {
      expect(toLngLat([106.8, -6.2])).toEqual([106.8, -6.2]);
      expect(toLngLat({ lat: -6.2, lng: 106.8 })).toEqual([106.8, -6.2]);
      expect(toLngLat({ lat: -6.2, lon: 106.8 })).toEqual([106.8, -6.2]);
      expect(toLngLat(null)).toEqual([0, 0]);
    });

    it('correctly tests bounding box containment', () => {
      const bbox = [104.5, -7.5, 108.5, -5.0];
      expect(isPointInBbox([106.8, -6.2], bbox)).toBe(true);
      expect(isPointInBbox([100.0, -6.2], bbox)).toBe(false);
      expect(isPointInBbox([106.8, 0.0], bbox)).toBe(false);
    });

    it('finds covered region for bundled preset areas', () => {
      // Indonesia / Jakarta
      const regId = findCoveredRegion([106.88, -6.10], [105.92, -6.05]);
      expect(regId).not.toBeNull();
      expect(regId.id).toBe('indonesia_sunda');

      // North Sea
      const regNorthSea = findCoveredRegion([8.29, 54.96], [3.20, 53.80]);
      expect(regNorthSea).not.toBeNull();
      expect(regNorthSea.id).toBe('north_sea');

      // Bohai / Yellow Sea
      const regBohai = findCoveredRegion([122.32, 37.07], [121.00, 38.20]);
      expect(regBohai).not.toBeNull();
      expect(regBohai.id).toBe('bohai_yellow_sea');

      // Uncovered location (e.g. US Great Lakes / Atlantic)
      const regUncovered = findCoveredRegion([-76.82, 42.71], [-69.97, 41.25]);
      expect(regUncovered).toBeNull();
    });

    it('guarantees 100% station coverage for all bundled preset scenarios', async () => {
      const { PRESET_SCENARIOS } = await import('../../state/presets.js');
      const manifest = (await import('../../data/geo/index.js')).COASTLINE_MANIFEST;

      for (const [regKey, meta] of Object.entries(manifest)) {
        if (!meta.presetId) continue;
        const scenario = PRESET_SCENARIOS[meta.presetId];
        expect(scenario).toBeDefined();
        const pts = [
          ...(scenario.masters || []),
          ...(scenario.slaves || []),
          ...(scenario.receivers || []),
        ];
        expect(pts.length).toBeGreaterThan(0);
        for (const pt of pts) {
          const covered = isPointInBbox([pt.lng, pt.lat], meta.bbox);
          expect(covered, `Station ${pt.label} (${pt.lat}, ${pt.lng}) must be inside bbox ${JSON.stringify(meta.bbox)} for ${regKey}`).toBe(true);
        }
      }
    });
  });

  describe('Great Circle Path Segmentation', () => {
    it('segments harbor exit path into land then sea (Tanjung Priok to Java Sea)', () => {
      const start = [106.88, -6.12]; // Tanjung Priok mainland
      const end = [106.88, -5.65]; // Java Sea offshore
      const res = segmentGreatCirclePath({ start, end });

      expect(res.isCovered).toBe(true);
      expect(res.regionId).toBe('indonesia_sunda');
      expect(res.totalDistKm).toBeGreaterThan(50);
      expect(res.segments.length).toBeGreaterThanOrEqual(2);

      // First segment must be land
      expect(res.segments[0].medium).toBe('land');
      expect(res.segments[0].startKm).toBe(0);

      // Final segment must be open sea
      const lastSeg = res.segments[res.segments.length - 1];
      expect(lastSeg.medium).toBe('sea');
      expect(lastSeg.endKm).toBeCloseTo(res.totalDistKm, 1);

      // Majority of this offshore path is sea
      expect(res.seaFraction).toBeGreaterThan(0.8);
      expect(res.landFraction).toBeLessThan(0.2);
    });

    it('segments complex multi-crossing path across Sunda Strait (Anyer to Lampung)', () => {
      const anyer = [105.92, -6.05]; // Java coast
      const lampung = [105.26, -5.45]; // Sumatra coast
      const res = segmentGreatCirclePath({ start: anyer, end: lampung });

      expect(res.isCovered).toBe(true);
      expect(res.regionId).toBe('indonesia_sunda');
      expect(res.totalDistKm).toBeCloseTo(98.9, 0);

      // Must have multiple crossings (transitions across strait and islands)
      expect(res.transitions).toBeGreaterThanOrEqual(2);
      expect(res.segments.length).toBeGreaterThanOrEqual(3);

      // Strict segment monotonicity and continuity
      for (let i = 0; i < res.segments.length; i++) {
        const seg = res.segments[i];
        expect(seg.endKm).toBeGreaterThan(seg.startKm);
        expect(seg.distKm).toBeCloseTo(seg.endKm - seg.startKm, 3);
        if (i > 0) {
          expect(seg.startKm).toBeCloseTo(res.segments[i - 1].endKm, 3);
          // Medium must alternate between adjacent segments
          expect(seg.medium).not.toBe(res.segments[i - 1].medium);
        }
      }

      // Sum of segment lengths must match total distance
      const sumDist = res.segments.reduce((acc, s) => acc + s.distKm, 0);
      expect(sumDist).toBeCloseTo(res.totalDistKm, 2);
    });

    it('classifies completely inland path as 100% land (Tangerang to Bekasi)', () => {
      const start = [106.63, -6.18]; // Tangerang
      const end = [106.99, -6.24]; // Bekasi
      const res = segmentGreatCirclePath({ start, end });

      expect(res.isCovered).toBe(true);
      expect(res.landFraction).toBe(1.0);
      expect(res.seaFraction).toBe(0.0);
      expect(res.transitions).toBe(0);
      expect(res.segments.length).toBe(1);
      expect(res.segments[0].medium).toBe('land');
    });

    it('classifies offshore path as 100% sea (Southern North Sea offshore)', () => {
      const start = [3.0, 54.0];
      const end = [4.0, 54.5];
      const res = segmentGreatCirclePath({ start, end });

      expect(res.isCovered).toBe(true);
      expect(res.seaFraction).toBe(1.0);
      expect(res.landFraction).toBe(0.0);
      expect(res.transitions).toBe(0);
      expect(res.segments.length).toBe(1);
      expect(res.segments[0].medium).toBe('sea');
    });

    it('handles zero-length or microscopic path gracefully', () => {
      const pt = [106.8, -6.2];
      const res = segmentGreatCirclePath({ start: pt, end: pt });
      expect(res.totalDistKm).toBe(0);
      expect(res.segments).toEqual([]);
    });

    it('flags uncovered paths outside bundled regions', () => {
      const start = [-76.82, 42.71];
      const end = [-69.97, 41.25];
      const res = segmentGreatCirclePath({ start, end });
      expect(res.isCovered).toBe(false);
      expect(res.regionId).toBeNull();
      expect(res.segments).toEqual([]);
    });
  });

  describe('Millington Reciprocal ASF Computation with Real GIS Segments', () => {
    it('computes non-zero ASF for mixed land/sea path', () => {
      const start = [105.92, -6.05];
      const end = [105.26, -5.45];
      const result = computeGeoMillingtonAsf({
        start,
        end,
        landSigma: 0.003,
      });

      expect(result.isCovered).toBe(true);
      expect(result.fallback).toBe(false);
      expect(result.asfMicroseconds).toBeGreaterThan(0.05);
      expect(result.asfMeters).toBeGreaterThan(15.0);
      expect(result.provenance).toContain('SOURCED');
    });

    it('produces exactly zero ASF for an all-seawater path', () => {
      const start = [3.0, 54.0];
      const end = [4.0, 54.5];
      const result = computeGeoMillingtonAsf({ start, end });

      expect(result.isCovered).toBe(true);
      expect(result.seaFraction).toBe(1.0);
      expect(result.asfMicroseconds).toBe(0);
      expect(result.asfMeters).toBe(0);
    });

    it('strictly satisfies electromagnetic reciprocity (Tx->Rx identical to Rx->Tx)', () => {
      const pA = [105.92, -6.05]; // Anyer
      const pB = [105.26, -5.45]; // Lampung

      const forward = computeGeoMillingtonAsf({ start: pA, end: pB, landSigma: 0.005 });
      const reverse = computeGeoMillingtonAsf({ start: pB, end: pA, landSigma: 0.005 });

      const diffUs = Math.abs(forward.asfMicroseconds - reverse.asfMicroseconds);
      const diffMeters = Math.abs(forward.asfMeters - reverse.asfMeters);

      expect(forward.totalDistKm).toBeCloseTo(reverse.totalDistKm, 2);
      expect(forward.landDistKm).toBeCloseTo(reverse.landDistKm, 1);
      expect(forward.seaDistKm).toBeCloseTo(reverse.seaDistKm, 1);

      // Reciprocal Millington delay must be strictly identical within floating point epsilon
      // Real GIS ray-tracing produces forward = 0.1475005776 µs, reverse = 0.1475005776 µs (diff < 1e-10 µs / < 1e-7 m)
      expect(forward.asfMicroseconds).toBeCloseTo(reverse.asfMicroseconds, 6);
      expect(forward.asfMeters).toBeCloseTo(reverse.asfMeters, 4);
      expect(diffUs).toBeLessThan(1e-9);
      expect(diffMeters).toBeLessThan(1e-6);
    });

    it('falls back gracefully to manual land fraction when region is uncovered', () => {
      const start = [-76.82, 42.71];
      const end = [-69.97, 41.25];
      const fallbackLandFraction = 0.4;

      const result = computeGeoMillingtonAsf({
        start,
        end,
        fallbackLandFraction,
        landSigma: 0.003,
      });

      expect(result.isCovered).toBe(false);
      expect(result.fallback).toBe(true);
      expect(result.landFraction).toBe(fallbackLandFraction);
      expect(result.asfMeters).toBeGreaterThan(0);
      expect(result.provenance).toContain('FALLBACK');
    });

    it('integrates seamlessly with createMillingtonAsfEvaluator when pathMode is geo', async () => {
      const { createMillingtonAsfEvaluator } = await import('../asf.js');
      const station = { lat: -6.10, lng: 106.88 }; // Tanjung Priok
      const evaluator = createMillingtonAsfEvaluator({
        station,
        landSigma: 0.003,
        pathMode: 'geo',
      });

      // Target out in the Java Sea
      const rxSea = { lat: -5.65, lng: 106.88 };
      const asfMeters = evaluator(rxSea.lat, rxSea.lng);
      expect(asfMeters).toBeGreaterThan(0);
      expect(asfMeters).toBeLessThan(100);
    });
  });
});
