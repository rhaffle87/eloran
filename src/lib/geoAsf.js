/**
 * LORAN LAB — GIS Coastline Ray-Tracing & Geodesic Path Segmentation for ASF
 * 
 * Replaces synthetic land-fraction slider with real Great Circle path ray-tracing
 * against Natural Earth 10m physical land polygons, feeding the rigorous
 * ITU-R P.368-10 Annex 2 Millington reciprocal solver.
 * 
 * Sourcing & Provenance:
 * - Coastline Geometries: SOURCED (Natural Earth v5.1.2 10m Physical Land, Public Domain / CC0).
 * - Soil Conductivities: SOURCED (ITU-R P.368-9 / ITU-R P.832 discrete terrain parameters).
 * - Multi-Boundary Solver: SOURCED (ITU-R P.368-10 Annex 2 reciprocal Millington formulation).
 */

import * as turf from '@turf/turf';
import { SPEED_OF_LIGHT } from './geodesy.js';
import { computeMillingtonAsfMicroseconds, computeMixedPathAsfMeters } from './grwave.js';
import { COASTLINE_REGIONS, COASTLINE_MANIFEST } from '../data/geo/index.js';

export { COASTLINE_REGIONS, COASTLINE_MANIFEST };

/**
 * Normalizes input coordinate to [lng, lat].
 * Accepts [lng, lat], [lat, lng] (if flagged), or { lat, lng } / { lng, lat }.
 * @param {Array<number>|object} coord
 * @returns {[number, number]} [lng, lat]
 */
export function toLngLat(coord) {
  if (!coord) return [0, 0];
  if (Array.isArray(coord)) {
    return [Number(coord[0]), Number(coord[1])];
  }
  if (typeof coord === 'object') {
    const lng = coord.lng !== undefined ? coord.lng : coord.lon !== undefined ? coord.lon : coord.x || 0;
    const lat = coord.lat !== undefined ? coord.lat : coord.y || 0;
    return [Number(lng), Number(lat)];
  }
  return [0, 0];
}

/**
 * Checks if a point [lng, lat] falls within a bounding box [minLng, minLat, maxLng, maxLat].
 * @param {[number, number]} lngLat
 * @param {[number, number, number, number]} bbox
 * @returns {boolean}
 */
export function isPointInBbox([lng, lat], [minLng, minLat, maxLng, maxLat]) {
  return lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat;
}

/**
 * Detects if a path between start and end is covered by any bundled coastline region.
 * @param {Array<number>|object} start
 * @param {Array<number>|object} end
 * @returns {object|null} Matched region object or null
 */
export function findCoveredRegion(start, end) {
  const pA = toLngLat(start);
  const pB = toLngLat(end);

  for (const region of Object.values(COASTLINE_REGIONS)) {
    if (isPointInBbox(pA, region.bbox) && isPointInBbox(pB, region.bbox)) {
      return region;
    }
  }
  return null;
}

/**
 * Segments a great-circle path from transmitter to receiver into alternating
 * land and sea segments based on vector polygon intersections.
 * 
 * @param {object} params
 * @param {Array<number>|object} params.start - Transmitter [lng, lat] or { lat, lng }
 * @param {Array<number>|object} params.end - Receiver [lng, lat] or { lat, lng }
 * @param {string} [params.regionId] - Optional region override ('indonesia_sunda' | 'north_sea' | 'bohai_yellow_sea')
 * @param {number} [params.landSigma=0.003] - Land conductivity in S/m (ITU-R P.832)
 * @param {number} [params.landEpslon=15.0] - Land relative permittivity
 * @param {number} [params.seaSigma=5.0] - Seawater conductivity in S/m
 * @param {number} [params.seaEpslon=70.0] - Seawater relative permittivity
 * @param {number} [params.npoints] - Optional great-circle sampling resolution
 * @returns {object} Path segmentation results
 */
