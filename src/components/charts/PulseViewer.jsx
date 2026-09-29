import React, { useState, useMemo, useRef } from 'react';
import {
  Download, FileText, Radio, Layers, Activity,
  Sliders, ShieldCheck, RotateCcw,
} from 'lucide-react';
import { useSimulationStore } from '../../state/simulationStore.js';
import { synthesizeReceiverWaveform } from '../../lib/pulse.js';
import Toggle from '../ui/Toggle.jsx';
import Slider from '../ui/Slider.jsx';

export default function PulseViewer() {
  const {
    masters, slaves, receivers, selectedReceiver,
    setSelectedReceiver, simTimeSec, settings, updateSettings,
  } = useSimulationStore();

  const svgRef = useRef(null);

  // Timebase & Oscilloscope Controls
  const [windowDurationMs, setWindowDurationMs] = useState(10);
  const [timeOffsetUs, setTimeOffsetUs] = useState(0);
  const [verticalGain, setVerticalGain] = useState(1.0); // 0.5, 1.0, 2.0, 5.0
  const [noiseSnrDb, setNoiseSnrDb] = useState(null); // null = off, or -5 to 30 dB
  const [showProbes, setShowProbes] = useState(true);

  const rx = useMemo(() => receivers.find((r) => r.label === selectedReceiver) || receivers[0] || { label: 'R1-Vessel', lat: -6.15, lng: 106.82 }, [receivers, selectedReceiver]);

  const allStations = useMemo(
    () => [
      ...masters.map((m) => ({ ...m, role: 'master' })),
      ...slaves.map((s) => ({ ...s, role: 'slave' })),
    ],
    [masters, slaves]
  );

  // Effective simulation start time accounting for horizontal trigger offset
  const effectiveSimTime = simTimeSec + (timeOffsetUs / 1e6);

  const { waveform: rawWaveform, envelope, arrivals, sampleRate } = useMemo(() => {
    if (!rx || !allStations.length) {
      return {
        waveform: new Float32Array(0),
        envelope: new Float32Array(0),
        arrivals: [],
        sampleRate: 1000000,
      };
    }
    return synthesizeReceiverWaveform({
      stations: allStations,
      receiver: rx,
      totalDuration: windowDurationMs / 1000,
      simTime: effectiveSimTime,
      includeCarrier: settings.includeCarrier,
      includeSkywave: settings.includeSkywave,
      skywaveDelayMs: settings.skywaveDelayMs,
      skywaveAmpRatio: settings.skywaveAmpRatio,
    });
  }, [allStations, rx, windowDurationMs, effectiveSimTime, settings]);

  // Downsample for high-performance SVG polylines
  const maxPts = 1600;
  const step = Math.max(1, Math.floor((rawWaveform.length || 1) / maxPts));

  // Determine base signal peak
  let baseMaxAmp = 1e-6;
  for (let i = 0; i < rawWaveform.length; i += step) {
    if (Math.abs(rawWaveform[i]) > baseMaxAmp) baseMaxAmp = Math.abs(rawWaveform[i]);
    if (envelope && Math.abs(envelope[i]) > baseMaxAmp) baseMaxAmp = Math.abs(envelope[i]);
  }

  // Synthesize realistic Gaussian RF noise if enabled
  const waveform = useMemo(() => {
    if (noiseSnrDb === null || noiseSnrDb === undefined || !rawWaveform.length) {
      return rawWaveform;
    }
    const noisy = new Float32Array(rawWaveform.length);
    // Linear noise sigma based on SNR definition: SNR = (Vpk^2) / (2 * sigma^2)
    const sigma = baseMaxAmp / Math.pow(10, noiseSnrDb / 20);
    // Box-Muller generator with fixed seed per window for stability
    let seed = 12345;
    const rng = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    for (let i = 0; i < rawWaveform.length; i++) {
      const u1 = Math.max(1e-12, rng());
      const u2 = rng();
      const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
      noisy[i] = rawWaveform[i] + sigma * z0;
    }
    return noisy;
  }, [rawWaveform, noiseSnrDb, baseMaxAmp]);

  // Display peak with gain multiplier
  const maxAmp = baseMaxAmp;
  const effectiveScale = verticalGain / maxAmp;

  // RF carrier wave polyline (oscillates between positive and negative)
  const polylinePoints = useMemo(() => {
    if (!waveform.length) return '';
    const pts = [];
    for (let i = 0; i < waveform.length; i += step) {
      const x = (i / waveform.length) * 1000;
      const rawY = 100 - ((waveform[i] || 0) * effectiveScale) * 78;
      const y = Math.max(8, Math.min(192, rawY)); // Clamp inside bezel
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    return pts.join(' ');
  }, [waveform, step, effectiveScale]);

  // Standard Loran-C pulse envelope curve (red curve)
  const envelopePoints = useMemo(() => {
    if (!envelope || !envelope.length || !settings.includeCarrier) return '';
    const pts = [];
    for (let i = 0; i < envelope.length; i += step) {
      const x = (i / envelope.length) * 1000;
      const rawY = 100 - ((envelope[i] || 0) * effectiveScale) * 78;
      const y = Math.max(8, Math.min(192, rawY));
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    return pts.join(' ');
  }, [envelope, step, effectiveScale, settings.includeCarrier]);

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

  // Scope Measurements HUD metrics
  const vPeak = maxAmp;
  const vPp = maxAmp * 2;
  const vRms = maxAmp / Math.SQRT2;
  // Estimated power into standard 50 Ohm receiver front-end
  const pWatts = (vRms * vRms) / 50;
  const pDbm = 10 * Math.log10(Math.max(1e-15, pWatts * 1000));
  const activeStationsCount = arrivals.filter((a) => !a.isSkywave).length;

  // Single-pulse zoom mode detection (window <= 0.5 ms)
  const isSinglePulseZoom = windowDurationMs <= 0.5;

  // Presentation-Grade Vector SVG Export
  const handleExportSvg = () => {
    if (!waveform.length) return;
    const exportWidth = 1200;
    const exportHeight = 560;
    const padX = 85;
    const padRight = 45;
    const chartW = exportWidth - padX - padRight;
    const topY = 115;
    const chartH = 360;
    const midY = topY + chartH / 2;
    const botY = topY + chartH;

    const ptsCount = Math.min(waveform.length, 2400);
    const expStep = Math.max(1, Math.floor(waveform.length / ptsCount));
    let wavePath = '';
    let envPath = '';

    for (let i = 0; i < waveform.length; i += expStep) {
      const px = padX + (i / waveform.length) * chartW;
      const pyWave = Math.max(topY + 6, Math.min(botY - 6, midY - ((waveform[i] || 0) * effectiveScale) * (chartH * 0.44)));
      const pyEnv = Math.max(topY + 6, Math.min(botY - 6, midY - (((envelope && envelope[i]) || 0) * effectiveScale) * (chartH * 0.44)));
      const cmd = i === 0 ? 'M' : 'L';
      wavePath += `${cmd} ${px.toFixed(1)} ${pyWave.toFixed(1)} `;
      if (envelope && envelope.length) {
        envPath += `${cmd} ${px.toFixed(1)} ${pyEnv.toFixed(1)} `;
      }
    }

    // Time axis grid & labels (10 divisions)
    let gridLinesSvg = '';
    for (let div = 0; div <= 10; div++) {
      const gx = padX + (div / 10) * chartW;
      const frac = div / 10;
      const timeVal = windowDurationMs < 1
        ? `${(frac * windowDurationMs * 1000).toFixed(0)} µs`
        : `${(frac * windowDurationMs).toFixed(1)} ms`;
      gridLinesSvg += `
        <line x1="${gx.toFixed(1)}" y1="${topY}" x2="${gx.toFixed(1)}" y2="${botY}" stroke="#1e293b" stroke-width="1" stroke-dasharray="2 3" />
        <text x="${gx.toFixed(1)}" y="${botY + 22}" fill="#94a3b8" font-size="11" font-family="ui-monospace, monospace" text-anchor="middle">${timeVal}</text>
      `;
    }

    // Amplitude grid lines
    const ampLines = [
      { y: midY - chartH * 0.44, label: `+${(maxAmp / verticalGain).toFixed(2)} V` },
      { y: midY - chartH * 0.22, label: `+${((maxAmp * 0.5) / verticalGain).toFixed(2)} V` },
      { y: midY, label: '0.00 V' },
      { y: midY + chartH * 0.22, label: `-${((maxAmp * 0.5) / verticalGain).toFixed(2)} V` },
      { y: midY + chartH * 0.44, label: `-${(maxAmp / verticalGain).toFixed(2)} V` },
    ];
    let ampGridSvg = '';
    ampLines.forEach((l) => {
      const isCenter = Math.abs(l.y - midY) < 1;
      ampGridSvg += `
        <line x1="${padX}" y1="${l.y.toFixed(1)}" x2="${padX + chartW}" y2="${l.y.toFixed(1)}" stroke="${isCenter ? '#334155' : '#1e293b'}" stroke-width="${isCenter ? '1.5' : '1'}" />
        <text x="${padX - 12}" y="${(l.y + 4).toFixed(1)}" fill="#94a3b8" font-size="11" font-family="ui-monospace, monospace" text-anchor="end">${l.label}</text>
      `;
    });

    // Station arrival markers
    let arrivalsSvg = '';
    arrivals.forEach((arr) => {
      const relSec = arr.arrivalSec - effectiveSimTime;
      const frac = relSec / (windowDurationMs / 1000);
      if (frac >= 0 && frac <= 1) {
        const ax = padX + frac * chartW;
        const color = arr.role === 'master' ? '#06b6d4' : '#f59e0b';
        arrivalsSvg += `
          <g>
            <line x1="${ax.toFixed(1)}" y1="${topY}" x2="${ax.toFixed(1)}" y2="${botY}" stroke="${color}" stroke-width="1.5" stroke-dasharray="${arr.isSkywave ? '3 3' : 'none'}" opacity="0.85" />
            <polygon points="${ax.toFixed(1)},${topY + 12} ${(ax - 5).toFixed(1)},${topY} ${(ax + 5).toFixed(1)},${topY}" fill="${color}" />
            <text x="${(ax + 5).toFixed(1)}" y="${topY + 22}" fill="${color}" font-size="10" font-family="ui-monospace, monospace" font-weight="bold">${arr.station} ${arr.isSkywave ? '(Sky)' : ''}</text>
          </g>
        `;
      }
    });

    // SZC reference marker in single pulse mode
    let szcMarkersSvg = '';
    if (isSinglePulseZoom && arrivals.length > 0) {
      const firstArr = arrivals[0];
      const relSec = firstArr.arrivalSec - effectiveSimTime;
      const t30Sec = relSec + 30e-6;
      const t65Sec = relSec + 65e-6;
      const frac30 = t30Sec / (windowDurationMs / 1000);
      const frac65 = t65Sec / (windowDurationMs / 1000);

      if (frac30 >= 0 && frac30 <= 1) {
        const x30 = padX + frac30 * chartW;
        szcMarkersSvg += `
          <g>
            <line x1="${x30.toFixed(1)}" y1="${topY}" x2="${x30.toFixed(1)}" y2="${botY}" stroke="#10b981" stroke-width="1.8" stroke-dasharray="3 2" />
            <rect x="${(x30 - 45).toFixed(1)}" y="${botY - 32}" width="90" height="20" rx="3" fill="#064e3b" stroke="#10b981" stroke-width="1" />
            <text x="${x30.toFixed(1)}" y="${botY - 18}" fill="#ecfdf5" font-size="10" font-family="ui-monospace, monospace" font-weight="bold" text-anchor="middle">SZC: 30 µs (3rd Cycle)</text>
          </g>
        `;
      }

      if (frac65 >= 0 && frac65 <= 1) {
        const x65 = padX + frac65 * chartW;
        szcMarkersSvg += `
          <g>
            <line x1="${x65.toFixed(1)}" y1="${topY}" x2="${x65.toFixed(1)}" y2="${botY}" stroke="#ef4444" stroke-width="1.8" stroke-dasharray="3 2" />
            <rect x="${(x65 - 42).toFixed(1)}" y="${botY - 56}" width="84" height="20" rx="3" fill="#7f1d1d" stroke="#ef4444" stroke-width="1" />
            <text x="${x65.toFixed(1)}" y="${botY - 42}" fill="#fef2f2" font-size="10" font-family="ui-monospace, monospace" font-weight="bold" text-anchor="middle">Peak τ: 65 µs</text>
          </g>
        `;
      }
    }

    const windowTitle = windowDurationMs < 1
      ? `${(windowDurationMs * 1000).toFixed(0)} µs`
      : `${windowDurationMs.toFixed(1)} ms`;

    const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${exportWidth} ${exportHeight}" width="${exportWidth}" height="${exportHeight}" preserveAspectRatio="xMidYMid meet">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#080c14" />
      <stop offset="100%" stop-color="#03050a" />
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="${exportWidth}" height="${exportHeight}" fill="url(#bgGrad)" rx="10" />

  <!-- Oscilloscope Bezel -->
  <rect x="${padX}" y="${topY}" width="${chartW}" height="${chartH}" fill="#03050a" stroke="#1e293b" stroke-width="1.5" rx="6" />

  <!-- Header Info -->
  <text x="${padX}" y="38" fill="#f8fafc" font-size="18" font-family="ui-monospace, monospace" font-weight="bold">Loran-C / eLoran Antenna Composite Voltage</text>
  <text x="${padX}" y="60" fill="#94a3b8" font-size="12" font-family="ui-monospace, monospace">Receiver: ${rx?.label || 'R1-Vessel'} (Lat: ${rx?.lat?.toFixed(4) || '0.0000'}°, Lon: ${rx?.lng?.toFixed(4) || '0.0000'}°) · Window: ${windowTitle} · Gain: ${verticalGain}x · Sample Rate: ${(sampleRate / 1e6).toFixed(1)} MHz</text>
  <text x="${padX}" y="78" fill="#64748b" font-size="10" font-family="ui-monospace, monospace">Standards: USCG Specification COMDTINST M16562.4A · CCIR Rec. 589 · 100 kHz Groundwave Discrimination</text>

  <!-- Scope HUD Box in SVG Header -->
  <g transform="translate(${exportWidth - 440}, 24)">
    <rect width="395" height="66" fill="#0f172a" stroke="#334155" stroke-width="1" rx="6" />
    <text x="14" y="22" fill="#38bdf8" font-size="11" font-family="ui-monospace, monospace" font-weight="bold">SCOPE HUD TELEMETRY</text>
    <text x="14" y="42" fill="#cbd5e1" font-size="10" font-family="ui-monospace, monospace">Vpk: ${(vPeak * 1000).toFixed(1)} mV  |  Vpp: ${(vPp * 1000).toFixed(1)} mV  |  fc: 100.0 kHz</text>
    <text x="14" y="54" fill="#cbd5e1" font-size="10" font-family="ui-monospace, monospace">SZC: 30.0 µs  |  τpk: 65.0 µs  |  Prx: ${pDbm.toFixed(1)} dBm  |  Gain: ${verticalGain}x</text>\n    <text x="14" y="68" fill="#94a3b8" font-size="9" font-family="ui-monospace, monospace">Traces: Pulse Envelope E(t) (Red) · Pulse Wave (100 kHz) (Cyan)</text>\n  </g>

  <!-- Grid and Ticks -->
  ${gridLinesSvg}
  ${ampGridSvg}

  <!-- SZC / Peak Reference Markers -->
  ${szcMarkersSvg}

  <!-- Arrival Markers -->
  ${arrivalsSvg}

  <!-- Waveform Traces -->
  ${envPath ? `<path d="${envPath}" fill="none" stroke="#ef4444" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" opacity="0.95" />` : ''}
  ${settings.includeCarrier && wavePath ? `<path d="${wavePath}" fill="none" stroke="#06b6d4" stroke-width="1.3" stroke-linejoin="round" />` : ''}
</svg>`;

    const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `loran-pulse-trace-${rx?.label || 'rx'}-${windowTitle.replace(/\s+/g, '')}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Raw Tabular Data CSV Export for MATLAB / Python / Excel analysis
  const handleExportCsv = () => {
    if (!waveform.length) return;
    const maxCsvSamples = Math.min(waveform.length, 10000);
    const csvStep = Math.max(1, Math.floor(waveform.length / maxCsvSamples));

    const header = [
      '# Loran-C / eLoran Antenna Composite Voltage Sample Export',
      `# Receiver: ${rx?.label || 'R1-Vessel'} (Lat: ${rx?.lat}, Lon: ${rx?.lng})`,
      `# Time Window: ${windowDurationMs} ms | Sample Rate: ${(sampleRate / 1e6).toFixed(2)} MHz | Offset: ${timeOffsetUs} us`,
      '# Standards: USCG COMDTINST M16562.4A / CCIR Rec. 589',
      'time_seconds,time_microseconds,carrier_voltage_v,envelope_voltage_v',
    ].join('\n');

    const rows = [];
    for (let i = 0; i < waveform.length; i += csvStep) {
      const tSec = i / sampleRate;
      const tUs = tSec * 1e6;
      const vCarrier = (waveform[i] || 0).toFixed(6);
      const vEnv = ((envelope && envelope[i]) || 0).toFixed(6);
      rows.push(`${tSec.toFixed(8)},${tUs.toFixed(2)},${vCarrier},${vEnv}`);
    }

    const csvContent = `${header}\n${rows.join('\n')}`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `loran-waveform-${rx?.label || 'rx'}-${windowDurationMs}ms.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clrEloran = 'var(--accent-eloran)';
  const clrLoranC = 'var(--accent-loran-c)';
  const clrGrid = 'var(--border-subtle)';
  const clrGri = 'var(--accent-loran-c)';

  return (
    <div className="space-y-6">
      {/* Tactical Receiver Telemetry & Antenna Station Deck (Overhauled Image 2) */}
      <div
        className="rounded-xl p-4 space-y-3 font-mono text-xs shadow-md"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
      >
        {/* Top Line: Antenna Selector, Telemetry Badges, and Export Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Receiver Selector & RF Status */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-semibold uppercase tracking-wider text-[11px]" style={{ color: 'var(--text-dim)' }}>
              Receiver Antenna:
            </span>
            <div className="relative">
              <select
                value={selectedReceiver}
                onChange={(e) => setSelectedReceiver(e.target.value)}
                className="rounded-lg pl-3 pr-8 py-1.5 font-bold cursor-pointer transition focus:ring-1 focus:ring-[var(--accent-eloran)]"
                style={{
                  background: 'var(--bg-subtle)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                  outline: 'none',
                }}
              >
                {receivers.map((r) => (
                  <option key={r.label} value={r.label}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold"
              style={{
                background: 'var(--status-ok-subtle)',
                color: 'var(--status-ok)',
                border: '1px solid var(--status-ok-border)',
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--status-ok)] animate-pulse" />
              RF FRONT-END ACTIVE
            </span>
          </div>

          {/* Action Buttons: Vector SVG & CSV Data Exports */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleExportSvg}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer hover:bg-[var(--bg-muted)]"
              style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
              title="Download uncompressed presentation-grade vector SVG"
            >
              <Download size={13} className="text-[var(--accent-eloran)]" /> Export SVG
            </button>
            <button
              onClick={handleExportCsv}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer hover:bg-[var(--bg-muted)]"
              style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
              title="Download raw 1 MHz waveform time-series in CSV format"
            >
              <FileText size={13} className="text-[var(--status-ok)]" /> Export CSV
            </button>
          </div>
        </div>

        {/* Live Receiver Avionics & RF Metrics Strip */}
        <div
          className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 rounded-lg text-[11px]"
          style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)' }}
        >
          <div>
            <span className="text-[10px] uppercase tracking-wider block" style={{ color: 'var(--text-dim)' }}>
              Geodetic Coords
            </span>
            <span className="font-bold text-[var(--text-primary)]">
              {Math.abs(rx.lat || 0).toFixed(4)}° {rx.lat >= 0 ? 'N' : 'S'}, {Math.abs(rx.lng || 0).toFixed(4)}° {rx.lng >= 0 ? 'E' : 'W'}
            </span>
          </div>

          <div>
            <span className="text-[10px] uppercase tracking-wider block" style={{ color: 'var(--text-dim)' }}>
              Transmitters in Track
            </span>
            <span className="font-bold text-[var(--accent-eloran)]">
              {activeStationsCount} / {allStations.length} Active in Window
            </span>
          </div>

          <div>
            <span className="text-[10px] uppercase tracking-wider block" style={{ color: 'var(--text-dim)' }}>
              Composite Peak / Power
            </span>
            <span className="font-bold text-[var(--status-warn)]">
              {(vPeak * 1000).toFixed(1)} mVpk ({pDbm.toFixed(1)} dBm)
            </span>
          </div>

          <div>
            <span className="text-[10px] uppercase tracking-wider block" style={{ color: 'var(--text-dim)' }}>
              Tracking Discriminator
            </span>
            <span className="font-bold text-[var(--status-ok)]">
              SZC Locked (30.0 µs)
            </span>
          </div>
        </div>
      </div>

      {/* Oscilloscope Control Deck & Capabilities (Overhauled Image 1) */}
      <div
        className="rounded-xl p-4 space-y-4 font-mono text-xs shadow-md"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
      >
        {/* Full-Width Timebase Slider */}
        <div className="w-full space-y-1">
          <Slider
            label="Time Axis Observation Window"
            value={windowDurationMs}
            min={0.3}
            max={50}
            step={0.1}
            unit="ms"
            tooltip="Duration of RF sample captured at antenna input (use 0.3 ms for 1-pulse canonical inspection)"
            onChange={setWindowDurationMs}
          />
        </div>

        {/* Quick Zoom Presets */}
        <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-[var(--border-subtle)] text-xs">
          <span className="text-[10px] uppercase tracking-wider font-semibold mr-1" style={{ color: 'var(--text-dim)' }}>
            Quick Zoom:
          </span>
          {[
            { label: '300 µs (1-Pulse Zoom)', val: 0.3, tooltip: 'Canonical 300 µs window to inspect USCG standard pulse shape, 65 µs peak, and 30 µs SZC' },
            { label: '1 ms', val: 1.0 },
            { label: '5 ms', val: 5.0 },
            { label: '10 ms (Default)', val: 10.0 },
            { label: '50 ms', val: 50.0 },
            { label: 'Full GRI (1000 ms)', val: Math.min(1000, griMs) },
          ].map(({ label, val, tooltip }) => (
            <button
              key={label}
              onClick={() => setWindowDurationMs(val)}
              className="px-2.5 py-1 rounded text-[11px] font-bold border transition cursor-pointer"
              style={
                windowDurationMs === val
                  ? { background: 'var(--accent-eloran-subtle)', color: 'var(--accent-eloran)', borderColor: 'var(--accent-eloran-border)' }
                  : { background: 'var(--bg-subtle)', color: 'var(--text-secondary)', borderColor: 'var(--border-subtle)' }
              }
              title={tooltip || ''}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Oscilloscope Side Capabilities: Offset, Gain, Noise & Probes */}
        <div
          className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 border-t border-[var(--border-subtle)]"
        >
          {/* Horizontal Trigger Delay / Offset */}
          <div className="space-y-1.5 p-3 rounded-lg" style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)' }}>
            <div className="flex justify-between items-center text-[11px]">
              <span className="font-semibold text-[var(--text-secondary)]">Trigger Offset (Δt):</span>
              <div className="flex items-center gap-1">
                <span className="text-[var(--accent-eloran)] font-bold">{timeOffsetUs} µs</span>
                {timeOffsetUs !== 0 && (
                  <button
                    onClick={() => setTimeOffsetUs(0)}
                    className="p-0.5 rounded text-[var(--text-dim)] hover:text-[var(--text-primary)] cursor-pointer"
                    title="Reset trigger offset to 0 µs"
                  >
                    <RotateCcw size={11} />
                  </button>
                )}
              </div>
            </div>
            <input
              type="range"
              min={0}
              max={Math.max(500, Math.min(10000, windowDurationMs * 1000))}
              step={10}
              value={timeOffsetUs}
              onChange={(e) => setTimeOffsetUs(parseFloat(e.target.value))}
              className="w-full h-1.5 rounded-lg appearance-none cursor-pointer"
              style={{ accentColor: 'var(--accent-eloran)', background: 'var(--bg-muted)' }}
            />
            <div className="flex gap-1.5 pt-1">
              {[0, 10, 50, 100].map((dt) => (
                <button
                  key={dt}
                  onClick={() => setTimeOffsetUs(dt)}
                  className="px-2 py-0.5 rounded text-[10px] font-semibold border transition cursor-pointer"
                  style={timeOffsetUs === dt
                    ? { background: 'var(--accent-eloran-subtle)', color: 'var(--accent-eloran)', borderColor: 'var(--accent-eloran-border)' }
                    : { background: 'var(--bg-canvas)', color: 'var(--text-dim)', borderColor: 'var(--border-subtle)' }}
                >
                  +{dt}µs
                </button>
              ))}
            </div>
          </div>

          {/* Vertical Gain (V/Div Scale) */}
          <div className="space-y-1.5 p-3 rounded-lg" style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)' }}>
            <div className="flex justify-between items-center text-[11px]">
              <span className="font-semibold text-[var(--text-secondary)]">Vertical Gain (V/div):</span>
              <span className="text-[var(--accent-eloran)] font-bold">{verticalGain}x</span>
            </div>
            <div className="grid grid-cols-4 gap-1.5 pt-1">
              {[0.5, 1.0, 2.0, 5.0].map((g) => (
                <button
                  key={g}
                  onClick={() => setVerticalGain(g)}
                  className="px-2 py-1 rounded text-[10px] font-bold border transition cursor-pointer text-center"
                  style={verticalGain === g
                    ? { background: 'var(--accent-eloran-subtle)', color: 'var(--accent-eloran)', borderColor: 'var(--accent-eloran-border)' }
                    : { background: 'var(--bg-canvas)', color: 'var(--text-dim)', borderColor: 'var(--border-subtle)' }}
                >
                  {g}x
                </button>
              ))}
            </div>
            <div className="text-[10px] text-[var(--text-muted)] pt-0.5">
              Magnifies vertical display trace without clipping data
            </div>
          </div>

          {/* Real-Time RF Gaussian Noise Injection */}
          <div className="space-y-1.5 p-3 rounded-lg" style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)' }}>
            <div className="flex justify-between items-center text-[11px]">
              <span className="font-semibold text-[var(--text-secondary)]">RF Noise Injection:</span>
              <span className="font-bold" style={{ color: noiseSnrDb === null ? 'var(--status-ok)' : 'var(--status-warn)' }}>
                {noiseSnrDb === null ? 'OFF (Clean)' : `${noiseSnrDb} dB SNR`}
              </span>
            </div>
            <div className="grid grid-cols-5 gap-1 pt-1">
              {[
                { label: 'Off', val: null },
                { label: '30dB', val: 30 },
                { label: '18dB', val: 18 },
                { label: '10dB', val: 10 },
                { label: '0dB', val: 0 },
              ].map(({ label, val }) => (
                <button
                  key={label}
                  onClick={() => setNoiseSnrDb(val)}
                  className="px-1.5 py-1 rounded text-[10px] font-bold border transition cursor-pointer text-center"
                  style={noiseSnrDb === val
                    ? { background: 'var(--accent-eloran-subtle)', color: 'var(--accent-eloran)', borderColor: 'var(--accent-eloran-border)' }
                    : { background: 'var(--bg-canvas)', color: 'var(--text-dim)', borderColor: 'var(--border-subtle)' }}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="text-[10px] text-[var(--text-muted)] pt-0.5">
              Simulates antenna thermal &amp; atmospheric noise jitter
            </div>
          </div>
        </div>

        {/* Display Probes & Channel Toggles Strip */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-[var(--border-subtle)] text-xs">
          <div className="flex items-center gap-4 flex-wrap">
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
            <Toggle
              label="SZC & Peak Probes"
              description="Show 30 µs zero-crossing and 65 µs peak reference lines"
              checked={showProbes}
              onChange={setShowProbes}
            />
          </div>

          <div className="flex items-center gap-3 text-[11px]" style={{ color: 'var(--text-dim)' }}>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 inline-block rounded" style={{ background: 'var(--status-danger)' }} />
              Envelope E(t)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 inline-block rounded" style={{ background: 'var(--accent-eloran)' }} />
              RF Carrier (100 kHz)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 inline-block rounded" style={{ background: 'var(--accent-loran-c)' }} />
              GRI Grid
            </span>
          </div>
        </div>
      </div>

      {/* Primary Oscilloscope Display Screen */}
      <div
        className="rounded-xl p-4 space-y-3 shadow-lg"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
      >
        {/* Oscilloscope Header Telemetry HUD Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs font-mono">
          <div className="flex items-center gap-3">
            <span className="font-bold flex items-center gap-1.5 text-[var(--accent-eloran)]">
              <Activity size={14} /> DSO CH1/CH2 LIVE TRACE
            </span>
            <span className="text-[10px] text-[var(--text-dim)]">
              (Sample Rate: {(sampleRate / 1e6).toFixed(1)} MHz · Peak: {maxAmp.toFixed(2)} V · Gain: {verticalGain}x)
            </span>
          </div>

          {/* Quick Scope HUD Measurement Badges */}
          <div className="flex items-center gap-2 flex-wrap text-[10px]">
            <span className="px-2 py-0.5 rounded bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-secondary)]">
              Vpk: <strong className="text-[var(--text-primary)]">{(vPeak * 1000).toFixed(0)} mV</strong>
            </span>
            <span className="px-2 py-0.5 rounded bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-secondary)]">
              Vpp: <strong className="text-[var(--text-primary)]">{(vPp * 1000).toFixed(0)} mV</strong>
            </span>
            <span className="px-2 py-0.5 rounded bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-secondary)]">
              SZC: <strong className="text-[var(--status-ok)]">30.0 µs</strong>
            </span>
            <span className="px-2 py-0.5 rounded bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-secondary)]">
              τpk: <strong className="text-[var(--status-danger)]">65.0 µs</strong>
            </span>
            <span className="px-2 py-0.5 rounded bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-secondary)]">
              fc: <strong className="text-[var(--accent-eloran)]">100.0 kHz</strong>
            </span>
          </div>
        </div>

        {/* SVG Scope Canvas */}
        <div
          className="relative rounded-lg overflow-hidden shadow-inner"
          style={{ background: 'var(--bg-canvas)', border: '1px solid var(--border-subtle)' }}
        >
          <svg
            ref={svgRef}
            viewBox="0 0 1000 200"
            preserveAspectRatio="none"
            className="w-full h-64 sm:h-72 cursor-crosshair"
          >
            {/* Horizontal centerline (0V) */}
            <line x1="0" y1="100" x2="1000" y2="100" stroke={clrGrid} strokeWidth="1.2" />

            {/* Voltage grid lines */}
            <line x1="0" y1="22" x2="1000" y2="22" stroke={clrGrid} strokeWidth="0.8" strokeDasharray="3 3" opacity="0.4" />
            <line x1="0" y1="61" x2="1000" y2="61" stroke={clrGrid} strokeWidth="0.8" strokeDasharray="3 3" opacity="0.4" />
            <line x1="0" y1="139" x2="1000" y2="139" stroke={clrGrid} strokeWidth="0.8" strokeDasharray="3 3" opacity="0.4" />
            <line x1="0" y1="178" x2="1000" y2="178" stroke={clrGrid} strokeWidth="0.8" strokeDasharray="3 3" opacity="0.4" />

            {/* GRI timing lines */}
            {griLines.map((x, i) => (
              <line
                key={`gri-${i}`}
                x1={x}
                y1="0"
                x2={x}
                y2="200"
                stroke={clrGri}
                strokeWidth="0.8"
                strokeDasharray="3 3"
                opacity="0.6"
              />
            ))}

            {/* Station arrival flags */}
            {arrivals.map((arr, i) => {
              const relSec = arr.arrivalSec - effectiveSimTime;
              const x = (relSec / (windowDurationMs / 1000)) * 1000;
              const color = arr.role === 'master' ? clrEloran : clrLoranC;
              return (
                <g key={`arr-${i}`}>
                  <line
                    x1={x}
                    y1="14"
                    x2={x}
                    y2="200"
                    stroke={color}
                    strokeWidth="1.2"
                    strokeDasharray={arr.isSkywave ? '2 2' : 'none'}
                    opacity="0.85"
                  />
                  <polygon points={`${x},14 ${x - 4},4 ${x + 4},4`} fill={color} />
                  <text x={x + 3} y="22" fontSize="9" fill={color} fontFamily="monospace" fontWeight="bold">
                    {arr.station} {arr.isSkywave ? '(Sky)' : ''}
                  </text>
                </g>
              );
            })}

            {/* Probes: SZC (30 µs) and Peak (65 µs) in Single-Pulse Inspection */}
            {showProbes && isSinglePulseZoom && arrivals.length > 0 && (() => {
              const firstArr = arrivals[0];
              const relSec = firstArr.arrivalSec - effectiveSimTime;
              const x30 = ((relSec + 30e-6) / (windowDurationMs / 1000)) * 1000;
              const x65 = ((relSec + 65e-6) / (windowDurationMs / 1000)) * 1000;
              return (
                <g>
                  {x30 >= 0 && x30 <= 1000 && (
                    <g>
                      <line x1={x30} y1="0" x2={x30} y2="200" stroke="var(--status-ok)" strokeWidth="1.5" strokeDasharray="3 2" />
                      <rect x={x30 - 35} y="172" width="70" height="18" rx="3" fill="#064e3b" stroke="#10b981" strokeWidth="1" />
                      <text x={x30} y="184" fill="#ecfdf5" fontSize="8" fontFamily="monospace" fontWeight="bold" textAnchor="middle">
                        SZC: 30 µs
                      </text>
                    </g>
                  )}
                  {x65 >= 0 && x65 <= 1000 && (
                    <g>
                      <line x1={x65} y1="0" x2={x65} y2="200" stroke="var(--status-danger)" strokeWidth="1.5" strokeDasharray="3 2" />
                      <rect x={x65 - 32} y="8" width="64" height="18" rx="3" fill="#7f1d1d" stroke="#ef4444" strokeWidth="1" />
                      <text x={x65} y="20" fill="#fef2f2" fontSize="8" fontFamily="monospace" fontWeight="bold" textAnchor="middle">
                        Peak: 65 µs
                      </text>
                    </g>
                  )}
                </g>
              );
            })()}

            {/* Synthesized RF Waveform (Cyan Carrier Oscillations) */}
            {polylinePoints && (
              <polyline
                points={polylinePoints}
                fill="none"
                stroke="#06b6d4" strokeWidth={settings.includeCarrier ? "1.2" : "2"}
                strokeLinejoin="round"
              />
            )}

            {/* Standard Loran-C Pulse Envelope (Red Curve) */}
            {envelopePoints && (
              <polyline
                points={envelopePoints}
                fill="none"
                stroke="#ef4444" strokeWidth="2" strokeLinejoin="round" opacity="0.95"
              />
            )}
          </svg>

          {/* Time axis markers */}
          <div
            className="flex justify-between px-2 py-1 text-[10px] font-mono"
            style={{ background: 'var(--bg-subtle)', borderTop: '1px solid var(--border-subtle)', color: 'var(--text-dim)' }}
          >
            <span>0 {windowDurationMs < 1 ? 'µs' : 'ms'}</span>
            <span>{windowDurationMs < 1 ? `${(windowDurationMs * 250).toFixed(0)} µs` : `${(windowDurationMs * 0.25).toFixed(1)} ms`}</span>
            <span>{windowDurationMs < 1 ? `${(windowDurationMs * 500).toFixed(0)} µs` : `${(windowDurationMs * 0.5).toFixed(1)} ms`}</span>
            <span>{windowDurationMs < 1 ? `${(windowDurationMs * 750).toFixed(0)} µs` : `${(windowDurationMs * 0.75).toFixed(1)} ms`}</span>
            <span>{windowDurationMs < 1 ? `${(windowDurationMs * 1000).toFixed(0)} µs` : `${windowDurationMs.toFixed(1)} ms`}</span>
          </div>
        </div>
      </div>

      {/* Per-Station Breakdown Tracks */}
      <div
        className="rounded-xl p-5 space-y-4 shadow-sm"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
      >
        <div className="text-xs font-mono font-bold uppercase tracking-wider flex items-center justify-between">
          <span className="flex items-center gap-2 text-[var(--text-secondary)]">
            <Layers size={14} style={{ color: 'var(--accent-eloran)' }} aria-hidden="true" />
            Station Component Arrival Breakdown
          </span>
          <span className="text-[10px] text-[var(--text-dim)]">
            {allStations.length} Configured Stations
          </span>
        </div>

        <div className="space-y-3 font-mono text-xs">
          {allStations.map((station) => {
            const stArrivals = arrivals.filter((a) => a.station === station.label);
            const accentColor = station.role === 'master' ? 'var(--accent-eloran)' : 'var(--accent-loran-c)';
            return (
              <div
                key={station.label}
                className="p-3 rounded-lg space-y-1.5"
                style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)' }}
              >
                <div className="flex justify-between items-center text-[11px]">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ background: accentColor }}
                    />
                    <span className="font-bold" style={{ color: 'var(--text-primary)' }}>
                      {station.label}
                    </span>
                    <span className="uppercase text-[10px]" style={{ color: 'var(--text-dim)' }}>
                      [{station.role} · {station.txDbm}dBm]
                    </span>
                  </div>
                  <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    {stArrivals.length
                      ? `Arrival at ${(stArrivals[0].arrivalSec * 1000).toFixed(3)} ms`
                      : 'No arrival in active window'}
                  </div>
                </div>

                {/* Arrival Timeline Bar */}
                <div
                  className="h-5 rounded relative overflow-hidden"
                  style={{ background: 'var(--bg-canvas)' }}
                >
                  {stArrivals.map((a, i) => {
                    const relSec = a.arrivalSec - effectiveSimTime;
                    const pct = (relSec / (windowDurationMs / 1000)) * 100;
                    return (
                      <div
                        key={i}
                        className="absolute top-0 bottom-0 w-1"
                        style={{
                          background: accentColor,
                          left: `${Math.min(99, Math.max(0, pct))}%`,
                        }}
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
