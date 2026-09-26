/**
 * LORAN LAB - Centralized Map Tile Configuration & Progressive Offline Fallbacks
 * 
 * Provides robust basemap options:
 * 1. OpenFreeMap Dark (Vector Default, keyless, zero watermarks)
 * 2. OpenStreetMap Standard (Raster Fallback, keyless)
 * 3. CARTO Dark (Authenticated Raster with user API key from VITE_CARTO_API_KEY, no watermark)
 * 4. Offline High-Contrast Radar Canvas (zero-network vector/background fallback)
 */

import openfreemapDarkStyle from './styles/openfreemap-dark.json';
import openfreemapBrightStyle from './styles/openfreemap-bright.json';

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
    url: CARTO_API_KEY ? `https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png?key=${CARTO_API_KEY}&api_key=${CARTO_API_KEY}` : null,
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
 * Recursively sanitizes a MapLibre style JSON to prevent crashes caused by
 * numerical comparison operators (<, <=, >, >=) evaluating against null/undefined feature attributes.
 * Upstream OpenFreeMap styles contain expressions like:
 *   [">=", ["get", "admin_level"], 3]
 * If admin_level is null, MapLibre throws: "Expected value to be of type number, but found null instead."
 * Wrapping in ['coalesce', ['to-number', ['get', ...]], 0] ensures safe evaluation without breaking styles.
 * 
 * @param {any} val - Style object, layer, or expression
 * @returns {any} Sanitized style fragment
 */
export function sanitizeMapLibreStyle(val) {
  if (!val) return val;
  if (Array.isArray(val)) {
    const op = val[0];
    const args = val.slice(1).map(sanitizeMapLibreStyle);

    if (['<', '<=', '>', '>='].includes(op)) {
      const sanitizedArgs = args.map((arg) => {
        if (Array.isArray(arg) && arg[0] === 'get') {
          return ['coalesce', ['to-number', arg], 0];
        }
        return arg;
      });
      return [op, ...sanitizedArgs];
    }

    return [op, ...args];
  }

  if (typeof val === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(val)) {
      out[k] = sanitizeMapLibreStyle(v);
    }
    return out;
  }

  return val;
}

/**
 * Asynchronously fetches and sanitizes the latest upstream OpenFreeMap style.
 * Falls back to bundled pre-sanitized styles if network or upstream is unavailable.
 * 
 * @param {'dark'|'light'} [theme='dark']
 * @returns {Promise<object>} Sanitized MapLibre style object
 */
export async function fetchAndSanitizeOpenFreeMapStyle(theme = 'dark') {
  const variant = theme === 'light' ? 'bright' : 'dark';
  try {
    const res = await fetch(`https://tiles.openfreemap.org/styles/${variant}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const upstream = await res.json();
    return sanitizeMapLibreStyle(upstream);
  } catch (err) {
    console.warn(`[TILES] Upstream OpenFreeMap ${variant} fetch failed, using bundled fallback:`, err.message);
    return theme === 'light' ? openfreemapBrightStyle : openfreemapDarkStyle;
  }
}

/**
 * Generate a MapLibre style spec for a given tile provider
 * @param {string} providerKey 
 * @param {string} [theme='dark'] - 'light' | 'dark'
 * @returns {object|string} MapLibre style specification or style URL
 */
export function getMapLibreStyle(providerKey = DEFAULT_TILE_PROVIDER, theme = 'dark') {
  // Normalize alias
  const normalizedKey = providerKey === 'openfreemap' ? 'openfreemap-dark' : providerKey;
  const provider = TILE_PROVIDERS[normalizedKey] || TILE_PROVIDERS[DEFAULT_TILE_PROVIDER];

  // Dynamic OpenFreeMap theme switching: bright for light mode, dark for dark mode
  if (normalizedKey === 'openfreemap-dark') {
    return theme === 'light' ? openfreemapBrightStyle : openfreemapDarkStyle;
  }

  // Dynamic CARTO theme switching: light_all for light mode, dark_all for dark mode
  if (normalizedKey === 'carto-dark') {
    const variant = theme === 'light' ? 'light_all' : 'dark_all';
    const tileUrl = CARTO_API_KEY
      ? `https://basemaps.cartocdn.com/rastertiles/${variant}/{z}/{x}/{y}.png?key=${CARTO_API_KEY}&api_key=${CARTO_API_KEY}`
      : null;
    if (!tileUrl) {
      return getMapLibreStyle('offline-radar', theme);
    }
    return {
      version: 8,
      sources: {
        'basemap-tiles': {
          type: 'raster',
          tiles: [tileUrl],
          tileSize: 256,
          attribution: provider.attribution,
          maxzoom: 19,
        },
      },
      layers: [
        {
          id: 'basemap-layer',
          type: 'raster',
          source: 'basemap-tiles',
          minzoom: 0,
          maxzoom: 19,
        },
      ],
    };
  }

  // Vector styles hosted directly as MapLibre Style JSON
  if (provider.type === 'vector' || provider.styleUrl) {
    return provider.styleUrl;
  }

  if (!provider.url) {
    // Pure offline radar canvas style with theme-aware background
    const isDark = theme === 'dark';
    return {
      version: 8,
      sources: {},
      layers: [
        {
          id: 'background',
          type: 'background',
          paint: {
            'background-color': isDark ? '#09090b' : '#f8fafc',
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
