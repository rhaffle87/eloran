import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Compass, Radio, Clock, Sparkles, Navigation, Layers, ChevronLeft, ChevronRight, Activity, Wifi, Ship, Target } from 'lucide-react';
import MapView from '../components/map/MapView.jsx';
import StationEditor from '../components/panels/StationEditor.jsx';
import ClockPanel from '../components/panels/ClockPanel.jsx';
import AsfPanel from '../components/panels/AsfPanel.jsx';
import FusionPanel from '../components/panels/FusionPanel.jsx';
import DisplayPanel from '../components/panels/DisplayPanel.jsx';
import ChainDesignPanel from '../components/panels/ChainDesignPanel.jsx';
import TrackingPanel from '../components/panels/TrackingPanel.jsx';
import DLoranPanel from '../components/panels/DLoranPanel.jsx';
import TrajectoryPanel from '../components/panels/TrajectoryPanel.jsx';
import TelemetryConsole from '../components/panels/TelemetryConsole.jsx';
import { useSimulationStore } from '../state/simulationStore.js';

/** Map-mode toolbar button — theme-aware */
function ModeButton({ active, onClick, title, accentVar, children }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="px-2.5 py-1.5 rounded-md transition text-xs font-mono cursor-pointer"
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
  const [windowWidth, setWindowWidth] = useState(
    () => (typeof window !== 'undefined' ? window.innerWidth : 1280)
  );

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isMobile = windowWidth < 640;
  const effectiveSidebarWidth = isMobile ? windowWidth : sidebarWidth;
  const [isDragging, setIsDragging] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartWidthRef = useRef(SIDEBAR_DEFAULT);

  const handleDragStart = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    isDraggingRef.current = true;
    setIsDragging(true);
    dragStartXRef.current = e.clientX;
    dragStartWidthRef.current = sidebarWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    let rafId = null;
    const onMove = (ev) => {
      if (!isDraggingRef.current) return;
      const delta = dragStartXRef.current - ev.clientX;
      const next = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, dragStartWidthRef.current + delta));
      setSidebarWidth(next);
      if (!rafId) {
        rafId = requestAnimationFrame(() => {
          rafId = null;
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('simuloran:map:resize'));
          }
        });
      }
    };
    const onUp = () => {
      isDraggingRef.current = false;
      setIsDragging(false);
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('simuloran:map:resize'));
      }
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
    { id: 'stations',   label: 'Stations',   icon: Radio },
    { id: 'clocks',     label: 'Clocks',     icon: Clock },
    { id: 'asf',        label: 'ASF',        icon: Sparkles },
    { id: 'dloran',     label: 'd-Loran',    icon: Wifi },
    { id: 'tracking',   label: 'Tracking',   icon: Activity },
    { id: 'trajectory', label: 'Trajectory', icon: Ship },
    { id: 'fusion',     label: 'Fusion',     icon: Navigation },
    { id: 'display',    label: 'Layers',     icon: Layers },
  ];

  return (
    <div
      className="relative w-full h-full flex overflow-hidden"
      style={{ background: 'var(--bg-canvas)' }}
    >
      <h1 className="sr-only">eLoran Precision Suite — Sovereign Assured PNT Testbed</h1>
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
                title="Exit chain design mode and return to simulation"
                aria-label="Back to Simulation"
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
            onClick={() => {
              setIsTransitioning(true);
              setSidebarOpen(true);
            }}
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
        <TelemetryConsole isELoran={true} />
      </div>

      {/* Collapsible right console drawer — stays mounted, no flicker */}
      <div
        data-testid="sidebar-container"
        onTransitionEnd={(e) => {
          if (e.target === e.currentTarget) {
            setIsTransitioning(false);
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('simuloran:map:resize'));
            }
          }
        }}
        className="relative z-30 flex flex-col flex-shrink-0 h-full max-w-full"
        style={{
          width: sidebarOpen ? effectiveSidebarWidth : 0,
          minWidth: 0,
          maxWidth: '100vw',
          transition: isDragging ? 'none' : 'width 220ms cubic-bezier(0.4, 0, 0.2, 1)',
          borderLeft: sidebarOpen ? '1px solid var(--border-subtle)' : 'none',
          background: 'var(--bg-surface)',
          overflow: 'hidden',
        }}
      >
        {/* Drag resize handle */}
        {sidebarOpen && (
          <div
            data-testid="sidebar-drag-handle"
            onMouseDown={handleDragStart}
            className="absolute left-0 top-0 bottom-0 w-2 z-40 cursor-col-resize select-none transition-colors hidden sm:block"
            style={{
              background: isDragging ? 'var(--accent-eloran-border)' : 'transparent',
            }}
            onMouseEnter={e => {
              if (!isDragging) e.currentTarget.style.background = 'var(--accent-eloran-border)';
            }}
            onMouseLeave={e => {
              if (!isDragging) e.currentTarget.style.background = 'transparent';
            }}
            title="Drag to resize console drawer"
          />
        )}
        <div
          data-testid="sidebar-content"
          className="absolute right-0 top-0 bottom-0 flex flex-col h-full overflow-hidden w-full"
          style={{ visibility: (sidebarOpen || isTransitioning) ? 'visible' : 'hidden', width: effectiveSidebarWidth, maxWidth: '100%' }}
        >
            {/* Console header */}
            <div
              className="p-3.5"
              style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-subtle)' }}
            >
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{
                      background: 'var(--accent-eloran-subtle)',
                      border: '1px solid var(--accent-eloran-border)',
                      color: 'var(--accent-eloran)',
                      boxShadow: '0 0 10px var(--glow-eloran)',
                    }}
                  >
                    <Compass size={15} aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="font-mono font-bold text-xs uppercase tracking-wider truncate"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        eLoran Precision Suite
                      </span>
                      <span
                        className="text-[9px] font-mono font-semibold px-1.5 py-0.2 rounded-full border shrink-0"
                        style={{
                          background: 'var(--accent-eloran-subtle)',
                          borderColor: 'var(--accent-eloran-border)',
                          color: 'var(--accent-eloran)',
                        }}
                      >
                        v1.5
                      </span>
                    </div>
                    <div
                      className="text-[10px] font-mono tracking-tight whitespace-nowrap overflow-hidden text-ellipsis"
                      style={{ color: 'var(--text-dim)' }}
                    >
                      DDS · ASF · PNT Fusion
                    </div>
                  </div>
                </div>

                <button
                  data-testid="sidebar-collapse-btn"
                  onClick={() => {
                    setIsTransitioning(true);
                    setSidebarOpen(false);
                  }}
                  className="p-1.5 rounded-lg hover:bg-[var(--bg-muted)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition cursor-pointer border border-[var(--border-subtle)] shrink-0"
                  title="Collapse console drawer"
                  aria-label="Collapse console drawer"
                >
                  <ChevronRight size={15} />
                </button>
              </div>

              {/* Primary Mode Switcher: Simulation vs Chain Design */}
              <div
                className="grid grid-cols-2 rounded-lg p-1 font-mono text-xs mb-3 gap-1 shadow-inner"
                style={{ background: 'var(--bg-canvas)', border: '1px solid var(--border-subtle)' }}
              >
                <button
                  onClick={() => toggleDesignMode(false)}
                  className="py-1.5 rounded-md text-center transition-all flex items-center justify-center gap-1.5 cursor-pointer font-medium"
                  title="Switch to live navigation operation mode"
                  aria-label="Operation Mode"
                  style={!isDesignMode
                    ? {
                        background: 'var(--bg-surface)',
                        color: 'var(--accent-eloran)',
                        border: '1px solid var(--accent-eloran-border)',
                        fontWeight: 700,
                        boxShadow: 'var(--shadow-subtle)',
                      }
                    : {
                        color: 'var(--text-secondary)',
                        border: '1px solid transparent',
                      }}
                >
                  <Radio size={12} aria-hidden="true" />
                  <span>Simulation</span>
                </button>
                <button
                  onClick={() => toggleDesignMode(true)}
                  className="py-1.5 rounded-md text-center transition-all flex items-center justify-center gap-1.5 cursor-pointer font-medium"
                  title="Switch to transmitter network design sandbox"
                  aria-label="Chain Design"
                  style={isDesignMode
                    ? {
                        background: 'var(--bg-surface)',
                        color: 'var(--accent-eloran)',
                        border: '1px solid var(--accent-eloran-border)',
                        fontWeight: 700,
                        boxShadow: 'var(--shadow-subtle)',
                      }
                    : {
                        color: 'var(--text-secondary)',
                        border: '1px solid transparent',
                      }}
                >
                  <Compass size={12} aria-hidden="true" />
                  <span>Chain Design</span>
                </button>
              </div>

              {!isDesignMode && (
                /* Subsystem tab bar: 4 columns x 2 rows */
                <div
                  className="grid grid-cols-4 gap-1 p-1 rounded-lg font-mono text-[10px]"
                  style={{ background: 'var(--bg-canvas)', border: '1px solid var(--border-subtle)' }}
                >
                  {tabs.map(({ id, label, icon: Icon }) => {
                    const isActive = activeTab === id;
                    return (
                      <button
                        key={id}
                        onClick={() => setActiveTab(id)}
                        className="py-2 px-1 rounded-md text-center transition-all flex flex-col items-center justify-center gap-1 cursor-pointer select-none group"
                        title={`Switch to ${label} panel`}
                        aria-label={label}
                        style={isActive
                          ? {
                              background: 'var(--accent-eloran-subtle)',
                              color: 'var(--accent-eloran)',
                              border: '1px solid var(--accent-eloran-border)',
                              fontWeight: 700,
                              boxShadow: 'var(--shadow-subtle)',
                            }
                          : {
                              color: 'var(--text-secondary)',
                              border: '1px solid transparent',
                            }}
                      >
                        <Icon
                          size={12}
                          aria-hidden="true"
                          className={isActive ? 'opacity-100' : 'opacity-65 group-hover:opacity-100 group-hover:scale-110 transition-transform'}
                        />
                        <span className="text-[10px] tracking-tight leading-tight truncate max-w-full">
                          {label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Active subsystem panel */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {isDesignMode ? (
                <ChainDesignPanel />
              ) : (
                <>
                                    {activeTab === 'stations'   && <StationEditor isELoran={true} />}
                  {activeTab === 'clocks'     && <ClockPanel />}
                  {activeTab === 'asf'        && <AsfPanel />}
                  {activeTab === 'dloran'     && <DLoranPanel />}
                  {activeTab === 'tracking'   && <TrackingPanel />}
                  {activeTab === 'trajectory' && <TrajectoryPanel />}
                  {activeTab === 'fusion'     && <FusionPanel />}
                  {activeTab === 'display'    && <DisplayPanel isELoran={true} />}
                </>
              )}
            </div>
        </div>
      </div>
    </div>
  );
}
