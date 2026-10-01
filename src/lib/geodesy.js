/**
 * Geodesy and Coordinate Transformations Library for SIMULORAN
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
 * SOURCED CONTINUOUS PHYSICAL MODEL:
 * Calculates Secondary Factor (SF) seawater propagation delay in seconds
 * using the Brunavs (1977) Canadian Hydrographic Service continuous closed-form formulation.
 *
 * Primary Sources:
 *   - Brunavs, P. (1977). "The secondary phase lag of the Loran-C ground wave over sea water."
 *     Contract Report, Canadian Hydrographic Service, Ottawa.
 *   - Brunavs, P. (1978). "The secondary phase lag of the Loran-C ground wave over sea water."
 *     The International Hydrographic Review, LV(1), pp. 27–53.
 *   - Rhee, J. H., Seo, K. I., & Son, P. U. (2021). "A Study on the Calculation of Secondary Factor (SF) for eLoran."
 *     Journal of the Korean Society of Marine Environment & Safety, 27(6), 844–850.
 *   - Seo, K. I., et al. (2020). "Analysis of Loran-C/eLoran Groundwave Propagation Characteristics."
 *     Sensors, 20(8), 2278.
 *
 * Mathematical Equation:
 *   (PF + SF)_meters = -111.0 + 98.2*D + (13.0*D + 113.0)*exp(-D/2) + 2.277/D
 *   where D is distance in Megameters (1 Mm = 1,000 km = 10^6 meters).
 *
 * Seawater Phase Delay:
 *   tau_sec = (PF + SF)_meters / SPEED_OF_LIGHT
 *
 * Unlike the historical USCG piecewise polynomial, this model is continuous everywhere
 * for D > 0 and exhibits zero boundary step discontinuity (< 0.0001 µs jump across 100 statute miles).
 *
 * @param {number} distanceMeters - Geodesic propagation distance in meters
 * @returns {number} Seawater phase delay in seconds
 */
export function computeBrunavsSecondaryFactorSec(distanceMeters) {
  if (distanceMeters <= 0) return 0;
  // Guard near-field singularity by clamping minimum distance to 100 meters (0.0001 Mm)
  const dClamped = Math.max(100, distanceMeters);
  const D = dClamped / 1e6; // Distance in Megameters (10^6 m)
  const pfSfMeters = -111.0 + (98.2 * D) + ((13.0 * D + 113.0) * Math.exp(-D / 2.0)) + (2.277 / D);
  return Math.max(0, pfSfMeters / SPEED_OF_LIGHT);
}

/**
 * Calculates the Secondary Factor (SF) delay in seconds over an assumed all-seawater path.
 *
 * Defaults to the SOURCED continuous Brunavs (1977) formulation.
 * An optional 'legacy' flag is available for historical comparison against the discontinued USCG polynomial.
 *
 * @param {number} distanceMeters - Geodesic distance in meters
 * @param {'brunavs'|'legacy'} [model='brunavs'] - Propagation model to use
 * @returns {number} SF delay in seconds
 */
export function computeSecondaryFactorSec(distanceMeters, model = 'brunavs') {
  if (distanceMeters <= 0) return 0;
  if (model === 'legacy') {
    const sm = distanceMeters / 1609.344; // Convert meters to statute miles
    let sfMicroseconds = 0;
    if (sm < 100) {
      // Short-range branch (0–100 statute miles) [HISTORICAL DISCONTINUOUS]
      sfMicroseconds = (-0.4076 / Math.max(0.1, sm)) + 0.08182 + (0.003914 * sm);
    } else {
      // Long-range branch (≥100 statute miles) [HISTORICAL DISCONTINUOUS]
      sfMicroseconds = (-107.8 / sm) + 1.297 + (0.000139 * sm);
    }
    return Math.max(0, sfMicroseconds * 1e-6);
  }
  return computeBrunavsSecondaryFactorSec(distanceMeters);
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
  let pLat = lat;
  let pLng = lng;
  let pRef = refLat;
  if (typeof lat === 'object' && lat !== null) {
    pLat = lat.lat;
    pLng = lat.lng;
    pRef = lng ?? lat.lat;
  }
  const safeLat = Number.isFinite(pLat) ? Math.max(-90, Math.min(90, pLat)) : 0;
  const safeLng = Number.isFinite(pLng) ? pLng : 0;
  const safeRef = Number.isFinite(pRef) ? Math.max(-90, Math.min(90, pRef)) : 0;
  const toRad = Math.PI / 180;
  const x = (safeLng * toRad) * EARTH_RADIUS * Math.cos(safeRef * toRad);
  const y = (safeLat * toRad) * EARTH_RADIUS;
  return { x, y };
}

/**
 * Inverts local Cartesian coordinates back to geographic latitude and longitude.
 * Strictly guarantees that returned latitude is a finite value within [-90, 90]
 * and longitude is within [-180, 180].
 * @param {number} x - Local Cartesian X in meters
 * @param {number} y - Local Cartesian Y in meters
 * @param {number} refLat - Reference latitude in degrees
 * @returns {{lat: number, lng: number}} Geographic coordinate in degrees
 */
export function localXYToLatLng(x, y, refLat) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return { lat: 0, lng: 0 };
  }
  const toDeg = 180 / Math.PI;
  let lat = (y / EARTH_RADIUS) * toDeg;
  // Strictly enforce valid geographic limits [-90, 90]
  lat = Math.max(-90, Math.min(90, lat));

  const cosLat = Math.cos(((Number.isFinite(refLat) ? refLat : 0) * Math.PI) / 180);
  const safeCos = Math.abs(cosLat) < 1e-6 ? 1e-6 : cosLat;
  let lng = (x / (EARTH_RADIUS * safeCos)) * toDeg;

  if (Number.isFinite(lng)) {
    lng = ((((lng + 180) % 360) + 360) % 360) - 180;
  } else {
    lng = 0;
  }
  return { lat, lng };
}

/**
 * Validates that latitude is within [-90, 90] and longitude is finite within [-180, 180].
 * Prevents MapLibre Marker and Popup crash: "Invalid LngLat latitude value: must be between -90 and 90".
 * @param {number} lng - Longitude in degrees
 * @param {number} lat - Latitude in degrees
 * @returns {boolean} True if coordinates are valid finite numbers in bounds
 */
export function isValidLngLat(lng, lat) {
  return (
    typeof lng === 'number' &&
    typeof lat === 'number' &&
    Number.isFinite(lng) &&
    Number.isFinite(lat) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}


