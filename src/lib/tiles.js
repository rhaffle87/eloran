/**
 * LORAN LAB - Centralized Map Tile Configuration & Offline Fallbacks
 * 
 * Provides robust basemap options:
 * 1. Carto Dark (standard sleek theme)
 * 2. OpenStreetMap (fallback raster)
 * 3. Offline High-Contrast Radar Canvas (zero-network vector/background fallback)
 */

export const TILE_PROVIDERS = {
  'carto-dark': {
    id: 'carto-dark',
    name: 'Carto Dark (Default)',
    url: 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    maxZoom: 19,
    tileSize: 256,
  },
  'osm-standard': {
    id: 'osm-standard',
    name: 'OpenStreetMap (Raster Fallback)',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
    tileSize: 256,
  },
  'offline-radar': {
    id: 'offline-radar',
    name: 'Offline Radar Canvas (No Network Required)',
    url: null,
    attribution: 'LORAN LAB Offline Radar Basemap',
    maxZoom: 22,
    tileSize: 256,
  },
};

/**
 * Generate a MapLibre style spec for a given tile provider
 * @param {string} providerKey 
 * @returns {object} MapLibre style specification
 */
export function getMapLibreStyle(providerKey = 'carto-dark') {
  const provider = TILE_PROVIDERS[providerKey] || TILE_PROVIDERS['carto-dark'];

  if (!provider.url) {
    // Pure offline dark radar canvas style with synthetic coordinate grid
    return {
      version: 8,
      sources: {},
      layers: [
        {
          id: 'background',
          type: 'background',
          paint: {
            'background-color': '#09090b', // Zinc 950
          },
        },
      ],
    };
  }

  return {
    version: 8,
    sources: {
      'basemap-tiles': {
        type: 'raster',
        tiles: [provider.url],
        tileSize: provider.tileSize || 256,
        attribution: provider.attribution,
        maxzoom: provider.maxZoom || 19,
      },
    },
    layers: [
      {
        id: 'basemap-layer',
        type: 'raster',
        source: 'basemap-tiles',
        minzoom: 0,
        maxzoom: provider.maxZoom || 19,
      },
    ],
  };
}
