/**
 * Kinematic Trajectory Simulation and Doppler Shift Library for SIMULORAN
 * Sourced from standard maritime navigation models and eLoran dynamic tracking specs.
 * Supports waypoint interpolation, heading calculation, local velocity projection,
 * and carrier Doppler frequency shift computation.
 */

import {
  haversineDistance,
  initialBearing,
  latLngToLocalXY,
  SPEED_OF_LIGHT,
} from './geodesy.js';

export const KNOTS_TO_MS = 0.5144444444;
export const MS_TO_KNOTS = 1.9438444924;
export const DEFAULT_ELORAN_CARRIER_HZ = 100000; // 100 kHz

/**
 * Creates a validated trajectory object from a series of waypoints.
 * @param {Array<{lat: number, lng: number, speedKts?: number, label?: string}>} waypoints
 * @param {Object} options
 * @param {number} [options.defaultSpeedKts=15] - Default vessel speed in knots
 * @param {boolean} [options.loop=false] - Whether the trajectory loops seamlessly
 * @returns {Object} Trajectory descriptor
 */
export function createWaypointTrajectory(waypoints, options = {}) {
  if (!Array.isArray(waypoints) || waypoints.length < 2) {
    throw new Error('createWaypointTrajectory requires at least 2 waypoints');
  }

  const defaultSpeedKts = options.defaultSpeedKts ?? 15;
  const loop = Boolean(options.loop);

  const points = waypoints.map((w, idx) => ({
    lat: Number(w.lat),
    lng: Number(w.lng),
    speedKts: typeof w.speedKts === 'number' && w.speedKts > 0 ? w.speedKts : defaultSpeedKts,
    label: w.label || `WP-${idx + 1}`,
  }));

  const numSegments = points.length - 1;
  const segmentDistM = [];
  const segmentDurSec = [];
  const cumulativeDistM = [0];
  const segmentTimestamps = [0];

  let totalDistM = 0;
  let totalDurSec = 0;

  for (let i = 0; i < numSegments; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const dist = haversineDistance(p1, p2);
    segmentDistM.push(dist);

    const speedMs = p1.speedKts * KNOTS_TO_MS;
    const durSec = dist / Math.max(0.1, speedMs);
    segmentDurSec.push(durSec);

    totalDistM += dist;
    totalDurSec += durSec;

    cumulativeDistM.push(totalDistM);
    segmentTimestamps.push(totalDurSec);
  }

  return {
    waypoints: points,
    loop,
    segmentDistM,
    segmentDurSec,
    cumulativeDistM,
    segmentTimestamps,
    totalDistanceM: totalDistM,
    totalDurationSec: totalDurSec,
    referencePoint: { lat: points[0].lat, lng: points[0].lng },
  };
}

/**
 * Samples a trajectory at a given elapsed time in seconds.
 * Returns interpolated coordinates, velocity vectors, heading, and progress.
 * @param {Object} trajectory - Trajectory descriptor from createWaypointTrajectory
 * @param {number} timeSec - Elapsed time from start in seconds
 * @returns {Object} Sampled kinematic state
 */