export function segmentGreatCirclePath({
  start,
  end,
  regionId,
  landSigma = 0.003,
  landEpslon = 15.0,
  seaSigma = 5.0,
  seaEpslon = 70.0,
  npoints,
}) {
  const pA = toLngLat(start);
  const pB = toLngLat(end);

  const ptA = turf.point(pA);
  const ptB = turf.point(pB);
  const totalDistKm = turf.distance(ptA, ptB, { units: 'kilometers' });

  if (totalDistKm <= 0.001) {
    return {
      totalDistKm: 0,
      segments: [],
      isCovered: true,
      regionId: regionId || null,
      seaFraction: 0,
      landFraction: 0,
      seaDistKm: 0,
      landDistKm: 0,
      transitions: 0,
    };
  }

  const region = regionId ? COASTLINE_REGIONS[regionId] : findCoveredRegion(pA, pB);

  // If outside bundled GIS regions, return uncovered flag
  if (!region) {
    return {
      totalDistKm,
      segments: [],
      isCovered: false,
      regionId: null,
      seaFraction: 0,
      landFraction: 0,
      seaDistKm: 0,
      landDistKm: 0,
      transitions: 0,
    };
  }

  // Generate great-circle path with sufficient resolution (1 sample per 0.5 km, between 50 and 500 points)
  const arcPoints = npoints || Math.max(50, Math.min(500, Math.round(totalDistKm * 2)));
  const gc = turf.greatCircle(ptA, ptB, { npoints: arcPoints });

  // Find all intersections with regional land polygons
  const crossings = [];
  const landFeatures = region.geoData.features;

  for (const feature of landFeatures) {
    try {
      const inter = turf.lineIntersect(gc, feature);
      if (inter && inter.features && inter.features.length > 0) {
        for (const pt of inter.features) {
          const dKm = turf.distance(ptA, pt, { units: 'kilometers' });
          if (dKm > 0.02 && dKm < totalDistKm - 0.02) {
            crossings.push(dKm);
          }
        }
      }
    } catch {
      // Ignore geometry errors on degenerate sub-features
    }
  }

  // Sort crossings and deduplicate (merge crossings within 50 meters)
  crossings.sort((a, b) => a - b);
  const uniqueCrossings = [];
  for (const d of crossings) {
    if (uniqueCrossings.length === 0 || d - uniqueCrossings[uniqueCrossings.length - 1] > 0.05) {
      uniqueCrossings.push(d);
    }
  }

  const boundaries = [0, ...uniqueCrossings, totalDistKm];
  const rawSegments = [];

  for (let i = 0; i < boundaries.length - 1; i++) {
    const sKm = boundaries[i];
    const eKm = boundaries[i + 1];
    const lenKm = eKm - sKm;
    if (lenKm <= 0.005) continue;

    // Test midpoint of segment
    const midKm = (sKm + eKm) / 2.0;
    const midPt = turf.along(gc, midKm, { units: 'kilometers' });

    let isLand = false;
    for (const f of landFeatures) {
      if (turf.booleanPointInPolygon(midPt, f)) {
        isLand = true;
        break;
      }
    }

    rawSegments.push({
      startKm: sKm,
      endKm: eKm,
      distKm: lenKm,
      medium: isLand ? 'land' : 'sea',
      sigma: isLand ? landSigma : seaSigma,
      epslon: isLand ? landEpslon : seaEpslon,
    });
  }

  // Merge contiguous segments of the same medium
  const mergedSegments = [];
  for (const seg of rawSegments) {
    if (mergedSegments.length > 0 && mergedSegments[mergedSegments.length - 1].medium === seg.medium) {
      const prev = mergedSegments[mergedSegments.length - 1];
      prev.endKm = seg.endKm;
      prev.distKm += seg.distKm;
    } else {
      mergedSegments.push({ ...seg });
    }
  }

  // Calculate statistics
  let seaDistKm = 0;
  let landDistKm = 0;
  for (const seg of mergedSegments) {
    if (seg.medium === 'sea') seaDistKm += seg.distKm;
    else landDistKm += seg.distKm;
    seg.percent = (seg.distKm / totalDistKm) * 100.0;
  }

  const transitions = Math.max(0, mergedSegments.length - 1);
  const seaFraction = totalDistKm > 0 ? seaDistKm / totalDistKm : 0;
  const landFraction = totalDistKm > 0 ? landDistKm / totalDistKm : 0;

  return {
    totalDistKm,
    segments: mergedSegments,
    isCovered: true,
    regionId: region.id,
    regionName: region.name,
    seaFraction,
    landFraction,
    seaDistKm,
    landDistKm,
    transitions,
  };
}

/**
 * Computes mixed-path ASF in meters and microseconds using real GIS coastline ray-tracing.
 * Automatically falls back to manual land-fraction slider if the path is outside bundled regions.
 * 
 * @param {object} params
 * @param {Array<number>|object} params.start - Transmitter [lng, lat] or { lat, lng }
 * @param {Array<number>|object} params.end - Receiver [lng, lat] or { lat, lng }
 * @param {string} [params.regionId] - Optional region override
 * @param {number} [params.landSigma=0.003] - Land conductivity in S/m
 * @param {number} [params.landEpslon=15.0] - Land permittivity
 * @param {number} [params.freqMhz=0.1] - Frequency in MHz (100 kHz)
 * @param {number} [params.fallbackLandFraction=0.5] - Fallback land fraction if uncovered
 * @returns {object} Computed ASF delay and segmentation details
 */
export function computeGeoMillingtonAsf({
  start,
  end,
  regionId,
  landSigma = 0.003,
  landEpslon = 15.0,
  freqMhz = 0.1,
  fallbackLandFraction = 0.5,
}) {
  const segmentation = segmentGreatCirclePath({
    start,
    end,
    regionId,
    landSigma,
    landEpslon,
  });

  if (segmentation.isCovered && segmentation.segments.length > 0) {
    const asfUs = computeMillingtonAsfMicroseconds(segmentation.segments, freqMhz);
    const asfMeters = asfUs * 1e-6 * SPEED_OF_LIGHT;

    return {
      ...segmentation,
      asfMicroseconds: asfUs,
      asfMeters,
      fallback: false,
      provenance: 'SOURCED (Natural Earth 10m GIS + ITU-R P.368-10 Millington)',
    };
  }

  // Fallback to manual slider calculation
  const totalDistMeters = segmentation.totalDistKm * 1000.0;
  const asfMeters = computeMixedPathAsfMeters({
    totalDistMeters,
    landFraction: fallbackLandFraction,
    landSigma,
    landEpslon,
    freqMhz,
  });
  const asfUs = asfMeters / (SPEED_OF_LIGHT * 1e-6);

  return {
    ...segmentation,
    asfMicroseconds: asfUs,
    asfMeters,
    fallback: true,
    seaFraction: 1.0 - fallbackLandFraction,
    landFraction: fallbackLandFraction,
    provenance: 'FALLBACK (Manual land fraction, region uncovered)',
  };
}
