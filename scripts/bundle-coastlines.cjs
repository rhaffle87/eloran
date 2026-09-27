/**
 * LORAN LAB — Coastline GIS Bundler
 * 
 * Fetches Natural Earth 10m physical land vector dataset (Public Domain),
 * clips to the simulation's active preset regions, rounds coordinates to 4 decimals (~10m precision),
 * and outputs lightweight GeoJSON bundles for client-side geodesic ray-tracing.
 * 
 * Data Source: Natural Earth v5.1.2 (ne_10m_land)
 * License: Public Domain (CC0 equivalent)
 */

const fs = require('fs');
const path = require('path');
const turf = require('@turf/turf');

function roundCoords(geom, precision = 4) {
  const factor = Math.pow(10, precision);
  function round(c) {
    if (typeof c[0] === 'number') {
      return [Math.round(c[0] * factor) / factor, Math.round(c[1] * factor) / factor];
    }
    return c.map(round);
  }
  return { ...geom, coordinates: round(geom.coordinates) };
}

async function bundleCoastlines() {
  console.log('Fetching Natural Earth 10m land polygons from GitHub raw (tag v5.1.2)...');
  const url = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_land.geojson';
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch Natural Earth data: ${res.status} ${res.statusText}`);
  }
  const rawData = await res.json();
  console.log(`Fetched ${rawData.features.length} features.`);

  const outDir = path.resolve(__dirname, '../src/data/geo');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const regions = {
    indonesia_sunda: {
      id: 'indonesia_sunda',
      name: 'Indonesia — Sunda Strait & Jakarta Bay',
      bbox: [104.5, -7.5, 108.5, -5.0],
      presetId: 'jakarta_baseline',
    },
    north_sea: {
      id: 'north_sea',
      name: 'Northwest Europe — North Sea & English Channel',
      bbox: [-5.0, 48.5, 9.5, 56.5],
      presetId: 'north_sea_historical',
    },
    bohai_yellow_sea: {
      id: 'bohai_yellow_sea',
      name: 'East Asia — Bohai & Yellow Sea (China / Korea)',
      bbox: [116.0, 30.5, 131.0, 43.5],
      presetId: 'bohai_yellow_sea_active',
    },
  };

  const manifest = {};

  for (const [id, meta] of Object.entries(regions)) {
    console.log(`Processing region ${id} (${meta.name})...`);
    const clipped = [];
    for (const f of rawData.features) {
      try {
        const c = turf.bboxClip(f, meta.bbox);
        if (c && c.geometry && c.geometry.coordinates && c.geometry.coordinates.length > 0) {
          clipped.push({
            type: 'Feature',
            properties: { region: id, name: meta.name },
            geometry: roundCoords(c.geometry, 4),
          });
        }
      } catch {
        // Skip degenerate geometries
      }
    }

    const fc = {
      type: 'FeatureCollection',
      id,
      name: meta.name,
      bbox: meta.bbox,
      presetId: meta.presetId,
      source: 'Natural Earth 10m Physical Land (ne_10m_land)',
      version: '5.1.2',
      license: 'Public Domain',
      features: clipped,
    };

    const outPath = path.join(outDir, `${id}.json`);
    const jsonStr = JSON.stringify(fc);
    fs.writeFileSync(outPath, jsonStr, 'utf8');

    const sizeKb = (Buffer.byteLength(jsonStr, 'utf8') / 1024).toFixed(1);
    console.log(`Saved ${outPath} (${sizeKb} KB, ${clipped.length} polygon features)`);

    manifest[id] = {
      id,
      name: meta.name,
      bbox: meta.bbox,
      presetId: meta.presetId,
      featureCount: clipped.length,
      fileSizeKb: parseFloat(sizeKb),
    };
  }

  // Write index / manifest
  const manifestPath = path.join(outDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`Saved manifest to ${manifestPath}`);
  console.log('Coastline bundling complete!');
}

bundleCoastlines().catch((err) => {
  console.error(err);
  process.exit(1);
});
