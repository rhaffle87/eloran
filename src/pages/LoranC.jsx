import React, { useState } from 'react';
import { Radio, ChevronLeft, ChevronRight } from 'lucide-react';
import MapView from '../components/map/MapView.jsx';
import StationEditor from '../components/panels/StationEditor.jsx';
import DisplayPanel from '../components/panels/DisplayPanel.jsx';
import { useSimulationStore } from '../state/simulationStore.js';

/** Map-mode toolbar button — theme-aware */
function ModeButton({ active, onClick, title, accentVar, children }) {
  const activeStyle = active
    ? { background: `var(${accentVar}-subtle)`, color: `var(${accentVar})`, border: `1px solid var(${accentVar}-border)`, fontWeight: 700 }
    : {};
  return (
    <button
      onClick={onClick}
      title={title}
      className="px-2.5 py-1.5 rounded-md transition text-xs font-mono"
      style={active
        ? activeStyle
        : { color: 'var(--text-secondary)', background: 'transparent' }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--bg-muted)'; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
    >
      {children}
    </button>
  );
}

export default function LoranC() {
  const [activeTab, setActiveTab] = useState('stations'); // 'stations' | 'display'
  const [sidebarOpen, setSidebarOpen] = useState(
    () => (typeof window !== 'undefined' ? window.innerWidth >= 1024 : true)
  );

  const { mapMode, setMapMode, addStation, evaluateReceivers } = useSimulationStore();

  const handleMapClick = (lngLat) => {
    if (mapMode === 'add-master') {
      addStation({ role: 'master', label: `M${Date.now().toString().slice(-3)}`, lat: lngLat.lat, lng: lngLat.lng, txDbm: 20, griMs: 1000, offsetSec: 0 });
      setMapMode('pan');
      setTimeout(() => evaluateReceivers(), 50);
    } else if (mapMode === 'add-slave') {
      addStation({ role: 'slave', label: `S${Date.now().toString().slice(-3)}`, lat: lngLat.lat, lng: lngLat.lng, txDbm: 18, griMs: 1000, offsetSec: 0.015 });
      setMapMode('pan');
      setTimeout(() => evaluateReceivers(), 50);
    } else if (mapMode === 'add-receiver') {
      addStation({ role: 'receiver', label: `R${Date.now().toString().slice(-3)}`, lat: lngLat.lat, lng: lngLat.lng, fuseMode: 'eLoran' });
      setMapMode('pan');
      setTimeout(() => evaluateReceivers(), 50);
    }
  };

  return (
    <div
      className="relative w-full h-[calc(100vh-4rem)] flex overflow-hidden"
      style={{ background: 'var(--bg-canvas)' }}
    >
      {/* Map hero */}
      <div className="flex-1 relative h-full">
        <MapView onMapClick={handleMapClick} isELoran={false} />

        {/* Mode toolbar overlay — theme-aware */}
        <div
          className="absolute top-4 right-4 z-20 backdrop-blur-md rounded-lg p-1 flex items-center gap-0.5 shadow-xl"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            boxShadow: 'var(--shadow-card)',
          }}
        >
          <ModeButton active={mapMode === 'pan'} onClick={() => setMapMode('pan')} title="Pan & Inspect (P)" accentVar="--accent-eloran">
            <span className="hidden sm:inline">Pan <span className="kbd-chip ml-1">P</span></span>
            <span className="sm:hidden">Pan</span>
          </ModeButton>
          <ModeButton active={mapMode === 'add-master'} onClick={() => setMapMode('add-master')} title="Place Master station (M)" accentVar="--accent-eloran">
            <span className="hidden sm:inline">+Master <span className="kbd-chip ml-1">M</span></span>
            <span className="sm:hidden">+M</span>
          </ModeButton>
          <ModeButton active={mapMode === 'add-slave'} onClick={() => setMapMode('add-slave')} title="Place Secondary station (S)" accentVar="--accent-loran-c">
            <span className="hidden sm:inline">+Secondary <span className="kbd-chip ml-1">S</span></span>
            <span className="sm:hidden">+S</span>
          </ModeButton>
          <ModeButton active={mapMode === 'add-receiver'} onClick={() => setMapMode('add-receiver')} title="Place Receiver (R)" accentVar="--status-ok">
            <span className="hidden sm:inline">+Receiver <span className="kbd-chip ml-1">R</span></span>
            <span className="sm:hidden">+R</span>
          </ModeButton>
        </div>
      </div>

      {/* Collapsible right console drawer */}
      <div
        className={`relative z-30 transition-all duration-300 ease-in-out flex flex-col ${
          sidebarOpen ? 'w-full max-w-[380px] lg:w-96' : 'w-0 overflow-hidden'
        }`}
        style={{
          borderLeft: sidebarOpen ? '1px solid var(--border-subtle)' : 'none',
          background: 'var(--bg-surface)',
        }}
      >
        {/* Collapse toggle tab */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="absolute -left-7 top-4 z-40 p-1.5 rounded-l-md shadow-xl transition"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRight: 'none',
            color: 'var(--text-secondary)',
          }}
          title={sidebarOpen ? 'Collapse console' : 'Expand console'}
        >
          {sidebarOpen ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>

        {sidebarOpen && (
          <div className="flex flex-col h-full overflow-hidden">
            {/* Console header */}
            <div
              className="p-4"
              style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-subtle)' }}
            >
              <div className="flex items-center justify-between mb-3">
                <div
                  className="font-mono font-bold text-xs uppercase tracking-widest flex items-center gap-2"
                  style={{ color: 'var(--accent-loran-c)' }}
                >
                  <Radio size={14} aria-hidden="true" /> Loran-C Console
                </div>
                <span className="text-[10px] font-mono" style={{ color: 'var(--text-dim)' }}>
                  100 kHz LOP Engine
                </span>
              </div>

              {/* Tab switcher */}
              <div
                className="flex rounded-lg p-0.5 font-mono text-xs"
                style={{ background: 'var(--bg-canvas)', border: '1px solid var(--border-subtle)' }}
              >
                {[
                  { id: 'stations', label: 'Stations' },
                  { id: 'display', label: 'Layers & Mesh' },
                ].map(({ id, label }) => (
                  <button
                    key={id}
                    onClick={() => setActiveTab(id)}
                    className="flex-1 py-1.5 rounded text-center transition"
                    style={activeTab === id
                      ? { background: 'var(--accent-loran-c-subtle)', color: 'var(--accent-loran-c)', border: '1px solid var(--accent-loran-c-border)', fontWeight: 700 }
                      : { color: 'var(--text-secondary)', border: '1px solid transparent' }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Panel content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {activeTab === 'stations' && <StationEditor isELoran={false} />}
              {activeTab === 'display' && <DisplayPanel isELoran={false} />}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
