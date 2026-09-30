/**
 * SIMULORAN — Differential eLoran (d-Loran) Broadcast Engine
 *
 * Implements real-time differential eLoran (d-Loran) correction generation,
 * spatial/temporal decorrelation modeling, and Eurofix/9th-pulse message encoding.
 *
 * In d-Loran, reference monitor stations at surveyed coordinates continuously track
 * transmitter signals to measure deviations between observed TOA and nominal propagation
 * delay (PF + SF + spatial ASF). The resulting temporal Additional Secondary Factor
 * delta (Delta-ASF) cancels out:
 *  1. Transmitter clock offset and oscillator drift
 *  2. Seasonal and meteorological propagation delay variations
 *  3. Path-wide ionospheric and tropospheric bulk shifts
 *
 * Mobile receivers apply these corrections with exponential spatial and temporal
 * decorrelation weighting based on empirical models (Offermans 2003, Pelgrum 2006,
 * USCG Harbor Entrance Project):
 *
 *   Delta-ASF_user(d, dt) = Delta-ASF_ref * exp(-d / D_corr) * exp(-dt / tau_corr)
 *
 * @module dLoran
 */

import { haversineDistance, SPEED_OF_LIGHT } from './geodesy.js';

// ---------------------------------------------------------------------------
// Physical & Empirical Constants
// ---------------------------------------------------------------------------

/** Empirical spatial correlation distance [m] (~120 km per Pelgrum 2006 / USCG) */
export const DEFAULT_SPATIAL_CORR_DISTANCE_M = 120_000;

/** Empirical temporal correlation time constant [s] (~8 hours for seasonal weather fronts) */
export const DEFAULT_TEMPORAL_CORR_TIME_SEC = 28_800;

/** Rapid age-of-data degradation threshold [s] (e.g. 5 minutes for stale corrections) */
export const STALE_CORRECTION_AGE_SEC = 300;

/** Nominal baseline d-Loran residual 1-sigma error at the reference station [m] */
export const MONITOR_STATION_RESIDUAL_STD_M = 1.5;

// ---------------------------------------------------------------------------
// Differential Correction Computation
// ---------------------------------------------------------------------------

/**
 * Computes differential TOA / ASF corrections at a surveyed reference monitor station.
 *
 * @param {object} params
 * @param {{lat:number, lng:number}} params.monitorPos - Surveyed monitor station location
 * @param {Array<object>} params.stations - List of transmitting stations
 * @param {object} params.observedToasSec - Map of station label -> observed TOA [seconds]
 * @param {object} params.nominalToasSec - Map of station label -> theoretical nominal TOA [seconds]
 * @param {number} [params.timestampSec=0] - Time of observation
 * @returns {object} Reference correction record containing per-station deltas
 */
export function computeDifferentialCorrections({
  monitorPos,
  stations = [],
  observedToasSec = {},
  nominalToasSec = {},
  timestampSec = 0,
}) {
  if (!monitorPos || !stations.length) {
    return { timestampSec, monitorPos, stationCorrections: {}, valid: false };
  }

  const stationCorrections = {};

  stations.forEach((st) => {
    const label = st.label;
    const obs = observedToasSec[label];
    const nom = nominalToasSec[label];

    if (typeof obs === 'number' && typeof nom === 'number') {
      const deltaSec = obs - nom;
      const deltaUs = deltaSec * 1e6;
      const deltaMeters = deltaSec * SPEED_OF_LIGHT;

      stationCorrections[label] = {
        stationLabel: label,
        deltaSec,
        deltaUs: parseFloat(deltaUs.toFixed(4)),
        deltaMeters: parseFloat(deltaMeters.toFixed(2)),
        snrDb: st.snrDb ?? 20,
      };
    }
  });

  return {
    timestampSec,
    monitorPos,
    stationCorrections,
    stationCount: Object.keys(stationCorrections).length,
    valid: Object.keys(stationCorrections).length > 0,
  };
}

/**
 * Applies spatial and temporal decorrelation to differential corrections for a user receiver.
 *
 * @param {object} params
 * @param {{lat:number, lng:number}} params.userPos - User receiver location
 * @param {object} params.monitorRecord - Output from computeDifferentialCorrections()
 * @param {number} params.currentTimeSec - Current simulation time in seconds
 * @param {number} [params.spatialCorrM=DEFAULT_SPATIAL_CORR_DISTANCE_M] - Spatial decorrelation distance in metres
 * @param {number} [params.temporalCorrSec=DEFAULT_TEMPORAL_CORR_TIME_SEC] - Temporal decay constant in seconds
 * @returns {object} Applied corrections per station with residual uncertainties
 */
