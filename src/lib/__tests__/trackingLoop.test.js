import { describe, it, expect } from 'vitest';
import {
  TRACKING_STATES,
  createTrackingLoop,
  computeTrackingSigmaUs,
  stepTrackingLoop,
  injectCycleSlip,
  reacquireTrackingLoop,
} from '../trackingLoop.js';

describe('Receiver Tracking Loop Simulation', () => {
  it('creates initial tracking loop with valid default state', () => {
    const loop = createTrackingLoop();
    expect(loop.state).toBe(TRACKING_STATES.ACQUIRING);
    expect(loop.cycleIndex).toBe(3);
    expect(loop.estimatedSzcUs).toBe(30.0);
    expect(loop.lockConfidence).toBe(0.0);
    expect(loop.history).toEqual([]);
    expect(loop.slipsCount).toBe(0);
    expect(loop.wrongCycleProb).toBeGreaterThanOrEqual(0);
    expect(loop.skywave).toBeNull();
  });

  it('computes tracking sigma accurately per Rhee et al. (2021)', () => {
    const sigmaHighSnr = computeTrackingSigmaUs(25, 10);
    const sigmaLowSnr = computeTrackingSigmaUs(0, 10);
    const sigmaNoAvg = computeTrackingSigmaUs(25, 1);

    // Lower SNR must produce higher timing jitter
    expect(sigmaLowSnr).toBeGreaterThan(sigmaHighSnr);

    // More pulse integration must reduce timing jitter
    expect(sigmaNoAvg).toBeGreaterThan(sigmaHighSnr);

    // Typical high SNR jitter should be around 0.02 µs (~6 m)
    expect(sigmaHighSnr).toBeLessThan(0.05);
    expect(sigmaHighSnr).toBeGreaterThan(0.005);
  });

  it('progresses from ACQUIRING to LOCKED under healthy SNR', () => {
    let loop = createTrackingLoop();
    expect(loop.state).toBe(TRACKING_STATES.ACQUIRING);

    // Step 4 times with SNR = 20 dB (healthy)
    for (let i = 0; i < 4; i++) {
      loop = stepTrackingLoop(loop, 20.0, {}, () => 0.5);
    }

    expect(loop.state).toBe(TRACKING_STATES.LOCKED);
    expect(loop.lockConfidence).toBe(1.0);
    expect(loop.cycleIndex).toBe(3);
    expect(loop.history.length).toBe(4);
  });

  it('transitions to LOST when SNR drops below threshold', () => {
    let loop = createTrackingLoop();
    // Step to lock
    for (let i = 0; i < 4; i++) {
      loop = stepTrackingLoop(loop, 20.0, {}, () => 0.5);
    }
    expect(loop.state).toBe(TRACKING_STATES.LOCKED);

    // Drop SNR to -15 dB
    loop = stepTrackingLoop(loop, -15.0, {}, () => 0.5);
    expect(loop.state).toBe(TRACKING_STATES.LOST);

    // Recover SNR
    loop = stepTrackingLoop(loop, 15.0, {}, () => 0.5);
    expect(loop.state).toBe(TRACKING_STATES.ACQUIRING);
  });

  it('injectCycleSlip correctly updates cycleIndex and state', () => {
    let loop = createTrackingLoop();
    for (let i = 0; i < 4; i++) {
      loop = stepTrackingLoop(loop, 20.0, {}, () => 0.5);
    }

    // Inject +1 slip: cycle 3 -> cycle 4
    loop = injectCycleSlip(loop, 1);
    expect(loop.cycleIndex).toBe(4);
    expect(loop.state).toBe(TRACKING_STATES.SLIPPED);
    expect(loop.estimatedSzcUs).toBeCloseTo(40.0, 1);
    expect(loop.slipsCount).toBe(1);

    // Inject -1 slip: cycle 4 -> cycle 3 (back to locked)
    loop = injectCycleSlip(loop, -1);
    expect(loop.cycleIndex).toBe(3);
    expect(loop.state).toBe(TRACKING_STATES.LOCKED);
    expect(loop.estimatedSzcUs).toBeCloseTo(30.0, 1);
  });

  it('caps history buffer at maxHistoryGris', () => {
    let loop = createTrackingLoop({ maxHistoryGris: 15 });
    for (let i = 0; i < 25; i++) {
      loop = stepTrackingLoop(loop, 20.0, {}, () => 0.5);
    }
    expect(loop.history.length).toBe(15);
    expect(loop.totalGris).toBe(25);
  });

  it('reacquireTrackingLoop resets to ACQUIRING', () => {
    let loop = createTrackingLoop();
    for (let i = 0; i < 4; i++) {
      loop = stepTrackingLoop(loop, 20.0, {}, () => 0.5);
    }
    expect(loop.state).toBe(TRACKING_STATES.LOCKED);

    loop = reacquireTrackingLoop(loop);
    expect(loop.state).toBe(TRACKING_STATES.ACQUIRING);
    expect(loop.lockConfidence).toBeLessThan(1.0);
  });

  describe('Skywave & Ionospheric Tracking Degradation', () => {
    it('populates skywave interference telemetry when skywave options provided', () => {
      let loop = createTrackingLoop();
      // Step with distant nighttime skywave (1200 km, 00:00 midnight)
      loop = stepTrackingLoop(loop, 20.0, {
        skywaveDistKm: 1200,
        hourOfDay: 0.0,
      }, () => 0.5);

      expect(loop.skywave).not.toBeNull();
      expect(loop.skywave.groundDistKm).toBe(1200);
      expect(loop.skywave.isNight).toBe(true);
      expect(typeof loop.skywave.ssrDb).toBe('number');
      expect(typeof loop.skywave.timingShiftUs).toBe('number');
      expect(['CRITICAL', 'HIGH', 'MODERATE', 'LOW', 'NONE']).toContain(loop.skywave.cycleSlipRisk);
    });

    it('tracks skywave zero-crossing phase shift in closed-loop PLL', () => {
      let loop = createTrackingLoop();
      // Lock first under nominal daylight
      for (let i = 0; i < 4; i++) {
        loop = stepTrackingLoop(loop, 25.0, {}, () => 0.5);
      }
      expect(loop.state).toBe(TRACKING_STATES.LOCKED);

      const prePhase = loop.phaseOffsetUs;

      // Now inject strong nighttime skywave with precomputed shift
      const mockSkywave = {
        ssrDb: -5.0,
        ampRatio: 1.77,
        cycleSlipRisk: 'CRITICAL',
        cycleSlipProb: 0.65,
        timingShiftUs: 0.28,
        tauSkyUs: 42.0,
        groundDistKm: 1300,
        isNight: true,
        phaseErrorDeg: 10.0,
      };

      for (let i = 0; i < 30; i++) {
        loop = stepTrackingLoop(loop, 20.0, { skywaveInterference: mockSkywave }, () => 0.5);
      }

      // Phase offset must have tracked towards mockSkywave.timingShiftUs
      expect(loop.phaseOffsetUs).toBeGreaterThan(prePhase);
      expect(loop.phaseOffsetUs).toBeCloseTo(0.28, 1);
    });

    it('induces cycle slip when severe skywave elevates slip probability', () => {
      let loop = createTrackingLoop();
      for (let i = 0; i < 4; i++) {
        loop = stepTrackingLoop(loop, 25.0, {}, () => 0.5);
      }
      expect(loop.state).toBe(TRACKING_STATES.LOCKED);

      // Severe skywave: cycleSlipProb = 0.8
      const severeSkywave = {
        ssrDb: -8.0,
        ampRatio: 2.5,
        cycleSlipRisk: 'CRITICAL',
        cycleSlipProb: 0.8,
        timingShiftUs: 0.35,
        tauSkyUs: 38.0,
        groundDistKm: 1400,
        isNight: true,
        phaseErrorDeg: 12.0,
      };

      // With rng returning 0.05 (well below pSlipPerGri ~ 0.8 * 0.15 = 0.12), a slip must trigger
      loop = stepTrackingLoop(loop, 25.0, { skywaveInterference: severeSkywave }, () => 0.05);

      expect(loop.state).toBe(TRACKING_STATES.SLIPPED);
      expect(loop.slipsCount).toBeGreaterThan(0);
      expect([2, 4]).toContain(loop.cycleIndex);
    });
  });
});
