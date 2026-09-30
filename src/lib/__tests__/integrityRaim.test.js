import { describe, it, expect } from 'vitest';
import {
  classifyStanfordZone,
  performRaimFde,
  STANFORD_ZONES,
  ALERT_LIMIT_PRESETS,
} from '../integrityRaim.js';

describe('Stanford Diagram & Autonomous RAIM FDE', () => {
  it('correctly classifies nominal safe operations (HPE <= HPL <= HAL)', () => {
    const res = classifyStanfordZone(3.5, 8.0, 10.0);
    expect(res.zone).toBe(STANFORD_ZONES.NORMAL);
    expect(res.isSafe).toBe(true);
    expect(res.isAvailable).toBe(true);
    expect(res.severity).toBe('ok');
  });

  it('correctly classifies system unavailable condition (HPL > HAL)', () => {
    const res = classifyStanfordZone(4.0, 15.0, 10.0);
    expect(res.zone).toBe(STANFORD_ZONES.UNAVAILABLE);
    expect(res.isSafe).toBe(true);
    expect(res.isAvailable).toBe(false);
    expect(res.severity).toBe('caution');
  });

  it('correctly classifies Misleading Information (HPE > HPL, but HPE <= HAL)', () => {
    const res = classifyStanfordZone(9.0, 6.0, 10.0);
    expect(res.zone).toBe(STANFORD_ZONES.MI);
    expect(res.isSafe).toBe(false);
    expect(res.isAvailable).toBe(true);
    expect(res.severity).toBe('warning');
  });

  it('correctly classifies Hazardously Misleading Information (HPE > HPL and HPE > HAL)', () => {
    const res = classifyStanfordZone(25.0, 8.0, 10.0);
    expect(res.zone).toBe(STANFORD_ZONES.HMI);
    expect(res.isSafe).toBe(false);
    expect(res.isAvailable).toBe(false);
    expect(res.severity).toBe('critical');
  });

  it('verifies standard alert limit presets across maritime and aviation domains', () => {
    expect(ALERT_LIMIT_PRESETS.maritime_hea.halMeters).toBe(10.0);
    expect(ALERT_LIMIT_PRESETS.maritime_coastal.halMeters).toBe(50.0);
    expect(ALERT_LIMIT_PRESETS.aviation_apv.halMeters).toBe(40.0);
    expect(ALERT_LIMIT_PRESETS.aviation_rnp03.halMeters).toBe(556.0);
  });

  it('performs RAIM FDE parity check and isolates faulty transmitter', () => {
    const stations = [
      { station: { label: 'M1' } },
      { station: { label: 'S1' } },
      { station: { label: 'S2' } },
      { station: { label: 'S3' } },
    ];

    // 1. Nominal case: small 1m residuals
    const nominalResiduals = [1.2, -0.8, 1.0, -0.5];
    const sigmas = [3.0, 3.0, 3.0, 3.0];

    const nominalRaim = performRaimFde(stations, nominalResiduals, sigmas);
    expect(nominalRaim.available).toBe(true);
    expect(nominalRaim.faultDetected).toBe(false);
    expect(nominalRaim.isolatedStation).toBe(null);

    // 2. Faulty case: station S2 has a 25m pseudorange error
    const faultyResiduals = [1.2, -0.8, 25.0, -0.5];
    const faultyRaim = performRaimFde(stations, faultyResiduals, sigmas);
    expect(faultyRaim.available).toBe(true);
    expect(faultyRaim.faultDetected).toBe(true);
    expect(faultyRaim.isolatedStation).toBe('S2');
    expect(faultyRaim.status).toBe('FAULT_DETECTED');
  });
});
