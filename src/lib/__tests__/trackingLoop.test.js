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
});