export function sampleTrajectory(trajectory, timeSec) {
  if (!trajectory || !trajectory.waypoints || trajectory.waypoints.length < 2) {
    return {
      lat: 0,
      lng: 0,
      vx: 0,
      vy: 0,
      speedMs: 0,
      speedKts: 0,
      headingDeg: 0,
      progressFrac: 0,
      distanceM: 0,
      segmentIndex: 0,
    };
  }

  const { totalDurationSec, segmentTimestamps, waypoints, segmentDistM, cumulativeDistM, loop } = trajectory;
  let t = Math.max(0, timeSec);

  if (loop && totalDurationSec > 0) {
    t = t % totalDurationSec;
  } else if (t >= totalDurationSec) {
    // Clamped at destination
    const lastIdx = waypoints.length - 1;
    const lastWp = waypoints[lastIdx];
    const prevWp = waypoints[lastIdx - 1];
    const headingDeg = initialBearing(prevWp, lastWp);
    return {
      lat: lastWp.lat,
      lng: lastWp.lng,
      vx: 0,
      vy: 0,
      speedMs: 0,
      speedKts: 0,
      headingDeg,
      progressFrac: 1.0,
      distanceM: trajectory.totalDistanceM,
      segmentIndex: numSegmentsClamped(waypoints.length),
    };
  }

  // Find active segment
  let segIdx = 0;
  for (let i = 0; i < segmentTimestamps.length - 1; i++) {
    if (t >= segmentTimestamps[i] && t <= segmentTimestamps[i + 1]) {
      segIdx = i;
      break;
    }
  }

  const t0 = segmentTimestamps[segIdx];
  const t1 = segmentTimestamps[segIdx + 1];
  const segDur = Math.max(0.001, t1 - t0);
  const alpha = Math.min(1.0, Math.max(0.0, (t - t0) / segDur));

  const p0 = waypoints[segIdx];
  const p1 = waypoints[segIdx + 1];

  // Geodesic linear interpolation
  const lat = p0.lat + alpha * (p1.lat - p0.lat);
  const lng = p0.lng + alpha * (p1.lng - p0.lng);

  // Speed and Heading
  const speedKts = p0.speedKts + alpha * (p1.speedKts - p0.speedKts);
  const speedMs = speedKts * KNOTS_TO_MS;
  const headingDeg = initialBearing(p0, p1);

  // Velocity components in local tangent frame (East = vx, North = vy)
  const rad = (headingDeg * Math.PI) / 180;
  const vx = speedMs * Math.sin(rad);
  const vy = speedMs * Math.cos(rad);

  const distanceM = cumulativeDistM[segIdx] + alpha * segmentDistM[segIdx];
  const progressFrac = totalDurationSec > 0 ? t / totalDurationSec : 0;

  return {
    lat,
    lng,
    vx,
    vy,
    speedMs,
    speedKts,
    headingDeg,
    progressFrac,
    distanceM,
    segmentIndex: segIdx,
  };
}

function numSegmentsClamped(len) {
  return Math.max(0, len - 2);
}

/**
 * Computes line-of-sight carrier Doppler frequency shift in Hertz.
 * Sourced from fundamental Doppler effect: Delta_f = -f0 * (v_los / c)
 * where v_los is the receiver velocity projected along the transmitter-to-receiver line-of-sight vector.
 * 
 * @param {{lat: number, lng: number}} userPos - Current receiver position
 * @param {{vx: number, vy: number}} userVel - Current receiver velocity (East, North) in m/s
 * @param {{lat: number, lng: number}} stationPos - Transmitter station coordinates
 * @param {number} [carrierFreqHz=100000] - Carrier frequency (default 100 kHz)
 * @returns {Object} Doppler shift analysis
 */