export function applyDifferentialCorrections({
  userPos,
  monitorRecord,
  currentTimeSec = 0,
  spatialCorrM = DEFAULT_SPATIAL_CORR_DISTANCE_M,
  temporalCorrSec = DEFAULT_TEMPORAL_CORR_TIME_SEC,
}) {
  if (!userPos || !monitorRecord || !monitorRecord.valid) {
    return { applied: false, userCorrections: {}, distanceToMonitorM: 0, weight: 0 };
  }

  const distM = haversineDistance(userPos, monitorRecord.monitorPos);
  const ageSec = Math.max(0, currentTimeSec - (monitorRecord.timestampSec || 0));

  // Compute combined spatial and temporal weight
  const spatialWeight = Math.exp(-distM / Math.max(1000, spatialCorrM));
  const temporalWeight = Math.exp(-ageSec / Math.max(1, temporalCorrSec));
  const totalWeight = Math.max(0, Math.min(1, spatialWeight * temporalWeight));

  const isStale = ageSec > STALE_CORRECTION_AGE_SEC;
  const userCorrections = {};

  Object.entries(monitorRecord.stationCorrections || {}).forEach(([label, corr]) => {
    // Scaled correction applied to user
    const appliedDeltaSec = corr.deltaSec * totalWeight;
    const appliedDeltaUs = appliedDeltaSec * 1e6;
    const appliedDeltaM = appliedDeltaSec * SPEED_OF_LIGHT;

    // Decorrelation uncertainty growth (standard deviation increases with distance and age)
    const spatialUncertaintyM = (distM / spatialCorrM) * 3.5;
    const temporalUncertaintyM = (ageSec / 3600) * 1.0;
    const residualSigmaM = Math.sqrt(
      MONITOR_STATION_RESIDUAL_STD_M ** 2 + spatialUncertaintyM ** 2 + temporalUncertaintyM ** 2
    );

    userCorrections[label] = {
      stationLabel: label,
      appliedDeltaSec,
      appliedDeltaUs: parseFloat(appliedDeltaUs.toFixed(4)),
      appliedDeltaM: parseFloat(appliedDeltaM.toFixed(2)),
      residualSigmaM: parseFloat(residualSigmaM.toFixed(2)),
      residualSigmaSec: residualSigmaM / SPEED_OF_LIGHT,
    };
  });

  return {
    applied: true,
    distanceToMonitorM: Math.round(distM),
    distanceToMonitorKm: parseFloat((distM / 1000).toFixed(2)),
    ageSec: parseFloat(ageSec.toFixed(1)),
    isStale,
    spatialWeight: parseFloat(spatialWeight.toFixed(4)),
    temporalWeight: parseFloat(temporalWeight.toFixed(4)),
    totalWeight: parseFloat(totalWeight.toFixed(4)),
    userCorrections,
  };
}

// ---------------------------------------------------------------------------
// Telemetry & Message Encoding (Eurofix / 9th-pulse DDC Format)
// ---------------------------------------------------------------------------

/**
 * Encodes differential corrections into a compact simulated DDC / Eurofix data packet.
 *
 * @param {object} monitorRecord - Correction record from computeDifferentialCorrections
 * @param {number} [sequenceId=1] - Message sequence counter (0 to 15)
 * @returns {object} Formatted telemetry packet
 */
export function encodeDloranMessage(monitorRecord, sequenceId = 1) {
  if (!monitorRecord || !monitorRecord.valid) return null;

  const entries = Object.values(monitorRecord.stationCorrections || {}).map((c) => ({
    st: c.stationLabel,
    us: parseFloat(c.deltaUs.toFixed(2)),
  }));

  return {
    type: 'dloran-type1',
    seq: sequenceId % 16,
    monLat: parseFloat(monitorRecord.monitorPos.lat.toFixed(4)),
    monLng: parseFloat(monitorRecord.monitorPos.lng.toFixed(4)),
    ts: monitorRecord.timestampSec,
    entries,
    crc16: Math.floor(Math.random() * 65535).toString(16).padStart(4, '0'),
  };
}

/**
 * Decodes a simulated DDC telemetry packet back into station correction structures.
 *
 * @param {object} packet - Encoded packet from encodeDloranMessage
 * @returns {object|null}
 */
export function decodeDloranMessage(packet) {
  if (!packet || packet.type !== 'dloran-type1' || !Array.isArray(packet.entries)) return null;

  const stationCorrections = {};
  packet.entries.forEach((e) => {
    const deltaUs = e.us;
    const deltaSec = deltaUs * 1e-6;
    stationCorrections[e.st] = {
      stationLabel: e.st,
      deltaSec,
      deltaUs,
      deltaMeters: deltaSec * SPEED_OF_LIGHT,
    };
  });

  return {
    timestampSec: packet.ts,
    monitorPos: { lat: packet.monLat, lng: packet.monLng },
    stationCorrections,
    stationCount: packet.entries.length,
    valid: true,
  };
}
