/**
 * Geodesy and Coordinate Transformations Library for LORAN LAB
 * All calculations use standard physical constants and WGS84 ellipsoid / sphere approximations.
 * Includes Primary Factor (PF), Secondary Factor (SF), and refractive index variations.
 */

export const SPEED_OF_LIGHT = 299792458; // m/s (vacuum)
export const EARTH_RADIUS = 6371000;    // meters

/**
 * Standard atmospheric refractive index presets (Primary Factor: PF = (eta * d) / c)
 * Sourced from RTCM 10410.1, USCG Loran-C User Handbook, and BACC standards.
 */
export const REFRACTIVE_INDEX_PRESETS = {
  rtcm: {
    id: 'rtcm',
    name: 'RTCM MPS (Standard)',
    value: 1.000338,
    description: 'RTCM 10410.1 Minimum Performance Standards (c = 299,792,458 m/s, n = 1.000338)',
  },
  handbook: {
    id: 'handbook',
    name: 'USCG Loran-C User Handbook',
    value: 1.000284,
    description: 'USCG Loran-C User Handbook (P16562.5) standard atmosphere reference',
  },
  china: {
    id: 'china',
    name: 'China National eLoran Standard',
    value: 1.000315,
    description: 'Chinese Academy of Sciences / BACC national timing & navigation standard',
  },
  vacuum: {
    id: 'vacuum',
    name: 'Theoretical Free Space (n = 1.0)',
    value: 1.000000,
    description: 'Unattenuated vacuum speed of light for theoretical baseline tests',
  },
};

export const DEFAULT_REFRACTIVE_INDEX = REFRACTIVE_INDEX_PRESETS.rtcm.value;

/**
 * Calculates Primary Factor (PF) propagation delay in seconds.
 * PF = (eta * distance) / c
 * @param {number} distanceMeters - Geodesic path distance in meters
 * @param {number} [eta=1.000338] - Atmospheric refractive index
 * @returns {number} PF delay in seconds
 */
export function computePrimaryFactorSec(distanceMeters, eta = DEFAULT_REFRACTIVE_INDEX) {
  if (distanceMeters <= 0) return 0;
  return (eta * distanceMeters) / SPEED_OF_LIGHT;
}

/**
 * Calculates the Secondary Factor (SF) delay in seconds over an assumed all-seawater path.
 * SF is defined relative to seawater conductivity σ = 5 S/m, relative permittivity ε_r ≈ 80
 * at the Loran-C 100 kHz carrier.
 *
 * Polynomial coefficients from: Brunavs, P. (1977). "Loran-C Time Transfer Stability."
 * Journal of Navigation (as reproduced in USCG Loran-C User Handbook M16562.4A, Table 3-1).
 * Cross-checked against Forssell, B. (1991). "Radionavigation Systems."
 *
 * @param {number} distanceMeters - Geodesic distance in meters
 * @returns {number} SF delay in seconds (over all-seawater path; add ASF for land portions)
 */
export function computeSecondaryFactorSec(distanceMeters) {
  if (distanceMeters <= 0) return 0;
  const sm = distanceMeters / 1609.344; // Convert meters to statute miles (Brunavs table uses statute miles)
  let sfMicroseconds = 0;
  if (sm < 100) {
    // Short-range polynomial (0–100 statute miles): Brunavs (1977) Table 3-1, Row 1
    sfMicroseconds = (-0.4076 / Math.max(0.1, sm)) + 0.08182 + (0.003914 * sm);
  } else {
    // Long-range polynomial (≥100 statute miles): Brunavs (1977) Table 3-1, Row 2
    sfMicroseconds = (-107.8 / sm) + 1.297 + (0.000139 * sm);
  }
  return Math.max(0, sfMicroseconds * 1e-6);
}

/**
 * Calculates total Loran groundwave propagation time:
 * t = PF + SF + ASF
 * 
 * @param {number} distanceMeters - Geodesic distance in meters
 * @param {number} [eta=1.000338] - Primary factor refractive index
 * @param {number} [asfSec=0] - Additional Secondary Factor (overland excess delay) in seconds
 * @returns {number} Total propagation time in seconds
 */
export function computeTotalPropagationTimeSec(distanceMeters, eta = DEFAULT_REFRACTIVE_INDEX, asfSec = 0) {
  const pf = computePrimaryFactorSec(distanceMeters, eta);
  const sf = computeSecondaryFactorSec(distanceMeters);
  return pf + sf + asfSec;
}

/**
 * Calculates great-circle distance between two geographic coordinates using the Haversine formula.
 * @param {{lat: number, lng: number}} a - Point A {lat, lng} in degrees
 * @param {{lat: number, lng: number}} b - Point B {lat, lng} in degrees
 * @returns {number} Distance in meters
 */
