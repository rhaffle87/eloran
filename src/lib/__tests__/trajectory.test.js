import { describe, it, expect } from 'vitest';
import {
  createWaypointTrajectory,
  sampleTrajectory,
  computeDopplerShiftHz,
  ROTTERDAM_APPROACH_WAYPOINTS,
  DOVER_STRAIT_TSS_WAYPOINTS,
  YELLOW_SEA_CORRIDOR_WAYPOINTS,
  KNOTS_TO_MS,
  DEFAULT_ELORAN_CARRIER_HZ,
} from '../trajectory.js';

describe('Kinematic Trajectory & Doppler Shift Simulation', () => {
  it('throws error if waypoints length is less than 2', () => {
    expect(() => createWaypointTrajectory([])).toThrow();
    expect(() => createWaypointTrajectory([{ lat: 52.0, lng: 4.0 }])).toThrow();
  });

  it('creates valid waypoint trajectory with correct distance and timing', () => {
    const waypoints = [
      { lat: 52.000, lng: 4.000, speedKts: 15.0 },
      { lat: 52.100, lng: 4.000, speedKts: 15.0 }, // ~11.1 km North
    ];
    const traj = createWaypointTrajectory(waypoints);

    expect(traj.waypoints.length).toBe(2);
    expect(traj.totalDistanceM).toBeGreaterThan(11000);
    expect(traj.totalDistanceM).toBeLessThan(11300);

    const speedMs = 15.0 * KNOTS_TO_MS;
    const expectedDur = traj.totalDistanceM / speedMs;
    expect(Math.abs(traj.totalDurationSec - expectedDur)).toBeLessThan(1.0);
  });

  it('samples trajectory accurately at start, middle, and end', () => {
    const waypoints = [
      { lat: 52.000, lng: 4.000, speedKts: 20.0 },
      { lat: 52.100, lng: 4.000, speedKts: 20.0 },
    ];
    const traj = createWaypointTrajectory(waypoints);

    // At t = 0
    const s0 = sampleTrajectory(traj, 0);
    expect(s0.lat).toBeCloseTo(52.000, 4);
    expect(s0.lng).toBeCloseTo(4.000, 4);
    expect(s0.progressFrac).toBe(0);
    expect(s0.speedKts).toBe(20.0);
    expect(s0.headingDeg).toBeCloseTo(0.0, 1); // Directly North

    // At half duration
    const sMid = sampleTrajectory(traj, traj.totalDurationSec / 2);
    expect(sMid.lat).toBeCloseTo(52.050, 3);
    expect(sMid.progressFrac).toBeCloseTo(0.5, 2);
    expect(sMid.vy).toBeGreaterThan(10.0); // Positive North velocity
    expect(Math.abs(sMid.vx)).toBeLessThan(0.1); // Near zero East velocity

    // At end
    const sEnd = sampleTrajectory(traj, traj.totalDurationSec + 100);
    expect(sEnd.lat).toBeCloseTo(52.100, 4);
    expect(sEnd.progressFrac).toBe(1.0);
  });

  it('computes carrier Doppler shift accurately under various motion vectors', () => {
    const station = { lat: 52.000, lng: 4.000 };
    const userPos = { lat: 52.100, lng: 4.000 }; // User is directly North of station

    // 1. Stationary receiver
    const dop0 = computeDopplerShiftHz(userPos, { vx: 0, vy: 0 }, station);
    expect(dop0.dopplerShiftHz).toBe(0);
    expect(dop0.receivedFreqHz).toBe(DEFAULT_ELORAN_CARRIER_HZ);

    // 2. Moving North (receding from station at ~15.43 m/s = 30 kts)
    const speedMs = 30 * KNOTS_TO_MS;
    const dopReceding = computeDopplerShiftHz(userPos, { vx: 0, vy: speedMs }, station);
    // Receding should produce negative Doppler shift
    expect(dopReceding.rangeRateMs).toBeGreaterThan(15.0);
    expect(dopReceding.dopplerShiftHz).toBeLessThan(0);
    expect(dopReceding.dopplerShiftHz).toBeCloseTo(-0.00515, 4);

    // 3. Moving South (approaching station at 30 kts)
    const dopApproaching = computeDopplerShiftHz(userPos, { vx: 0, vy: -speedMs }, station);
    expect(dopApproaching.rangeRateMs).toBeLessThan(-15.0);
    expect(dopApproaching.dopplerShiftHz).toBeGreaterThan(0);
    expect(dopApproaching.dopplerShiftHz).toBeCloseTo(0.00515, 4);

    // 4. Moving East (orthogonal to LOS)
    const dopOrthogonal = computeDopplerShiftHz(userPos, { vx: speedMs, vy: 0 }, station);
    expect(Math.abs(dopOrthogonal.rangeRateMs)).toBeLessThan(0.01);
    expect(Math.abs(dopOrthogonal.dopplerShiftHz)).toBeLessThan(1e-6);
  });

  it('verifies operational trajectory presets have valid geometry', () => {
    const rotterdam = createWaypointTrajectory(ROTTERDAM_APPROACH_WAYPOINTS);
    expect(rotterdam.totalDistanceM).toBeGreaterThan(20000); // > 20 km fairway
    expect(rotterdam.totalDurationSec).toBeGreaterThan(1800); // > 30 minutes

    const dover = createWaypointTrajectory(DOVER_STRAIT_TSS_WAYPOINTS);
    expect(dover.totalDistanceM).toBeGreaterThan(40000); // > 40 km strait passage
    expect(dover.totalDurationSec).toBeGreaterThan(3600); // > 1 hour

    const yellowSea = createWaypointTrajectory(YELLOW_SEA_CORRIDOR_WAYPOINTS);
    expect(yellowSea.totalDistanceM).toBeGreaterThan(30000);
  });
});
