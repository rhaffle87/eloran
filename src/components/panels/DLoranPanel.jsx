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
  { id: 'rotterdam', name: 'Hook of Holland / Europort Monitor', lat: 51.980, lng: 4.120, chain: 'North Sea (6731)' },
  { id: 'dover', name: 'Dover Harbor Reference Station', lat: 51.127, lng: 1.320, chain: 'Lessay / Anthorn (6731)' },
  { id: 'incheon', name: 'Incheon Port Reference Station', lat: 37.452, lng: 126.598, chain: 'Korea (9930)' },
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
  const [spatialCorrKm, setSpatialCorrKm] = useState(DEFAULT_SPATIAL_CORR_DISTANCE_M / 1000); // 120 km
  const [temporalCorrHours, setTemporalCorrHours] = useState(DEFAULT_TEMPORAL_CORR_TIME_SEC / 3600); // 8 h
  const [simulatedTemporalShiftUs, setSimulatedTemporalShiftUs] = useState(1.4); // 1.4 us atmospheric/weather shift

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
      // Base nominal travel time ~ 1-3 ms
      const baseToa = 0.0015 + (i * 0.0004);
      nominalToasSec[st.label] = baseToa;

      // Simulated unmodelled temporal shift (weather/ground conductivity delta)
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
    <div className="space-y-4 font-mono text-xs">
      {/* Header & Main Toggle */}
      <div
        className="p-4 rounded-xl border space-y-3"
        style={{ background: 'var(--bg-canvas)', borderColor: 'var(--border-subtle)' }}
      >
        <div className="flex items-center justify-between border-b pb-2.5" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="flex items-center gap-2">
            <Radio size={16} style={{ color: 'var(--accent-eloran)' }} />
            <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
              Differential eLoran (d-Loran)
            </span>
            <span
              className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase"
              style={{
                background: isEnabled ? 'var(--status-ok-subtle)' : 'var(--bg-subtle)',
                color: isEnabled ? 'var(--status-ok)' : 'var(--text-dim)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              {isEnabled ? 'ACTIVE DDC' : 'STANDALONE'}
            </span>
          </div>
          <InfoTooltip content="Differential eLoran broadcasts real-time temporal ASF and transmitter clock deltas from surveyed reference monitor stations via Eurofix or 9th-pulse channels, cancelling common-mode errors for harbor-entrance (<10 m) navigation." />
        </div>

        <Toggle
          label="Enable Differential Corrections"
          description="Apply real-time DDC/Eurofix delta corrections at the receiver with spatial and temporal decorrelation."
          checked={isEnabled}
          onChange={(checked) => updateSettings({ enableDLoran: checked })}
        />
      </div>

      {/* Monitor Station Selector & Status */}
      <div
        className="p-4 rounded-xl border space-y-3"
        style={{ background: 'var(--bg-canvas)', borderColor: 'var(--border-subtle)' }}
      >
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-dim)' }}>
            Reference Monitor Station
          </label>
          <span className="text-[10px] flex items-center gap-1 font-semibold" style={{ color: 'var(--status-ok)' }}>
            <Wifi size={12} /> DDC Broadcast 100 kHz
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {DLORAN_MONITOR_PRESETS.map((m) => (
            <button
              key={m.id}
              onClick={() => setSelectedMonitorPreset(m.id)}
              className="p-2.5 rounded-lg border text-left transition cursor-pointer"
              style={{
                background: selectedMonitorPreset === m.id ? 'var(--accent-eloran-subtle)' : 'var(--bg-subtle)',
                borderColor: selectedMonitorPreset === m.id ? 'var(--accent-eloran-border)' : 'var(--border-subtle)',
                color: selectedMonitorPreset === m.id ? 'var(--accent-eloran)' : 'var(--text-primary)',
              }}
            >
              <div className="font-bold text-[11px] truncate">{m.name}</div>
              <div className="text-[10px] opacity-75 mt-0.5">{m.lat.toFixed(3)}°N, {m.lng.toFixed(3)}°E</div>
              <div className="text-[9px] mt-1 text-[var(--text-dim)]">{m.chain}</div>
            </button>
          ))}
        </div>

        {/* Live Broadcast Telemetry Frame */}
        {broadcastPacket && (
          <div
            className="p-2.5 rounded-lg border space-y-1.5 text-[11px]"
            style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
          >
            <div className="flex justify-between items-center text-[10px] border-b pb-1" style={{ borderColor: 'var(--border-subtle)' }}>
              <span className="font-bold uppercase" style={{ color: 'var(--accent-eloran)' }}>
                Eurofix / 9th-Pulse LDC Packet
              </span>
              <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-[var(--bg-canvas)] border border-[var(--border-subtle)]">
                Seq: {broadcastPacket.seq} &bull; CRC-16: #{broadcastPacket.crc16}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1 text-[10px]">
              {broadcastPacket.entries.map((e) => (
                <div key={e.st} className="p-1.5 rounded bg-[var(--bg-canvas)] border border-[var(--border-subtle)] flex justify-between items-center">
                  <span className="font-bold">Station {e.st}:</span>
                  <span className={e.us >= 0 ? 'text-[var(--accent-loran-c)]' : 'text-[var(--accent-eloran)]'}>
                    {e.us >= 0 ? `+${e.us.toFixed(2)}` : e.us.toFixed(2)} µs
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
          className="p-4 rounded-xl border space-y-3"
          style={{ background: 'var(--bg-canvas)', borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-dim)' }}>
              Receiver Differential Reception: {activeRx.label}
            </span>
            <span className="text-[10px] font-bold" style={{ color: isEnabled ? 'var(--status-ok)' : 'var(--text-dim)' }}>
              Distance: {userCorrectionResult.distanceToMonitorKm} km
            </span>
          </div>

          {/* Spatial & Temporal Weights */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 rounded-lg border space-y-1" style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}>
              <div className="flex justify-between text-[10px]">
                <span style={{ color: 'var(--text-dim)' }}>Spatial Correlation:</span>
                <span className="font-bold">{(userCorrectionResult.spatialWeight * 100).toFixed(1)}%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-[var(--bg-canvas)] overflow-hidden">
                <div
                  className="h-full rounded-full bg-[var(--accent-eloran)] transition-all"
                  style={{ width: `${Math.min(100, userCorrectionResult.spatialWeight * 100)}%` }}
                />
              </div>
              <span className="text-[9px] text-[var(--text-dim)] block">
                Scale: {spatialCorrKm} km radius
              </span>
            </div>

            <div className="p-2.5 rounded-lg border space-y-1" style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}>
              <div className="flex justify-between text-[10px]">
                <span style={{ color: 'var(--text-dim)' }}>Correction Freshness:</span>
                <span className="font-bold">{(userCorrectionResult.temporalWeight * 100).toFixed(1)}%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-[var(--bg-canvas)] overflow-hidden">
                <div
                  className="h-full rounded-full bg-[var(--status-ok)] transition-all"
                  style={{ width: `${Math.min(100, userCorrectionResult.temporalWeight * 100)}%` }}
                />
              </div>
              <span className="text-[9px] text-[var(--text-dim)] block">
                Age: {userCorrectionResult.ageSec.toFixed(0)}s &bull; tau: {temporalCorrHours}h
              </span>
            </div>
          </div>

          {/* Accuracy Impact Comparison Badge */}
          <div
            className="p-3 rounded-lg border flex items-center justify-between"
            style={{
              background: isEnabled ? 'rgba(16, 185, 129, 0.08)' : 'var(--bg-subtle)',
              borderColor: isEnabled ? 'var(--status-ok-border)' : 'var(--border-subtle)',
            }}
          >
            <div className="flex items-center gap-2.5">
              {isEnabled ? <ShieldCheck size={20} className="text-[var(--status-ok)] shrink-0" /> : <ShieldAlert size={20} className="text-[var(--text-dim)] shrink-0" />}
              <div>
                <span className="font-bold text-[11px] block" style={{ color: isEnabled ? 'var(--status-ok)' : 'var(--text-primary)' }}>
                  {isEnabled ? 'Harbor-Entrance Grade Accuracy (< 10 m)' : 'Standard Standalone Positioning (~45 m)'}
                </span>
                <span className="text-[10px]" style={{ color: 'var(--text-dim)' }}>
                  {isEnabled
                    ? `Estimated 2drms: ~${(userCorrectionResult.userCorrections?.M?.residualSigmaM * 2.45 || 4.2).toFixed(1)} m (Common-mode error canceled)`
                    : 'Uncorrected seasonal ASF delay and transmitter clock offsets remain active.'}
                </span>
              </div>
            </div>
            <span
              className="text-[10px] font-bold px-2 py-1 rounded uppercase border"
              style={{
                background: isEnabled ? 'var(--status-ok-subtle)' : 'var(--bg-canvas)',
                borderColor: isEnabled ? 'var(--status-ok-border)' : 'var(--border-subtle)',
                color: isEnabled ? 'var(--status-ok)' : 'var(--text-dim)',
              }}
            >
              {isEnabled ? 'CORRECTED' : 'UNCORRECTED'}
            </span>
          </div>
        </div>
      )}

      {/* Atmospheric / Seasonal Variation & Parameters Sliders */}
      <div
        className="p-4 rounded-xl border space-y-3"
        style={{ background: 'var(--bg-canvas)', borderColor: 'var(--border-subtle)' }}
      >
        <span className="text-xs font-semibold uppercase tracking-wider block" style={{ color: 'var(--text-dim)' }}>
          d-Loran Propagation & Channel Parameters
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
