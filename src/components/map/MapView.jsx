import React, { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useSimulationStore } from '../../state/simulationStore.js';
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
  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;

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
        style: getMapLibreStyle(activeTileProvider),
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
    } catch (err) {
      console.error('Failed to initialize MapLibre map:', err);
    }

    return () => {
      setIsStyleLoaded(false);
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

      if (!markersRef.current[station.label]) {
        const el = document.createElement('div');
        el.className = `station-marker marker-${station.type}`;
        el.style.display = 'flex';
        el.style.flexDirection = 'column';
        el.style.alignItems = 'center';
        el.style.cursor = 'grab';

        const dot = document.createElement('div');
        dot.style.width = station.type === 'master' ? '22px' : '18px';
        dot.style.height = station.type === 'master' ? '22px' : '18px';
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
        tag.style.fontSize = '10px';
        tag.style.fontWeight = '700';
        tag.style.color = '#f4f4f5';
        tag.style.background = 'rgba(24, 24, 27, 0.85)';
        tag.style.padding = '1px 5px';
        tag.style.borderRadius = '4px';
        tag.style.marginTop = '3px';
        tag.style.whiteSpace = 'nowrap';
        tag.style.border = '1px solid rgba(63, 63, 70, 0.6)';
        tag.style.fontFamily = 'monospace';

        el.appendChild(dot);
        el.appendChild(tag);

        const marker = new maplibregl.Marker({ element: el, draggable: true })
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
      }
    });

    // Remove deleted stations
    Object.keys(markersRef.current).forEach((label) => {
      if (!currentLabels.has(label)) {
        markersRef.current[label].remove();
        delete markersRef.current[label];
      }
    });
  }, [masters, slaves, receivers, mapMode, updateStation, evaluateReceivers]);

  // Synchronize Estimated Position Fix Markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    receivers.forEach((rx) => {
      const fix = receiverFixes[rx.label];
      const hasValidFix = fix && isValidLngLat(fix.lng, fix.lat) && fix.converged !== false && !fix.noSolution;

      if (hasValidFix) {
        if (!estMarkerRef.current[rx.label]) {
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
  }, [receivers, receiverFixes]);


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

      safeRemoveLayerAndSource(map, layerId, sourceId);

      map.addSource(sourceId, { type: 'geojson', data: geojson });
      map.addLayer({
        id: layerId,
        type: 'line',
        source: sourceId,
        paint: {
          'line-color': '#71717a',
          'line-width': 1.5,
          'line-opacity': 0.65,
          'line-dasharray': [3, 2],
        },
      });
    } catch (err) {
      console.warn('Failed to render baselines layer:', err);
    }

    return () => {
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

  // Switch basemap provider safely
  const handleSwitchProvider = (providerKey) => {
    const map = mapRef.current;
    if (!map) return;
    if (providerKey === 'carto-dark' && !CARTO_API_KEY) {
      setFallbackMessage('CARTO Dark requires VITE_CARTO_API_KEY in environment variables.');
      setShowFallbackNotice(true);
      return;
    }
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
      map.setStyle(getMapLibreStyle(providerKey));
    } catch (err) {
      console.warn('Error setting map style:', err);
    }
  };

  return (
    <div className="relative w-full h-full min-h-[500px] overflow-hidden select-none" style={{ background: 'var(--bg-canvas)' }}>
      <div ref={mapContainer} className="w-full h-full" />

      {/* Dismissible Fallback Notice */}
      {showFallbackNotice && (
        <div
          data-testid="radar-fallback-notice"
          className="absolute top-16 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs font-mono shadow-2xl backdrop-blur-md animate-fade-in"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--status-warn-border)', color: 'var(--status-warn)' }}
        >
          <span>{fallbackMessage || 'Basemap tiles unavailable. Switched to offline Radar Canvas.'}</span>
          <button
            onClick={() => setShowFallbackNotice(false)}
            className="font-bold px-1.5 py-0.5 rounded transition leading-none cursor-pointer"
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
        {Object.values(TILE_PROVIDERS).map((p) => (
          <button
            key={p.id}
            onClick={() => handleSwitchProvider(p.id)}
            className="px-2 sm:px-2.5 py-0.5 rounded-full transition-colors text-[10px] sm:text-[11px]"
            style={activeTileProvider === p.id
              ? { background: 'var(--accent-eloran-subtle)', color: 'var(--accent-eloran)', border: '1px solid var(--accent-eloran-border)', fontWeight: 700 }
              : { color: 'var(--text-muted)', border: '1px solid transparent' }
            }
          >
            {p.id === 'openfreemap-dark'
              ? 'OpenFreeMap'
              : p.id === 'osm-standard'
              ? 'OSM'
              : p.id === 'carto-dark'
              ? (CARTO_API_KEY ? 'CARTO' : 'CARTO*')
              : 'Radar'}
          </button>
        ))}
      </div>

      {/* Collapsible Station Symbols Legend */}
      <div className="absolute bottom-8 sm:bottom-10 left-4 z-10 font-mono text-xs">
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