export function computeDopplerShiftHz(userPos, userVel, stationPos, carrierFreqHz = DEFAULT_ELORAN_CARRIER_HZ) {
  const hasCoordinates =
    typeof userPos?.lat === 'number' &&
    typeof userPos?.lng === 'number' &&
    typeof stationPos?.lat === 'number' &&
    typeof stationPos?.lng === 'number';

  const bearingDeg = hasCoordinates ? initialBearing(userPos, stationPos) : 0;

  if (!hasCoordinates) {
    return {
      dopplerShiftHz: 0,
      dopplerHz: 0,
      receivedFreqHz: carrierFreqHz,
      rangeRateMs: 0,
      losUnitVector: { ux: 0, uy: 0 },
      distanceMeters: 0,
      distanceM: 0,
      bearingDeg: 0,
    };
  }

  // Tangent coordinates relative to user position
  const uxy = latLngToLocalXY(userPos.lat, userPos.lng, userPos.lat);
  const sxy = latLngToLocalXY(stationPos.lat, stationPos.lng, userPos.lat);

  // Vector from transmitter station to receiver
  const dx = uxy.x - sxy.x;
  const dy = uxy.y - sxy.y;
  const distanceMeters = Math.hypot(dx, dy);

  if (distanceMeters < 1.0) {
    return {
      dopplerShiftHz: 0,
      dopplerHz: 0,
      receivedFreqHz: carrierFreqHz,
      rangeRateMs: 0,
      losUnitVector: { ux: 0, uy: 0 },
      distanceMeters,
      distanceM: distanceMeters,
      bearingDeg,
    };
  }

  // Line-of-sight unit vector from station pointing towards user
  const ux = dx / distanceMeters;
  const uy = dy / distanceMeters;

  const vx = typeof userVel?.vx === 'number' ? userVel.vx : 0;
  const vy = typeof userVel?.vy === 'number' ? userVel.vy : 0;

  // Range rate = projection of velocity along LOS (positive = receding from station)
  const rangeRateMs = vx * ux + vy * uy;

  // Negative sign: when receding (rangeRateMs > 0), carrier frequency is shifted lower
  const rawShift = -carrierFreqHz * (rangeRateMs / SPEED_OF_LIGHT);
  const dopplerShiftHz = Math.abs(rawShift) < 1e-12 ? 0 : rawShift;

  return {
    dopplerShiftHz,
    dopplerHz: dopplerShiftHz,
    receivedFreqHz: carrierFreqHz + dopplerShiftHz,
    rangeRateMs,
    losUnitVector: { ux, uy },
    distanceMeters,
    distanceM: distanceMeters,
    bearingDeg,
  };
}

/**
 * Standard Operational Trajectory Presets
 */

/**
 * Rotterdam Europort Harbor Approach
 * Approach corridor from North Sea deep-water route past Hook of Holland into Maasvlakte container basin.
 */
export const ROTTERDAM_APPROACH_WAYPOINTS = [
  { lat: 52.0250, lng: 3.7500, speedKts: 18.0, label: 'Maas Center Buoy' },
  { lat: 52.0080, lng: 3.8850, speedKts: 15.0, label: 'Maas North Approach' },
  { lat: 51.9950, lng: 3.9900, speedKts: 12.0, label: 'Pilot Boarding Area' },
  { lat: 51.9860, lng: 4.0750, speedKts: 10.0, label: 'Hook of Holland Breakwater' },
  { lat: 51.9680, lng: 4.1450, speedKts: 8.0,  label: 'Calandkanaal Entrance' },
  { lat: 51.9540, lng: 4.1950, speedKts: 6.0,  label: 'Maasvlakte 2 Basin' },
];

/**
 * Dover Strait Traffic Separation Scheme (TSS)
 * High-density commercial lane between English Channel and North Sea under high shipping congestion.
 */
export const DOVER_STRAIT_TSS_WAYPOINTS = [
  { lat: 51.2800, lng: 1.9500, speedKts: 16.0, label: 'Sandettie Light Float (NE Gate)' },
  { lat: 51.1800, lng: 1.6800, speedKts: 16.0, label: 'South Falls Junction' },
  { lat: 51.1000, lng: 1.4500, speedKts: 15.0, label: 'Dover Strait Narrow (Mid-Channel)' },
  { lat: 50.9800, lng: 1.2800, speedKts: 15.0, label: 'Cap Gris-Nez Beam' },
  { lat: 50.8800, lng: 1.1200, speedKts: 16.0, label: 'Dungeness TSS Exit' },
];

/**
 * Incheon Yellow Sea Coastal Approach
 * Critical South Korean maritime corridor subject to intense regional GNSS jamming events.
 */
export const YELLOW_SEA_CORRIDOR_WAYPOINTS = [
  { lat: 37.1500, lng: 126.0500, speedKts: 20.0, label: 'Outer Fairway Entry' },
  { lat: 37.2600, lng: 126.2400, speedKts: 16.0, label: 'Deokjeokdo Fairway' },
  { lat: 37.3450, lng: 126.4500, speedKts: 12.0, label: 'Palmido Light Approach' },
  { lat: 37.4350, lng: 126.5800, speedKts: 8.0,  label: 'Incheon Port Lock Entrance' },
];
