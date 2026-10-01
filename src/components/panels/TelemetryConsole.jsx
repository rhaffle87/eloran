import React, { useState, useEffect } from 'react';
import {
  Terminal, ChevronUp, ChevronDown, Activity, Crosshair, ShieldCheck, Radio, Target,
} from 'lucide-react';
import { useSimulationStore } from '../../state/simulationStore.js';
import UncertaintySparkline from '../charts/UncertaintySparkline.jsx';
import ActivityLogFeed from './ActivityLogFeed.jsx';
import NmeaTerminalModal from './NmeaTerminalModal.jsx';
import MissionDrawer from './MissionDrawer.jsx';

export default function TelemetryConsole({ isELoran = false }) {
  const [isNmeaModalOpen, setIsNmeaModalOpen] = useState(false);
  const [isMissionsOpen, setIsMissionsOpen] = useState(false);

  useEffect(() => {
    const handleOpenMissions = () => setIsMissionsOpen(true);
    window.addEventListener('simuloran:open-missions', handleOpenMissions);
    return () => window.removeEventListener('simuloran:open-missions', handleOpenMissions);
  }, []);

  const {
    isConsoleOpen,
    toggleConsoleOpen,
    receiverFixes = {},
    selectedReceiver,
    setSelectedReceiver,
    receivers = [],
    masters = [],
    slaves = [],
    uncertaintyHistory = [],
    activityLogs = [],
  } = useSimulationStore();

  const activeFix = receiverFixes[selectedReceiver] || Object.values(receiverFixes)[0];
  const activeRx = receivers.find((r) => r.label === selectedReceiver) || receivers[0];

  const totalStations = masters.length + slaves.length;
  const activeStations = masters.filter((m) => m.enabled !== false).length +
    slaves.filter((s) => s.enabled !== false).length;

  const gdop = activeFix?.gdop ?? activeFix?.eloranSol?.gdop ?? null;
  const gdopColor = gdop === null
    ? 'var(--text-muted)'
    : gdop < 3
    ? 'var(--status-ok)'
    : gdop < 10.92
    ? 'var(--status-warn)'
    : 'var(--status-danger)';

  const gdopLabel = gdop === null
    ? 'N/A'
    : gdop < 3
    ? 'OPTIMAL'
    : gdop < 10.92
    ? 'ACCEPTABLE'
    : 'CRITICAL';

  const latestLog = activityLogs[activityLogs.length - 1];

  return (
    <div
      data-testid="telemetry-console"
      className="absolute bottom-0 left-0 right-0 z-20 font-mono transition-all duration-200 backdrop-blur-md"
      style={{
        background: 'var(--bg-surface)',
        borderTop: '1px solid var(--border-subtle)',
        boxShadow: '0 -4px 16px rgba(0,0,0,0.25)',
      }}
    >
      {/* Ribbon Bar (Always visible) */}
      <div
        className="flex items-center justify-between px-3 py-1.5 cursor-pointer select-none text-xs gap-2"
        style={{
          borderBottom: isConsoleOpen ? '1px solid var(--border-subtle)' : 'none',
          background: isConsoleOpen ? 'var(--bg-subtle)' : 'transparent',
        }}
        onClick={toggleConsoleOpen}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="w-5 h-5 rounded flex items-center justify-center shrink-0"
            style={{
              background: isELoran ? 'var(--accent-eloran-subtle)' : 'var(--accent-loran-c-subtle)',
              color: isELoran ? 'var(--accent-eloran)' : 'var(--accent-loran-c)',
              border: `1px solid ${isELoran ? 'var(--accent-eloran-border)' : 'var(--accent-loran-c-border)'}`,
            }}
          >
            <Terminal size={12} aria-hidden="true" />
          </div>

          <div className="flex items-center gap-2 text-[11px] min-w-0">
            <span className="font-bold tracking-wider hidden sm:inline" style={{ color: 'var(--text-primary)' }}>
              TACTICAL CONSOLE
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase shrink-0"
              style={{
                background: activeStations === totalStations ? 'var(--status-ok-subtle)' : 'var(--status-warn-subtle)',
                color: activeStations === totalStations ? 'var(--status-ok)' : 'var(--status-warn)',
                border: `1px solid ${activeStations === totalStations ? 'var(--status-ok-border)' : 'var(--status-warn-border)'}`,
              }}
            >
              NET: {activeStations}/{totalStations}
            </span>

            {activeFix && (
              <span className="text-[10px] hidden md:inline truncate" style={{ color: 'var(--text-secondary)' }}>
                RX: <strong style={{ color: 'var(--text-primary)' }}>{selectedReceiver || 'R1'}</strong> | Δρ: {activeFix.errorMeters ? `${activeFix.errorMeters.toFixed(1)}m` : '0.0m'} | GDOP:{' '}
                <strong style={{ color: gdopColor }}>{gdop !== null ? gdop.toFixed(2) : '--'}</strong> ({gdopLabel})
              </span>
            )}

            {!isConsoleOpen && latestLog && (
              <span className="text-[10px] text-[var(--text-dim)] hidden xl:inline truncate max-w-sm">
                • [{latestLog.category}] {latestLog.message}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsMissionsOpen((prev) => !prev);
            }}
            className="text-[10px] font-bold font-mono flex items-center gap-1.5 px-2.5 py-0.5 rounded transition cursor-pointer hover:opacity-90"
            style={{
              background: isMissionsOpen ? 'var(--accent-eloran)' : 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              color: isMissionsOpen ? '#000' : 'var(--text-primary)',
            }}
            title="Open Guided Mission Challenges & Scenario Labs"
          >
            <Target size={11} aria-hidden="true" />
            <span>Missions</span>
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsNmeaModalOpen(true);
            }}
            className="text-[10px] font-bold font-mono flex items-center gap-1.5 px-2.5 py-0.5 rounded transition cursor-pointer hover:opacity-90"
            style={{
              background: 'var(--accent-eloran-subtle)',
              border: '1px solid var(--accent-eloran-border)',
              color: 'var(--accent-eloran)',
            }}
            title="Open NMEA 0183 Telemetry Streamer & Serial Console"
          >
            <Radio size={11} aria-hidden="true" />
            <span>NMEA 0183</span>
          </button>

          <div
            className="text-[10px] font-bold flex items-center gap-1.5 px-2 py-0.5 rounded"
            style={{
              background: 'var(--bg-subtle)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-secondary)',
            }}
          >
            <span>{isConsoleOpen ? 'COLLAPSE' : 'EXPAND CONSOLE'}</span>
            {isConsoleOpen ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
          </div>
        </div>
      </div>

      {/* Expanded Console Panel */}
      {isConsoleOpen && (
        <div className="p-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs max-h-56 overflow-y-auto">
          {/* Column 1: Receiver Telemetry & Fix Coordinates */}
          <div
            className="p-2.5 rounded-lg flex flex-col justify-between space-y-2"
            style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)' }}
          >
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-1.5">
              <div className="flex items-center gap-1.5 font-bold text-[11px]" style={{ color: 'var(--accent-eloran)' }}>
                <Crosshair size={13} aria-hidden="true" />
                TELEMETRY & FIX
              </div>
              {receivers.length > 1 && (
                <select
                  value={selectedReceiver}
                  onChange={(e) => setSelectedReceiver(e.target.value)}
                  className="px-1.5 py-0.5 rounded text-[10px] font-mono cursor-pointer"
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-secondary)',
                  }}
                  aria-label="Active receiver selection"
                >
                  {receivers.map((r) => (
                    <option key={r.label} value={r.label}>
                      {r.label}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="space-y-1 text-[10px] font-mono">
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-dim)' }}>TRUE POS:</span>
                <span style={{ color: 'var(--text-primary)' }}>
                  {activeRx ? `${activeRx.lat.toFixed(4)}°, ${activeRx.lng.toFixed(4)}°` : '--'}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-dim)' }}>SOLVER FIX:</span>
                <span style={{ color: activeFix?.converged ? 'var(--status-ok)' : 'var(--status-warn)' }}>
                  {activeFix ? `${activeFix.lat.toFixed(4)}°, ${activeFix.lng.toFixed(4)}°` : '--'}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-dim)' }}>POSITION DELTA (Δρ):</span>
                <span className="font-bold" style={{ color: 'var(--text-primary)' }}>
                  {activeFix?.errorMeters !== undefined ? `${activeFix.errorMeters.toFixed(2)} m` : '--'}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-dim)' }}>CLOCK BIAS (Δt_rx):</span>
                <span style={{ color: 'var(--text-secondary)' }}>
                  {activeFix?.clockBiasNs !== undefined ? `${activeFix.clockBiasNs.toFixed(1)} ns` : '--'}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-dim)' }}>DOP QUALITY:</span>
                <span className="font-bold" style={{ color: gdopColor }}>
                  {gdop !== null ? `${gdop.toFixed(2)} [${gdopLabel}]` : '--'}
                </span>
              </div>
            </div>

            <div className="pt-1 border-t border-[var(--border-subtle)] text-[9px] flex items-center justify-between" style={{ color: 'var(--text-dim)' }}>
              <span>Convergence: {activeFix?.converged ? '4 iters' : 'aborted'}</span>
              <span>Singularity Limit: 10⁻¹²</span>
            </div>
          </div>

          {/* Column 2: Dynamic Uncertainty Variance Sparkline */}
          <div
            className="p-2.5 rounded-lg flex flex-col justify-between space-y-2"
            style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)' }}
          >
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-1.5">
              <div className="flex items-center gap-1.5 font-bold text-[11px]" style={{ color: 'var(--status-ok)' }}>
                <Activity size={13} aria-hidden="true" />
                UNCERTAINTY VARIANCE (σ²)
              </div>
              <span className="text-[9px] font-mono px-1 rounded" style={{ background: 'var(--bg-surface)', color: 'var(--text-dim)' }}>
                HISTORY: {uncertaintyHistory.length} SAMPLES
              </span>
            </div>

            <UncertaintySparkline
              data={uncertaintyHistory}
              height={46}
              metric="variance"
              unit="m²"
              strokeColor="var(--accent-eloran)"
            />

            <div className="pt-1 border-t border-[var(--border-subtle)] text-[9.5px] font-mono flex items-center justify-between" style={{ color: 'var(--text-secondary)' }}>
              <span className="flex items-center gap-1">
                <ShieldCheck size={11} style={{ color: 'var(--status-ok)' }} />
                <span>HPL (3σ):</span>
                <strong style={{ color: 'var(--text-primary)' }}>
                  {activeFix?.errorMeters ? `${(activeFix.errorMeters * 3).toFixed(1)} m` : '--'}
                </strong>
              </span>
              <span className="text-[9px]" style={{ color: 'var(--text-dim)' }}>
                Noise Mode: Controlled
              </span>
            </div>
          </div>

          {/* Column 3: Operational Activity Stream */}
          <div
            className="p-2.5 rounded-lg flex flex-col justify-between"
            style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)' }}
          >
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-1.5 mb-1">
              <div className="flex items-center gap-1.5 font-bold text-[11px]" style={{ color: 'var(--text-primary)' }}>
                <Terminal size={13} aria-hidden="true" />
                OPERATIONAL ACTIVITY FEED
              </div>
            </div>

            <div className="flex-1 min-h-[110px]">
              <ActivityLogFeed maxHeight="110px" compact={true} />
            </div>
          </div>
        </div>
      )}

      {/* NMEA 0183 Telemetry Streamer Modal */}
      <MissionDrawer
        isOpen={isMissionsOpen}
        onClose={() => setIsMissionsOpen(false)}
      />

      <NmeaTerminalModal
        isOpen={isNmeaModalOpen}
        onClose={() => setIsNmeaModalOpen(false)}
      />
    </div>
  );
}