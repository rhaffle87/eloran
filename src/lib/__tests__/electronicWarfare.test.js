import { describe, it, expect } from 'vitest';
import {
  computeFreeSpacePathLossDb,
  computeJammerToSignalRatio,
  computeEloranJammingAdvantage,
  evaluateGnssSpoofingAttack,
  GPS_L1_FREQ_HZ,
  JAMMER_DEGRADATION_THRESHOLD_DB,
  JAMMER_TRACKING_LOSS_THRESHOLD_DB,
} from '../electronicWarfare.js';

describe('Electronic Warfare (EW) Jamming & Spoofing Simulator', () => {
  it('computes free-space path loss accurately at GPS L1 frequency', () => {
    // At 1000m (1 km), FSPL at 1575.42 MHz should be ~96.38 dB
    const fspl1km = computeFreeSpacePathLossDb(1000, GPS_L1_FREQ_HZ);
    expect(fspl1km).toBeCloseTo(96.38, 1);

    // At 10 km (+20 dB from distance tenfold), should be ~116.38 dB
    const fspl10km = computeFreeSpacePathLossDb(10000, GPS_L1_FREQ_HZ);
    expect(fspl10km).toBeCloseTo(116.38, 1);
  });

  it('evaluates Jammer-to-Signal (J/S) ratio and operational receiver states', () => {
    // 10W jammer at 500m -> high J/S -> DENIED
    const nearJammer = computeJammerToSignalRatio({
      jammerPowerWatts: 10,
      jammerDistanceMeters: 500,
    });
    expect(nearJammer.jsRatioDb).toBeGreaterThan(JAMMER_TRACKING_LOSS_THRESHOLD_DB);
    expect(nearJammer.receiverState).toBe('denied');
    expect(nearJammer.isDenied).toBe(true);

    // 10W jammer at 25 km -> intermediate J/S -> DEGRADED
    const midJammer = computeJammerToSignalRatio({
      jammerPowerWatts: 10,
      jammerDistanceMeters: 60000,
    });
    expect(midJammer.jsRatioDb).toBeGreaterThan(JAMMER_DEGRADATION_THRESHOLD_DB);
    expect(midJammer.jsRatioDb).toBeLessThan(JAMMER_TRACKING_LOSS_THRESHOLD_DB);
    expect(midJammer.receiverState).toBe('degraded');
    expect(midJammer.isDegraded).toBe(true);
    expect(midJammer.inducedNoiseStdMeters).toBeGreaterThan(5.0);

    // 10W jammer at 150 km -> NOMINAL
    const farJammer = computeJammerToSignalRatio({
      jammerPowerWatts: 10,
      jammerDistanceMeters: 250000,
    });
    expect(farJammer.jsRatioDb).toBeLessThan(JAMMER_DEGRADATION_THRESHOLD_DB);
    expect(farJammer.receiverState).toBe('nominal');
    expect(farJammer.isDenied).toBe(false);
  });

  it('demonstrates eLoran high-power LF groundwave penetration advantage', () => {
    const adv = computeEloranJammingAdvantage(-30, -158.5);
    // eLoran received power (-60 dBW) vs GPS (-158.5 dBW) = +98.5 dB
    expect(adv.powerAdvantageDb).toBeCloseTo(98.5, 1);
    expect(adv.powerAdvantageLinear).toBeGreaterThan(1e9); // Over a billion times stronger
    expect(adv.summary).toContain('billion times');
  });

  it('detects subtle GNSS spoofing trajectory pull-off attack via eLoran cross-check', () => {
    const truePos = { lat: 52.000, lng: 4.000 };
    const eloranEstimate = { lat: 52.000, lng: 4.000 };

    // At t = 0 min, spoofing starts with 0 drift
    const startSpoof = evaluateGnssSpoofingAttack(truePos, eloranEstimate, {
      active: true,
      driftRateMetersPerMin: 60,
      elapsedSec: 0,
    });
    expect(startSpoof.isSpoofed).toBe(true);
    expect(startSpoof.driftMeters).toBe(0);
    expect(startSpoof.spoofingDetected).toBe(false);

    // At t = 3 min (180s), drift = 180 meters > 50m threshold -> DETECTED!
    const midSpoof = evaluateGnssSpoofingAttack(truePos, eloranEstimate, {
      active: true,
      driftRateMetersPerMin: 60,
      elapsedSec: 180,
    });
    expect(midSpoof.driftMeters).toBeCloseTo(180, 0);
    expect(midSpoof.spoofingDetected).toBe(true);
    expect(midSpoof.alertMessage).toContain('CRITICAL: GNSS spoofing attack detected');
  });
});
