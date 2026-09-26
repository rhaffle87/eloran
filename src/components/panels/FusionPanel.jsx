import React from 'react';
import { ShieldCheck, AlertTriangle, Radio, Navigation, Compass } from 'lucide-react';
import { useSimulationStore } from '../../state/simulationStore.js';
import Slider from '../ui/Slider.jsx';
import Toggle from '../ui/Toggle.jsx';
import InfoTooltip from '../ui/Tooltip.jsx';

export default function FusionPanel() {
  const {
    receivers, receiverFixes, selectedReceiver,
    setSelectedReceiver, updateStation, settings, updateSettings, ddsLogs,
  } = useSimulationStore();

  const rx = receivers.find((r) => r.label === selectedReceiver) || receivers[0];
  const fix = rx ? receiverFixes[rx.label] : null;
  const currentMode = rx?.fuseMode || 'fusion';

  const handleModeChange = (mode) => {
    if (!rx) return;
    updateStation(rx.label, { fuseMode: mode });
  };

  const isAlarm =
    fix &&
    settings.enableIntegrity &&
    (fix.errorMeters > settings.integrityThresholdMeters ||
      (fix.hplMeters && fix.hplMeters > settings.integrityThresholdMeters));

  const modes = [
    { id: 'fusion', label: 'Fused Mode',  icon: Compass   },
    { id: 'eLoran', label: 'eLoran Only', icon: Radio     },
    { id: 'GNSS',   label: 'GNSS Only',   icon: Navigation },
  ];

  return (
    <div className="space-y-4">
      {/* Receiver Selector */}
      {receivers.length > 1 && (
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider block mb-1.5" style={{ color: 'var(--text-dim)' }}>
            Active Receiver Unit
          </label>
          <select
            value={selectedReceiver}
            onChange={(e) => setSelectedReceiver(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-xs font-mono"
            style={{ background: 'var(--bg-canvas)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', outline: 'none' }}
          >
            {receivers.map((r) => (
              <option key={r.label} value={r.label}>
                {r.label} ({r.lat.toFixed(4)}°, {r.lng.toFixed(4)}°)
              </option>
            ))}
          </select>
        </div>
      )}

      {/* PNT Mode Switcher */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider block" style={{ color: 'var(--text-dim)' }}>
            PNT Navigation Architecture
          </label>
          <InfoTooltip text="Switch between multi-sensor Kalman fusion, terrestrial eLoran only, and GNSS satellite only." />
        </div>
        <div className="grid grid-cols-3 gap-1.5 font-mono text-xs">
          {modes.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => handleModeChange(id)}
              className="py-2 px-2 rounded-lg text-center transition flex flex-col items-center gap-1 cursor-pointer"
              style={currentMode === id
                ? { background: 'var(--accent-eloran-subtle)', border: '1px solid var(--accent-eloran-border)', color: 'var(--accent-eloran)', fontWeight: 700 }
                : { background: 'var(--bg-canvas)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
            >
              <Icon size={14} aria-hidden="true" /> {label}
            </button>
          ))}
        </div>
      </div>

      {/* Real-time Position & Integrity Cards */}
      <div
        className="p-3 rounded-lg space-y-3 font-mono text-xs"
        style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)' }}
      >
        <div className="flex justify-between items-center pb-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <span style={{ color: 'var(--text-muted)' }}>Integrity Status:</span>
          {isAlarm ? (
            <span className="inline-flex items-center gap-1 font-bold animate-pulse" style={{ color: 'var(--status-danger)' }}>
              <AlertTriangle size={13} /> INTEGRITY ALARM
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 font-semibold" style={{ color: 'var(--status-ok)' }}>
              <ShieldCheck size={13} /> CHANNEL NOMINAL
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="p-2.5 rounded" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
            <div className="text-[10px] uppercase" style={{ color: 'var(--text-dim)' }}>True Position Error</div>
            <div
              className="text-lg font-bold mt-0.5"
              style={{ color: fix?.errorMeters > settings.integrityThresholdMeters ? 'var(--status-danger)' : 'var(--accent-eloran)' }}
            >
              {fix?.errorMeters ? `${fix.errorMeters.toFixed(1)} m` : 'Calculating...'}
            </div>
          </div>

          <div className="p-2.5 rounded" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
            <div className="text-[10px] uppercase" style={{ color: 'var(--text-dim)' }}>Protection Level (HPL)</div>
            <div className="text-lg font-bold mt-0.5" style={{ color: 'var(--text-primary)' }}>
              {fix?.hplMeters ? `${fix.hplMeters.toFixed(1)} m` : 'n/a'}
            </div>
          </div>
        </div>

        {fix?.lat !== undefined && (
          <div className="text-[11px] space-y-0.5 pt-1" style={{ color: 'var(--text-muted)' }}>
            <div>
              Estimated Coords: <span style={{ color: 'var(--text-primary)' }}>{fix.lat.toFixed(5)}°, {fix.lng.toFixed(5)}°</span>
            </div>
            {rx && (
              <div>
                Ground Truth: <span style={{ color: 'var(--text-secondary)' }}>{rx.lat.toFixed(5)}°, {rx.lng.toFixed(5)}°</span>
              </div>
            )}
            {fix.toaNoiseStdDevMeters !== undefined && (
              <div className="flex justify-between items-center pt-1 text-[10px]">
                <span className="text-[var(--text-muted)]">TOA Measurement Noise σ_i:</span>
                <span className="text-[var(--accent-eloran)] font-bold">
                  {fix.toaNoiseStdDevMeters.toFixed(2)} m ({(fix.toaNoiseStdDevMeters / 0.299792).toFixed(1)} ns)
                </span>
              </div>
            )}
          </div>
        )}

        {/* Active Models Provenance Indicators */}
        <div className="pt-2 border-t border-[var(--border-subtle)] flex flex-wrap gap-1.5 text-[9px]">
          <span className="px-1.5 py-0.5 rounded bg-[var(--status-ok-subtle)] text-[var(--status-ok)] border border-emerald-500/20">
            Model: PF Refraction (SOURCED)
          </span>
          <span className="px-1.5 py-0.5 rounded bg-[var(--status-ok-subtle)] text-[var(--status-ok)] border border-emerald-500/20">
            Model: TOA Noise (SOURCED)
          </span>
          {settings.asfModelMode === 'millington' ? (
            <span className="px-1.5 py-0.5 rounded bg-[var(--status-ok-subtle)] text-[var(--status-ok)] border border-emerald-500/20">
              Model: Millington ASF (SOURCED/UNVERIFIED)
            </span>
          ) : (
            <span className="px-1.5 py-0.5 rounded bg-[var(--status-warn-subtle)] text-[var(--status-warn)] border border-amber-500/20">
              Model: AST ASF (UNVERIFIED)
            </span>
          )}
          {settings.enableSecondaryFactor && (
            <span className="px-1.5 py-0.5 rounded bg-[var(--status-warn-subtle)] text-[var(--status-warn)] border border-amber-500/20">
              Model: SF Seawater (UNVERIFIED)
            </span>
          )}
          {settings.enableCycleSlips && (
            <span className="px-1.5 py-0.5 rounded bg-[var(--status-ok-subtle)] text-[var(--status-ok)] border border-emerald-500/20">
              Model: Boyce Cycle Slip (SOURCED)
            </span>
          )}
        </div>
      </div>

      {/* Integrity Settings */}
      <div className="space-y-3 pt-1">
        <Toggle
          label="Enable Real-Time Integrity Monitoring"
          checked={settings.enableIntegrity}
          onChange={(checked) => updateSettings({ enableIntegrity: checked })}
        />
        <Slider
          label="Alarm Threshold Limit"
          value={settings.integrityThresholdMeters}
          min={10} max={200} step={5} unit="m"
          tooltip="Maximum acceptable horizontal error before triggering an alarm"
          onChange={(val) => updateSettings({ integrityThresholdMeters: val })}
        />
      </div>

      {/* DDS Telemetry Stream */}
      <div className="space-y-1.5 pt-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <span className="text-[11px] font-semibold uppercase tracking-wider block" style={{ color: 'var(--text-dim)' }}>
          eLoran Data Channel Broadcasts ({ddsLogs.length})
        </span>
        <div
          className="h-28 overflow-y-auto p-2 rounded-lg text-[10px] font-mono space-y-1"
          style={{ background: 'var(--bg-canvas)', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}
        >
          {ddsLogs.length === 0 ? (
            <div style={{ color: 'var(--text-dim)' }}>No DDS broadcast packets captured yet...</div>
          ) : (
            ddsLogs
              .slice()
              .reverse()
              .map((log, i) => (
                <div key={i} className="flex items-center justify-between pb-0.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <span style={{ color: 'var(--accent-eloran)' }}>[{log.station}]</span>
                  <span style={{ color: 'var(--text-secondary)' }}>Seq #{log.seq}</span>
                  <span style={{ color: 'var(--text-muted)' }}>Diff: {log.diffMeters}m</span>
                  <span style={{ color: 'var(--status-ok)' }}>{log.integrityStatus}</span>
                </div>
              ))
          )}
        </div>
      </div>
    </div>
  );
}

