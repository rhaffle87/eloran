import React, { useState, useRef, useCallback } from 'react';
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

const SIDEBAR_MIN = 320;
const SIDEBAR_MAX = 560;
const SIDEBAR_DEFAULT = 420;

export default function ELoran() {
  const [activeTab, setActiveTab] = useState('stations');
  const [sidebarOpen, setSidebarOpen] = useState(
    () => (typeof window !== 'undefined' ? window.innerWidth >= 1024 : true)
  );
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT);
  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartWidthRef = useRef(SIDEBAR_DEFAULT);

  const handleDragStart = useCallback((e) => {
    isDraggingRef.current = true;
    dragStartXRef.current = e.clientX;
    dragStartWidthRef.current = sidebarWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const onMove = (ev) => {
      if (!isDraggingRef.current) return;
      const delta = dragStartXRef.current - ev.clientX;
      const next = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, dragStartWidthRef.current + delta));
      setSidebarWidth(next);
      window.__maplibreInstance?.resize();
    };
    const onUp = () => {
      isDraggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.__maplibreInstance?.resize();
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [sidebarWidth]);

  const {
    mapMode,
    setMapMode,
    addStation,
    evaluateReceivers,
    isDesignMode,
    toggleDesignMode,
  } = useSimulationStore();

  React.useEffect(() => {
    evaluateReceivers();
  }, [evaluateReceivers]);

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
    { id: 'display',  label: 'Layers',   icon: Layers },
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
          className={`absolute top-4 ${sidebarOpen ? 'right-4' : 'right-14'} z-20 backdrop-blur-md rounded-lg p-1 flex items-center gap-1 shadow-xl transition-all duration-200`}
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
            data-testid="sidebar-expand-btn"
            onClick={() => setSidebarOpen(true)}
            className="absolute top-4 right-3.5 z-30 p-2 rounded-lg shadow-xl backdrop-blur-md transition cursor-pointer flex items-center justify-center border hover:bg-[var(--bg-muted)]"
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

      {/* Collapsible right console drawer — stays mounted, no flicker */}
      <div
        data-testid="sidebar-container"
        className="relative z-30 flex flex-col flex-shrink-0"
        style={{
          width: sidebarOpen ? sidebarWidth : 0,
          minWidth: 0,
          transition: 'width 220ms cubic-bezier(0.4,0,0.2,1)',
          borderLeft: sidebarOpen ? '1px solid var(--border-subtle)' : 'none',
          background: 'var(--bg-surface)',
          overflow: sidebarOpen ? 'visible' : 'hidden',
        }}
      >
        {/* Drag resize handle */}
        {sidebarOpen && (
          <div
            data-testid="sidebar-drag-handle"
            onMouseDown={handleDragStart}
            className="absolute left-0 top-0 bottom-0 w-1 z-40 cursor-col-resize"
            style={{ background: 'transparent' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent-eloran-border)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          />
        )}
        <div
          data-testid="sidebar-content"
          className="flex flex-col h-full overflow-hidden"
          style={{ visibility: sidebarOpen ? 'visible' : 'hidden', width: sidebarWidth }}
        >
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
                    data-testid="sidebar-collapse-btn"
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
      </div>
    </div>
  );
}
