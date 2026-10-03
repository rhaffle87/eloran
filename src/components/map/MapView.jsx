import React, { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useSimulationStore } from '../../state/simulationStore.js';
import { useThemeStore } from '../../state/themeStore.js';
import { haversineDistance, destinationPoint, initialBearing, isValidLngLat } from '../../lib/geodesy.js';
import {
  computeHyperbolicGDOP,
  isInsideBaselineExtension,
  generateBaselineExtensionSectors,
} from '../../lib/chainDesign.js';
import { computeGdopAsync } from '../../workers/workerClient.js';
import { getMapLibreStyle, TILE_PROVIDERS, DEFAULT_TILE_PROVIDER, CARTO_API_KEY } from '../../lib/tiles.js';
import AsfHeatmapLayer from './AsfHeatmapLayer.jsx';
import { computeCovarianceEllipse } from '../../lib/fusion.js';
import { computeTerrainMasking } from '../../lib/terrainMasking.js';
import { fetchElevationProfile } from '../../lib/elevationProfile.js';
import { ROTTERDAM_APPROACH_WAYPOINTS, DOVER_STRAIT_TSS_WAYPOINTS, YELLOW_SEA_CORRIDOR_WAYPOINTS } from '../../lib/trajectory.js';

function isMapStyleReady(map) {
  return Boolean(map && map.style && typeof map.isStyleLoaded === 'function' && map.isStyleLoaded());
}


function getGdopContourFilter(selectedLevel) {
  if (!selectedLevel || selectedLevel === 'all') {
    return ['all'];
  }
  const num = parseFloat(selectedLevel);
  return ['==', ['get', 'level'], num];
}

