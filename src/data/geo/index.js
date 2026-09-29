/**
 * SIMULORAN — Bundled Regional Coastline Vector Geometries
 * 
 * SOURCED from Natural Earth 10m Physical Land (ne_10m_land, v5.1.2).
 * License: Public Domain (CC0 equivalent).
 */

import indonesiaSunda from './indonesia_sunda.json' with { type: 'json' };
import northSea from './north_sea.json' with { type: 'json' };
import bohaiYellowSea from './bohai_yellow_sea.json' with { type: 'json' };
import manifest from './manifest.json' with { type: 'json' };

export const COASTLINE_REGIONS = {
  indonesia_sunda: {
    ...manifest.indonesia_sunda,
    geoData: indonesiaSunda,
  },
  north_sea: {
    ...manifest.north_sea,
    geoData: northSea,
  },
  bohai_yellow_sea: {
    ...manifest.bohai_yellow_sea,
    geoData: bohaiYellowSea,
  },
};

export { manifest as COASTLINE_MANIFEST };
