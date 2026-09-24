import React, { useState, useMemo, useRef } from 'react';
import { Download, ZoomIn, ZoomOut, Radio, Eye, Layers } from 'lucide-react';
import { useSimulationStore } from '../../state/simulationStore.js';
import { synthesizeReceiverWaveform, NOMINAL_PULSE_DURATION } from '../../lib/pulse.js';
import Toggle from '../ui/Toggle.jsx';
import Slider from '../ui/Slider.jsx';

export default function PulseViewer() {
  const {
    masters,
    slaves,
    receivers,
    selectedReceiver,
    setSelectedReceiver,
    simTimeSec,
    settings,
    updateSettings,
  } = useSimulationStore();

  const svgRef = useRef(null);

  // Local state for zoom and window
  const [windowDurationMs, setWindowDurationMs] = useState(10); // 10ms default

  const rx = receivers.find((r) => r.label === selectedReceiver) || receivers[0];
  const allStations = useMemo(
    () => [
      ...masters.map((m) => ({ ...m, role: 'master' })),
      ...slaves.map((s) => ({ ...s, role: 'slave' })),
    ],
    [masters, slaves]
  );

  // Synthesize waveform
  const { waveform, arrivals, sampleRate } = useMemo(() => {
    if (!rx || !allStations.length) {
      return { waveform: new Float32Array(0), arrivals: [], sampleRate: 1000000, totalDuration: 0.01 };
    }
    return synthesizeReceiverWaveform({
      stations: allStations,
      receiver: rx,
      totalDuration: windowDurationMs / 1000,
      simTime: simTimeSec,
      includeCarrier: settings.includeCarrier,
      includeSkywave: settings.includeSkywave,
      skywaveDelayMs: settings.skywaveDelayMs,
      skywaveAmpRatio: settings.skywaveAmpRatio,
    });
  }, [allStations, rx, windowDurationMs, simTimeSec, settings]);

  // Downsample waveform for high-performance SVG polyline
  const maxPts = 1200;
  const step = Math.max(1, Math.floor((waveform.length || 1) / maxPts));

  let maxAmp = 1e-6;
  for (let i = 0; i < waveform.length; i += step) {
    if (Math.abs(waveform[i]) > maxAmp) maxAmp = Math.abs(waveform[i]);
  }

  const polylinePoints = useMemo(() => {
    if (!waveform.length) return '';
    const pts = [];
    for (let i = 0; i < waveform.length; i += step) {
      const x = (i / waveform.length) * 1000;
      const y = 60 - ((waveform[i] || 0) / maxAmp) * 45;
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    return pts.join(' ');
  }, [waveform, step, maxAmp]);

  // Compute GRI markers (standard 1000 wide coordinate space)
  const griMs = allStations[0]?.griMs || 1000;
  const griLines = useMemo(() => {
    const lines = [];
    const windowSec = windowDurationMs / 1000;
    const griSec = griMs / 1000;
    for (let t = 0; t <= windowSec; t += griSec) {
      lines.push((t / windowSec) * 1000);
    }
    return lines;
  }, [windowDurationMs, griMs]);

  // Export SVG directly
  const handleExportSvg = () => {
    if (!svgRef.current) return;
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svgRef.current);
    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `loran-pulse-trace-${rx?.label || 'rx'}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Top Controls Bar */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 font-mono text-xs">
        <div className="flex items-center gap-3">
          <span className="text-zinc-400 font-semibold uppercase tracking-wider text-[11px]">
            Receiver Antenna:
          </span>
          <select
            value={selectedReceiver}
            onChange={(e) => setSelectedReceiver(e.target.value)}
            className="bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-1.5 text-zinc-100 font-bold"
          >
            {receivers.map((r) => (
              <option key={r.label} value={r.label}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-4">
          <Toggle
            label="100 kHz RF Carrier"
            description="Modulate envelope with RF carrier sinusoid"
            checked={settings.includeCarrier}
            onChange={(checked) => updateSettings({ includeCarrier: checked })}
          />

          <Toggle
            label="Ionospheric Skywave"
            description="Simulate multi-path ionospheric reflection"
            checked={settings.includeSkywave}
            onChange={(checked) => updateSettings({ includeSkywave: checked })}
          />

          <button
            onClick={handleExportSvg}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg transition"
          >
            <Download size={13} /> Export SVG
          </button>
        </div>
      </div>

      {/* Time Window Scale Slider */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <Slider
          label="Time Axis Observation Window"
          value={windowDurationMs}
          min={1}
          max={50}
          step={1}
          unit="ms"
          tooltip="Duration of RF sample captured at antenna input"
          onChange={setWindowDurationMs}
        />
      </div>

      {/* Primary Waveform Oscilloscope Plot */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3 shadow-2xl">
        <div className="flex justify-between items-center text-xs font-mono">
          <div className="flex items-center gap-2">
            <Radio size={14} className="text-cyan-400" />
            <span className="font-bold text-zinc-100">Antenna Composite Voltage</span>
            <span className="text-[10px] text-zinc-500">
              (Sample Rate: {(sampleRate / 1e6).toFixed(1)} MHz • Max Amplitude: {maxAmp.toFixed(1)})
            </span>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-zinc-400">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-0.5 bg-cyan-400 inline-block"></span> Composite Signal
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-0.5 bg-amber-400 inline-block"></span> GRI Grid
            </span>
          </div>
        </div>

        <div className="relative bg-zinc-950 rounded-lg border border-zinc-800/90 overflow-hidden">
          <svg
            ref={svgRef}
            viewBox="0 0 1000 120"
            preserveAspectRatio="none"
            className="w-full h-44 cursor-crosshair"
          >
            {/* Horizontal centerline */}
            <line x1="0" y1="60" x2="1000" y2="60" stroke="#27272a" strokeWidth="1" />

            {/* GRI vertical timing lines */}
            {griLines.map((x, i) => (
              <line
                key={`gri-${i}`}
                x1={x}
                y1="0"
                x2={x}
                y2="120"
                stroke="#d97706"
                strokeWidth="0.8"
                strokeDasharray="3 3"
                opacity="0.6"
              />
            ))}

            {/* Station arrival delay flags */}
            {arrivals.map((arr, i) => {
              const relSec = arr.arrivalSec - simTimeSec;
              const x = (relSec / (windowDurationMs / 1000)) * 1000;
              const color = arr.role === 'master' ? '#06b6d4' : '#f59e0b';
              return (
                <g key={`arr-${i}`}>
                  <line
                    x1={x}
                    y1="10"
                    x2={x}
                    y2="120"
                    stroke={color}
                    strokeWidth="1.2"
                    strokeDasharray={arr.isSkywave ? '2 2' : 'none'}
                    opacity="0.85"
                  />
                  <polygon
                    points={`${x},10 ${x - 4},2 ${x + 4},2`}
                    fill={color}
                  />
                  <text
                    x={x + 3}
                    y="18"
                    fontSize="9"
                    fill={color}
                    fontFamily="monospace"
                    fontWeight="bold"
                  >
                    {arr.station} {arr.isSkywave ? '(Sky)' : ''}
                  </text>
                </g>
              );
            })}

            {/* Synthesized RF Waveform Polyline */}
            {polylinePoints && (
              <polyline
                points={polylinePoints}
                fill="none"
                stroke="#06b6d4"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            )}
          </svg>

          {/* Time axis markers */}
          <div className="flex justify-between px-2 py-1 bg-zinc-900 border-t border-zinc-800 text-[10px] font-mono text-zinc-500">
            <span>0 ms</span>
            <span>{(windowDurationMs * 0.25).toFixed(1)} ms</span>
            <span>{(windowDurationMs * 0.5).toFixed(1)} ms</span>
            <span>{(windowDurationMs * 0.75).toFixed(1)} ms</span>
            <span>{windowDurationMs.toFixed(1)} ms</span>
          </div>
        </div>
      </div>

      {/* Per-Station Breakdown Tracks */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
        <div className="text-xs font-mono font-bold text-zinc-200 uppercase tracking-wider flex items-center gap-2">
          <Layers size={14} className="text-cyan-400" /> Station Component Tracks
        </div>

        <div className="space-y-3 font-mono text-xs">
          {allStations.map((station) => {
            const stArrivals = arrivals.filter((a) => a.station === station.label);
            return (
              <div
                key={station.label}
                className="bg-zinc-950 p-3 rounded-lg border border-zinc-800 space-y-1.5"
              >
                <div className="flex justify-between items-center text-[11px]">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        station.role === 'master' ? 'bg-cyan-400' : 'bg-amber-400'
                      }`}
                    />
                    <span className="font-bold text-zinc-100">{station.label}</span>
                    <span className="text-zinc-500 uppercase text-[10px]">
                      [{station.role} • {station.txDbm}dBm]
                    </span>
                  </div>
                  <div className="text-zinc-400 text-[10px]">
                    {stArrivals.length
                      ? `Arrival at ${(stArrivals[0].arrivalSec * 1000).toFixed(3)} ms`
                      : 'No arrival in active window'}
                  </div>
                </div>

                <div className="h-6 bg-zinc-900/80 rounded relative overflow-hidden">
                  {stArrivals.map((a, i) => {
                    const relSec = a.arrivalSec - simTimeSec;
                    const pct = (relSec / (windowDurationMs / 1000)) * 100;
                    return (
                      <div
                        key={i}
                        className={`absolute top-0 bottom-0 w-1 ${
                          station.role === 'master' ? 'bg-cyan-400' : 'bg-amber-400'
                        }`}
                        style={{ left: `${Math.min(99, Math.max(0, pct))}%` }}
                        title={`${station.label} Arrival`}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
