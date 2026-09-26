import { describe, it, expect } from 'vitest';
import {
  TILE_PROVIDERS,
  DEFAULT_TILE_PROVIDER,
  FALLBACK_CHAIN,
  getNextFallbackProvider,
  getMapLibreStyle,
  sanitizeMapLibreStyle,
} from '../tiles.js';

describe('Map Tile Configuration & Runtime Sanitizer', () => {
  it('provides default OpenFreeMap Dark provider with keyless config', () => {
    expect(DEFAULT_TILE_PROVIDER).toBe('openfreemap-dark');
    expect(TILE_PROVIDERS['openfreemap-dark']).toBeDefined();
    expect(TILE_PROVIDERS['openfreemap-dark'].type).toBe('vector');
  });

  it('cycles through fallback chain correctly', () => {
    expect(getNextFallbackProvider('openfreemap-dark')).toBe('osm-standard');
    expect(getNextFallbackProvider('osm-standard')).toBe('offline-radar');
    expect(getNextFallbackProvider('offline-radar')).toBe('offline-radar');
  });

  describe('sanitizeMapLibreStyle', () => {
    it('wraps null-vulnerable comparison expressions in coalesce and to-number', () => {
      const rawLayer = {
        id: 'place_city',
        type: 'symbol',
        filter: ['all', ['==', '$type', 'Point'], ['>=', ['get', 'admin_level'], 3]],
      };

      const sanitized = sanitizeMapLibreStyle(rawLayer);

      expect(sanitized.filter).toEqual([
        'all',
        ['==', '$type', 'Point'],
        ['>=', ['coalesce', ['to-number', ['get', 'admin_level']], 0], 3],
      ]);
    });

    it('preserves non-comparison and literal expressions intact', () => {
      const benign = {
        id: 'water',
        paint: { 'fill-color': '#112233' },
        layout: { visibility: 'visible' },
      };

      const sanitized = sanitizeMapLibreStyle(benign);
      expect(sanitized).toEqual(benign);
    });
  });

  describe('getMapLibreStyle', () => {
    it('returns style object for OpenFreeMap dark and light modes', () => {
      const darkStyle = getMapLibreStyle('openfreemap-dark', 'dark');
      const lightStyle = getMapLibreStyle('openfreemap-dark', 'light');

      expect(typeof darkStyle).toBe('object');
      expect(typeof lightStyle).toBe('object');
      expect(darkStyle.version).toBe(8);
      expect(lightStyle.version).toBe(8);
    });

    it('returns offline radar canvas style with zero network requests', () => {
      const offlineStyle = getMapLibreStyle('offline-radar', 'dark');
      expect(offlineStyle.version).toBe(8);
      expect(offlineStyle.sources).toEqual({});
      expect(offlineStyle.layers[0].type).toBe('background');
    });
  });
});
