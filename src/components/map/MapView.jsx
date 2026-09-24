import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useSimulationStore } from '../../state/simulationStore.js';
import { haversineDistance, destinationPoint, initialBearing } from '../../lib/geodesy.js';
import { computeGDOPAtPoint } from '../../lib/gdop.js';

const TILE_URL = 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

export default function MapView({ onMapClick, isELoran = false }) {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef({});
  const estMarkerRef = useRef({});
  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;

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

  // Initialize Map
  useEffect(() => {
    if (mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          'carto-dark': {
            type: 'raster',
            tiles: [TILE_URL],
            tileSize: 256,
            attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
          },
        },
        layers: [
          {
            id: 'carto-dark-layer',
            type: 'raster',
            source: 'carto-dark',
            minzoom: 0,
            maxzoom: 19,
          },
        ],
      },
      center: initialCenterRef.current || [106.816666, -6.200000],
      zoom: initialZoomRef.current || 8,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 200, unit: 'metric' }), 'bottom-left');

    map.on('mousemove', (e) => {
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

    map.on('click', (e) => {
      onMapClickRef.current?.(e.lngLat);
    });

    mapRef.current = map;

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Update map view when preset changes
  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.flyTo({
      center: mapCenter,
      zoom: mapZoom,
      essential: true,
      duration: 1200,
    });
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
          if (mapMode === 'pan') {
            const popupContent = `
              <div class="space-y-1">
                <div class="font-bold text-cyan-400 text-xs">${station.label} (${station.type.toUpperCase()})</div>
                <div class="text-[11px] text-zinc-300">Lat: ${station.lat.toFixed(5)}°</div>
                <div class="text-[11px] text-zinc-300">Lng: ${station.lng.toFixed(5)}°</div>
                ${station.txDbm ? `<div class="text-[11px] text-zinc-400">Power: ${station.txDbm} dBm</div>` : ''}
                ${station.clock?.type ? `<div class="text-[11px] text-zinc-400">Clock: ${station.clock.type}</div>` : ''}
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
      if (fix && fix.lat !== undefined && fix.lng !== undefined) {
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
      } else if (estMarkerRef.current[rx.label]) {
        estMarkerRef.current[rx.label].remove();
        delete estMarkerRef.current[rx.label];
      }
    });
  }, [receivers, receiverFixes]);

  // Render Baselines Layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const sourceId = 'loran-baselines-source';
    const layerId = 'loran-baselines-layer';

    const safeRemove = () => {
      if (map.getLayer(layerId)) map.removeLayer(layerId);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
    };

    if (!baselinesVisible || !masters.length || !slaves.length) {
      safeRemove();
      return;
    }

    const features = [];
    const master = masters[0];

    slaves.forEach((slave, sidx) => {
      const d = haversineDistance(master, slave);
      const b = initialBearing(master, slave);
      // Baseline extension: 50% beyond secondary station
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

    safeRemove();
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
  }, [masters, slaves, baselinesVisible]);

  // Render Hyperbolic LOP Contours Layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const sourceId = 'loran-lops-source';
    const layerId = 'loran-lops-layer';

    const safeRemove = () => {
      if (map.getLayer(layerId)) map.removeLayer(layerId);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
    };

    if (!lopsVisible || !contours.length) {
      safeRemove();
      return;
    }

    // Convert contours from EPSG:3857 meters or geographic coordinates
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

    safeRemove();
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

    map.on('click', layerId, (e) => {
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
    });
  }, [contours, lopsVisible, isELoran]);

  return (
    <div className="relative w-full h-full min-h-[500px] bg-zinc-950 overflow-hidden select-none">
      <div ref={mapContainer} className="w-full h-full" />

      {/* Real-time telemetry HUD overlay */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2 pointer-events-none">
        <div className="bg-zinc-900/90 backdrop-blur-md border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono shadow-xl pointer-events-auto flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
            <span className="text-zinc-400 uppercase tracking-wider text-[10px]">MODE:</span>
            <span className="font-bold text-cyan-300 uppercase">{mapMode}</span>
          </div>
          {cursorPos && (
            <div className="text-zinc-300">
              <span className="text-zinc-500 mr-1">POS:</span>
              {cursorPos.lat.toFixed(4)}°, {cursorPos.lng.toFixed(4)}°
            </div>
          )}
          {cursorGdop !== null && (
            <div className="text-zinc-300">
              <span className="text-zinc-500 mr-1">LIVE GDOP:</span>
              <span className={`font-bold ${cursorGdop < 3 ? 'text-emerald-400' : cursorGdop < 8 ? 'text-amber-400' : 'text-red-400'}`}>
                {cursorGdop}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="absolute bottom-6 right-4 z-10 bg-zinc-900/90 backdrop-blur-md border border-zinc-800 rounded-lg p-3 text-xs font-mono shadow-xl space-y-1.5">
        <div className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider mb-1">Station Symbols</div>
        <div className="flex items-center gap-2 text-zinc-300">
          <span className="w-3 h-3 rounded-full bg-cyan-400 border border-white shrink-0"></span> Master (M)
        </div>
        <div className="flex items-center gap-2 text-zinc-300">
          <span className="w-3 h-3 rounded-full bg-amber-500 border border-white shrink-0"></span> Secondary (S)
        </div>
        <div className="flex items-center gap-2 text-zinc-300">
          <span className="w-3 h-3 rounded-full bg-emerald-500 border border-white shrink-0"></span> True Receiver (R)
        </div>
        <div className="flex items-center gap-2 text-zinc-300">
          <span className="w-3 h-3 rounded-full border-2 border-red-500 shrink-0"></span> Estimated PNT Fix
        </div>
      </div>
    </div>
  );
}