export default function MapView({ onMapClick, isELoran = false }) {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef({});
  const estMarkerRef = useRef({});
  const radarCanvasRef = useRef(null);
  const [mapInstance, setMapInstance] = useState(null);
  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;

  const effectiveTheme = useThemeStore((s) => s.effectiveTheme);

  const [activeTileProvider, setActiveTileProvider] = useState(() => {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        // One-time session migration: migrate legacy 'loran_offline_radar' to canonical 'simuloran_offline_radar'
        const legacy = window.sessionStorage.getItem('loran_offline_radar');
        if (legacy !== null) {
          window.sessionStorage.setItem('simuloran_offline_radar', legacy);
          window.sessionStorage.removeItem('loran_offline_radar');
        }
        if (window.sessionStorage.getItem('simuloran_offline_radar') === 'true') {
          return 'offline-radar';
        }
      }
    } catch {
      // ignore
    }
    return DEFAULT_TILE_PROVIDER;
  });
  const [showFallbackNotice, setShowFallbackNotice] = useState(false);
  const [fallbackMessage, setFallbackMessage] = useState('');
  const [showLegend, setShowLegend] = useState(() => (typeof window !== 'undefined' ? window.innerWidth >= 1024 : true));
  const [radarShowRadials, setRadarShowRadials] = useState(false);
  const [radarShowGraticule, setRadarShowGraticule] = useState(true);

  const tileErrorsRef = useRef([]);
  const hasTileLoadedRef = useRef(false);
  const activeTileProviderRef = useRef(activeTileProvider);
  activeTileProviderRef.current = activeTileProvider;
  const currentStyleKeyRef = useRef(`${activeTileProvider}:${effectiveTheme}`);

  const triggerNextFallback = useCallback(() => {
    const current = activeTileProviderRef.current;
    if (current === 'offline-radar') return;

    if (current === 'openfreemap-dark') {
      console.warn('SIMULORAN: OpenFreeMap vector service unreachable. Auto-switched to OpenStreetMap raster fallback.');
      setActiveTileProvider('osm-standard');
      activeTileProviderRef.current = 'osm-standard';
      hasTileLoadedRef.current = false;
      tileErrorsRef.current = [];
      setFallbackMessage('OpenFreeMap unavailable. Switched to OpenStreetMap fallback.');
      setShowFallbackNotice(true);
      const map = mapRef.current;
      if (map) {
        currentStyleKeyRef.current = `osm-standard:${effectiveTheme}`;
        try {
          map.setStyle(getMapLibreStyle('osm-standard', effectiveTheme));
        } catch (err) {
          console.warn('Error applying OSM fallback style:', err);
        }
      }
    } else {
      console.warn('SIMULORAN: Basemap network unreachable. Auto-switched to offline Radar Canvas fallback.');
      try {
        if (typeof window !== 'undefined' && window.sessionStorage) {
          sessionStorage.setItem('simuloran_offline_radar', 'true');
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
        currentStyleKeyRef.current = `offline-radar:${effectiveTheme}`;
        try {
          map.setStyle(getMapLibreStyle('offline-radar', effectiveTheme));
        } catch (err) {
          console.warn('Error applying offline radar style:', err);
        }
      }
    }
  }, [effectiveTheme]);

  const handleDismissFallbackNotice = () => {
    setShowFallbackNotice(false);
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        sessionStorage.setItem('loran_notice_dismissed', 'true');
        if (fallbackMessage.includes('CARTO')) {
          sessionStorage.setItem('loran_carto_notice_dismissed', 'true');
        }
      }
    } catch {
      // ignore
    }
  };

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
    gdopLayerVisible,
    receiverFixes,
    updateStation,
    evaluateReceivers,
    isDesignMode,
    designChain,
    designParams,
    showBaselineExtensions,
    showCrossingAngles,
    updateDesignMaster,
    updateDesignSecondary,
    stationStatus = {},
    settings,
    isConsoleOpen,
    setGdopSelectedLevel,
    setGdopHeatmapVisible,
    setGdopContoursVisible,
  } = useSimulationStore();

  const stationsRef = useRef({ masters, slaves });
  stationsRef.current = { masters, slaves };

  const designRef = useRef({ isDesignMode, designChain, designParams, showCrossingAngles });
  designRef.current = { isDesignMode, designChain, designParams, showCrossingAngles };

  const baselinesVisibleRef = useRef(baselinesVisible);
  baselinesVisibleRef.current = baselinesVisible;
  const lopsVisibleRef = useRef(lopsVisible);
  lopsVisibleRef.current = lopsVisible;
  const gdopVisibleRef = useRef(gdopLayerVisible);
  gdopVisibleRef.current = gdopLayerVisible;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const overlayRenderersRef = useRef({
    baselines: null,
    extensions: null,
    lops: null,
    gdop: null,
  });

  const [cursorPos, setCursorPos] = useState(null);
  const [cursorGdop, setCursorGdop] = useState(null);
  const [cursorCrossing, setCursorCrossing] = useState(null);
  const [isInBaselineExtension, setIsInBaselineExtension] = useState(false);

  const initialCenterRef = useRef(mapCenter);
  const initialZoomRef = useRef(mapZoom);

  // Initialize Map safely
  useEffect(() => {
    if (mapRef.current || !mapContainer.current) return;

    const handleGlobalMapResize = () => {
      if (mapRef.current) {
        mapRef.current.resize();
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('simuloran:map:resize', handleGlobalMapResize);
    }

    let mapInstance = null;
    try {
      mapInstance = new maplibregl.Map({
        container: mapContainer.current,
        style: getMapLibreStyle(activeTileProvider, effectiveTheme),
        center: initialCenterRef.current || [106.816666, -6.200000],
        zoom: initialZoomRef.current || 8,
        attributionControl: false,
        trackResize: false, // Prevent continuous GPU canvas thrashing during CSS drawer transitions
      });

      mapInstance.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'bottom-right');
      mapInstance.addControl(new maplibregl.ScaleControl({ maxWidth: 200, unit: 'metric' }), 'bottom-left');
      mapInstance.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

      // Self-healing overlay recovery:
      // MapLibre emits 'styledata' whenever a style is loaded or updated via map.setStyle().
      // If any active overlay layers were removed by MapLibre during setStyle(),
      // this handler detects their absence and re-adds them once the style is ready.
      const handleStyleData = () => {
        if (!isMapStyleReady(mapInstance)) return;
        if (baselinesVisibleRef.current && !mapInstance.getLayer('loran-baselines-layer')) {
          overlayRenderersRef.current.baselines?.();
        }
        if (designRef.current?.showBaselineExtensions && !mapInstance.getLayer('loran-baseline-ext-0')) {
          overlayRenderersRef.current.extensions?.();
        }
        if (lopsVisibleRef.current && !mapInstance.getLayer('loran-lops-layer')) {
          overlayRenderersRef.current.lops?.();
        }
        if (gdopVisibleRef.current && !mapInstance.getLayer('loran-gdop-heatmap-layer')) {
          overlayRenderersRef.current.gdop?.();
        }
      };

      mapInstance.on('load', handleStyleData);
      mapInstance.on('style.load', handleStyleData);
      mapInstance.on('styledata', handleStyleData);
      mapInstance.on('idle', handleStyleData);

      mapInstance.on('error', (e) => {
        const errMsg = e?.error?.message || '';

        // If tiles are being aborted during rapid panning, ignore
        if (/abort|cancel/i.test(errMsg) || e?.error?.name === 'AbortError') {
          return;
        }

        const currentProvider = activeTileProviderRef.current;
        if (currentProvider === 'offline-radar') return;

        // On openfreemap-dark: trigger fallback on OFM tile/source errors
        if (currentProvider === 'openfreemap-dark') {
          const isOfmError = Boolean(
            e?.sourceId === 'openmaptiles' ||
            e?.sourceId === 'ne2_shaded' ||
            (errMsg && /openfreemap|planet|ne2/i.test(errMsg)) ||
            (e?.error && (e.error.status || /failed|fetch|network|net::ERR|blocked|csp/i.test(errMsg)))
          );
          if (isOfmError && !hasTileLoadedRef.current) {
            triggerNextFallback();
          }
          return;
        }

        // On osm-standard: ignore lingering errors from openfreemap; trigger on OSM errors
        if (currentProvider === 'osm-standard') {
          if (/openfreemap|planet|ne2/i.test(errMsg || e?.sourceId || '')) {
            return;
          }
          const isOsmError = Boolean(
            e?.sourceId === 'basemap-tiles' ||
            (errMsg && /openstreetmap|tile\.open/i.test(errMsg)) ||
            (e?.error && (e.error.status || /failed|fetch|network|net::ERR|blocked|csp/i.test(errMsg)))
          );
          if (isOsmError) {
            triggerNextFallback();
          }
          return;
        }
      });

      const handleTileLoaded = (e) => {
        const isBasemapSource = e.sourceId === 'openmaptiles' || e.sourceId === 'basemap-tiles';
        if (isBasemapSource && e.tile && (e.tile.state === 'loaded' || e.tile.state === 'ready')) {
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

        const { isDesignMode: inDesign, designChain: dc } = designRef.current;
        const activeMaster = inDesign ? dc.master : stationsRef.current.masters[0];
        const activeSecondaries = inDesign ? dc.secondaries : stationsRef.current.slaves;

        if (activeMaster && activeSecondaries && activeSecondaries.length >= 2) {
          const sigmaUs = inDesign ? (dc.tdSigmaUs || 0.1) : 0.1;
          const gdopRes = computeHyperbolicGDOP({ lat, lng }, activeMaster, activeSecondaries, sigmaUs);
          setCursorGdop(gdopRes.valid ? gdopRes.gdop : null);
          setCursorCrossing(gdopRes.minCrossingAngleDeg ?? null);

          let inExt = false;
          const halfWidth = designRef.current.designParams?.hazardConeHalfAngleDeg || 10;
          for (const sec of activeSecondaries) {
            if (isInsideBaselineExtension({ lat, lng }, activeMaster, sec, halfWidth).isExtension) {
              inExt = true;
              break;
            }
          }
          setIsInBaselineExtension(inExt);
        } else {
          setCursorGdop(null);
          setCursorCrossing(null);
          setIsInBaselineExtension(false);
        }
      });

      mapInstance.on('click', (e) => {
        onMapClickRef.current?.(e.lngLat);
      });

      mapRef.current = mapInstance;
      setMapInstance(mapInstance);
      currentStyleKeyRef.current = `${activeTileProvider}:${effectiveTheme}`;
      if (typeof window !== 'undefined' && (typeof __E2E_HOOKS__ !== 'undefined' ? __E2E_HOOKS__ : import.meta.env.DEV)) {
        window.__maplibreInstance = mapInstance;
      }
    } catch (err) {
      console.error('Failed to initialize MapLibre map:', err);
    }

    let resizeDebounceTimer = null;
    const handleWindowResize = () => {
      if (resizeDebounceTimer) clearTimeout(resizeDebounceTimer);
      resizeDebounceTimer = setTimeout(() => {
        if (mapRef.current) {
          mapRef.current.resize();
        }
      }, 120);
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', handleWindowResize);
    }

    return () => {
      if (resizeDebounceTimer) {
        clearTimeout(resizeDebounceTimer);
      }
      // epoch: overlay effects re-run when style.load fires after remount
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', handleWindowResize);
        window.removeEventListener('simuloran:map:resize', handleGlobalMapResize);
        if (typeof __E2E_HOOKS__ !== 'undefined' ? __E2E_HOOKS__ : import.meta.env.DEV) {
          delete window.__maplibreInstance;
        }
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
        setMapInstance(null);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dynamic theme switching for OpenFreeMap and Offline Radar basemaps
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const styleKey = `${activeTileProvider}:${effectiveTheme}`;
    if (currentStyleKeyRef.current === styleKey) return;
    currentStyleKeyRef.current = styleKey;

    if (activeTileProvider === 'openfreemap-dark' || activeTileProvider === 'openfreemap' || activeTileProvider === 'offline-radar') {
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
    const allStations = isDesignMode
      ? [
          { ...designChain.master, type: 'master', isDesign: true },
          ...designChain.secondaries.map((s, idx) => ({ ...s, type: 'slave', isDesign: true, designIndex: idx })),
        ]
      : [
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
        const stStatus = stationStatus[station.label] || 'nominal';
        if (stStatus === 'failed') {
          el.style.opacity = '0.35';
          el.style.filter = 'grayscale(100%)';
        } else if (stStatus === 'degraded') {
          el.style.opacity = '0.9';
          el.style.filter = 'none';
          el.style.boxShadow = '0 0 10px rgba(245, 158, 11, 0.7)';
        } else {
          el.style.opacity = '1';
          el.style.filter = 'none';
          el.style.boxShadow = 'none';
        }
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
          if (station.isDesign) {
            if (station.type === 'master') {
              updateDesignMaster({ lat: parseFloat(lngLat.lat.toFixed(4)), lng: parseFloat(lngLat.lng.toFixed(4)) });
            } else {
              updateDesignSecondary(station.designIndex, { lat: parseFloat(lngLat.lat.toFixed(4)), lng: parseFloat(lngLat.lng.toFixed(4)) });
            }
          } else {
            updateStation(station.label, { lat: lngLat.lat, lng: lngLat.lng });
            setTimeout(() => evaluateReceivers(), 50);
          }
        });

        el.addEventListener('click', (e) => {
          e.stopPropagation();
          if (mapMode === 'pan' && isValidLngLat(station.lng, station.lat)) {
            const popupContent = station.isDesign ? `
              <div class="space-y-1">
                <div style="font-family:monospace;font-weight:700;font-size:12px;color:var(--accent-loran-c)">PROPOSED ${station.label} (${station.type.toUpperCase()})</div>
                <div style="font-size:11px;color:var(--text-secondary)">Lat: ${station.lat.toFixed(5)}°</div>
                <div style="font-size:11px;color:var(--text-secondary)">Lng: ${station.lng.toFixed(5)}°</div>
                ${station.codingDelayUs ? `<div style="font-size:11px;color:var(--text-muted)">Coding Delay: ${station.codingDelayUs} µs</div>` : ''}
                <div style="font-size:10px;color:var(--accent-loran-c);margin-top:4px;">Drag marker on map to reposition</div>
              </div>
            ` : `
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
          const stStatus = stationStatus[station.label] || 'nominal';
          if (stStatus === 'failed') {
            existingEl.style.opacity = '0.35';
            existingEl.style.filter = 'grayscale(100%)';
          } else if (stStatus === 'degraded') {
            existingEl.style.opacity = '0.9';
            existingEl.style.filter = 'none';
            existingEl.style.boxShadow = '0 0 10px rgba(245, 158, 11, 0.7)';
          } else {
            existingEl.style.opacity = '1';
            existingEl.style.filter = 'none';
            existingEl.style.boxShadow = 'none';
          }
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
  }, [
    masters,
    slaves,
    receivers,
    designChain,
    isDesignMode,
    mapMode,
    updateStation,
    updateDesignMaster,
    updateDesignSecondary,
    evaluateReceivers,
    stationStatus,
  ]);

  // Synchronize Estimated Position Fix Markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (isDesignMode) {
      Object.values(estMarkerRef.current).forEach((m) => {
        try { m.remove(); } catch { /* ignore */ }
      });
      estMarkerRef.current = {};
      return;
    }

    const activeRxLabels = new Set(receivers.map((r) => r.label));
    Object.keys(estMarkerRef.current).forEach((label) => {
      if (!activeRxLabels.has(label)) {
        try { estMarkerRef.current[label].remove(); } catch { /* ignore */ }
        delete estMarkerRef.current[label];
      }
    });

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
  }, [receivers, receiverFixes, isDesignMode]);


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
    if (!map) return;

    let cancelled = false;
    const sourceId = 'loran-baselines-source';
    const layerId = 'loran-baselines-layer';

    const activeMaster = isDesignMode ? designChain.master : masters[0];
    const activeSecondaries = isDesignMode ? designChain.secondaries : slaves;

    if (!baselinesVisible || !activeMaster || !activeSecondaries || !activeSecondaries.length) {
      overlayRenderersRef.current.baselines = null;
      safeRemoveLayerAndSource(map, layerId, sourceId);
      return;
    }

    const render = () => {
      if (cancelled) return;
      if (!isMapStyleReady(map)) {
        return;
      }

      try {
        const features = [];

        activeSecondaries.forEach((slave, sidx) => {
          const d = haversineDistance(activeMaster, slave);
          const b = initialBearing(activeMaster, slave);
          const ext = destinationPoint(slave, d * 0.5, b);

          features.push({
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: [
                [activeMaster.lng, activeMaster.lat],
                [slave.lng, slave.lat],
                [ext.lng, ext.lat],
              ],
            },
            properties: {
              id: `baseline-${sidx}`,
              label: `${activeMaster.label}-${slave.label}`,
              lengthKm: (d / 1000).toFixed(1),
            },
          });
        });

        const geojson = { type: 'FeatureCollection', features };
        if (typeof window !== 'undefined' && (typeof __E2E_HOOKS__ !== 'undefined' ? __E2E_HOOKS__ : import.meta.env.DEV)) {
          window.__baselineGeoJson = geojson;
        }

        safeRemoveLayerAndSource(map, layerId, sourceId);

        map.addSource(sourceId, { type: 'geojson', data: geojson });
        map.addLayer({
          id: layerId,
          type: 'line',
          source: sourceId,
          paint: {
            'line-color': isDesignMode ? '#f59e0b' : '#06b6d4',
            'line-width': isDesignMode ? 2.2 : 1.8,
            'line-opacity': 0.85,
            'line-dasharray': [4, 3],
          },
        });
      } catch (err) {
        console.warn('Failed to render baselines layer:', err);
      }
    };

    const renderers = overlayRenderersRef.current;
    renderers.baselines = render;
    render();

    return () => {
      cancelled = true;
      renderers.baselines = null;
      map.off('styledata', render);
      map.off('idle', render);
      if (typeof window !== 'undefined') {
        delete window.__baselineGeoJson;
      }
      safeRemoveLayerAndSource(map, layerId, sourceId);
    };
  }, [masters, slaves, designChain, isDesignMode, baselinesVisible, safeRemoveLayerAndSource, activeTileProvider]);

  // Render Baseline Extension Hazard Sectors (±7.5° wedges)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    let cancelled = false;
    const fillSourceId = 'loran-baseline-ext-source';
    const fillLayerId = 'loran-baseline-ext-fill';
    const lineLayerId = 'loran-baseline-ext-line';

    const shouldShow = showBaselineExtensions || isDesignMode;
    const activeMaster = isDesignMode ? designChain.master : masters[0];
    const activeSecondaries = isDesignMode ? designChain.secondaries : slaves;

    if (!shouldShow || !activeMaster || !activeSecondaries || !activeSecondaries.length) {
      overlayRenderersRef.current.extensions = null;
      safeRemoveLayerAndSource(map, lineLayerId, fillSourceId);
      safeRemoveLayerAndSource(map, fillLayerId, fillSourceId);
      return;
    }

    let clickHandler = null;

    const render = () => {
      if (cancelled) return;
      if (!isMapStyleReady(map)) {
        return;
      }

      try {
        const halfWidth = designParams?.hazardConeHalfAngleDeg || 10;
        const geojson = generateBaselineExtensionSectors(activeMaster, activeSecondaries, 800000, halfWidth);
        safeRemoveLayerAndSource(map, lineLayerId, fillSourceId);
        safeRemoveLayerAndSource(map, fillLayerId, fillSourceId);

        map.addSource(fillSourceId, { type: 'geojson', data: geojson });
        map.addLayer({
          id: fillLayerId,
          type: 'fill',
          source: fillSourceId,
          paint: {
            'fill-color': '#f59e0b',
            'fill-opacity': 0.14,
          },
        });
        map.addLayer({
          id: lineLayerId,
          type: 'line',
          source: fillSourceId,
          paint: {
            'line-color': '#ef4444',
            'line-width': 1.5,
            'line-opacity': 0.75,
            'line-dasharray': [3, 2],
          },
        });

        clickHandler = (e) => {
          const feat = e.features?.[0];
          if (!feat) return;
          const p = feat.properties;
          const content = `
            <div class="font-mono text-xs">
              <div class="font-bold text-[var(--status-warn)] mb-1">Baseline Extension Hazard Zone</div>
              <div class="text-[11px] text-[var(--text-secondary)]">Station: ${p.stationId || ''} (${p.stationRole || ''})</div>
              <div class="text-[10px] text-[var(--text-muted)] mt-1">${p.description || 'Ambiguous hyperbolic gradient.'}</div>
            </div>
          `;
          new maplibregl.Popup({ offset: 10 }).setLngLat(e.lngLat).setHTML(content).addTo(map);
        };

        map.on('click', fillLayerId, clickHandler);
      } catch (err) {
        console.warn('Failed to render baseline extensions layer:', err);
      }
    };

    const renderers = overlayRenderersRef.current;
    renderers.extensions = render;
    render();

    return () => {
      cancelled = true;
      renderers.extensions = null;
      map.off('styledata', render);
      map.off('idle', render);
      if (clickHandler) {
        try { map.off('click', fillLayerId, clickHandler); } catch { /* ignore */ }
      }
      safeRemoveLayerAndSource(map, lineLayerId, fillSourceId);
      safeRemoveLayerAndSource(map, fillLayerId, fillSourceId);
    };
  }, [
    masters,
    slaves,
    designChain,
    isDesignMode,
    showBaselineExtensions,
    designParams,
    safeRemoveLayerAndSource,
  ]);

  // Render Hyperbolic LOP Contours Layer safely once style is fully loaded
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    let cancelled = false;
    const sourceId = 'loran-lops-source';
    const layerId = 'loran-lops-layer';

    if (!lopsVisible || !contours.length) {
      overlayRenderersRef.current.lops = null;
      safeRemoveLayerAndSource(map, layerId, sourceId);
      return;
    }

    let clickHandler = null;

    const render = () => {
      if (cancelled) return;
      if (!isMapStyleReady(map)) {
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

        clickHandler = (e) => {
          const feat = e.features?.[0];
          if (!feat) return;
          const p = feat.properties;
          const content = `
            <div class="font-mono text-xs">
              <div class="font-bold text-[var(--accent-eloran)] mb-1">Hyperbolic Line of Position (LOP)</div>
              <div class="text-[var(--text-secondary)]">Master index: ${p.masterIndex} | Secondary: ${p.slaveIndex}</div>
              <div class="text-[var(--text-secondary)]">Delay offset: ${(p.levelMeters || 0).toFixed(0)} m</div>
              <div class="text-[var(--text-secondary)]">TDOA: ${(p.levelSeconds || 0).toExponential(3)} s</div>
            </div>
          `;
          new maplibregl.Popup().setLngLat(e.lngLat).setHTML(content).addTo(map);
        };

        map.on('click', layerId, clickHandler);
      } catch (err) {
        console.warn('Failed to render LOP contours layer:', err);
      }
    };

    const renderers = overlayRenderersRef.current;
    renderers.lops = render;
    render();

    return () => {
      cancelled = true;
      renderers.lops = null;
      map.off('styledata', render);
      map.off('idle', render);
      if (clickHandler) {
        try {
          map.off('click', layerId, clickHandler);
        } catch {
          // ignore
        }
      }
      safeRemoveLayerAndSource(map, layerId, sourceId);
    };
  }, [contours, lopsVisible, isELoran, safeRemoveLayerAndSource]);

  // Render Live GDOP Coverage & Iso-Contours Layer — static station geometry, zero viewport drift
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    let cancelled = false;
    const heatmapSourceId = 'loran-gdop-heatmap-source';
    const heatmapLayerId = 'loran-gdop-heatmap-layer';
    const contoursSourceId = 'loran-gdop-contours-source';
    const contoursCasingLayerId = 'loran-gdop-contours-casing';
    const contoursLayerId = 'loran-gdop-contours-layer';

    const activeMaster = isDesignMode ? designChain.master : masters[0];
    const activeSecondaries = isDesignMode ? designChain.secondaries : slaves;

    if (!gdopLayerVisible || !activeMaster || !activeSecondaries || !activeSecondaries.length) {
      overlayRenderersRef.current.gdop = null;
      safeRemoveLayerAndSource(map, contoursLayerId, null);
      safeRemoveLayerAndSource(map, contoursCasingLayerId, contoursSourceId);
      safeRemoveLayerAndSource(map, heatmapLayerId, heatmapSourceId);
      return;
    }

    const render = () => {
      if (cancelled) return;
      if (!isMapStyleReady(map)) {
        return;
      }

      try {
        // Static geographic coverage domain: fixed strictly to physical station geometry,
        // independent of map camera viewport or user zoom/pan.
        const _lats = [activeMaster.lat, ...activeSecondaries.map((s) => s.lat)];
        const _lngs = [activeMaster.lng, ...activeSecondaries.map((s) => s.lng)];
        const stMinLat = Math.min(..._lats), stMaxLat = Math.max(..._lats);
        const stMinLng = Math.min(..._lngs), stMaxLng = Math.max(..._lngs);
        const latSpan = Math.max(stMaxLat - stMinLat, 1.0);
        const lngSpan = Math.max(stMaxLng - stMinLng, 1.0);

        // Fixed margin beyond outermost transmitters (+40% of baseline span or min 3.5 deg)
        // Strictly anchors the GDOP coverage region to physical station geometry,
        // preventing map zoom/pan from re-computing or blowing up the heatmap across continents.
        const latMargin = Math.max(latSpan * 0.40, 3.5);
        const lngMargin = Math.max(lngSpan * 0.50, 4.5);
        const bbox = {
          minLat: Math.max(-85,    stMinLat - latMargin),
          maxLat: Math.min(85,     stMaxLat + latMargin),
          minLng: Math.max(-179.9, stMinLng - lngMargin),
          maxLng: Math.min(179.9,  stMaxLng + lngMargin),
        };

        // High-fidelity uniform mesh keyed to geometric aspect ratio
        const _aspect = (lngSpan + 2 * lngMargin) / Math.max(latSpan + 2 * latMargin, 0.01);
        const nx = Math.max(90, Math.min(180, Math.round(Math.sqrt(18000 * _aspect))));
        const ny = Math.max(70, Math.min(150, Math.round(Math.sqrt(18000 / _aspect))));

        // Offload GDOP grid & Iso-GDOP contour generation to dedicated physics worker
        computeGdopAsync({
          master: activeMaster,
          secondaries: activeSecondaries,
          bbox,
          nx,
          ny,
          contourLevels: [1.5, 3.0, 7.7, 10.92],
          includeHeatmap: true,
        }).then((result) => {
          if (cancelled || !isMapStyleReady(map) || !result) return;

          const { contoursGeoJson, heatmapGeoJson } = result;

          if (typeof window !== 'undefined' && (typeof __E2E_HOOKS__ !== 'undefined' ? __E2E_HOOKS__ : import.meta.env.DEV)) {
            window.__gdopGeoJson = heatmapGeoJson;
            window.__gdopContoursGeoJson = contoursGeoJson;
          }

          const s = settingsRef.current;
          const heatmapVisible = gdopLayerVisible && (s?.gdopHeatmapVisible ?? true);
          const contoursVisible = gdopLayerVisible && (s?.gdopContoursVisible ?? true);
          const contourFilter = getGdopContourFilter(s?.gdopSelectedLevel);
          const heatmapOpacity = typeof s?.gdopHeatmapOpacity === 'number' ? s.gdopHeatmapOpacity : 0.45;

          // 1. Render GDOP Heatmap Layer with calibrated geographic radius
          safeRemoveLayerAndSource(map, heatmapLayerId, heatmapSourceId);
          if (heatmapGeoJson && heatmapGeoJson.features?.length) {
            map.addSource(heatmapSourceId, { type: 'geojson', data: heatmapGeoJson });
            map.addLayer({
              id: heatmapLayerId,
              type: 'heatmap',
              source: heatmapSourceId,
              paint: {
                // Weight: good-GDOP zones hot; poor-GDOP dims to zero naturally
                'heatmap-weight': [
                  'interpolate', ['linear'], ['get', 'gdop'],
                  1, 1.00, 2, 0.90, 4, 0.70, 8, 0.40, 16, 0.15,
                ],
                // Intensity gently scales with zoom without exploding screen pixels
                'heatmap-intensity': [
                  'interpolate', ['linear'], ['zoom'],
                  1, 0.5, 4, 0.8, 7, 1.4, 10, 2.2,
                ],
                'heatmap-color': [
                  'interpolate', ['linear'], ['heatmap-density'],
                  0,    'rgba(0, 0, 0, 0)',
                  0.10, 'rgba(56, 189, 248, 0.16)',
                  0.30, 'rgba(52, 211, 153, 0.38)',
                  0.55, 'rgba(250, 204, 21, 0.52)',
                  0.75, 'rgba(251, 146, 60, 0.65)',
                  0.90, 'rgba(248, 113, 113, 0.75)',
                  1.00, 'rgba(239, 68, 68, 0.85)',
                ],
                // Calibrated radius: scales smoothly from macro view to tactical zoom
                'heatmap-radius': [
                  'interpolate', ['linear'], ['zoom'],
                  2, 10, 5, 20, 8, 32, 11, 46,
                ],
                'heatmap-opacity': heatmapOpacity,
              },
              layout: {
                visibility: heatmapVisible ? 'visible' : 'none',
              },
            });
          }

          // 2. Render Smooth Iso-GDOP Vector Contours with Casing for High Contrast
          safeRemoveLayerAndSource(map, contoursLayerId, null);
          safeRemoveLayerAndSource(map, contoursCasingLayerId, contoursSourceId);

          if (contoursGeoJson && contoursGeoJson.features?.length) {
            map.addSource(contoursSourceId, { type: 'geojson', data: contoursGeoJson });

            // Casing layer for crisp outline separation against basemap and heatmap colors
            map.addLayer({
              id: contoursCasingLayerId,
              type: 'line',
              source: contoursSourceId,
              paint: {
                'line-color': '#030712',
                'line-width': [
                  'case',
                  ['==', ['get', 'level'], 10.92], 4.2,
                  ['==', ['get', 'level'], 1.5], 4.0,
                  3.4,
                ],
                'line-opacity': 0.85,
                'line-blur': 0,
              },
              filter: contourFilter,
              layout: {
                'line-cap': 'round',
                'line-join': 'round',
                visibility: contoursVisible ? 'visible' : 'none',
              },
            });

            // Fore-edge colored contour line
            map.addLayer({
              id: contoursLayerId,
              type: 'line',
              source: contoursSourceId,
              paint: {
                'line-color': ['get', 'color'],
                'line-width': [
                  'case',
                  ['==', ['get', 'level'], 10.92], 2.2,
                  ['==', ['get', 'level'], 1.5], 2.0,
                  1.6,
                ],
                'line-dasharray': [
                  'case',
                  ['==', ['get', 'level'], 10.92], ['literal', [3, 2]],
                  ['literal', [1]],
                ],
                'line-opacity': 0.95,
                'line-blur': 0,
              },
              filter: contourFilter,
              layout: {
                'line-cap': 'round',
                'line-join': 'round',
                visibility: contoursVisible ? 'visible' : 'none',
              },
            });
          }
        }).catch((err) => {
          if (!cancelled) {
            console.warn('Failed to compute or render GDOP layers via worker:', err);
          }
        });
      } catch (err) {
        console.warn('Failed to initiate GDOP render:', err);
      }
    };

    const renderers = overlayRenderersRef.current;
    renderers.gdop = render;
    render();

    return () => {
      cancelled = true;
      renderers.gdop = null;
      map.off('styledata', render);
      map.off('idle', render);
      if (typeof window !== 'undefined') {
        delete window.__gdopGeoJson;
        delete window.__gdopContoursGeoJson;
      }
      safeRemoveLayerAndSource(map, contoursLayerId, null);
      safeRemoveLayerAndSource(map, contoursCasingLayerId, contoursSourceId);
      safeRemoveLayerAndSource(map, heatmapLayerId, heatmapSourceId);
    };
  }, [
    masters,
    slaves,
    designChain,
    isDesignMode,
    gdopLayerVisible,
    safeRemoveLayerAndSource,
  ]);

  // Live interactive updates for GDOP filter & visibility without recomputing mesh
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapStyleReady(map)) return;

    const heatmapLayerId = 'loran-gdop-heatmap-layer';
    const contoursCasingLayerId = 'loran-gdop-contours-casing';
    const contoursLayerId = 'loran-gdop-contours-layer';

    const heatmapVisible = gdopLayerVisible && (settings?.gdopHeatmapVisible ?? true);
    const contoursVisible = gdopLayerVisible && (settings?.gdopContoursVisible ?? true);
    const filter = getGdopContourFilter(settings?.gdopSelectedLevel);
    const opacity = typeof settings?.gdopHeatmapOpacity === 'number' ? settings.gdopHeatmapOpacity : 0.45;

    try {
      if (map.getLayer(heatmapLayerId)) {
        map.setLayoutProperty(heatmapLayerId, 'visibility', heatmapVisible ? 'visible' : 'none');
        map.setPaintProperty(heatmapLayerId, 'heatmap-opacity', opacity);
      }
      if (map.getLayer(contoursCasingLayerId)) {
        map.setLayoutProperty(contoursCasingLayerId, 'visibility', contoursVisible ? 'visible' : 'none');
        map.setFilter(contoursCasingLayerId, filter);
      }
      if (map.getLayer(contoursLayerId)) {
        map.setLayoutProperty(contoursLayerId, 'visibility', contoursVisible ? 'visible' : 'none');
        map.setFilter(contoursLayerId, filter);
      }
    } catch (err) {
      console.warn('Error updating GDOP dynamic visibility/filter:', err);
    }
  }, [
    gdopLayerVisible,
    settings?.gdopHeatmapVisible,
    settings?.gdopContoursVisible,
    settings?.gdopSelectedLevel,
    settings?.gdopHeatmapOpacity,
  ]);

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
    if (radarShowGraticule) {
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
    }

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

    // 3. Radial Bearing Lines (cardinal by default; full 12 radials when toggled)
    const bearings = radarShowRadials
      ? [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]
      : [0, 90, 180, 270];
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
    ctx.fillText('RADAR 2D VECTOR BACKDROP · OFFLINE ZERO-NETWORK', 14, h - 14);

    ctx.restore();
  }, [activeTileProvider, effectiveTheme, radarShowRadials, radarShowGraticule]);

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
      try {
        if (typeof window !== 'undefined' && window.sessionStorage?.getItem('loran_carto_notice_dismissed') === 'true') {
          return;
        }
      } catch {
        // ignore
      }
      setFallbackMessage('CARTO is an optional commercial basemap requiring a VITE_CARTO_API_KEY environment variable. OpenFreeMap and OpenStreetMap are currently active and operational.');
      setShowFallbackNotice(true);
      return;
    }
    const map = mapRef.current;
    if (!map) return;
    setActiveTileProvider(providerKey);
    activeTileProviderRef.current = providerKey;
    // epoch: style.load will increment styleLoadEpoch when new provider loads
    if (providerKey !== 'offline-radar') {
      try {
        if (typeof window !== 'undefined' && window.sessionStorage) {
          sessionStorage.removeItem('simuloran_offline_radar');
          sessionStorage.removeItem('loran_offline_radar');
        }
      } catch {
        // ignore
      }
      hasTileLoadedRef.current = false;
      tileErrorsRef.current = [];
    }
    setShowFallbackNotice(false);
    currentStyleKeyRef.current = `${providerKey}:${effectiveTheme}`;
    try {
      map.setStyle(getMapLibreStyle(providerKey, effectiveTheme));
    } catch (err) {
      console.warn('Error setting map style:', err);
    }
  };
  // Render coverage hole overlay for failed transmitters
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const fillSourceId = 'failed-stations-source';
    const fillLayerId = 'failed-stations-fill';
    const lineLayerId = 'failed-stations-line';

    const renderFailedCoverage = () => {
      if (!isMapStyleReady(map)) return;

      const allTx = isDesignMode
        ? [{ ...designChain.master, type: 'master' }, ...designChain.secondaries.map((s) => ({ ...s, type: 'slave' }))]
        : [...masters.map((m) => ({ ...m, type: 'master' })), ...slaves.map((s) => ({ ...s, type: 'slave' }))];

      const failedList = allTx.filter((s) => (stationStatus[s.label] || 'nominal') === 'failed');

      if (failedList.length === 0) {
        if (map.getLayer(lineLayerId)) map.removeLayer(lineLayerId);
        if (map.getLayer(fillLayerId)) map.removeLayer(fillLayerId);
        if (map.getSource(fillSourceId)) map.removeSource(fillSourceId);
        return;
      }

      // Build 250km circle polygon for each failed station to indicate lost coverage area
      const features = failedList.map((st) => {
        const coords = [];
        for (let a = 0; a <= 360; a += 10) {
          const pt = destinationPoint(st, 250000, a);
          coords.push([pt.lng, pt.lat]);
        }
        return {
          type: 'Feature',
          properties: {
            stationLabel: st.label,
            type: st.type,
            name: st.name || st.label,
          },
          geometry: {
            type: 'Polygon',
            coordinates: [coords],
          },
        };
      });

      const geojson = {
        type: 'FeatureCollection',
        features,
      };

      if (map.getSource(fillSourceId)) {
        map.getSource(fillSourceId).setData(geojson);
      } else {
        map.addSource(fillSourceId, { type: 'geojson', data: geojson });

        map.addLayer({
          id: fillLayerId,
          type: 'fill',
          source: fillSourceId,
          paint: {
            'fill-color': '#ef4444',
            'fill-opacity': 0.16,
          },
        });

        map.addLayer({
          id: lineLayerId,
          type: 'line',
          source: fillSourceId,
          paint: {
            'line-color': '#ef4444',
            'line-width': 2,
            'line-dasharray': [3, 2],
            'line-opacity': 0.85,
          },
        });
      }
    };

    renderFailedCoverage();
    map.on('style.load', renderFailedCoverage);

    return () => {
      map.off('style.load', renderFailedCoverage);
    };
  }, [masters, slaves, designChain, isDesignMode, stationStatus]);


  // Render Covariance Error Ellipses (eLoran, GNSS, BLUE Fused)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const sourceId = 'fusion-ellipses-source';
    const fillLayerId = 'fusion-ellipses-fill';
    const lineLayerId = 'fusion-ellipses-line';

    const showEllipses = settings?.showCovarianceEllipses !== false;

    if (!showEllipses || isDesignMode) {
      safeRemoveLayerAndSource(map, lineLayerId, null);
      safeRemoveLayerAndSource(map, fillLayerId, sourceId);
      return;
    }

    const renderEllipses = () => {
      if (!isMapStyleReady(map)) return;

      const features = [];

      receivers.forEach((rx) => {
        const fix = receiverFixes[rx.label];
        if (!fix) return;

        // 1. eLoran Error Ellipse
        const eloran = fix.eloranSol;
        if (eloran && eloran.covariance && eloran.converged && !eloran.noSolution) {
          const eloranCenter = { lat: eloran.lat, lng: eloran.lng };
          const eloranEllipse = computeCovarianceEllipse(eloranCenter, eloran.covariance, 2.45);
          if (eloranEllipse) {
            features.push({
              type: 'Feature',
              properties: {
                id: `ellipse-eloran-${rx.label}`,
                type: 'eloran',
                color: '#06b6d4', // Cyan
                label: `eLoran 95% (${rx.label}): ${eloranEllipse.semiMajorMeters.toFixed(1)}m`,
              },
              geometry: {
                type: 'Polygon',
                coordinates: [eloranEllipse.coordinates],
              },
            });
          }
        }

        // 2. GNSS Error Ellipse
        const gnss = fix.gnssFix;
        if (gnss && gnss.covariance && !gnss.noSolution) {
          const gnssCenter = { lat: gnss.lat, lng: gnss.lng };
          const gnssEllipse = computeCovarianceEllipse(gnssCenter, gnss.covariance, 2.45);
          if (gnssEllipse) {
            const gnssColor = gnss.status === 'jammed' ? '#f59e0b' : gnss.status === 'spoofed' ? '#ef4444' : '#10b981';
            features.push({
              type: 'Feature',
              properties: {
                id: `ellipse-gnss-${rx.label}`,
                type: 'gnss',
                color: gnssColor,
                label: `GNSS 95% (${rx.label}): ${gnssEllipse.semiMajorMeters.toFixed(1)}m`,
              },
              geometry: {
                type: 'Polygon',
                coordinates: [gnssEllipse.coordinates],
              },
            });
          }
        }

        // 3. Fused Error Ellipse
        const fused = fix.fusedFix || fix;
        if (fused && fused.covariance && !fused.noSolution) {
          const fusedCenter = { lat: fix.lat, lng: fix.lng };
          const fusedEllipse = computeCovarianceEllipse(fusedCenter, fused.covariance, 2.45);
          if (fusedEllipse) {
            features.push({
              type: 'Feature',
              properties: {
                id: `ellipse-fused-${rx.label}`,
                type: 'fused',
                color: '#a855f7', // Purple
                label: `BLUE Fused 95% (${rx.label}): ${fusedEllipse.semiMajorMeters.toFixed(1)}m`,
              },
              geometry: {
                type: 'Polygon',
                coordinates: [fusedEllipse.coordinates],
              },
            });
          }
        }
      });

      if (features.length === 0) {
        safeRemoveLayerAndSource(map, lineLayerId, null);
        safeRemoveLayerAndSource(map, fillLayerId, sourceId);
        return;
      }

      const geojson = { type: 'FeatureCollection', features };

      if (map.getSource(sourceId)) {
        map.getSource(sourceId).setData(geojson);
      } else {
        map.addSource(sourceId, { type: 'geojson', data: geojson });

        map.addLayer({
          id: fillLayerId,
          type: 'fill',
          source: sourceId,
          paint: {
            'fill-color': ['get', 'color'],
            'fill-opacity': 0.14,
          },
        });

        map.addLayer({
          id: lineLayerId,
          type: 'line',
          source: sourceId,
          paint: {
            'line-color': ['get', 'color'],
            'line-width': 1.8,
            'line-opacity': 0.85,
            'line-dasharray': [
              'case',
              ['==', ['get', 'type'], 'fused'],
              ['literal', [1, 0]],
              ['literal', [2, 2]],
            ],
          },
        });
      }
    };

    renderEllipses();
    map.on('style.load', renderEllipses);

    return () => {
      map.off('style.load', renderEllipses);
    };
  }, [receivers, receiverFixes, settings?.showCovarianceEllipses, isDesignMode, safeRemoveLayerAndSource]);

  // Render Terrain Masking / Obstacle Diffraction Signal Paths (ITU-R P.526)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const sourceId = 'terrain-paths-source';
    const clearLayerId = 'terrain-paths-clear';
    const blockedLayerId = 'terrain-paths-blocked';

    const enabled = Boolean(settings?.terrainMaskingEnabled);

    if (!enabled || isDesignMode) {
      safeRemoveLayerAndSource(map, clearLayerId, null);
      safeRemoveLayerAndSource(map, blockedLayerId, sourceId);
      return;
    }

    let isCancelled = false;

    const renderTerrainPaths = async () => {
      if (!isMapStyleReady(map)) return;

      const allTx = [
        ...masters.map((m) => ({ ...m, type: 'master' })),
        ...slaves.map((s) => ({ ...s, type: 'slave' })),
      ];

      if (allTx.length === 0 || receivers.length === 0) {
        safeRemoveLayerAndSource(map, clearLayerId, null);
        safeRemoveLayerAndSource(map, blockedLayerId, sourceId);
        return;
      }

      const features = [];

      for (const rx of receivers) {
        for (const tx of allTx) {
          if (!isValidLngLat(tx.lng, tx.lat) || !isValidLngLat(rx.lng, rx.lat)) continue;

          try {
            const profile = await fetchElevationProfile(
              { lat: tx.lat, lng: tx.lng },
              { lat: rx.lat, lng: rx.lng },
              16
            );
            if (isCancelled) return;

            const masking = computeTerrainMasking(profile, tx.antennaHeightM || 30, rx.antennaHeightM || 5);

            features.push({
              type: 'Feature',
              properties: {
                id: `terrain-path-${tx.label}-${rx.label}`,
                txLabel: tx.label,
                rxLabel: rx.label,
                blocked: Boolean(masking.blocked),
                diffractionLossDb: Number((masking.diffractionLossDb || 0).toFixed(1)),
                timingBiasUs: Number((masking.timingBiasUs || 0).toFixed(3)),
              },
              geometry: {
                type: 'LineString',
                coordinates: [
                  [tx.lng, tx.lat],
                  [rx.lng, rx.lat],
                ],
              },
            });
          } catch (err) {
            console.warn(`[TerrainMasking] Error calculating path ${tx.label}->${rx.label}:`, err);
          }
        }
      }

      if (isCancelled || !isMapStyleReady(map)) return;

      const geojson = {
        type: 'FeatureCollection',
        features,
      };

      if (map.getSource(sourceId)) {
        map.getSource(sourceId).setData(geojson);
      } else {
        map.addSource(sourceId, { type: 'geojson', data: geojson });

        map.addLayer({
          id: clearLayerId,
          type: 'line',
          source: sourceId,
          filter: ['!=', ['get', 'blocked'], true],
          paint: {
            'line-color': '#10b981',
            'line-width': 1.5,
            'line-opacity': 0.65,
          },
        });

        map.addLayer({
          id: blockedLayerId,
          type: 'line',
          source: sourceId,
          filter: ['==', ['get', 'blocked'], true],
          paint: {
            'line-color': '#ef4444',
            'line-width': 2.5,
            'line-opacity': 0.95,
            'line-dasharray': [3, 2],
          },
        });
      }
    };

    renderTerrainPaths();
    map.on('style.load', renderTerrainPaths);

    return () => {
      isCancelled = true;
      map.off('style.load', renderTerrainPaths);
    };
  }, [
    masters,
    slaves,
    receivers,
    settings?.terrainMaskingEnabled,
    isDesignMode,
    safeRemoveLayerAndSource,
  ]);


  const mapBottomClearance = isConsoleOpen ? '260px' : '48px';


    const legendBottomClearance = isConsoleOpen ? '292px' : '78px';


  


    return (


      <div


        className="relative w-full h-full min-h-[500px] overflow-hidden select-none"


        style={{


          background: 'var(--bg-canvas)',


          '--map-bottom-clearance': mapBottomClearance,


        }}


      >
      {/* Offline Radar 2D Vector Backdrop Canvas (underlay at z-index 0) */}
      <canvas
        ref={radarCanvasRef}
        data-testid="radar-backdrop-canvas"
        className="absolute inset-0 pointer-events-none w-full h-full"
        style={{
          zIndex: 0,
          display: activeTileProvider === 'offline-radar' ? 'block' : 'none',
        }}
      />
      {/* MapLibre WebGL container (overlay at z-index 1 with transparent background in radar mode) */}
      <div
        ref={mapContainer}
        className="w-full h-full relative"
        style={{
          zIndex: 1,
          backgroundColor: activeTileProvider === 'offline-radar' ? 'transparent' : undefined,
        }}
      />
      <AsfHeatmapLayer map={mapInstance} />

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
            onClick={handleDismissFallbackNotice}
            className="p-1 rounded-md transition text-xs font-bold shrink-0 cursor-pointer hover:bg-[var(--bg-subtle)]"
            style={{ color: 'var(--text-muted)' }}
            title="Dismiss notice"
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
            <span className="inline-block w-2 h-2 rounded-full animate-pulse"
              style={{ background: isDesignMode ? 'var(--accent-loran-c)' : 'var(--accent-eloran)' }}
            />
            <span className="uppercase tracking-wider text-[10px]" style={{ color: 'var(--text-dim)' }}>
              {isDesignMode ? 'CHAIN DESIGN:' : 'MODE:'}
            </span>
            <span className="font-bold uppercase" style={{ color: isDesignMode ? 'var(--accent-loran-c)' : 'var(--accent-eloran)' }}>
              {isDesignMode ? 'PLANNING' : mapMode}
            </span>
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
                style={{ color: cursorGdop < 3 ? 'var(--status-ok)' : cursorGdop < 10.92 ? 'var(--status-warn)' : 'var(--status-danger)' }}
                title="Hyperbolic GDOP = 2drms / 2drms* (USCG Spec Limit = 10.92)"
              >
                {cursorGdop}
              </span>
            </div>
          )}
          {cursorCrossing !== null && (
            <div className="hidden md:inline text-[11px]" style={{ color: 'var(--text-secondary)' }}>
              <span className="mr-1" style={{ color: 'var(--text-dim)' }}>θ:</span>
              <span
                className="font-bold"
                style={{ color: cursorCrossing >= 30 ? 'var(--status-ok)' : 'var(--status-danger)' }}
                title="LOP Crossing Angle θ (90° optimal, <30° degraded)"
              >
                {cursorCrossing.toFixed(0)}°
              </span>
            </div>
          )}
          {isInBaselineExtension && (
            <div
              className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider animate-pulse"
              style={{
                background: 'rgba(239, 68, 68, 0.15)',
                color: 'var(--status-danger)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
              }}
              title="Within ±7.5° baseline extension: hyperbolic gradient is degenerate"
            >
              ⚠ Baseline Extension
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
          const isRadar = p.id === 'offline-radar';
          return (
            <button
              key={p.id}
              onClick={() => handleSwitchProvider(p.id)}
              data-testid={isRadar ? 'basemap-radar' : `basemap-${p.id}`}
              title={
                isRadar
                  ? 'Offline Radar: Zero-network 2D navigation backdrop with calibrated range rings and bearing radials. Operates without internet connectivity.'
                  : isCartoUnset
                  ? 'CARTO Dark requires VITE_CARTO_API_KEY (optional commercial basemap). Click for setup details.'
                  : `Switch basemap provider to ${p.name}`
              }
              className="px-2 sm:px-2.5 py-0.5 rounded-full transition-colors text-[10px] sm:text-[11px] flex items-center gap-1 cursor-pointer"
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

      {/* Offline Radar Declutter & Feature Toggles */}
      {activeTileProvider === 'offline-radar' && (
        <div
          data-testid="radar-controls-pill"
          className="absolute top-26 sm:top-24 left-4 z-10 backdrop-blur-md rounded-full px-2.5 py-1 text-[10px] font-mono flex items-center gap-2 shadow-lg animate-fade-in"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', opacity: 0.95 }}
        >
          <span className="text-[9px] uppercase tracking-wider font-semibold" style={{ color: 'var(--accent-eloran)' }}>
            Offline 2D:
          </span>
          <button
            type="button"
            onClick={() => setRadarShowRadials((v) => !v)}
            data-testid="toggle-radar-radials"
            title="Toggle 30° radial bearing lines (default: cardinals only to minimize clutter)"
            className="px-2 py-0.5 rounded-full transition-colors text-[10px] cursor-pointer flex items-center gap-1"
            style={{
              background: radarShowRadials ? 'var(--accent-eloran-subtle)' : 'transparent',
              color: radarShowRadials ? 'var(--accent-eloran)' : 'var(--text-dim)',
              border: `1px solid ${radarShowRadials ? 'var(--accent-eloran-border)' : 'var(--border-subtle)'}`,
            }}
          >
            <span>Radials</span>
            <span className="font-bold">{radarShowRadials ? 'ON' : 'OFF'}</span>
          </button>
          <button
            type="button"
            onClick={() => setRadarShowGraticule((v) => !v)}
            data-testid="toggle-radar-graticule"
            title="Toggle geographic coordinate grid (lat/lng)"
            className="px-2 py-0.5 rounded-full transition-colors text-[10px] cursor-pointer flex items-center gap-1"
            style={{
              background: radarShowGraticule ? 'var(--accent-eloran-subtle)' : 'transparent',
              color: radarShowGraticule ? 'var(--accent-eloran)' : 'var(--text-dim)',
              border: `1px solid ${radarShowGraticule ? 'var(--accent-eloran-border)' : 'var(--border-subtle)'}`,
            }}
          >
            <span>Grid</span>
            <span className="font-bold">{radarShowGraticule ? 'ON' : 'OFF'}</span>
          </button>
        </div>
      )}

      {/* GDOP Coverage & Iso-Contours Quick-Inspector HUD */}
      {gdopLayerVisible && (
        <div
          data-testid="gdop-inspector-pill"
          className={`absolute left-4 z-10 backdrop-blur-md rounded-lg px-2.5 py-1.5 text-[11px] font-mono flex flex-wrap items-center gap-2 shadow-lg animate-fade-in ${
            activeTileProvider === 'offline-radar' ? 'top-38 sm:top-36' : 'top-26 sm:top-24'
          }`}
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', opacity: 0.95 }}
        >
          <div className="flex items-center gap-1.5 pr-1 border-r border-[var(--border-subtle)]">
            <span className="w-2 h-2 rounded-full" style={{ background: '#38bdf8' }} />
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">GDOP:</span>
          </div>

          {/* Heatmap surface toggle */}
          <button
            type="button"
            data-testid="gdop-toggle-heatmap"
            onClick={() => setGdopHeatmapVisible(!(settings?.gdopHeatmapVisible ?? true))}
            className="px-2 py-0.5 rounded text-[10px] cursor-pointer flex items-center gap-1 transition-colors"
            style={{
              background: (settings?.gdopHeatmapVisible ?? true) ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
              color: (settings?.gdopHeatmapVisible ?? true) ? '#38bdf8' : 'var(--text-dim)',
              border: `1px solid ${(settings?.gdopHeatmapVisible ?? true) ? '#38bdf8' : 'var(--border-subtle)'}`,
            }}
            title="Toggle GDOP continuous gradient surface"
          >
            <span>Heatmap</span>
            <span className="font-bold">{(settings?.gdopHeatmapVisible ?? true) ? 'ON' : 'OFF'}</span>
          </button>

          {/* Iso-Contours toggle */}
          <button
            type="button"
            data-testid="gdop-toggle-contours"
            onClick={() => setGdopContoursVisible(!(settings?.gdopContoursVisible ?? true))}
            className="px-2 py-0.5 rounded text-[10px] cursor-pointer flex items-center gap-1 transition-colors"
            style={{
              background: (settings?.gdopContoursVisible ?? true) ? 'rgba(52, 211, 153, 0.15)' : 'transparent',
              color: (settings?.gdopContoursVisible ?? true) ? '#10b981' : 'var(--text-dim)',
              border: `1px solid ${(settings?.gdopContoursVisible ?? true) ? '#10b981' : 'var(--border-subtle)'}`,
            }}
            title="Toggle Iso-GDOP threshold lines"
          >
            <span>Contours</span>
            <span className="font-bold">{(settings?.gdopContoursVisible ?? true) ? 'ON' : 'OFF'}</span>
          </button>

          {/* Individual Contour Level Filter Buttons */}
          {(settings?.gdopContoursVisible ?? true) && (
            <div className="flex items-center gap-1 pl-1 border-l border-[var(--border-subtle)]">
              <span className="text-[9px] uppercase text-[var(--text-dim)] mr-0.5">Filter:</span>
              {[
                { id: 'all', label: 'All', color: 'var(--text-primary)' },
                { id: '1.5', label: '1.5', color: '#10b981', title: 'Optimal (GDOP ≤ 1.5, Harbor/HEA)' },
                { id: '3.0', label: '3.0', color: '#38bdf8', title: 'Good (GDOP ≤ 3.0, Coastal)' },
                { id: '7.7', label: '7.7', color: '#f59e0b', title: 'Marginal (GDOP ≤ 7.7, Ocean)' },
                { id: '10.92', label: '10.92', color: '#ef4444', title: 'USCG Limit (GDOP ≤ 10.92)' },
              ].map((lvl) => {
                const isActive = (settings?.gdopSelectedLevel ?? 'all') === lvl.id;
                return (
                  <button
                    key={lvl.id}
                    type="button"
                    data-testid={`gdop-hud-level-${lvl.id}`}
                    onClick={() => setGdopSelectedLevel(lvl.id)}
                    title={lvl.title || 'Show all contour lines'}
                    className="px-1.5 py-0.5 rounded text-[10px] font-bold cursor-pointer transition-all"
                    style={{
                      background: isActive ? 'var(--bg-subtle)' : 'transparent',
                      color: lvl.color,
                      border: `1px solid ${isActive ? lvl.color : 'transparent'}`,
                      boxShadow: isActive ? `0 0 6px ${lvl.color}40` : 'none',
                    }}
                  >
                    {lvl.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Collapsible Station Symbols Legend — positioned cleanly above MapLibre scale control */}
      <div
        className="absolute bottom-12 left-2.5 z-10 font-mono text-xs transition-all duration-200"
        style={{ bottom: legendBottomClearance }}
      >
        {showLegend ? (
          <div
            className="backdrop-blur-md rounded-lg p-2.5 shadow-md space-y-1.5 text-[11px] animate-fade-in"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.12)',
            }}
          >
            <div className="flex items-center justify-between gap-3 text-[10px] uppercase font-bold tracking-wider mb-1" style={{ color: 'var(--text-dim)' }}>
              <span>Station Symbols</span>
              <button
                onClick={() => setShowLegend(false)}
                className="font-bold px-1 rounded cursor-pointer leading-none hover:text-[var(--text-primary)]"
                style={{ color: 'var(--text-dim)' }}
                title="Hide map symbols legend"
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
            {!isDesignMode && (
              <>
                <div className="flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                  <span className="w-2.5 h-2.5 rounded-full border border-white shrink-0" style={{ background: 'var(--status-ok)' }} /> True Receiver (R)
                </div>
                <div className="flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                  <span className="w-2.5 h-2.5 rounded-full border-2 shrink-0" style={{ borderColor: 'var(--status-danger)' }} /> Estimated PNT Fix
                </div>
                <div className="flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                  <span className="w-2.5 h-2.5 rounded-full border-2 shrink-0" style={{ borderColor: '#a855f7' }} /> BLUE 95% Covariance Ellipse
                </div>
                {settings?.terrainMaskingEnabled && (
                  <>
                    <div className="flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                      <span className="w-3 h-0.5 shrink-0" style={{ background: '#10b981' }} /> Terrain Path (Clear)
                    </div>
                    <div className="flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                      <span className="w-3 h-0.5 shrink-0 border-b-2 border-dashed" style={{ borderColor: '#ef4444' }} /> Masked Path (&gt;15 dB loss)
                    </div>
                  </>
                )}
              </>
            )}
            {(showBaselineExtensions || isDesignMode) && (
              <div className="flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                <span className="w-2.5 h-2.5 rounded-sm border shrink-0" style={{ borderColor: 'var(--status-danger)', background: 'var(--status-warn-subtle)' }} /> Baseline Extension (Hazard)
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={() => setShowLegend(true)}
            className="backdrop-blur-md rounded-md px-2 py-1 text-[10px] font-mono shadow-lg transition flex items-center gap-1.5 cursor-pointer hover:bg-[var(--bg-subtle)]"
            style={{ background: 'var(--bg-surface)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}
            title="Show map symbols legend"
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
