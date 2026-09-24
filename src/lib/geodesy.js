/**
 * Geodesy and Coordinate Transformations Library for LORAN LAB
 * All calculations use standard physical constants and WGS84 ellipsoid / sphere approximations.
 */

export const SPEED_OF_LIGHT = 299792458; // m/s
export const EARTH_RADIUS = 6371000;    // meters

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
 * Matches original ACTIFE solver implementation.
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
