import { useState, useEffect, useRef, useCallback } from 'react';
import { computeAsfGridAsync } from '../workers/workerClient.js';
import { renderGridToCanvas } from '../lib/heatmapColormap.js';

const SOURCE_ID = 'asf-heatmap-source';
const LAYER_ID = 'asf-heatmap-layer';

/**
 * Safely updates or creates the MapLibre raster image layer for the ASF heatmap.
 */
function updateMapRasterLayer(map, canvas, bounds, opacity) {
  if (!map || typeof map.isStyleLoaded !== 'function' || !map.isStyleLoaded()) {
    return;
  }

  const coordinates = [
    [bounds.minLng, bounds.maxLat], // Top-Left
    [bounds.maxLng, bounds.maxLat], // Top-Right
    [bounds.maxLng, bounds.minLat], // Bottom-Right
    [bounds.minLng, bounds.minLat], // Bottom-Left
  ];

  const dataUrl = canvas.toDataURL();
  const source = map.getSource(SOURCE_ID);

  if (source && typeof source.updateImage === 'function') {
    source.updateImage({
      url: dataUrl,
      coordinates,
    });
  } else {
    // Re-create cleanly if missing or after style change
    if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
    if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);

    map.addSource(SOURCE_ID, {
      type: 'image',
      url: dataUrl,
      coordinates,
    });

    // Place underneath station markers if layer exists
    const beforeId = map.getLayer('stations-layer') ? 'stations-layer' : undefined;

    map.addLayer(
      {
        id: LAYER_ID,
        type: 'raster',
        source: SOURCE_ID,
        paint: {
          'raster-opacity': Math.max(0, Math.min(1, opacity ?? 0.65)),
          'raster-resampling': 'linear',
          'raster-fade-duration': 150,
        },
      },
      beforeId
    );
  }
}

/**
 * Safely cleans up the heatmap layer and source from the MapLibre map.
 */
function removeMapRasterLayer(map) {
  if (!map || typeof map.isStyleLoaded !== 'function' || !map.isStyleLoaded()) {
    return;
  }
  if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
  if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
}

/**
 * React hook that manages the lifecycle, worker calculation, and MapLibre rendering
 * of the Live ASF Heatmap.
 */
export function useAsfHeatmap({
  map,
  enabled = false,
  mode = 'us',
  landSigma = 0.003,
  landEpslon = 15.0,
  fallbackLandFraction = 0.5,
  resolution = 40,
  opacity = 0.65,
  isoContours = true,
  master = null,
}) {
  const [isComputing, setIsComputing] = useState(false);
  const [heatmapStats, setHeatmapStats] = useState({
    minVal: 0,
    maxVal: mode === 'us' ? 3.0 : 60.0,
    mode,
    lastComputedAt: 0,
  });

  const canvasRef = useRef(null);
  const debounceTimerRef = useRef(null);
  const lastBoundsRef = useRef(null);

  // Lazy-initialize offscreen canvas
  if (!canvasRef.current && typeof document !== 'undefined') {
    canvasRef.current = document.createElement('canvas');
  }

  // Handle live opacity adjustment without recomputing grid
  useEffect(() => {
    if (!map || !enabled) return;
    if (typeof map.isStyleLoaded === 'function' && map.isStyleLoaded() && map.getLayer(LAYER_ID)) {
      map.setPaintProperty(LAYER_ID, 'raster-opacity', Math.max(0, Math.min(1, opacity ?? 0.65)));
    }
  }, [map, enabled, opacity]);

  const runCompute = useCallback(async () => {
    if (!map || !enabled || typeof map.getBounds !== 'function') return;

    const b = map.getBounds();
    if (!b) return;

    const bounds = {
      minLat: b.getSouth(),
      maxLat: b.getNorth(),
      minLng: b.getWest(),
      maxLng: b.getEast(),
    };

    lastBoundsRef.current = bounds;
    setIsComputing(true);

    try {
      const payload = {
        bounds,
        nx: Math.max(20, Math.min(80, resolution)),
        ny: Math.max(20, Math.min(80, resolution)),
        master: master || {
          lat: (bounds.minLat + bounds.maxLat) / 2,
          lng: (bounds.minLng + bounds.maxLng) / 2,
        },
        mode,
        landSigma,
        landEpslon,
        fallbackLandFraction,
      };

      const result = await computeAsfGridAsync(payload);
      if (!result || !result.grid) return;

      const grid = new Float32Array(result.grid);
      const canvas = canvasRef.current;
      if (!canvas) return;

      const colormap = mode === 'us' ? 'jet' : 'viridis';
      const isoStep = isoContours ? (mode === 'us' ? 0.5 : 10.0) : null;

      renderGridToCanvas(grid, result.nx, result.ny, canvas, {
        colormap,
        minVal: result.minVal,
        maxVal: result.maxVal,
        opacity,
        isoStep,
        width: result.nx * 4,
        height: result.ny * 4,
      });

      updateMapRasterLayer(map, canvas, bounds, opacity);

      setHeatmapStats({
        minVal: result.minVal,
        maxVal: result.maxVal,
        mode,
        lastComputedAt: Date.now(),
      });
    } catch (err) {
      if (err?.message !== 'Job cancelled' && err?.message !== 'ASF job cancelled by newer request') {
        console.warn('ASF Heatmap worker computation error:', err);
      }
    } finally {
      setIsComputing(false);
    }
  }, [map, enabled, mode, landSigma, landEpslon, fallbackLandFraction, resolution, opacity, isoContours, master]);

  // Debounced trigger on parameter or viewport change
  const triggerCompute = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      runCompute();
    }, 300);
  }, [runCompute]);

  useEffect(() => {
    if (!enabled) {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      removeMapRasterLayer(map);
      return;
    }

    triggerCompute();

    if (!map) return;

    const onMoveEnd = () => triggerCompute();
    const onStyleLoad = () => {
      triggerCompute();
    };

    map.on('moveend', onMoveEnd);
    map.on('zoomend', onMoveEnd);
    map.on('style.load', onStyleLoad);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      map.off('moveend', onMoveEnd);
      map.off('zoomend', onMoveEnd);
      map.off('style.load', onStyleLoad);
      removeMapRasterLayer(map);
    };
  }, [map, enabled, triggerCompute]);

  return {
    isComputing,
    minVal: heatmapStats.minVal,
    maxVal: heatmapStats.maxVal,
    mode: heatmapStats.mode,
    lastComputedAt: heatmapStats.lastComputedAt,
    triggerCompute,
  };
}