export function haversineDistance(a, b) {
  if (!a || !b || typeof a.lat !== 'number' || typeof a.lng !== 'number' ||
      typeof b.lat !== 'number' || typeof b.lng !== 'number') {
    return 0;
  }
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinHalfDLat = Math.sin(dLat / 2);
  const sinHalfDLon = Math.sin(dLon / 2);
  const h = sinHalfDLat * sinHalfDLat + Math.cos(lat1) * Math.cos(lat2) * sinHalfDLon * sinHalfDLon;
  const clampedH = Math.min(1, Math.max(0, h));
  return 2 * EARTH_RADIUS * Math.asin(Math.sqrt(clampedH));
}

/**
 * Calculates the initial bearing (forward azimuth) from point a to point b.
 * @param {{lat: number, lng: number}} a - Start point {lat, lng} in degrees
 * @param {{lat: number, lng: number}} b - End point {lat, lng} in degrees
 * @returns {number} Bearing in degrees from North (0°..360°)
 */
export function initialBearing(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;

  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLon = toRad(b.lng - a.lng);

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const bRad = Math.atan2(y, x);
  return (toDeg(bRad) + 360) % 360;
}

/**
 * Computes destination point given start point, distance, and bearing.
 * @param {{lat: number, lng: number}} start - Start point in degrees
 * @param {number} distanceMeters - Distance along great circle in meters
 * @param {number} bearingDeg - Initial bearing in degrees from North
 * @returns {{lat: number, lng: number}} Destination coordinate in degrees
 */
export function destinationPoint(start, distanceMeters, bearingDeg) {
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;

  const delta = distanceMeters / EARTH_RADIUS;
  const theta = toRad(bearingDeg);
  const lat1 = toRad(start.lat);
  const lng1 = toRad(start.lng);

  const sinLat2 = Math.sin(lat1) * Math.cos(delta) + Math.cos(lat1) * Math.sin(delta) * Math.cos(theta);
  const lat2 = Math.asin(Math.max(-1, Math.min(1, sinLat2)));
  const y = Math.sin(theta) * Math.sin(delta) * Math.cos(lat1);
  const x = Math.cos(delta) - Math.sin(lat1) * Math.sin(lat2);
  const lng2 = lng1 + Math.atan2(y, x);

  return {
    lat: toDeg(lat2),
    lng: ((toDeg(lng2) + 540) % 360) - 180,
  };
}

/**
 * Projects WGS84 geographic coordinate (degrees) to Spherical Mercator EPSG:3857 (meters).
 * @param {[number, number]} coord - [longitude, latitude] in degrees
 * @returns {[number, number]} [x, y] in EPSG:3857 meters
 */
export function wgs84ToMercator([lng, lat]) {
  const x = (lng * 20037508.34) / 180;
  const clampedLat = Math.max(-85.0511287798, Math.min(85.0511287798, lat));
  let y = Math.log(Math.tan(((90 + clampedLat) * Math.PI) / 360)) / (Math.PI / 180);
  y = (y * 20037508.34) / 180;
  return [x, y];
}

/**
 * Unprojects Spherical Mercator EPSG:3857 (meters) to WGS84 geographic coordinate (degrees).
 * @param {[number, number]} coord - [x, y] in EPSG:3857 meters
 * @returns {[number, number]} [longitude, latitude] in degrees
 */
export function mercatorToWgs84([x, y]) {
  const lng = (x * 180) / 20037508.34;
  let lat = (y * 180) / 20037508.34;
  lat = (180 / Math.PI) * (2 * Math.atan(Math.exp((lat * Math.PI) / 180)) - Math.PI / 2);
  return [lng, lat];
}

/**
 * Transforms latitude and longitude to local Cartesian coordinates (meters).
 * @param {number} lat - Latitude in degrees
 * @param {number} lng - Longitude in degrees
 * @param {number} refLat - Reference latitude in degrees
 * @returns {{x: number, y: number}} Local Cartesian coordinates in meters
 */
export function latLngToLocalXY(lat, lng, refLat) {
  const toRad = Math.PI / 180;
  const x = (lng * toRad) * EARTH_RADIUS * Math.cos(refLat * toRad);
  const y = (lat * toRad) * EARTH_RADIUS;
  return { x, y };
}

/**
 * Inverts local Cartesian coordinates back to geographic latitude and longitude.
 * @param {number} x - Local Cartesian X in meters
 * @param {number} y - Local Cartesian Y in meters
 * @param {number} refLat - Reference latitude in degrees
 * @returns {{lat: number, lng: number}} Geographic coordinate in degrees
 */
export function localXYToLatLng(x, y, refLat) {
  const toDeg = 180 / Math.PI;
  const lat = (y / EARTH_RADIUS) * toDeg;
  const lng = (x / (EARTH_RADIUS * Math.cos((refLat * Math.PI) / 180))) * toDeg;
  return { lat, lng };
}
