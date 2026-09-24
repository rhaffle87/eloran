/**
 * Station Schema, CSV Import/Export, and Validation Library
 * Maintains 100% backward compatibility with ACTIFE CSV files while adding typed validation.
 */

import Papa from 'papaparse';

/**
 * Validates and normalizes a single station data object.
 * @param {object} row - Raw row object
 * @param {number} [index=0] - Row index for error messages
 * @returns {{valid: boolean, station?: object, error?: string}}
 */
export function validateStation(row, index = 0) {
  if (!row) return { valid: false, error: `Row ${index + 1}: empty record` };

  const role = String(row.role || '').toLowerCase().trim();
  if (!['master', 'slave', 'receiver'].includes(role)) {
    return {
      valid: false,
      error: `Row ${index + 1}: Invalid role '${row.role}'. Must be 'master', 'slave', or 'receiver'.`,
    };
  }

  const lat = parseFloat(row.lat);
  const lng = parseFloat(row.lng);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    return { valid: false, error: `Row ${index + 1}: Invalid latitude '${row.lat}' (must be between -90 and 90)` };
  }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    return { valid: false, error: `Row ${index + 1}: Invalid longitude '${row.lng}' (must be between -180 and 180)` };
  }

  const label = String(row.label || `${role[0].toUpperCase()}${index + 1}`).trim();
  const txDbm = Number.isFinite(parseFloat(row.txDbm)) ? parseFloat(row.txDbm) : (role === 'master' ? 20 : 18);
  const offsetSec = Number.isFinite(parseFloat(row.offsetSec)) ? parseFloat(row.offsetSec) : 0;
  const griMs = Number.isFinite(parseFloat(row.griMs)) ? parseFloat(row.griMs) : (role === 'master' ? 1000 : 1000);
  const phaseSec = Number.isFinite(parseFloat(row.phaseSec)) ? parseFloat(row.phaseSec) : 0;

  const clockBias = Number.isFinite(parseFloat(row.clock_bias || row.clockBias))
    ? parseFloat(row.clock_bias || row.clockBias)
    : 0;
  const clockDrift = Number.isFinite(parseFloat(row.clock_drift || row.clockDrift))
    ? parseFloat(row.clock_drift || row.clockDrift)
    : 0;
  const clockType = String(row.clockType || 'gps-disciplined');

  const diffCorrAvg = Number.isFinite(parseFloat(row.diffCorrAvg)) ? parseFloat(row.diffCorrAvg) : 0;
  const ddsEnabled = row.ddsEnabled === false || row.ddsEnabled === 'false' ? false : true;

  const station = {
    role,
    lat,
    lng,
    label,
    txDbm,
    offsetSec,
    griMs,
    phaseSec,
    clock: {
      type: clockType,
      biasSec: clockBias,
      driftPerSec: clockDrift,
    },
    ddsEnabled,
    diffCorrections: {
      enabled: diffCorrAvg !== 0 || row.diffCorrEnabled === 'true',
      avgMeters: diffCorrAvg,
    },
    asfFormula: typeof row.asfFormula === 'string' ? row.asfFormula : '0',
    asfMeters: Number.isFinite(parseFloat(row.asfMeters)) ? parseFloat(row.asfMeters) : 0,
    fuseMode: role === 'receiver' ? (row.fuseMode || 'fusion') : undefined,
  };

  return { valid: true, station };
}

/**
 * Parses CSV text into verified lists of masters, slaves, and receivers.
 *
 * @param {string} csvText - Raw CSV file string
 * @returns {{masters: object[], slaves: object[], receivers: object[], errors: string[]}}
 */
export function parseStationsCsv(csvText) {
  const result = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  const masters = [];
  const slaves = [];
  const receivers = [];
  const errors = [];

  result.data.forEach((row, i) => {
    const { valid, station, error } = validateStation(row, i);
    if (!valid) {
      errors.push(error);
      return;
    }
    if (station.role === 'master') masters.push(station);
    else if (station.role === 'slave') slaves.push(station);
    else if (station.role === 'receiver') receivers.push(station);
  });

  return { masters, slaves, receivers, errors };
}

/**
 * Serializes station list into standard CSV format.
 * Compatible with ACTIFE schema.
 *
 * @param {object[]} stations - Array of station objects
 * @returns {string} CSV text
 */
export function exportStationsCsv(stations) {
  const rows = stations.map((s) => ({
    role: s.role,
    lat: s.lat.toFixed(6),
    lng: s.lng.toFixed(6),
    label: s.label,
    clock_bias: s.clock?.biasSec || 0,
    clock_drift: s.clock?.driftPerSec || 0,
    diffCorrAvg: s.diffCorrections?.avgMeters || 0,
    ddsEnabled: s.ddsEnabled !== false,
    griMs: s.griMs || 1000,
    phaseSec: s.phaseSec || 0,
    txDbm: s.txDbm || (s.role === 'master' ? 20 : 18),
    offsetSec: s.offsetSec || 0,
    clockType: s.clock?.type || 'gps-disciplined',
  }));

  return Papa.unparse(rows);
}

/**
 * Exports complete scenario with stations and optional LOP contours as GeoJSON FeatureCollection.
 * @param {object[]} masters
 * @param {object[]} slaves
 * @param {object[]} receivers
 * @param {object[]} [contours=[]]
 * @returns {object} GeoJSON FeatureCollection
 */
export function exportScenarioGeoJson(masters = [], slaves = [], receivers = [], contours = []) {
  const features = [];

  const addPoint = (s, role) => {
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
      properties: {
        role,
        label: s.label,
        txDbm: s.txDbm,
        griMs: s.griMs,
        clock: s.clock,
        diffCorrections: s.diffCorrections,
      },
    });
  };

  masters.forEach((m) => addPoint(m, 'master'));
  slaves.forEach((s) => addPoint(s, 'slave'));
  receivers.forEach((r) => addPoint(r, 'receiver'));

  contours.forEach((c, idx) => {
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: c.points },
      properties: {
        id: `lop-${c.masterIndex}-${c.slaveIndex}-${idx}`,
        masterIndex: c.masterIndex,
        slaveIndex: c.slaveIndex,
        level: c.level,
      },
    });
  });

  return {
    type: 'FeatureCollection',
    metadata: {
      generator: 'LORAN LAB',
      timestamp: new Date().toISOString(),
      stationCount: masters.length + slaves.length + receivers.length,
    },
    features,
  };
}
