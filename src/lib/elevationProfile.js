/**
 * SIMULORAN — Elevation Profile Fetcher
 *
 * Fetches terrain elevation samples along a great-circle path between two geographic points.
 * Primary data source: Open-Elevation API (https://api.open-elevation.com) — free, no key required.
 * Falls back to flat-earth (elevation = 0) when the API is unreachable, so the simulation
 * degrades gracefully to "no terrain masking" rather than crashing.
 *
 * Cache: Simple in-memory LRU (max 128 entries). Cache key is derived from rounded
 * coordinate pairs (4 decimal places ≈ 11 m resolution) + sample count.
 *
 * @module elevationProfile
 */

import { destinationPoint, initialBearing, haversineDistance } from './geodesy.js';

// ---------------------------------------------------------------------------
// Internal LRU Cache
// ---------------------------------------------------------------------------

const CACHE_MAX = 128;
const _cache = new Map(); // key → { elevations: number[], ts: number }

function _cacheSet(key, value) {
  if (_cache.size >= CACHE_MAX) {
    const firstKey = _cache.keys().next().value;
    _cache.delete(firstKey);
  }
  _cache.set(key, { elevations: value, ts: Date.now() });
}

function _cacheGet(key) {
  const entry = _cache.get(key);
  if (!entry) return null;
  _cache.delete(key);
  _cache.set(key, entry);
  return entry.elevations;
}

/** Clear the elevation cache (useful for tests). */
export function clearElevationCache() {
  _cache.clear();
}

// ---------------------------------------------------------------------------
// Great-circle interpolation helpers
// ---------------------------------------------------------------------------

/**
 * Generates N evenly-spaced {lat, lng} waypoints along the great-circle from `from` to `to`,
 * including the start and end points.
 * @param {{lat:number, lng:number}} from
 * @param {{lat:number, lng:number}} to
 * @param {number} n  — number of sample points (>=2)
 * @returns {{lat:number, lng:number}[]}
 */
export function interpolateGreatCircle(from, to, n) {
  if (n < 2) n = 2;
  const distM = haversineDistance(from, to);
  const bearing = initialBearing(from, to);
  const points = [];
  for (let i = 0; i < n; i++) {
    const frac = i / (n - 1);
    const pt = destinationPoint(from, distM * frac, bearing);
    points.push(pt);
  }
  return points;
}

// ---------------------------------------------------------------------------
// Open-Elevation API client
// ---------------------------------------------------------------------------

const OE_ENDPOINT = 'https://api.open-elevation.com/api/v1/lookup';
const FETCH_TIMEOUT_MS = 8000;

/**
 * Fetch elevations for an array of {lat, lng} waypoints from the Open-Elevation API.
 * Returns an array of elevation values in metres, same order as input.
 * On network/API error returns null (caller should fall back to flat earth).
 * @param {{lat:number, lng:number}[]} waypoints
 * @returns {Promise<number[]|null>}
 */
async function fetchOpenElevation(waypoints) {
  const locations = waypoints.map(({ lat, lng }) => ({ latitude: lat, longitude: lng }));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(OE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ locations }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!data?.results || data.results.length !== waypoints.length) return null;
    return data.results.map((r) => (typeof r.elevation === 'number' ? r.elevation : 0));
  } catch {
    clearTimeout(timer);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch the terrain elevation profile along the great-circle path from a transmitter
 * to a receiver.
 *
 * @param {{lat:number, lng:number}} txLatLng   — Transmitter location
 * @param {{lat:number, lng:number}} rxLatLng   — Receiver location
 * @param {number}  [nSamples=16]               — Number of sample points (including endpoints)
 * @param {boolean} [forceFlat=false]           — If true, skip API and return zero elevations
 * @returns {Promise<{waypoints, elevations, distanceM, fromCache, flat}>}
 */
export async function fetchElevationProfile(txLatLng, rxLatLng, nSamples = 16, forceFlat = false) {
  const distanceM = haversineDistance(txLatLng, rxLatLng);
  const waypoints = interpolateGreatCircle(txLatLng, rxLatLng, nSamples);

  const cacheKey = [
    txLatLng.lat.toFixed(4), txLatLng.lng.toFixed(4),
    rxLatLng.lat.toFixed(4), rxLatLng.lng.toFixed(4),
    nSamples,
  ].join('|');

  const cached = _cacheGet(cacheKey);
  if (cached) {
    return { waypoints, elevations: cached, distanceM, fromCache: true, flat: false };
  }

  if (forceFlat) {
    const zeros = new Array(nSamples).fill(0);
    return { waypoints, elevations: zeros, distanceM, fromCache: false, flat: true };
  }

  const elevations = await fetchOpenElevation(waypoints);
  if (elevations) {
    _cacheSet(cacheKey, elevations);
    return { waypoints, elevations, distanceM, fromCache: false, flat: false };
  }

  const zeros = new Array(nSamples).fill(0);
  return { waypoints, elevations: zeros, distanceM, fromCache: false, flat: true };
}