import { describe, it, expect } from 'vitest';
import { computeGdopAsync } from '../../workers/workerClient.js';
import { computeGDOPGrid, computeGDOPAtPoint } from '../gdop.js';

describe('GDOP Worker & Off-Thread Grid Engine', () => {
  const master = { id: 'M', label: 'Carolina Beach', lat: 34.062, lng: -77.904 };
  const secondaries = [
    { id: 'W', label: 'Jupiter', lat: 27.033, lng: -80.114 },
    { id: 'X', label: 'Cape Race', lat: 46.779, lng: -53.076 },
    { id: 'Y', label: 'Nantucket', lat: 41.253, lng: -69.979 },
  ];

  const bbox = {
    minLat: 30.0,
    maxLat: 42.0,
    minLng: -82.0,
    maxLng: -68.0,
  };

  it('computes GDOP at a single point with consistent geometry', () => {
    const pt = { lat: 35.0, lng: -75.0 };
    const res = computeGDOPAtPoint(pt, master, secondaries);
    expect(res.valid).toBe(true);
    expect(res.gdop).toBeGreaterThan(0.5);
    expect(res.gdop).toBeLessThan(15.0);
  });

  it('computes 2D GDOP grid with valid bounds and scalar range', () => {
    const nx = 40;
    const ny = 40;
    const grid = computeGDOPGrid(master, secondaries, bbox, nx, ny);

    expect(grid.data).toBeInstanceOf(Float32Array);
    expect(grid.data.length).toBe(nx * ny);
    expect(grid.minVal).toBeGreaterThan(0);
    expect(grid.maxVal).toBeGreaterThan(grid.minVal);
    expect(grid.nx).toBe(nx);
    expect(grid.ny).toBe(ny);
  });

  it('computeGdopAsync resolves safely in Node.js test environment', async () => {
    const result = await computeGdopAsync({
      master,
      secondaries,
      bbox,
      nx: 30,
      ny: 30,
      contourLevels: [1.5, 3.0, 7.7, 10.92],
      includeHeatmap: true,
    });

    expect(result).toBeDefined();
    expect(result.heatmapGeoJson).toBeDefined();
    expect(result.heatmapGeoJson.type).toBe('FeatureCollection');
    expect(Array.isArray(result.heatmapGeoJson.features)).toBe(true);
    expect(result.heatmapGeoJson.features.length).toBeGreaterThan(0);

    // Verify sample feature properties
    const sampleFeature = result.heatmapGeoJson.features[0];
    expect(sampleFeature.type).toBe('Feature');
    expect(sampleFeature.geometry.type).toBe('Point');
    expect(sampleFeature.properties.gdop).toBeDefined();
  });
});
