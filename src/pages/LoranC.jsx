import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Radio, Compass, ChevronLeft, ChevronRight } from 'lucide-react';
import MapView from '../components/map/MapView.jsx';
import StationEditor from '../components/panels/StationEditor.jsx';
import DisplayPanel from '../components/panels/DisplayPanel.jsx';
import ChainDesignPanel from '../components/panels/ChainDesignPanel.jsx';
import TelemetryConsole from '../components/panels/TelemetryConsole.jsx';
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
      className="px-2.5 py-1.5 rounded-md transition text-xs font-mono cursor-pointer"
      style={active
        ? activeStyle
        : { color: 'var(--text-secondary)', background: 'transparent', border: '1px solid transparent' }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--bg-muted)'; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
    >
      {children}
    </button>
  );
}

const SIDEBAR_MIN = 280;
const SIDEBAR_MAX = 560;
const SIDEBAR_DEFAULT = 380;

export default function LoranC() {
  const [activeTab, setActiveTab] = useState('stations'); // 'stations' | 'display'
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
      className="relative w-full h-full flex overflow-hidden"
      style={{ background: 'var(--bg-canvas)' }}
    >
      {/* Map hero */}
      <div className="flex-1 relative h-full min-w-0">
        <MapView onMapClick={handleMapClick} isELoran={false} />

        {/* Mode toolbar overlay — theme-aware, positioned with clearance from sidebar toggle */}
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
                  background: 'var(--accent-loran-c-subtle)',
                  color: 'var(--accent-loran-c)',
                  borderColor: 'var(--accent-loran-c-border)',
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
        <TelemetryConsole isELoran={false} />
      </div>

      {/* Collapsible right console drawer — stays mounted to prevent MapLibre flicker */}
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
              background: isDragging ? 'var(--accent-loran-c-border)' : 'transparent',
            }}
            onMouseEnter={e => {
              if (!isDragging) e.currentTarget.style.background = 'var(--accent-loran-c-border)';
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
                    background: 'var(--accent-loran-c-subtle)',
                    border: '1px solid var(--accent-loran-c-border)',
                    color: 'var(--accent-loran-c)',
                    boxShadow: '0 0 10px var(--glow-loran-c)',
                  }}
                >
                  <Radio size={14} aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="font-mono font-bold text-xs uppercase tracking-wider truncate"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      Loran-C Console
                    </span>
                    <span
                      className="text-[9px] font-mono font-semibold px-1.5 py-0.2 rounded-full border shrink-0"
                      style={{
                        background: 'var(--accent-loran-c-subtle)',
                        borderColor: 'var(--accent-loran-c-border)',
                        color: 'var(--accent-loran-c)',
                      }}
                    >
                      100 kHz
                    </span>
                  </div>
                  <div
                    className="text-[10px] font-mono tracking-tight whitespace-nowrap overflow-hidden text-ellipsis"
                    style={{ color: 'var(--text-dim)' }}
                  >
                    Hyperbolic PNT · GRI Multi-Chain
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

            {/* Mode Switcher */}
            <div
              className="grid grid-cols-2 rounded-lg p-1 font-mono text-xs mb-3 gap-1 shadow-inner"
              style={{ background: 'var(--bg-canvas)', border: '1px solid var(--border-subtle)' }}
            >
              <button
                onClick={() => toggleDesignMode(false)}
                className="py-1.5 rounded-md text-center transition-all flex items-center justify-center gap-1 cursor-pointer text-[11px] font-medium"
                style={!isDesignMode
                  ? {
                      background: 'var(--bg-surface)',
                      color: 'var(--accent-loran-c)',
                      border: '1px solid var(--accent-loran-c-border)',
                      fontWeight: 700,
                      boxShadow: 'var(--shadow-subtle)',
                    }
                  : {
                      color: 'var(--text-secondary)',
                      border: '1px solid transparent',
                    }}
              >
                <Radio size={11} aria-hidden="true" />
                <span>Simulation</span>
              </button>
              <button
                onClick={() => toggleDesignMode(true)}
                className="py-1.5 rounded-md text-center transition-all flex items-center justify-center gap-1 cursor-pointer text-[11px] font-medium"
                style={isDesignMode
                  ? {
                      background: 'var(--bg-surface)',
                      color: 'var(--accent-loran-c)',
                      border: '1px solid var(--accent-loran-c-border)',
                      fontWeight: 700,
                      boxShadow: 'var(--shadow-subtle)',
                    }
                  : {
                      color: 'var(--text-secondary)',
                      border: '1px solid transparent',
                    }}
              >
                <Compass size={11} aria-hidden="true" />
                <span>Chain Design</span>
              </button>
            </div>

            {!isDesignMode && (
              <div
                className="grid grid-cols-2 rounded-lg p-1 font-mono text-[11px] gap-1"
                style={{ background: 'var(--bg-canvas)', border: '1px solid var(--border-subtle)' }}
              >
                {[
                  { id: 'stations', label: 'Stations' },
                  { id: 'display', label: 'Layers' },
                ].map(({ id, label }) => (
                  <button
                    key={id}
                    onClick={() => setActiveTab(id)}
                    className="py-1.5 rounded-md text-center transition-all cursor-pointer font-medium"
                    style={activeTab === id
                      ? {
                          background: 'var(--accent-loran-c-subtle)',
                          color: 'var(--accent-loran-c)',
                          border: '1px solid var(--accent-loran-c-border)',
                          fontWeight: 700,
                          boxShadow: 'var(--shadow-subtle)',
                        }
                      : {
                          color: 'var(--text-secondary)',
                          border: '1px solid transparent',
                        }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Panel content */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {isDesignMode ? (
              <ChainDesignPanel />
            ) : (
              <>
                {activeTab === 'stations' && <StationEditor isELoran={false} />}
                {activeTab === 'display' && <DisplayPanel isELoran={false} />}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
