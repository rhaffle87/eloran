import React, { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useSimulationStore } from '../../state/simulationStore.js';
import { useThemeStore } from '../../state/themeStore.js';
import { haversineDistance, destinationPoint, initialBearing, isValidLngLat } from '../../lib/geodesy.js';
import { computeGDOPAtPoint } from '../../lib/gdop.js';
import { getMapLibreStyle, TILE_PROVIDERS, DEFAULT_TILE_PROVIDER, CARTO_API_KEY } from '../../lib/tiles.js';

function isMapStyleReady(map) {
  return Boolean(map && map.style && typeof map.isStyleLoaded === 'function' && map.isStyleLoaded());
}


export default function MapView({ onMapClick, isELoran = false }) {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef({});
  const estMarkerRef = useRef({});
  const radarCanvasRef = useRef(null);
  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;

  const effectiveTheme = useThemeStore((s) => s.effectiveTheme);

  const [isStyleLoaded, setIsStyleLoaded] = useState(false);
  const [activeTileProvider, setActiveTileProvider] = useState(() => {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage?.getItem('loran_offline_radar') === 'true') {
        return 'offline-radar';
      }
    } catch {
      // ignore
    }
    return DEFAULT_TILE_PROVIDER;
  });
  const [showFallbackNotice, setShowFallbackNotice] = useState(false);
  const [fallbackMessage, setFallbackMessage] = useState('');
  const [showLegend, setShowLegend] = useState(() => (typeof window !== 'undefined' ? window.innerWidth >= 1024 : true));

  const tileErrorsRef = useRef([]);
  const hasTileLoadedRef = useRef(false);
  const activeTileProviderRef = useRef(activeTileProvider);
  activeTileProviderRef.current = activeTileProvider;

  const triggerNextFallback = useCallback(() => {
    const current = activeTileProviderRef.current;
    if (current === 'offline-radar') return;

    if (current === 'openfreemap-dark') {
      console.warn('LORAN LAB: OpenFreeMap vector service unreachable. Auto-switched to OpenStreetMap raster fallback.');
      setActiveTileProvider('osm-standard');
      activeTileProviderRef.current = 'osm-standard';
      hasTileLoadedRef.current = false;
      tileErrorsRef.current = [];
      setFallbackMessage('OpenFreeMap unavailable. Switched to OpenStreetMap fallback.');
      setShowFallbackNotice(true);
      const map = mapRef.current;
      if (map) {
        setIsStyleLoaded(false);
        try {
          map.setStyle(getMapLibreStyle('osm-standard'));
        } catch (err) {
          console.warn('Error applying OSM fallback style:', err);
        }
      }
    } else {
      console.warn('LORAN LAB: Basemap network unreachable. Auto-switched to offline Radar Canvas fallback.');
      try {
        if (typeof window !== 'undefined' && window.sessionStorage) {
          sessionStorage.setItem('loran_offline_radar', 'true');
        }
      } catch {
        // ignore
      }
      setActiveTileProvider('offline-radar');
      activeTileProviderRef.current = 'offline-radar';
      hasTileLoadedRef.current = false;
      tileErrorsRef.current = [];
      setFallbackMessage('Basemap tiles unavailable. Switched to offline Radar Canvas.');
      setShowFallbackNotice(true);
      const map = mapRef.current;
      if (map) {
        setIsStyleLoaded(false);
        try {
          map.setStyle(getMapLibreStyle('offline-radar'));
        } catch (err) {
          console.warn('Error applying offline radar style:', err);
        }
      }
    }
  }, []);

  const {
    masters,
    slaves,
    receivers,
    contours,
    mapMode,
    mapCenter,
    mapZoom,
    baselinesVisible,
    lopsVisible,
    receiverFixes,
    updateStation,
    evaluateReceivers,
  } = useSimulationStore();

  const stationsRef = useRef({ masters, slaves });
  stationsRef.current = { masters, slaves };

  const [cursorPos, setCursorPos] = useState(null);
  const [cursorGdop, setCursorGdop] = useState(null);

  const initialCenterRef = useRef(mapCenter);
  const initialZoomRef = useRef(mapZoom);

  // Initialize Map safely
  useEffect(() => {
    if (mapRef.current || !mapContainer.current) return;

    let mapInstance = null;
    try {
      mapInstance = new maplibregl.Map({
        container: mapContainer.current,
        style: getMapLibreStyle(activeTileProvider, effectiveTheme),
        center: initialCenterRef.current || [106.816666, -6.200000],
        zoom: initialZoomRef.current || 8,
        attributionControl: false,
      });

      mapInstance.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'bottom-right');
      mapInstance.addControl(new maplibregl.ScaleControl({ maxWidth: 200, unit: 'metric' }), 'bottom-left');
      mapInstance.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

      const handleStyleReady = () => {
        if (isMapStyleReady(mapInstance)) {
          setIsStyleLoaded(true);
        }
      };

      mapInstance.on('load', handleStyleReady);
      mapInstance.on('styledata', handleStyleReady);

      if (isMapStyleReady(mapInstance)) {
        setIsStyleLoaded(true);
      }

      let tileSummaryLogged = false;
      mapInstance.on('error', (e) => {
        const isTileError = Boolean(
          e && (
            (e.error && (e.error.status || (e.error.message && /tile|fetch|failed|blocked|csp|network/i.test(e.error.message)))) ||
            e.tile ||
            e.sourceId === 'basemap-tiles' ||
            e.sourceId === 'openmaptiles' ||
            e.sourceId === 'ne2_shaded'
          )
        );

        if (isTileError && activeTileProviderRef.current !== 'offline-radar') {
          const now = Date.now();
          tileErrorsRef.current.push(now);
          tileErrorsRef.current = tileErrorsRef.current.filter((t) => now - t <= 5000);

          if (!tileSummaryLogged) {
            tileSummaryLogged = true;
            console.warn('LORAN LAB: Basemap tile loading issues detected. Monitoring for offline fallback.');
          }

          const isFatalStyleFailure = Boolean(
            e?.error && /failed|abort|fetch|network|404|500/i.test(e.error.message || '')
          );

          if ((tileErrorsRef.current.length >= 3 || isFatalStyleFailure) && !hasTileLoadedRef.current) {
            triggerNextFallback();
          }
        }
      });

      const handleTileLoaded = (e) => {
        if (
          (e.tile && (e.tile.state === 'loaded' || e.tile.state === 'ready')) ||
          (e.isSourceLoaded && e.sourceId && !e.sourceId.startsWith('loran-'))
        ) {
          hasTileLoadedRef.current = true;
        }
      };

      mapInstance.on('sourcedata', handleTileLoaded);
      mapInstance.on('data', handleTileLoaded);

      // Gracefully handle style image missing events (e.g. wood-pattern, circle-11 in vector styles)
      mapInstance.on('styleimagemissing', (e) => {
        const id = e.id;
        if (!mapInstance.hasImage(id)) {
          mapInstance.addImage(id, {
            width: 1,
            height: 1,
            data: new Uint8Array([0, 0, 0, 0]),
          });
        }
      });

      mapInstance.on('mousemove', (e) => {
        const { lat, lng } = e.lngLat;
        setCursorPos({ lat, lng });

        const { masters: currentMasters, slaves: currentSlaves } = stationsRef.current;
        const master = currentMasters[0];
        if (master && currentSlaves.length >= 2) {
          const { gdop, valid } = computeGDOPAtPoint({ lat, lng }, master, currentSlaves);
          setCursorGdop(valid ? gdop : null);
        } else {
          setCursorGdop(null);
        }
      });

      mapInstance.on('click', (e) => {
        onMapClickRef.current?.(e.lngLat);
      });

      mapRef.current = mapInstance;
      if (typeof window !== 'undefined' && (import.meta.env.DEV || window.__LORAN_E2E__)) {
        window.__maplibreInstance = mapInstance;
      }
    } catch (err) {
      console.error('Failed to initialize MapLibre map:', err);
    }

    return () => {
      setIsStyleLoaded(false);
      if (typeof window !== 'undefined') {
        delete window.__maplibreInstance;
      }
      Object.values(markersRef.current).forEach((m) => {
        try { m.remove(); } catch { /* ignore */ }
      });
      markersRef.current = {};
      Object.values(estMarkerRef.current).forEach((m) => {
        try { m.remove(); } catch { /* ignore */ }
      });
      estMarkerRef.current = {};
      if (mapRef.current) {
        try {
          mapRef.current.remove();
        } catch (e) {
          console.warn('MapLibre cleanup notice:', e);
        }
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dynamic theme switching for OpenFreeMap and Offline Radar basemaps
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (activeTileProvider === 'openfreemap-dark' || activeTileProvider === 'openfreemap' || activeTileProvider === 'offline-radar') {
      setIsStyleLoaded(false);
      try {
        map.setStyle(getMapLibreStyle(activeTileProvider, effectiveTheme));
      } catch (err) {
        console.warn('Error updating basemap style for theme change:', err);
      }
    }
  }, [effectiveTheme, activeTileProvider]);

  // Update map view when preset changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    try {
      map.flyTo({
        center: mapCenter,
        zoom: mapZoom,
        essential: true,
        duration: 1200,
      });
    } catch (err) {
      console.warn('Map flyTo notice:', err);
    }
  }, [mapCenter, mapZoom]);

  // Synchronize Station Markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const currentLabels = new Set();
    const allStations = [
      ...masters.map((m) => ({ ...m, type: 'master' })),
      ...slaves.map((s) => ({ ...s, type: 'slave' })),
      ...receivers.map((r) => ({ ...r, type: 'receiver' })),
    ];

    allStations.forEach((station) => {
      currentLabels.add(station.label);

      if (!isValidLngLat(station.lng, station.lat)) {
        console.warn(`[MapView] Skipping marker for station ${station.label} with invalid coordinates: [${station.lng}, ${station.lat}]`);
        return;
      }

      if (!markersRef.current[station.label] || markersRef.current[station.label]._map !== map) {
        if (markersRef.current[station.label]) {
          try { markersRef.current[station.label].remove(); } catch { /* ignore */ }
        }
        const size = station.type === 'master' ? 22 : 18;
        const el = document.createElement('div');
        el.className = `station-marker marker-${station.type}`;
        el.dataset.label = station.label;
        el.dataset.lng = String(station.lng);
        el.dataset.lat = String(station.lat);
        el.dataset.type = station.type;
        el.style.position = 'absolute';
        el.style.top = '0';
        el.style.left = '0';
        el.style.width = `${size}px`;
        el.style.height = `${size}px`;
        el.style.cursor = 'grab';

        const dot = document.createElement('div');
        dot.style.width = `${size}px`;
        dot.style.height = `${size}px`;
        dot.style.borderRadius = '50%';
        dot.style.border = '2px solid rgba(255,255,255,0.9)';
        dot.style.boxShadow = '0 0 12px rgba(0,0,0,0.8)';

        if (station.type === 'master') {
          dot.style.background = '#06b6d4'; // Cyan
          dot.className = 'radar-ping';
        } else if (station.type === 'slave') {
          dot.style.background = '#f59e0b'; // Amber
        } else {
          dot.style.background = '#10b981'; // Emerald
          dot.className = 'radar-ping';
        }

        const tag = document.createElement('div');
        tag.innerText = station.label;
        tag.style.position = 'absolute';
        tag.style.top = '100%';
        tag.style.left = '50%';
        tag.style.transform = 'translateX(-50%)';
        tag.style.marginTop = '4px';
        tag.style.fontSize = '10px';
        tag.style.fontWeight = '700';
        tag.style.color = '#f4f4f5';
        tag.style.background = 'rgba(24, 24, 27, 0.85)';
        tag.style.padding = '1px 5px';
        tag.style.borderRadius = '4px';
        tag.style.whiteSpace = 'nowrap';
        tag.style.border = '1px solid rgba(63, 63, 70, 0.6)';
        tag.style.fontFamily = 'monospace';
        tag.style.pointerEvents = 'none';

        el.appendChild(dot);
        el.appendChild(tag);

        const marker = new maplibregl.Marker({ element: el, draggable: true, anchor: 'center' })
          .setLngLat([station.lng, station.lat])
          .addTo(map);

        marker.on('dragend', () => {
          const lngLat = marker.getLngLat();
          updateStation(station.label, { lat: lngLat.lat, lng: lngLat.lng });
          setTimeout(() => evaluateReceivers(), 50);
        });

        el.addEventListener('click', (e) => {
          e.stopPropagation();
          if (mapMode === 'pan' && isValidLngLat(station.lng, station.lat)) {
            const popupContent = `
              <div class="space-y-1">
                <div style="font-family:monospace;font-weight:700;font-size:12px;color:var(--accent-eloran)">${station.label} (${station.type.toUpperCase()})</div>
                <div style="font-size:11px;color:var(--text-secondary)">Lat: ${station.lat.toFixed(5)}°</div>
                <div style="font-size:11px;color:var(--text-secondary)">Lng: ${station.lng.toFixed(5)}°</div>
                ${station.txDbm ? `<div style="font-size:11px;color:var(--text-muted)">Power: ${station.txDbm} dBm</div>` : ''}
                ${station.clock?.type ? `<div style="font-size:11px;color:var(--text-muted)">Clock: ${station.clock.type}</div>` : ''}
              </div>
            `;
            new maplibregl.Popup({ offset: 15 }).setLngLat([station.lng, station.lat]).setHTML(popupContent).addTo(map);
          }
        });

        markersRef.current[station.label] = marker;
      } else {
        markersRef.current[station.label].setLngLat([station.lng, station.lat]);
        const existingEl = markersRef.current[station.label].getElement();
        if (existingEl) {
          existingEl.dataset.lng = String(station.lng);
          existingEl.dataset.lat = String(station.lat);
        }
      }
    });

    // Remove deleted stations
    Object.keys(markersRef.current).forEach((label) => {
      if (!currentLabels.has(label)) {
        markersRef.current[label].remove();
        delete markersRef.current[label];
      }
    });
  }, [masters, slaves, receivers, mapMode, isStyleLoaded, updateStation, evaluateReceivers]);

  // Synchronize Estimated Position Fix Markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    receivers.forEach((rx) => {
      const fix = receiverFixes[rx.label];
      const hasValidFix = fix && isValidLngLat(fix.lng, fix.lat) && fix.converged !== false && !fix.noSolution;

      if (hasValidFix) {
        if (!estMarkerRef.current[rx.label] || estMarkerRef.current[rx.label]._map !== map) {
          if (estMarkerRef.current[rx.label]) {
            try { estMarkerRef.current[rx.label].remove(); } catch { /* ignore */ }
          }
          const el = document.createElement('div');
          el.className = 'estimated-fix-marker';
          el.style.width = '14px';
          el.style.height = '14px';
          el.style.borderRadius = '50%';
          el.style.border = '2px solid #ef4444';
          el.style.background = 'transparent';
          el.style.boxShadow = '0 0 8px #ef4444';
          el.title = `Estimated Fix for ${rx.label} (Error: ${fix.errorMeters?.toFixed(1)}m)`;

          const marker = new maplibregl.Marker({ element: el })
            .setLngLat([fix.lng, fix.lat])
            .addTo(map);

          estMarkerRef.current[rx.label] = marker;
        } else {
          estMarkerRef.current[rx.label].setLngLat([fix.lng, fix.lat]);
        }
      } else {
        if (estMarkerRef.current[rx.label]) {
          estMarkerRef.current[rx.label].remove();
          delete estMarkerRef.current[rx.label];
        }
        if (fix && !isValidLngLat(fix.lng, fix.lat)) {
          console.warn(`[MapView] Skipping estimated fix marker for receiver ${rx.label}: invalid coordinates [${fix?.lng}, ${fix?.lat}]`);
        }
      }
    });
  }, [receivers, receiverFixes, isStyleLoaded]);


  // Safe removal helper for MapLibre layers and sources
  const safeRemoveLayerAndSource = useCallback((map, layerId, sourceId) => {
    if (!isMapStyleReady(map)) return;
    try {
      if (map.getLayer(layerId)) {
        map.removeLayer(layerId);
      }
      if (map.getSource(sourceId)) {
        map.removeSource(sourceId);
      }
    } catch (e) {
      console.warn(`Layer/Source cleanup notice (${layerId}/${sourceId}):`, e);
    }
  }, []);

  // Render Baselines Layer safely once style is fully loaded
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isStyleLoaded || !isMapStyleReady(map)) return;

    const sourceId = 'loran-baselines-source';
    const layerId = 'loran-baselines-layer';

    if (!baselinesVisible || !masters.length || !slaves.length) {
      safeRemoveLayerAndSource(map, layerId, sourceId);
      return;
    }

    try {
      const features = [];
      const master = masters[0];

      slaves.forEach((slave, sidx) => {
        const d = haversineDistance(master, slave);
        const b = initialBearing(master, slave);
        const ext = destinationPoint(slave, d * 0.5, b);

        features.push({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [
              [master.lng, master.lat],
              [slave.lng, slave.lat],
              [ext.lng, ext.lat],
            ],
          },
          properties: {
            id: `baseline-${sidx}`,
            label: `${master.label}-${slave.label}`,
            lengthKm: (d / 1000).toFixed(1),
          },
        });
      });

      const geojson = { type: 'FeatureCollection', features };
      if (typeof window !== 'undefined' && (import.meta.env.DEV || window.__LORAN_E2E__)) {
        window.__baselineGeoJson = geojson;
      }

      safeRemoveLayerAndSource(map, layerId, sourceId);

      map.addSource(sourceId, { type: 'geojson', data: geojson });
      map.addLayer({
        id: layerId,
        type: 'line',
        source: sourceId,
        paint: {
          'line-color': '#06b6d4',
          'line-width': 1.8,
          'line-opacity': 0.85,
          'line-dasharray': [4, 3],
        },
      });
    } catch (err) {
      console.warn('Failed to render baselines layer:', err);
    }

    return () => {
      if (typeof window !== 'undefined') {
        delete window.__baselineGeoJson;
      }
      safeRemoveLayerAndSource(map, layerId, sourceId);
    };
  }, [masters, slaves, baselinesVisible, isStyleLoaded, safeRemoveLayerAndSource]);

  // Render Hyperbolic LOP Contours Layer safely once style is fully loaded
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isStyleLoaded || !isMapStyleReady(map)) return;

    const sourceId = 'loran-lops-source';
    const layerId = 'loran-lops-layer';

    if (!lopsVisible || !contours.length) {
      safeRemoveLayerAndSource(map, layerId, sourceId);
      return;
    }

    try {
      const features = [];
      contours.forEach((c, idx) => {
        if (!c.points || c.points.length < 2) return;
        features.push({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: c.points,
          },
          properties: {
            id: `lop-${c.masterIndex}-${c.slaveIndex}-${idx}`,
            masterIndex: c.masterIndex,
            slaveIndex: c.slaveIndex,
            levelMeters: c.levelMeters,
            levelSeconds: c.levelSeconds,
          },
        });
      });

      const geojson = { type: 'FeatureCollection', features };

      safeRemoveLayerAndSource(map, layerId, sourceId);

      map.addSource(sourceId, { type: 'geojson', data: geojson });
      map.addLayer({
        id: layerId,
        type: 'line',
        source: sourceId,
        paint: {
          'line-color': isELoran ? '#06b6d4' : '#ef4444',
          'line-width': 2,
          'line-opacity': 0.85,
        },
      });

      const clickHandler = (e) => {
        const feat = e.features?.[0];
        if (!feat) return;
        const p = feat.properties;
        const content = `
          <div class="font-mono text-xs">
            <div class="font-bold text-cyan-400 mb-1">Hyperbolic Line of Position (LOP)</div>
            <div>Master index: ${p.masterIndex} | Secondary: ${p.slaveIndex}</div>
            <div>Delay offset: ${(p.levelMeters || 0).toFixed(0)} m</div>
            <div>TDOA: ${(p.levelSeconds || 0).toExponential(3)} s</div>
          </div>
        `;
        new maplibregl.Popup().setLngLat(e.lngLat).setHTML(content).addTo(map);
      };

      map.on('click', layerId, clickHandler);

      return () => {
        try {
          map.off('click', layerId, clickHandler);
        } catch {
          // ignore
        }
        safeRemoveLayerAndSource(map, layerId, sourceId);
      };
    } catch (err) {
      console.warn('Failed to render LOP contours layer:', err);
    }
  }, [contours, lopsVisible, isELoran, isStyleLoaded, safeRemoveLayerAndSource]);

  // High-performance radar canvas fallback drawing
  const drawRadar = useCallback(() => {
    const canvas = radarCanvasRef.current;
    const map = mapRef.current;
    const container = mapContainer.current;
    if (!canvas || !map || !container || activeTileProvider !== 'offline-radar') return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = container.clientWidth || Math.round(canvas.getBoundingClientRect().width);
    const h = container.clientHeight || Math.round(canvas.getBoundingClientRect().height);
    if (w <= 0 || h <= 0) return;

    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const isDark = effectiveTheme === 'dark';
    const bgColor = isDark ? '#09090b' : '#f8fafc';
    const ringColor = isDark ? 'rgba(6, 182, 212, 0.32)' : 'rgba(14, 116, 144, 0.30)';
    const ringMajorColor = isDark ? 'rgba(6, 182, 212, 0.70)' : 'rgba(14, 116, 144, 0.65)';
    const radialColor = isDark ? 'rgba(16, 185, 129, 0.25)' : 'rgba(15, 118, 110, 0.25)';
    const textColor = isDark ? '#38bdf8' : '#0369a1';
    const textMuted = isDark ? '#71717a' : '#64748b';
    const graticuleColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)';

    // Fill background
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, h);

    const centerLngLat = map.getCenter();
    const centerScreen = map.project(centerLngLat);
    const cx = centerScreen.x;
    const cy = centerScreen.y;

    // 1. Geographic graticule (lat/lng coordinates)
    const bounds = map.getBounds();
    const west = bounds.getWest();
    const east = bounds.getEast();
    const north = bounds.getNorth();
    const south = bounds.getSouth();

    const zoom = map.getZoom();
    let step = 1.0;
    if (zoom >= 11) step = 0.05;
    else if (zoom >= 9) step = 0.1;
    else if (zoom >= 7) step = 0.25;
    else if (zoom >= 5) step = 0.5;
    else if (zoom >= 3) step = 1.0;
    else step = 2.0;

    ctx.strokeStyle = graticuleColor;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);

    const startLng = Math.floor(west / step) * step;
    for (let lng = startLng; lng <= east; lng += step) {
      const p1 = map.project([lng, north]);
      const p2 = map.project([lng, south]);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();

      ctx.fillStyle = textMuted;
      ctx.font = '9px monospace';
      ctx.fillText(`${lng.toFixed(2)}°`, p1.x + 4, 14);
    }

    const startLat = Math.floor(south / step) * step;
    for (let lat = startLat; lat <= north; lat += step) {
      const p1 = map.project([west, lat]);
      const p2 = map.project([east, lat]);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();

      ctx.fillStyle = textMuted;
      ctx.font = '9px monospace';
      ctx.fillText(`${lat.toFixed(2)}°`, 6, p1.y - 4);
    }

    ctx.setLineDash([]);

    // 2. Concentric Range Rings centered on screen/map center
    const rangeNM = [2, 5, 10, 20, 40, 80, 160, 320, 640];
    const maxRadius = Math.hypot(w, h);

    for (let i = 0; i < rangeNM.length; i++) {
      const nm = rangeNM[i];
      const km = nm * 1.852;
      const eastPoint = destinationPoint(centerLngLat, km * 1000, 90);
      const eastScreen = map.project([eastPoint.lng, eastPoint.lat]);
      const radiusPx = Math.abs(eastScreen.x - cx);

      if (radiusPx < 25 || radiusPx > maxRadius) continue;

      const isMajor = (i % 2 === 0);
      ctx.beginPath();
      ctx.arc(cx, cy, radiusPx, 0, Math.PI * 2);
      ctx.strokeStyle = isMajor ? ringMajorColor : ringColor;
      ctx.lineWidth = isMajor ? 1.5 : 1;
      ctx.stroke();

      ctx.fillStyle = textColor;
      ctx.font = '10px monospace';
      ctx.fillText(`${nm} NM (${km.toFixed(0)} km)`, cx + radiusPx + 4, cy - 3);
    }

    // 3. Radial Bearing Lines (every 30 degrees)
    const bearings = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];
    const bearingLabels = {
      0: '000° N', 30: '030°', 60: '060°', 90: '090° E',
      120: '120°', 150: '150°', 180: '180° S', 210: '210°',
      240: '240°', 270: '270° W', 300: '300°', 330: '330°',
    };

    const lineLen = Math.max(w, h);
    for (const b of bearings) {
      const rad = ((b - 90) * Math.PI) / 180;
      const x2 = cx + lineLen * Math.cos(rad);
      const y2 = cy + lineLen * Math.sin(rad);

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = (b % 90 === 0) ? ringMajorColor : radialColor;
      ctx.lineWidth = (b % 90 === 0) ? 1.2 : 0.8;
      ctx.stroke();

      const labelRadius = Math.min(w, h) * 0.42;
      if (labelRadius > 50) {
        const lx = cx + labelRadius * Math.cos(rad);
        const ly = cy + labelRadius * Math.sin(rad);
        ctx.fillStyle = (b % 90 === 0) ? textColor : textMuted;
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(bearingLabels[b], lx, ly);
      }
    }

    // 4. Center Reticle Crosshairs
    ctx.strokeStyle = isDark ? '#22d3ee' : '#0284c7';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - 16, cy);
    ctx.lineTo(cx + 16, cy);
    ctx.moveTo(cx, cy - 16);
    ctx.lineTo(cx, cy + 16);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.stroke();

    // 5. Offline Radar Status Watermark
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.font = 'bold 10px monospace';
    ctx.fillStyle = isDark ? 'rgba(34, 211, 238, 0.7)' : 'rgba(2, 132, 199, 0.8)';
    ctx.fillText('RADAR 2D VECTOR BACKDROP · OFFLINE STANDBY', 14, h - 14);

    ctx.restore();
  }, [activeTileProvider, effectiveTheme]);

  // Redraw radar canvas on map events and provider switch
  useEffect(() => {
    const map = mapRef.current;
    if (!map || activeTileProvider !== 'offline-radar') return;

    drawRadar();
    map.on('move', drawRadar);
    map.on('resize', drawRadar);

    return () => {
      try {
        map.off('move', drawRadar);
        map.off('resize', drawRadar);
      } catch {
        // ignore
      }
    };
  }, [activeTileProvider, drawRadar]);

  // Switch basemap provider safely
  const handleSwitchProvider = (providerKey) => {
    if (providerKey === 'carto-dark' && !CARTO_API_KEY) {
      setFallbackMessage('CARTO is an optional commercial basemap requiring a VITE_CARTO_API_KEY environment variable. OpenFreeMap and OpenStreetMap are currently active and operational.');
      setShowFallbackNotice(true);
      return;
    }
    const map = mapRef.current;
    if (!map) return;
    setActiveTileProvider(providerKey);
    activeTileProviderRef.current = providerKey;
    setIsStyleLoaded(false);
    if (providerKey !== 'offline-radar') {
      try {
        if (typeof window !== 'undefined' && window.sessionStorage) {
          sessionStorage.removeItem('loran_offline_radar');
        }
      } catch {
        // ignore
      }
      hasTileLoadedRef.current = false;
      tileErrorsRef.current = [];
    }
    setShowFallbackNotice(false);
    try {
      map.setStyle(getMapLibreStyle(providerKey, effectiveTheme));
    } catch (err) {
      console.warn('Error setting map style:', err);
    }
  };

  return (
    <div className="relative w-full h-full min-h-[500px] overflow-hidden select-none" style={{ background: 'var(--bg-canvas)' }}>
      <div ref={mapContainer} className="w-full h-full" />
      <canvas
        ref={radarCanvasRef}
        className="absolute inset-0 pointer-events-none w-full h-full"
        style={{
          zIndex: 1,
          display: activeTileProvider === 'offline-radar' ? 'block' : 'none',
        }}
      />

      {/* Dismissible Fallback Notice */}
      {showFallbackNotice && (
        <div
          data-testid="radar-fallback-notice"
          className="absolute top-16 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 px-3.5 py-2 rounded-xl text-xs font-mono shadow-2xl backdrop-blur-md animate-fade-in"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--accent-eloran-border)',
            color: 'var(--text-primary)',
            boxShadow: 'var(--shadow-card)',
          }}
        >
          <div className="w-2 h-2 rounded-full shrink-0 animate-ping" style={{ background: 'var(--accent-eloran)' }} />
          <span className="leading-snug max-w-md">{fallbackMessage || 'Basemap tiles unavailable. Switched to offline Radar Canvas.'}</span>
          <button
            onClick={() => setShowFallbackNotice(false)}
            className="p-1 rounded-md transition text-xs font-bold shrink-0 cursor-pointer hover:bg-[var(--bg-subtle)]"
            style={{ color: 'var(--text-muted)' }}
            aria-label="Dismiss notice"
          >
            ✕
          </button>
        </div>
      )}

      {/* Real-time telemetry HUD overlay */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2 pointer-events-none">
        <div
          className="backdrop-blur-md rounded-lg px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs font-mono shadow-xl pointer-events-auto flex items-center gap-2 sm:gap-4"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', opacity: 0.95 }}
        >
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span className={`inline-block w-2 h-2 rounded-full ${isStyleLoaded ? 'animate-pulse' : ''}`}
              style={{ background: isStyleLoaded ? 'var(--accent-eloran)' : 'var(--accent-loran-c)' }}
            />
            <span className="uppercase tracking-wider text-[10px]" style={{ color: 'var(--text-dim)' }}>MODE:</span>
            <span className="font-bold uppercase" style={{ color: 'var(--accent-eloran)' }}>{mapMode}</span>
          </div>
          {cursorPos && (
            <div className="hidden sm:inline text-[11px]" style={{ color: 'var(--text-secondary)' }}>
              <span className="mr-1" style={{ color: 'var(--text-dim)' }}>POS:</span>
              {cursorPos.lat.toFixed(4)}°, {cursorPos.lng.toFixed(4)}°
            </div>
          )}
          {cursorGdop !== null && (
            <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
              <span className="mr-1" style={{ color: 'var(--text-dim)' }}>GDOP:</span>
              <span
                className="font-bold"
                style={{ color: cursorGdop < 3 ? 'var(--status-ok)' : cursorGdop < 8 ? 'var(--status-warn)' : 'var(--status-danger)' }}
              >
                {cursorGdop}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Map Tile Switcher & Fallback selector */}
      <div
        className="absolute top-16 sm:top-14 left-4 z-10 backdrop-blur-md rounded-full px-2 py-1 text-[11px] font-mono flex items-center gap-1 shadow-lg"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', opacity: 0.92 }}
      >
        {Object.values(TILE_PROVIDERS).map((p) => {
          const isCartoUnset = p.id === 'carto-dark' && !CARTO_API_KEY;
          return (
            <button
              key={p.id}
              onClick={() => handleSwitchProvider(p.id)}
              title={
                isCartoUnset
                  ? 'CARTO Dark requires VITE_CARTO_API_KEY (optional commercial basemap). Click for setup details.'
                  : undefined
              }
              className="px-2 sm:px-2.5 py-0.5 rounded-full transition-colors text-[10px] sm:text-[11px] flex items-center gap-1"
              style={activeTileProvider === p.id
                ? { background: 'var(--accent-eloran-subtle)', color: 'var(--accent-eloran)', border: '1px solid var(--accent-eloran-border)', fontWeight: 700 }
                : isCartoUnset
                ? { color: 'var(--text-dim)', border: '1px dashed var(--border-subtle)', opacity: 0.75 }
                : { color: 'var(--text-muted)', border: '1px solid transparent' }
              }
            >
              {p.id === 'openfreemap-dark'
                ? 'OpenFreeMap'
                : p.id === 'osm-standard'
                ? 'OSM'
                : p.id === 'carto-dark'
                ? (CARTO_API_KEY ? 'CARTO' : 'CARTO 🔒')
                : 'Radar'}
            </button>
          );
        })}
      </div>

      {/* Collapsible Station Symbols Legend */}
      <div className="absolute bottom-12 sm:bottom-8 left-4 z-10 font-mono text-xs">
        {showLegend ? (
          <div
            className="backdrop-blur-md rounded-lg p-2.5 shadow-2xl space-y-1.5 text-[11px] animate-fade-in"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
          >
            <div className="flex items-center justify-between gap-3 text-[10px] uppercase font-bold tracking-wider mb-1" style={{ color: 'var(--text-dim)' }}>
              <span>Station Symbols</span>
              <button
                onClick={() => setShowLegend(false)}
                className="font-bold px-1 rounded cursor-pointer leading-none"
                style={{ color: 'var(--text-dim)' }}
                aria-label="Hide symbols legend"
              >
                ✕
              </button>
            </div>
            <div className="flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <span className="w-2.5 h-2.5 rounded-full border border-white shrink-0" style={{ background: 'var(--accent-eloran)' }} /> Master (M)
            </div>
            <div className="flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <span className="w-2.5 h-2.5 rounded-full border border-white shrink-0" style={{ background: 'var(--accent-loran-c)' }} /> Secondary (S)
            </div>
            <div className="flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <span className="w-2.5 h-2.5 rounded-full border border-white shrink-0" style={{ background: 'var(--status-ok)' }} /> True Receiver (R)
            </div>
            <div className="flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <span className="w-2.5 h-2.5 rounded-full border-2 shrink-0" style={{ borderColor: 'var(--status-danger)' }} /> Estimated PNT Fix
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowLegend(true)}
            className="backdrop-blur-md rounded-md px-2 py-1 text-[10px] font-mono shadow-lg transition flex items-center gap-1.5 cursor-pointer"
            style={{ background: 'var(--bg-surface)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}
            aria-label="Show symbols legend"
          >
            <span className="w-2 h-2 rounded-full" style={{ background: 'var(--accent-eloran)' }} />
            <span>Symbols</span>
          </button>
        )}
      </div>
    </div>
  );
}
