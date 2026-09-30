import { describe, it, expect } from 'vitest';
import { PRESET_SCENARIOS } from '../../state/presets.js';
import { haversineDistance } from '../geodesy.js';

describe('Operational Scenario Presets Verification', () => {
  it('contains all required real-world operational scenarios', () => {
    const keys = Object.keys(PRESET_SCENARIOS);
    expect(keys).toContain('jakarta_baseline');
    expect(keys).toContain('rotterdam_harbor_approach');
    expect(keys).toContain('dover_strait_tss');
    expect(keys).toContain('korea_yellow_sea_trial');
  });

  it('verifies Rotterdam Europort Harbor Approach scenario geometry and monitor', () => {
    const rotterdam = PRESET_SCENARIOS.rotterdam_harbor_approach;
    expect(rotterdam).toBeDefined();
    expect(rotterdam.status).toBe('calibrated');
    expect(rotterdam.masters.length).toBeGreaterThanOrEqual(1);
    expect(rotterdam.slaves.length).toBeGreaterThanOrEqual(3);
    expect(rotterdam.receivers.length).toBeGreaterThanOrEqual(1);

    // Verify Hook of Holland reference monitor
    expect(rotterdam.dLoranMonitor).toBeDefined();
    expect(rotterdam.dLoranMonitor.lat).toBeCloseTo(51.9775, 3);
    expect(rotterdam.dLoranMonitor.lng).toBeCloseTo(4.1333, 3);

    // Verify receiver is within 15 km of Hook of Holland monitor
    const rx = rotterdam.receivers[0];
    const distToMonitor = haversineDistance(rx, rotterdam.dLoranMonitor);
    expect(distToMonitor).toBeLessThan(15000);
  });

  it('verifies Dover Strait TSS scenario geometry and resilient PNT coverage', () => {
    const dover = PRESET_SCENARIOS.dover_strait_tss;
    expect(dover).toBeDefined();
    expect(dover.status).toBe('resilience');
    expect(dover.center[1]).toBeCloseTo(51.10, 2); // Latitude around 51.1 N
    expect(dover.receivers[0].fuseMode).toBe('eloran-only');

    // Dover harbor monitor
    expect(dover.dLoranMonitor).toBeDefined();
    expect(dover.dLoranMonitor.lat).toBeCloseTo(51.1333, 3);
    expect(dover.dLoranMonitor.lng).toBeCloseTo(1.3667, 3);
  });

  it('verifies all scenario stations have valid geographic coordinates and transmitters', () => {
    for (const [key, sc] of Object.entries(PRESET_SCENARIOS)) {
      expect(sc.id).toBe(key);
      expect(sc.name).toBeTruthy();
      expect(Array.isArray(sc.center)).toBe(true);
      expect(sc.center.length).toBe(2);

      const allStations = [...sc.masters, ...sc.slaves];
      for (const st of allStations) {
        expect(st.lat).toBeGreaterThanOrEqual(-90);
        expect(st.lat).toBeLessThanOrEqual(90);
        expect(st.lng).toBeGreaterThanOrEqual(-180);
        expect(st.lng).toBeLessThanOrEqual(180);
        expect(st.txDbm).toBeGreaterThan(0);
      }
    }
  });
});
