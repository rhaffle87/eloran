import { describe, it, expect } from 'vitest';
import {
  COMPARATIVE_MODES,
  COMPARATIVE_PRESETS,
  evaluateComparativeSystems,
} from '../comparativeAnalysis.js';

describe('Multi-System PNT Comparative Analysis Engine', () => {
  it('correctly evaluates nominal conditions across all 4 systems with physical metrics', () => {
    const res = evaluateComparativeSystems({
      trueLat: 37.456,
      trueLng: 126.705,
      eloranFix: { errorMeters: 11.2, hdop: 1.1 },
      gnssFix: { errorMeters: 4.8 },
      fusedFix: { errorMeters: 3.9 },
      settings: COMPARATIVE_PRESETS.nominal_clear,
      alertLimitMeters: 25.0,
    });

    expect(res).toBeDefined();
    expect(res.alertLimitMeters).toBe(25.0);
    expect(res.integrityMarginMeters).toBeGreaterThan(0);
    expect(res.hplHalRatio).toBeLessThan(1.0);
    expect(res.resilienceScore).toBeGreaterThanOrEqual(70);

    const systems = res.systems;
    expect(systems[COMPARATIVE_MODES.LORAN_C].errorMeters).toBeGreaterThan(400);
    expect(systems[COMPARATIVE_MODES.LORAN_C].hpeMeters).toBe(systems[COMPARATIVE_MODES.LORAN_C].errorMeters);
    expect(systems[COMPARATIVE_MODES.LORAN_C].hplMeters).toBeGreaterThan(900);
    expect(systems[COMPARATIVE_MODES.LORAN_C].r95Meters).toBeGreaterThan(systems[COMPARATIVE_MODES.LORAN_C].errorMeters);
    expect(systems[COMPARATIVE_MODES.LORAN_C].available).toBe(false); // Fails IMO HEA 25m

    expect(systems[COMPARATIVE_MODES.ELORAN].errorMeters).toBeCloseTo(11.2, 1);
    expect(systems[COMPARATIVE_MODES.ELORAN].hpeMeters).toBe(systems[COMPARATIVE_MODES.ELORAN].errorMeters);
    expect(systems[COMPARATIVE_MODES.ELORAN].hdop).toBe(1.1);
    expect(systems[COMPARATIVE_MODES.ELORAN].hasAsfCorrection).toBe(true);

    expect(systems[COMPARATIVE_MODES.GNSS].available).toBe(true);
    expect(systems[COMPARATIVE_MODES.GNSS].errorMeters).toBeLessThan(10);
    expect(systems[COMPARATIVE_MODES.GNSS].hpeMeters).toBe(systems[COMPARATIVE_MODES.GNSS].errorMeters);

    expect(systems[COMPARATIVE_MODES.EKF_FUSION].available).toBe(true);
    expect(systems[COMPARATIVE_MODES.EKF_FUSION].status).toContain('OPTIMAL');
    expect(systems[COMPARATIVE_MODES.EKF_FUSION].hplMeters).toBeLessThanOrEqual(res.alertLimitMeters);
  });

  it('proves eLoran resilience during GPS barrage jamming attack', () => {
    const res = evaluateComparativeSystems({
      trueLat: 37.456,
      trueLng: 126.705,
      eloranFix: { errorMeters: 14.0, hdop: 1.2 },
      gnssFix: { errorMeters: 180.0 },
      fusedFix: { errorMeters: 14.5 },
      settings: COMPARATIVE_PRESETS.hormuz_jamming,
      alertLimitMeters: 25.0,
    });

    const systems = res.systems;
    // GNSS must fail completely
    expect(systems[COMPARATIVE_MODES.GNSS].available).toBe(false);
    expect(systems[COMPARATIVE_MODES.GNSS].errorMeters).toBeGreaterThanOrEqual(100);
    expect(systems[COMPARATIVE_MODES.GNSS].status).toContain('JAMMED');
    expect(systems[COMPARATIVE_MODES.GNSS].hdop).toBeGreaterThan(5);

    // eLoran must remain available on LF 100 kHz
    expect(systems[COMPARATIVE_MODES.ELORAN].errorMeters).toBeLessThan(20);
    expect(systems[COMPARATIVE_MODES.ELORAN].available).toBe(true);

    // EKF Fusion must shed GNSS and sustain continuity
    expect(systems[COMPARATIVE_MODES.EKF_FUSION].status).toContain('RAIM FAULT EXCLUSION');
    expect(systems[COMPARATIVE_MODES.EKF_FUSION].errorMeters).toBeLessThan(20);
    expect(systems[COMPARATIVE_MODES.EKF_FUSION].available).toBe(true);
    expect(res.integrityMarginMeters).toBeGreaterThan(0);
  });

  it('detects GPS spoofing and executes RAIM fault exclusion in EKF', () => {
    const res = evaluateComparativeSystems({
      trueLat: 37.456,
      trueLng: 126.705,
      eloranFix: { errorMeters: 12.0, hdop: 1.1 },
      gnssFix: { errorMeters: 350.0 },
      fusedFix: { errorMeters: 13.0 },
      settings: COMPARATIVE_PRESETS.baltic_spoofing,
      alertLimitMeters: 25.0,
    });

    const systems = res.systems;
    expect(systems[COMPARATIVE_MODES.GNSS].status).toContain('HAZARDOUS / SPOOFED');
    expect(systems[COMPARATIVE_MODES.GNSS].errorMeters).toBeGreaterThan(200);

    expect(systems[COMPARATIVE_MODES.EKF_FUSION].status).toContain('GNSS ISOLATED');
    expect(systems[COMPARATIVE_MODES.EKF_FUSION].errorMeters).toBeLessThan(20);
    expect(systems[COMPARATIVE_MODES.EKF_FUSION].available).toBe(true);
  });

  it('demonstrates legacy Loran-C cycle slip vs eLoran robustness during ionospheric storm', () => {
    const res = evaluateComparativeSystems({
      trueLat: 37.456,
      trueLng: 126.705,
      eloranFix: { errorMeters: 18.0, hdop: 1.3 },
      gnssFix: { errorMeters: 5.0 },
      fusedFix: { errorMeters: 6.0 },
      settings: COMPARATIVE_PRESETS.nighttime_skywave_storm,
      alertLimitMeters: 25.0,
    });

    const systems = res.systems;
    // Legacy Loran-C error jumps by ~3,000 meters due to wrong-cycle slip
    expect(systems[COMPARATIVE_MODES.LORAN_C].errorMeters).toBeGreaterThan(3000);
    expect(systems[COMPARATIVE_MODES.LORAN_C].status).toContain('CYCLE SLIP');

    // eLoran and EKF Fusion remain robust
    expect(systems[COMPARATIVE_MODES.ELORAN].errorMeters).toBeLessThan(30);
    expect(systems[COMPARATIVE_MODES.EKF_FUSION].available).toBe(true);
  });
});
