import React, { useState } from 'react';
import { Compass, Radio, Clock, Sparkles, Navigation, Layers, ChevronLeft, ChevronRight } from 'lucide-react';
import MapView from '../components/map/MapView.jsx';
import StationEditor from '../components/panels/StationEditor.jsx';
import ClockPanel from '../components/panels/ClockPanel.jsx';
import AsfPanel from '../components/panels/AsfPanel.jsx';
import FusionPanel from '../components/panels/FusionPanel.jsx';
import DisplayPanel from '../components/panels/DisplayPanel.jsx';
import ChainDesignPanel from '../components/panels/ChainDesignPanel.jsx';
import { useSimulationStore } from '../state/simulationStore.js';

/** Map-mode toolbar button — theme-aware */
function ModeButton({ active, onClick, title, accentVar, children }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="px-2.5 py-1.5 rounded-md transition text-xs font-mono"
      style={active
        ? { background: `var(${accentVar}-subtle)`, color: `var(${accentVar})`, border: `1px solid var(${accentVar}-border)`, fontWeight: 700 }
        : { color: 'var(--text-secondary)', background: 'transparent', border: '1px solid transparent' }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--bg-muted)'; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
    >
      {children}
    </button>
  );
}

export default function ELoran() {
  const [activeTab, setActiveTab] = useState('stations');
  const [sidebarOpen, setSidebarOpen] = useState(
    () => (typeof window !== 'undefined' ? window.innerWidth >= 1024 : true)
  );

  const {
    mapMode,
    setMapMode,
    addStation,
    evaluateReceivers,
    isDesignMode,
    toggleDesignMode,
  } = useSimulationStore();

  const handleMapClick = (lngLat) => {
    if (isDesignMode) return;
    if (mapMode === 'add-master') {
      addStation({
        role: 'master', label: `M${Date.now().toString().slice(-3)}`,
        lat: lngLat.lat, lng: lngLat.lng, txDbm: 20, griMs: 1000, offsetSec: 0,
        ddsEnabled: true, clock: { type: 'gps-disciplined', biasSec: 0, driftPerSec: 0 },
        diffCorrections: { enabled: true, avgMeters: 0 },
      });
      setMapMode('pan');
      setTimeout(() => evaluateReceivers(), 50);
    } else if (mapMode === 'add-slave') {
      addStation({
        role: 'slave', label: `S${Date.now().toString().slice(-3)}`,
        lat: lngLat.lat, lng: lngLat.lng, txDbm: 18, griMs: 1000, offsetSec: 0.015,
        ddsEnabled: false, clock: { type: 'gps-disciplined', biasSec: 0, driftPerSec: 0 },
      });
      setMapMode('pan');
      setTimeout(() => evaluateReceivers(), 50);
    } else if (mapMode === 'add-receiver') {
      addStation({ role: 'receiver', label: `R${Date.now().toString().slice(-3)}`, lat: lngLat.lat, lng: lngLat.lng, fuseMode: 'fusion' });
      setMapMode('pan');
      setTimeout(() => evaluateReceivers(), 50);
    }
  };

  const tabs = [
    { id: 'stations', label: 'Stations', icon: Radio },
    { id: 'clocks',   label: 'Clocks',   icon: Clock },
    { id: 'asf',      label: 'ASF',      icon: Sparkles },
    { id: 'fusion',   label: 'Fusion',   icon: Navigation },
    { id: 'display',  label: 'Mesh',     icon: Layers },
  ];

  return (
    <div
      className="relative w-full h-full flex overflow-hidden"
      style={{ background: 'var(--bg-canvas)' }}
    >
      {/* Map hero */}
      <div className="flex-1 relative h-full min-w-0">
        <MapView onMapClick={handleMapClick} isELoran={true} />

        {/* Tactical mode toolbar overlay — theme-aware, positioned with clearance from sidebar toggle */}
        <div
          className="absolute top-4 right-14 sm:right-16 z-20 backdrop-blur-md rounded-lg p-1 flex items-center gap-1 shadow-xl"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            boxShadow: 'var(--shadow-card)',
          }}
        >
          {isDesignMode ? (
            <div className="flex items-center gap-1 px-1">
              <span
                className="px-2 py-1 rounded text-xs font-mono font-bold uppercase tracking-wider border flex items-center gap-1.5"
                style={{
                  background: 'var(--accent-eloran-subtle)',
                  color: 'var(--accent-eloran)',
                  borderColor: 'var(--accent-eloran-border)',
                }}
              >
                <Compass size={13} aria-hidden="true" />
                <span>Chain Design Active</span>
              </span>
              <button
                onClick={() => toggleDesignMode(false)}
                className="px-2.5 py-1 rounded-md transition text-xs font-mono border hover:bg-[var(--bg-muted)] cursor-pointer"
                style={{
                  background: 'var(--bg-subtle)',
                  color: 'var(--text-primary)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                Back to Simulation
              </button>
            </div>
          ) : (
            <>
              <ModeButton active={mapMode === 'pan'} onClick={() => setMapMode('pan')} title="Pan & Inspect (P)" accentVar="--accent-eloran">
                <span className="hidden sm:inline">Pan <span className="kbd-chip ml-1">P</span></span>
                <span className="sm:hidden">Pan</span>
              </ModeButton>
              <ModeButton active={mapMode === 'add-master'} onClick={() => setMapMode('add-master')} title="Place Master (M)" accentVar="--accent-eloran">
                <span className="hidden sm:inline">+Master <span className="kbd-chip ml-1">M</span></span>
                <span className="sm:hidden">+M</span>
              </ModeButton>
              <ModeButton active={mapMode === 'add-slave'} onClick={() => setMapMode('add-slave')} title="Place Secondary (S)" accentVar="--accent-loran-c">
                <span className="hidden sm:inline">+Secondary <span className="kbd-chip ml-1">S</span></span>
                <span className="sm:hidden">+S</span>
              </ModeButton>
              <ModeButton active={mapMode === 'add-receiver'} onClick={() => setMapMode('add-receiver')} title="Place Receiver (R)" accentVar="--status-ok">
                <span className="hidden sm:inline">+Receiver <span className="kbd-chip ml-1">R</span></span>
                <span className="sm:hidden">+R</span>
              </ModeButton>
            </>
          )}
        </div>

        {/* Sidebar Expand Toggle — only rendered when drawer is collapsed */}
        {!sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            className="absolute top-4 right-3 z-30 p-2 rounded-lg shadow-xl backdrop-blur-md transition cursor-pointer flex items-center justify-center border hover:bg-[var(--bg-muted)]"
            style={{
              background: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-secondary)',
            }}
            title="Expand console drawer"
            aria-label="Expand console drawer"
          >
            <ChevronLeft size={17} />
          </button>
        )}
      </div>

      {/* Collapsible right console drawer */}
      <div
        className={`relative z-30 transition-[width] duration-300 ease-in-out flex flex-col ${
          sidebarOpen ? 'w-full max-w-[380px] lg:w-[420px]' : 'w-0 overflow-hidden'
        }`}
        style={{
          borderLeft: sidebarOpen ? '1px solid var(--border-subtle)' : 'none',
          background: 'var(--bg-surface)',
        }}
        onTransitionEnd={() => {
          if (typeof window !== 'undefined' && window.__maplibreInstance) {
            window.__maplibreInstance.resize();
          }
        }}
      >
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
                  style={{ color: 'var(--accent-eloran)' }}
                >
                  <Compass size={15} aria-hidden="true" /> eLoran Precision Suite
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--bg-canvas)] border border-[var(--border-subtle)]" style={{ color: 'var(--text-dim)' }}>
                    DDS · ASF · PNT Fusion
                  </span>
                  <button
                    onClick={() => setSidebarOpen(false)}
                    className="p-1.5 rounded-md hover:bg-[var(--bg-muted)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition cursor-pointer border border-[var(--border-subtle)]"
                    title="Collapse console drawer"
                    aria-label="Collapse console drawer"
                  >
                    <ChevronRight size={15} />
                  </button>
                </div>
              </div>

              {/* Primary Mode Switcher: Simulation vs Chain Design */}
              <div
                className="flex rounded-lg p-0.5 font-mono text-xs mb-3"
                style={{ background: 'var(--bg-canvas)', border: '1px solid var(--border-subtle)' }}
              >
                <button
                  onClick={() => toggleDesignMode(false)}
                  className="flex-1 py-1.5 rounded text-center transition flex items-center justify-center gap-1.5 cursor-pointer"
                  style={!isDesignMode
                    ? { background: 'var(--accent-eloran-subtle)', color: 'var(--accent-eloran)', border: '1px solid var(--accent-eloran-border)', fontWeight: 700 }
                    : { color: 'var(--text-secondary)', border: '1px solid transparent' }}
                >
                  <Radio size={12} aria-hidden="true" />
                  <span>Simulation</span>
                </button>
                <button
                  onClick={() => toggleDesignMode(true)}
                  className="flex-1 py-1.5 rounded text-center transition flex items-center justify-center gap-1.5 cursor-pointer"
                  style={isDesignMode
                    ? { background: 'var(--accent-eloran-subtle)', color: 'var(--accent-eloran)', border: '1px solid var(--accent-eloran-border)', fontWeight: 700 }
                    : { color: 'var(--text-secondary)', border: '1px solid transparent' }}
                >
                  <Compass size={12} aria-hidden="true" />
                  <span>Chain Design</span>
                </button>
              </div>

              {!isDesignMode && (
                /* Subsystem tab bar */
                <div
                  className="grid grid-cols-5 rounded-lg p-0.5 font-mono text-[10px]"
                  style={{ background: 'var(--bg-canvas)', border: '1px solid var(--border-subtle)' }}
                >
                  {tabs.map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      onClick={() => setActiveTab(id)}
                      className="py-1.5 rounded text-center transition flex flex-col items-center gap-0.5 cursor-pointer"
                      style={activeTab === id
                        ? { background: 'var(--accent-eloran-subtle)', color: 'var(--accent-eloran)', border: '1px solid var(--accent-eloran-border)', fontWeight: 700 }
                        : { color: 'var(--text-secondary)', border: '1px solid transparent' }}
                    >
                      <Icon size={11} aria-hidden="true" />
                      <span className="text-[9px] leading-none">{label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Active subsystem panel */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {isDesignMode ? (
                <ChainDesignPanel />
              ) : (
                <>
                  {activeTab === 'stations' && <StationEditor isELoran={true} />}
                  {activeTab === 'clocks'   && <ClockPanel />}
                  {activeTab === 'asf'      && <AsfPanel />}
                  {activeTab === 'fusion'   && <FusionPanel />}
                  {activeTab === 'display'  && <DisplayPanel isELoran={true} />}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
