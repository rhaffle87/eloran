import { describe, it, expect } from 'vitest';
import {
  computeDifferentialCorrections,
  applyDifferentialCorrections,
  encodeDloranMessage,
  decodeDloranMessage,
  DEFAULT_SPATIAL_CORR_DISTANCE_M,
  DEFAULT_TEMPORAL_CORR_TIME_SEC,
  STALE_CORRECTION_AGE_SEC,
} from '../dLoran.js';

describe('Differential eLoran (d-Loran) Engine', () => {
  const monitorPos = { lat: 51.95, lng: 4.15 }; // Hook of Holland / Rotterdam approach
  const stations = [
    { label: 'M', lat: 52.5, lng: 5.0, snrDb: 25 },
    { label: 'W', lat: 53.0, lng: 6.0, snrDb: 22 },
    { label: 'X', lat: 51.0, lng: 3.0, snrDb: 18 },
  ];

  const nominalToas = {
    M: 0.001250,
    W: 0.001850,
    X: 0.001600,
  };

  // Measured has +1.2 us shift on M, -0.8 us on W, +2.5 us on X (temporal ASF variations)
  const observedToas = {
    M: 0.001250 + 1.2e-6,
    W: 0.001850 - 0.8e-6,
    X: 0.001600 + 2.5e-6,
  };

  describe('computeDifferentialCorrections', () => {
    it('returns invalid on empty parameters', () => {
      const res = computeDifferentialCorrections({ monitorPos: null, stations: [] });
      expect(res.valid).toBe(false);
    });

    it('computes exact deltaUs and deltaMeters for all visible transmitters', () => {
      const rec = computeDifferentialCorrections({
        monitorPos,
        stations,
        observedToasSec: observedToas,
        nominalToasSec: nominalToas,
        timestampSec: 1000,
      });

      expect(rec.valid).toBe(true);
      expect(rec.stationCount).toBe(3);
      expect(rec.stationCorrections.M.deltaUs).toBeCloseTo(1.2, 3);
      expect(rec.stationCorrections.W.deltaUs).toBeCloseTo(-0.8, 3);
      expect(rec.stationCorrections.X.deltaUs).toBeCloseTo(2.5, 3);

      // Verify physical distance equivalent: deltaMeters = deltaSec * SPEED_OF_LIGHT
      // 1.2 us * ~299.792 m/us ~ 359.75 m
      expect(rec.stationCorrections.M.deltaMeters).toBeCloseTo(359.75, 1);
    });
  });

  describe('applyDifferentialCorrections', () => {
    const monitorRecord = computeDifferentialCorrections({
      monitorPos,
      stations,
      observedToasSec: observedToas,
      nominalToasSec: nominalToas,
      timestampSec: 1000,
    });

    it('applies 100% full correction at the monitor location with zero age', () => {
      const applied = applyDifferentialCorrections({
        userPos: monitorPos,
        monitorRecord,
        currentTimeSec: 1000,
      });

      expect(applied.applied).toBe(true);
      expect(applied.distanceToMonitorM).toBe(0);
      expect(applied.ageSec).toBe(0);
      expect(applied.totalWeight).toBeCloseTo(1.0, 3);
      expect(applied.isStale).toBe(false);

      expect(applied.userCorrections.M.appliedDeltaUs).toBeCloseTo(1.2, 3);
      expect(applied.userCorrections.W.appliedDeltaUs).toBeCloseTo(-0.8, 3);
      expect(applied.userCorrections.M.residualSigmaM).toBeLessThan(2.0); // ~1.5 m
    });

    it('decays exponentially with distance according to spatial correlation length (~120 km)', () => {
      // Point approx 120 km away
      // 1 degree latitude ~ 111 km
      const farPos = { lat: monitorPos.lat + 1.08, lng: monitorPos.lng };
      const applied = applyDifferentialCorrections({
        userPos: farPos,
        monitorRecord,
        currentTimeSec: 1000,
        spatialCorrM: DEFAULT_SPATIAL_CORR_DISTANCE_M, // 120,000 m
      });

      // At distance ~ 120 km, exp(-120/120) = exp(-1) ~ 0.368
      expect(applied.spatialWeight).toBeCloseTo(Math.exp(-1), 1);
      expect(applied.userCorrections.M.appliedDeltaUs).toBeLessThan(1.2);
      expect(applied.userCorrections.M.appliedDeltaUs).toBeGreaterThan(0.3);
      expect(applied.userCorrections.M.residualSigmaM).toBeGreaterThan(3.0);
    });

    it('flags stale corrections when age exceeds threshold', () => {
      const staleRes = applyDifferentialCorrections({
        userPos: monitorPos,
        monitorRecord,
        currentTimeSec: 1000 + STALE_CORRECTION_AGE_SEC + 50,
      });

      expect(staleRes.isStale).toBe(true);
      expect(staleRes.ageSec).toBe(STALE_CORRECTION_AGE_SEC + 50);
      expect(staleRes.temporalWeight).toBeLessThan(1.0);
    });
  });

  describe('Telemetry Encoding & Decoding (encodeDloranMessage / decodeDloranMessage)', () => {
    const monitorRecord = computeDifferentialCorrections({
      monitorPos,
      stations,
      observedToasSec: observedToas,
      nominalToasSec: nominalToas,
      timestampSec: 1234,
    });

    it('preserves correction values across serialization and deserialization', () => {
      const packet = encodeDloranMessage(monitorRecord, 5);
      expect(packet).not.toBeNull();
      expect(packet.type).toBe('dloran-type1');
      expect(packet.seq).toBe(5);
      expect(packet.entries.length).toBe(3);

      const decoded = decodeDloranMessage(packet);
      expect(decoded).not.toBeNull();
      expect(decoded.valid).toBe(true);
      expect(decoded.timestampSec).toBe(1234);
      expect(decoded.monitorPos.lat).toBeCloseTo(monitorPos.lat, 3);
      expect(decoded.monitorPos.lng).toBeCloseTo(monitorPos.lng, 3);
      expect(decoded.stationCorrections.M.deltaUs).toBeCloseTo(1.2, 2);
      expect(decoded.stationCorrections.W.deltaUs).toBeCloseTo(-0.8, 2);
    });
  });
});
