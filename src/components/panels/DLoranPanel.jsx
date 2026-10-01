import React, { useState, useMemo } from 'react';
import { Radio, ShieldCheck, ShieldAlert, Wifi } from 'lucide-react';
import { useSimulationStore } from '../../state/simulationStore.js';
import Toggle from '../ui/Toggle.jsx';
import Slider from '../ui/Slider.jsx';
import InfoTooltip from '../ui/Tooltip.jsx';
import {
  computeDifferentialCorrections,
  applyDifferentialCorrections,
  encodeDloranMessage,
  DEFAULT_SPATIAL_CORR_DISTANCE_M,
  DEFAULT_TEMPORAL_CORR_TIME_SEC,
} from '../../lib/dLoran.js';

const DLORAN_MONITOR_PRESETS = [
  { id: 'rotterdam', name: 'Hook of Holland / Europort', lat: 51.980, lng: 4.120, chain: 'North Sea (6731)' },
  { id: 'dover', name: 'Dover Harbor Station', lat: 51.127, lng: 1.320, chain: 'Lessay / Anthorn (6731)' },
  { id: 'incheon', name: 'Incheon Port Station', lat: 37.452, lng: 126.598, chain: 'Korea (9930)' },
];

export default function DLoranPanel() {
  const {
    masters,
    slaves,
    receivers,
    selectedReceiver,
    settings,
    updateSettings,
    simTimeSec,
  } = useSimulationStore();

  const [selectedMonitorPreset, setSelectedMonitorPreset] = useState('rotterdam');
  const [spatialCorrKm, setSpatialCorrKm] = useState(DEFAULT_SPATIAL_CORR_DISTANCE_M / 1000);
  const [temporalCorrHours, setTemporalCorrHours] = useState(DEFAULT_TEMPORAL_CORR_TIME_SEC / 3600);
  const [simulatedTemporalShiftUs, setSimulatedTemporalShiftUs] = useState(1.4);

  const activeMonitor = useMemo(() => {
    return DLORAN_MONITOR_PRESETS.find((m) => m.id === selectedMonitorPreset) || DLORAN_MONITOR_PRESETS[0];
  }, [selectedMonitorPreset]);

  const activeRx = useMemo(() => {
    return (receivers && receivers.find((r) => r.label === selectedReceiver)) || receivers?.[0];
  }, [receivers, selectedReceiver]);

  const allStations = useMemo(() => {
    return [...masters, ...slaves];
  }, [masters, slaves]);

  // Generate simulated reference monitor measurements
  const monitorRecord = useMemo(() => {
    if (!allStations.length) return null;

    const nominalToasSec = {};
    const observedToasSec = {};

    allStations.forEach((st, i) => {
      const baseToa = 0.0015 + (i * 0.0004);
      nominalToasSec[st.label] = baseToa;
      const perStationShift = simulatedTemporalShiftUs * 1e-6 * (1.0 + (i * 0.15) * (i % 2 === 0 ? 1 : -1));
      observedToasSec[st.label] = baseToa + perStationShift;
    });

    return computeDifferentialCorrections({
      monitorPos: { lat: activeMonitor.lat, lng: activeMonitor.lng },
      stations: allStations,
      observedToasSec,
      nominalToasSec,
      timestampSec: Math.floor(simTimeSec),
    });
  }, [allStations, activeMonitor, simulatedTemporalShiftUs, simTimeSec]);

  // Apply differential corrections at the active receiver
  const userCorrectionResult = useMemo(() => {
    if (!activeRx || !monitorRecord) return null;

    return applyDifferentialCorrections({
      userPos: { lat: activeRx.lat, lng: activeRx.lng },
      monitorRecord,
      currentTimeSec: simTimeSec,
      spatialCorrM: spatialCorrKm * 1000,
      temporalCorrSec: temporalCorrHours * 3600,
    });
  }, [activeRx, monitorRecord, simTimeSec, spatialCorrKm, temporalCorrHours]);

  // Encode broadcast packet
  const broadcastPacket = useMemo(() => {
    if (!monitorRecord) return null;
    return encodeDloranMessage(monitorRecord, Math.floor(simTimeSec / 10));
  }, [monitorRecord, simTimeSec]);

  const isEnabled = Boolean(settings.enableDLoran);

  return (
    <div className="space-y-3 font-mono text-xs">
      {/* Header & Main Toggle */}
      <div
        className="p-3 rounded-lg border space-y-2.5"
        style={{ background: 'var(--bg-canvas)', borderColor: 'var(--border-subtle)' }}
      >
        <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="flex items-center gap-1.5">
            <Radio size={15} style={{ color: 'var(--accent-eloran)' }} />
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-primary)' }}>
              Differential eLoran (d-Loran)
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider"
              style={{
                background: isEnabled ? 'var(--status-ok-subtle)' : 'var(--bg-subtle)',
                color: isEnabled ? 'var(--status-ok)' : 'var(--text-dim)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              {isEnabled ? 'ACTIVE DDC' : 'STANDALONE'}
            </span>
            <InfoTooltip
              align="right"
              title="Differential Loran (d-Loran)"
              text="Broadcasts real-time temporal ASF and transmitter clock deltas from surveyed reference monitor stations via Eurofix or 9th-pulse channels, cancelling common-mode errors for harbor-entrance (<10 m) navigation."
            />
          </div>
        </div>

        <Toggle
          label="Differential Corrections"
          description="Applies real-time DDC delta corrections with spatial and temporal decorrelation."
          checked={isEnabled}
          onChange={(checked) => updateSettings({ enableDLoran: checked })}
        />
      </div>

      {/* Monitor Station Selector & Status */}
      <div
        className="p-3 rounded-lg border space-y-2.5"
        style={{ background: 'var(--bg-canvas)', borderColor: 'var(--border-subtle)' }}
      >
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-dim)' }}>
            Reference Monitor
          </label>
          <span className="text-[10px] flex items-center gap-1 font-semibold" style={{ color: 'var(--status-ok)' }}>
            <Wifi size={11} /> 100 kHz DDC
          </span>
        </div>

        {/* Clean Monitor Dropdown Selector */}
        <div className="space-y-1">
          <select
            value={selectedMonitorPreset}
            onChange={(e) => setSelectedMonitorPreset(e.target.value)}
            className="w-full text-xs p-2 rounded border bg-[var(--bg-surface)] text-[var(--text-primary)] border-[var(--border-subtle)] focus:border-[var(--accent-eloran)] outline-none cursor-pointer"
          >
            {DLORAN_MONITOR_PRESETS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.chain})
              </option>
            ))}
          </select>
          <div className="flex items-center justify-between text-[10px] text-[var(--text-dim)] px-1">
            <span>{activeMonitor.lat.toFixed(3)}°N, {activeMonitor.lng.toFixed(3)}°E</span>
            <span>{activeMonitor.chain}</span>
          </div>
        </div>

        {/* Live Broadcast Telemetry Strip */}
        {broadcastPacket && (
          <div
            className="p-2 rounded border space-y-1.5 text-[10px]"
            style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
          >
            <div className="flex justify-between items-center text-[9px] border-b pb-1" style={{ borderColor: 'var(--border-subtle)' }}>
              <span className="font-bold uppercase tracking-wider" style={{ color: 'var(--accent-eloran)' }}>
                Eurofix / 9th-Pulse Frame
              </span>
              <span className="font-mono text-[9px] px-1 py-0.2 rounded bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--text-dim)]">
                Seq: {broadcastPacket.seq} &bull; CRC-16: #{broadcastPacket.crc16}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-1.5 pt-0.5">
              {broadcastPacket.entries.map((e) => (
                <div key={e.st} className="p-1 rounded bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-center">
                  <span className="text-[9px] text-[var(--text-dim)] block">{e.st}</span>
                  <span className={"font-bold " + (e.us >= 0 ? "text-[var(--accent-loran-c)]" : "text-[var(--accent-eloran)]")}>
                    {e.us >= 0 ? "+" + e.us.toFixed(2) : e.us.toFixed(2)} µs
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Receiver Differential Performance */}
      {userCorrectionResult && activeRx && (
        <div
          className="p-3 rounded-lg border space-y-2.5"
          style={{ background: 'var(--bg-canvas)', borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-bold text-[var(--text-primary)] truncate">
              {activeRx.label}
            </span>
            <span className="text-[10px] font-mono" style={{ color: isEnabled ? 'var(--status-ok)' : 'var(--text-dim)' }}>
              Dist: {userCorrectionResult.distanceToMonitorKm} km
            </span>
          </div>

          {/* Spatial & Freshness Progress */}
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <div className="p-2 rounded border space-y-1" style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-dim)' }}>Spatial Corr:</span>
                <span className="font-bold">{(userCorrectionResult.spatialWeight * 100).toFixed(0)}%</span>
              </div>
              <div className="h-1 w-full rounded-full bg-[var(--bg-canvas)] overflow-hidden">
                <div
                  className="h-full rounded-full bg-[var(--accent-eloran)] transition-all"
                  style={{ width: `${Math.min(100, userCorrectionResult.spatialWeight * 100)}%` }}
                />
              </div>
              <span className="text-[9px] text-[var(--text-dim)]">Radius: {spatialCorrKm} km</span>
            </div>

            <div className="p-2 rounded border space-y-1" style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-dim)' }}>Freshness:</span>
                <span className="font-bold">{(userCorrectionResult.temporalWeight * 100).toFixed(0)}%</span>
              </div>
              <div className="h-1 w-full rounded-full bg-[var(--bg-canvas)] overflow-hidden">
                <div
                  className="h-full rounded-full bg-[var(--status-ok)] transition-all"
                  style={{ width: `${Math.min(100, userCorrectionResult.temporalWeight * 100)}%` }}
                />
              </div>
              <span className="text-[9px] text-[var(--text-dim)]">Age: {userCorrectionResult.ageSec.toFixed(0)}s</span>
            </div>
          </div>

          {/* Accuracy Impact Badge */}
          <div
            className="p-2.5 rounded border flex items-center justify-between gap-2"
            style={{
              background: isEnabled ? 'rgba(16, 185, 129, 0.08)' : 'var(--bg-subtle)',
              borderColor: isEnabled ? 'var(--status-ok-border)' : 'var(--border-subtle)',
            }}
          >
            <div className="flex items-center gap-2">
              {isEnabled ? <ShieldCheck size={16} className="text-[var(--status-ok)] shrink-0" /> : <ShieldAlert size={16} className="text-[var(--text-dim)] shrink-0" />}
              <div>
                <span className="font-bold text-[10px] block" style={{ color: isEnabled ? 'var(--status-ok)' : 'var(--text-primary)' }}>
                  {isEnabled ? 'Harbor-Grade (< 10 m)' : 'Standalone (~45 m)'}
                </span>
                <span className="text-[9px] text-[var(--text-dim)]">
                  {isEnabled
                    ? `Est. 2drms: ~${(userCorrectionResult.userCorrections?.M?.residualSigmaM * 2.45 || 4.2).toFixed(1)} m`
                    : 'Uncorrected seasonal ASF active'}
                </span>
              </div>
            </div>
            <span
              className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase border shrink-0"
              style={{
                background: isEnabled ? 'var(--status-ok-subtle)' : 'var(--bg-canvas)',
                borderColor: isEnabled ? 'var(--status-ok-border)' : 'var(--border-subtle)',
                color: isEnabled ? 'var(--status-ok)' : 'var(--text-dim)',
              }}
            >
              {isEnabled ? 'CORRECTED' : 'STANDALONE'}
            </span>
          </div>
        </div>
      )}

      {/* Atmospheric & Channel Sliders */}
      <div
        className="p-3 rounded-lg border space-y-2.5"
        style={{ background: 'var(--bg-canvas)', borderColor: 'var(--border-subtle)' }}
      >
        <span className="text-[10px] font-semibold uppercase tracking-wider block" style={{ color: 'var(--text-dim)' }}>
          Atmospheric & Channel Parameters
        </span>
        <Slider
          label="Atmospheric Temporal Shift"
          value={simulatedTemporalShiftUs}
          min={-3.0}
          max={3.0}
          step={0.1}
          unit=" µs"
          tooltip="Simulates temporal delay variations caused by weather front passage or seasonal soil freezing that d-Loran cancels."
          onChange={(val) => setSimulatedTemporalShiftUs(val)}
        />
        <Slider
          label="Spatial Correlation Distance"
          value={spatialCorrKm}
          min={50}
          max={300}
          step={10}
          unit=" km"
          tooltip="Effective spatial radius of differential validity. Beyond this radius, localized ground conductivities decorrelate."
          onChange={(val) => setSpatialCorrKm(val)}
        />
        <Slider
          label="Temporal Decay Constant"
          value={temporalCorrHours}
          min={1}
          max={24}
          step={1}
          unit=" h"
          tooltip="Correlation time of temporal atmospheric perturbations (typically 6-12 hours for meteorological weather fronts)."
          onChange={(val) => setTemporalCorrHours(val)}
        />
      </div>
    </div>
  );
}
