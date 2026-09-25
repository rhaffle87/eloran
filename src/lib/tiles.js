/**
 * LORAN LAB - Centralized Map Tile Configuration & Progressive Offline Fallbacks
 * 
 * Provides robust basemap options:
 * 1. OpenFreeMap Dark (Vector Default, keyless, zero watermarks)
 * 2. OpenStreetMap Standard (Raster Fallback, keyless)
 * 3. CARTO Dark (Authenticated Raster with user API key from VITE_CARTO_API_KEY, no watermark)
 * 4. Offline High-Contrast Radar Canvas (zero-network vector/background fallback)
 */

// CARTO API key must be supplied via user environment (e.g. VITE_CARTO_API_KEY in Vercel settings).
// It is NEVER hardcoded in source control.
export const CARTO_API_KEY = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_CARTO_API_KEY) || '';

export const TILE_PROVIDERS = {
  'openfreemap-dark': {
    id: 'openfreemap-dark',
    name: 'OpenFreeMap Dark (Vector Default)',
    type: 'vector',
    styleUrl: 'https://tiles.openfreemap.org/styles/dark',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors &copy; <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a>',
    maxZoom: 19,
  },
  'osm-standard': {
    id: 'osm-standard',
    name: 'OpenStreetMap (Raster Fallback)',
    type: 'raster',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
    maxZoom: 19,
    tileSize: 256,
  },
  'carto-dark': {
    id: 'carto-dark',
    name: CARTO_API_KEY ? 'CARTO Dark (API Key Authenticated)' : 'CARTO Dark (API Key Required - Unconfigured)',
    type: 'raster',
    url: CARTO_API_KEY ? `https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png?api_key=${CARTO_API_KEY}` : null,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>',
    maxZoom: 19,
    tileSize: 256,
  },
  'offline-radar': {
    id: 'offline-radar',
    name: 'Offline Radar Canvas (No Network Required)',
    type: 'offline',
    url: null,
    attribution: 'LORAN LAB Offline Radar Basemap',
    maxZoom: 22,
    tileSize: 256,
  },
};

export const DEFAULT_TILE_PROVIDER = 'openfreemap-dark';

// Progressive fallback sequence if primary provider experiences downtime
export const FALLBACK_CHAIN = ['openfreemap-dark', 'osm-standard', 'offline-radar'];

/**
 * Get the next provider in the fallback sequence
 * @param {string} currentProviderKey
 * @returns {string} Next fallback provider key
 */
export function getNextFallbackProvider(currentProviderKey) {
  const currentIndex = FALLBACK_CHAIN.indexOf(currentProviderKey);
  if (currentIndex >= 0 && currentIndex < FALLBACK_CHAIN.length - 1) {
    return FALLBACK_CHAIN[currentIndex + 1];
  }
  return 'offline-radar';
}

/**
 * Generate a MapLibre style spec for a given tile provider
 * @param {string} providerKey 
 * @returns {object|string} MapLibre style specification or style URL
 */
export function getMapLibreStyle(providerKey = DEFAULT_TILE_PROVIDER) {
  const provider = TILE_PROVIDERS[providerKey] || TILE_PROVIDERS[DEFAULT_TILE_PROVIDER];

  // Vector styles hosted directly as MapLibre Style JSON
  if (provider.type === 'vector' || provider.styleUrl) {
    return provider.styleUrl;
  }

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
