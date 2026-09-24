import React from 'react';
import { ShieldCheck, AlertTriangle, Radio, Navigation, Compass } from 'lucide-react';
import { useSimulationStore } from '../../state/simulationStore.js';
import Slider from '../ui/Slider.jsx';
import Toggle from '../ui/Toggle.jsx';

export default function FusionPanel() {
  const {
    receivers,
    receiverFixes,
    selectedReceiver,
    setSelectedReceiver,
    updateStation,
    settings,
    updateSettings,
    ddsLogs,
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

  return (
    <div className="space-y-4">
      {/* Receiver Selector */}
      {receivers.length > 1 && (
        <div>
          <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block mb-1.5">
            Active Receiver Unit
          </label>
          <select
            value={selectedReceiver}
            onChange={(e) => setSelectedReceiver(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 font-mono"
          >
            {receivers.map((r) => (
              <option key={r.label} value={r.label}>
                {r.label} ({r.lat.toFixed(4)}°, {r.lng.toFixed(4)}°)
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Positioning Mode Switcher */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">
          PNT Navigation Architecture
        </label>
        <div className="grid grid-cols-3 gap-1.5 font-mono text-xs">
          <button
            onClick={() => handleModeChange('fusion')}
            className={`py-2 px-2 rounded-lg border text-center transition flex flex-col items-center gap-1 ${
              currentMode === 'fusion'
                ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 font-bold'
                : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'
            }`}
          >
            <Compass size={14} /> Fused Mode
          </button>
          <button
            onClick={() => handleModeChange('eLoran')}
            className={`py-2 px-2 rounded-lg border text-center transition flex flex-col items-center gap-1 ${
              currentMode === 'eLoran'
                ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 font-bold'
                : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'
            }`}
          >
            <Radio size={14} /> eLoran Only
          </button>
          <button
            onClick={() => handleModeChange('GNSS')}
            className={`py-2 px-2 rounded-lg border text-center transition flex flex-col items-center gap-1 ${
              currentMode === 'GNSS'
                ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 font-bold'
                : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'
            }`}
          >
            <Navigation size={14} /> GNSS Only
          </button>
        </div>
      </div>

      {/* Real-time Position & Integrity Metric Cards */}
      <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800 space-y-3 font-mono text-xs">
        <div className="flex justify-between items-center pb-2 border-b border-zinc-800/80">
          <span className="text-zinc-400">Integrity Status:</span>
          {isAlarm ? (
            <span className="inline-flex items-center gap-1 text-red-400 font-bold animate-pulse">
              <AlertTriangle size={13} /> INTEGRITY ALARM
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold">
              <ShieldCheck size={13} /> CHANNEL NOMINAL
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-zinc-900/60 p-2.5 rounded border border-zinc-800">
            <div className="text-[10px] text-zinc-500 uppercase">True Position Error</div>
            <div
              className={`text-lg font-bold mt-0.5 ${
                fix?.errorMeters > settings.integrityThresholdMeters
                  ? 'text-red-400'
                  : 'text-cyan-300'
              }`}
            >
              {fix?.errorMeters ? `${fix.errorMeters.toFixed(1)} m` : 'Calculating...'}
            </div>
          </div>

          <div className="bg-zinc-900/60 p-2.5 rounded border border-zinc-800">
            <div className="text-[10px] text-zinc-500 uppercase">Protection Level (HPL)</div>
            <div className="text-lg font-bold text-zinc-100 mt-0.5">
              {fix?.hplMeters ? `${fix.hplMeters.toFixed(1)} m` : 'n/a'}
            </div>
          </div>
        </div>

        {fix?.lat !== undefined && (
          <div className="text-[11px] text-zinc-400 space-y-0.5 pt-1">
            <div>
              Estimated Coords: <span className="text-zinc-200">{fix.lat.toFixed(5)}°, {fix.lng.toFixed(5)}°</span>
            </div>
            {rx && (
              <div>
                Ground Truth: <span className="text-zinc-400">{rx.lat.toFixed(5)}°, {rx.lng.toFixed(5)}°</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Integrity Threshold Settings */}
      <div className="space-y-3 pt-1">
        <Toggle
          label="Enable Real-Time Integrity Monitoring"
          checked={settings.enableIntegrity}
          onChange={(checked) => updateSettings({ enableIntegrity: checked })}
        />

        <Slider
          label="Alarm Threshold Limit"
          value={settings.integrityThresholdMeters}
          min={10}
          max={200}
          step={5}
          unit="m"
          tooltip="Maximum acceptable horizontal error before triggering an alarm"
          onChange={(val) => updateSettings({ integrityThresholdMeters: val })}
        />
      </div>

      {/* DDS Telemetry Stream */}
      <div className="space-y-1.5 pt-2 border-t border-zinc-800/80">
        <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block">
          eLoran Data Channel Broadcasts ({ddsLogs.length})
        </span>
        <div className="h-28 overflow-y-auto bg-zinc-950 p-2 rounded-lg border border-zinc-800 text-[10px] font-mono space-y-1 text-zinc-400">
          {ddsLogs.length === 0 ? (
            <div className="text-zinc-600 italic">No DDS broadcast packets captured yet...</div>
          ) : (
            ddsLogs
              .slice()
              .reverse()
              .map((log, i) => (
                <div key={i} className="flex items-center justify-between border-b border-zinc-900 pb-0.5">
                  <span className="text-cyan-400">[{log.station}]</span>
                  <span className="text-zinc-300">Seq #{log.seq}</span>
                  <span className="text-zinc-500">Diff: {log.diffMeters}m</span>
                  <span className="text-emerald-400">{log.integrityStatus}</span>
                </div>
              ))
          )}
        </div>
      </div>
    </div>
  );
}
