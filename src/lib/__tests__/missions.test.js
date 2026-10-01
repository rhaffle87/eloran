import { describe, it, expect, vi } from 'vitest';
import { MISSIONS } from '../missions.js';

describe('Mission Guide Scenarios (src/lib/missions.js)', () => {
  it('contains exactly 3 structured missions', () => {
    expect(MISSIONS).toHaveLength(3);
    expect(MISSIONS.map((m) => m.id)).toEqual([
      'gps-spoofing',
      'asf-calibration',
      'baseline-singularity',
    ]);
  });

  describe('Mission 1: GPS Spoofing Recovery & eLoran Failover', () => {
    const mission = MISSIONS[0];

    it('has valid metadata and theory link', () => {
      expect(mission.number).toBe(1);
      expect(mission.theoryAnchor).toBe('/learn#fusion');
      expect(mission.objectives).toHaveLength(3);
      expect(typeof mission.setup).toBe('function');
    });

    it('executes setup on store correctly', () => {
      const mockStore = {
        loadPreset: vi.fn(),
        updateSettings: vi.fn(),
        updateStation: vi.fn(),
        logActivity: vi.fn(),
        evaluateReceivers: vi.fn(),
      };

      mission.setup(mockStore);

      expect(mockStore.loadPreset).toHaveBeenCalledWith('jakarta_baseline');
      expect(mockStore.updateSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          gnssStatus: 'spoofed',
          gnssSpoofBiasMeters: 180,
          solverMode: 'pseudorange',
        })
      );
      expect(mockStore.updateStation).toHaveBeenCalledWith(
        'receiver',
        'R1-Vessel',
        expect.objectContaining({
          fuseMode: 'gnss',
          lat: -5.95,
          lng: 106.60,
        })
      );
      expect(mockStore.logActivity).toHaveBeenCalled();
    });

    it('validates objectives dynamically', () => {
      const [obj1, obj2, obj3] = mission.objectives;

      // Objective 1: Detect spoofing
      expect(obj1.check({ settings: { gnssStatus: 'nominal' } }, { gnssFix: { errorMeters: 5 } })).toBe(false);
      expect(obj1.check({ settings: { gnssStatus: 'spoofed' } }, { gnssFix: { errorMeters: 180 } })).toBe(true);
      expect(obj1.getMetric({ settings: { gnssStatus: 'spoofed', gnssSpoofBiasMeters: 180 } }, { gnssFix: { errorMeters: 180 } })).toContain('SPOOFED');

      // Objective 2: Track eLoran
      const mockStateFew = {
        masters: [{ enabled: true }],
        slaves: [{ enabled: true }],
      };
      const mockStateEnough = {
        masters: [{ enabled: true }],
        slaves: [{ enabled: true }, { enabled: true }],
      };
      expect(obj2.check(mockStateFew, { converged: true })).toBe(false);
      expect(obj2.check(mockStateEnough, { converged: true })).toBe(true);

      // Objective 3: Restore fix error <= 25m
      expect(obj3.check({}, { errorMeters: 180 }, { fuseMode: 'gnss' })).toBe(false);
      expect(obj3.check({}, { errorMeters: 30 }, { fuseMode: 'fusion' })).toBe(false);
      expect(obj3.check({}, { errorMeters: 8.5 }, { fuseMode: 'fusion' })).toBe(true);
      expect(obj3.check({}, { errorMeters: 6.2 }, { fuseMode: 'eLoran' })).toBe(true);
    });
  });

  describe('Mission 2: ASF Seawater vs. Land Boundary Calibration', () => {
    const mission = MISSIONS[1];

    it('has valid metadata and theory link', () => {
      expect(mission.number).toBe(2);
      expect(mission.theoryAnchor).toBe('/learn#asf');
      expect(mission.objectives).toHaveLength(3);
      expect(typeof mission.setup).toBe('function');
    });

    it('executes setup on store correctly', () => {
      const mockStore = {
        loadPreset: vi.fn(),
        updateSettings: vi.fn(),
        updateStation: vi.fn(),
        logActivity: vi.fn(),
        evaluateReceivers: vi.fn(),
      };

      mission.setup(mockStore);

      expect(mockStore.updateSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          asfModelMode: 'millington',
          asfLandFraction: 0.85,
          enableSecondaryFactor: false,
        })
      );
    });

    it('validates objectives dynamically', () => {
      const [obj1, obj2, obj3] = mission.objectives;

      // Objective 1: Millington mode and land fraction >= 0.5
      expect(obj1.check({ settings: { asfModelMode: 'formula', asfLandFraction: 0.2 } })).toBe(false);
      expect(obj1.check({ settings: { asfModelMode: 'millington', asfLandFraction: 0.85 } })).toBe(true);

      // Objective 2: Enable secondary factor
      expect(obj2.check({ settings: { enableSecondaryFactor: false } })).toBe(false);
      expect(obj2.check({ settings: { enableSecondaryFactor: true } })).toBe(true);

      // Objective 3: Calibrate conductivity & error <= 20m
      expect(obj3.check({ settings: { asfLandSigma: 0.001, enableSecondaryFactor: true } }, { errorMeters: 15 })).toBe(false);
      expect(obj3.check({ settings: { asfLandSigma: 0.005, enableSecondaryFactor: false } }, { errorMeters: 15 })).toBe(false);
      expect(obj3.check({ settings: { asfLandSigma: 0.005, enableSecondaryFactor: true } }, { errorMeters: 25 })).toBe(false);
      expect(obj3.check({ settings: { asfLandSigma: 0.005, enableSecondaryFactor: true } }, { errorMeters: 12 })).toBe(true);
    });
  });

  describe('Mission 3: Hyperbolic Baseline Extension Singularity Avoidance', () => {
    const mission = MISSIONS[2];

    it('has valid metadata and theory link', () => {
      expect(mission.number).toBe(3);
      expect(mission.theoryAnchor).toBe('/learn#gdop');
      expect(mission.objectives).toHaveLength(3);
      expect(typeof mission.setup).toBe('function');
    });

    it('executes setup on store correctly', () => {
      const mockStore = {
        loadPreset: vi.fn(),
        updateSettings: vi.fn(),
        updateStation: vi.fn(),
        logActivity: vi.fn(),
        evaluateReceivers: vi.fn(),
      };

      mission.setup(mockStore);

      expect(mockStore.updateSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          solverMode: 'tdoa',
          showBaselineExtensions: true,
        })
      );
      expect(mockStore.updateStation).toHaveBeenCalledWith(
        'receiver',
        'R1-Vessel',
        expect.objectContaining({
          lat: -6.3177,
          lng: 106.1994,
        })
      );
    });

    it('validates objectives dynamically', () => {
      const [obj1, obj2, obj3] = mission.objectives;

      const mockMaster = { lat: -6.1, lng: 106.88 };
      const mockSec = { lat: -6.18, lng: 106.63 };
      const ptInExt = { lat: -6.3177, lng: 106.1994 };
      const ptSafe = { lat: -5.95, lng: 106.85 };

      // Objective 1: Enter extension
      expect(
        obj1.check(
          { masters: [mockMaster], slaves: [mockSec] },
          { gdop: 2.1 },
          ptSafe,
          { hasEnteredHazard: false }
        )
      ).toBe(false);

      expect(
        obj1.check(
          { masters: [mockMaster], slaves: [mockSec] },
          { gdop: 18.5 },
          ptInExt,
          { hasEnteredHazard: false }
        )
      ).toBe(true);

      // Objective 2: Observe GDOP divergence >= 8.0
      expect(obj2.check({}, { gdop: 3.2 }, {}, { maxGdopObserved: 3.2 })).toBe(false);
      expect(obj2.check({}, { gdop: 15.4 }, {}, { maxGdopObserved: 15.4 })).toBe(true);

      // Objective 3: Escape extension with GDOP < 3.5 after seeing hazard
      expect(
        obj3.check(
          { masters: [mockMaster], slaves: [mockSec] },
          { gdop: 12.0, eloranSol: { converged: true } },
          ptInExt,
          { maxGdopObserved: 12.0, hasEnteredHazard: true }
        )
      ).toBe(false);

      expect(
        obj3.check(
          { masters: [mockMaster], slaves: [mockSec] },
          { gdop: 2.3, eloranSol: { converged: true } },
          ptSafe,
          { maxGdopObserved: 12.0, hasEnteredHazard: true }
        )
      ).toBe(true);
    });
  });
});
