import React, { useState, useMemo, useRef } from 'react';
import { Download, Radio, Layers } from 'lucide-react';
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
  const [windowDurationMs, setWindowDurationMs] = useState(10);

  const rx = receivers.find((r) => r.label === selectedReceiver) || receivers[0];

  const allStations = useMemo(
    () => [
      ...masters.map((m) => ({ ...m, role: 'master' })),
      ...slaves.map((s)  => ({ ...s, role: 'slave'  })),
    ],
    [masters, slaves]
  );

  const { waveform, envelope, arrivals, sampleRate } = useMemo(() => {
    if (!rx || !allStations.length) {
      return {
        waveform: new Float32Array(0),
        envelope: new Float32Array(0),
        arrivals: [],
        sampleRate: 1000000,
      };
    }
    return synthesizeReceiverWaveform({
      stations:       allStations,
      receiver:       rx,
      totalDuration:  windowDurationMs / 1000,
      simTime:        simTimeSec,
      includeCarrier: settings.includeCarrier,
      includeSkywave: settings.includeSkywave,
      skywaveDelayMs: settings.skywaveDelayMs,
      skywaveAmpRatio: settings.skywaveAmpRatio,
    });
  }, [allStations, rx, windowDurationMs, simTimeSec, settings]);

  // Downsample for high-performance SVG polylines
  const maxPts = 1600;
  const step = Math.max(1, Math.floor((waveform.length || 1) / maxPts));
  let maxAmp = 1e-6;
  for (let i = 0; i < waveform.length; i += step) {
    if (Math.abs(waveform[i]) > maxAmp) maxAmp = Math.abs(waveform[i]);
    if (envelope && Math.abs(envelope[i]) > maxAmp) maxAmp = Math.abs(envelope[i]);
  }

  // RF carrier wave polyline (oscillates between positive and negative)
  const polylinePoints = useMemo(() => {
    if (!waveform.length) return '';
    const pts = [];
    for (let i = 0; i < waveform.length; i += step) {
      const x = (i / waveform.length) * 1000;
      const y = 100 - ((waveform[i] || 0) / maxAmp) * 78;
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    return pts.join(' ');
  }, [waveform, step, maxAmp]);

  // Standard Loran-C pulse envelope curve (red line, matching USCG M16562.4A / Image 4)
  const envelopePoints = useMemo(() => {
    if (!envelope || !envelope.length || !settings.includeCarrier) return '';
    const pts = [];
    for (let i = 0; i < envelope.length; i += step) {
      const x = (i / envelope.length) * 1000;
      const y = 100 - ((envelope[i] || 0) / maxAmp) * 78;
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    return pts.join(' ');
  }, [envelope, step, maxAmp, settings.includeCarrier]);

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

  // Dedicated uncompressed, presentation-grade vector SVG export
  const handleExportSvg = () => {
    if (!waveform.length) return;
    const exportWidth = 1200;
    const exportHeight = 560;
    const padX = 80;
    const padRight = 40;
    const chartW = exportWidth - padX - padRight;
    const topY = 105;
    const chartH = 370;
    const midY = topY + chartH / 2;
    const botY = topY + chartH;

    const ptsCount = Math.min(waveform.length, 2400);
    const expStep = Math.max(1, Math.floor(waveform.length / ptsCount));
    let wavePath = '';
    let envPath = '';

    for (let i = 0; i < waveform.length; i += expStep) {
      const px = padX + (i / waveform.length) * chartW;
      const pyWave = midY - ((waveform[i] || 0) / maxAmp) * (chartH * 0.44);
      const pyEnv = midY - (((envelope && envelope[i]) || 0) / maxAmp) * (chartH * 0.44);
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
        <text x="${gx.toFixed(1)}" y="${botY + 22}" fill="#94a3b8" font-size="11" font-family="monospace" text-anchor="middle">${timeVal}</text>
      `;
    }

    // Horizontal amplitude grid lines
    const ampLines = [
      { y: midY - chartH * 0.44, label: `+${maxAmp.toFixed(1)}` },
      { y: midY - chartH * 0.22, label: `+${(maxAmp * 0.5).toFixed(1)}` },
      { y: midY, label: '0.0' },
      { y: midY + chartH * 0.22, label: `-${(maxAmp * 0.5).toFixed(1)}` },
      { y: midY + chartH * 0.44, label: `-${maxAmp.toFixed(1)}` },
    ];
    let ampGridSvg = '';
    ampLines.forEach((l) => {
      const isCenter = Math.abs(l.y - midY) < 1;
      ampGridSvg += `
        <line x1="${padX}" y1="${l.y.toFixed(1)}" x2="${padX + chartW}" y2="${l.y.toFixed(1)}" stroke="${isCenter ? '#334155' : '#1e293b'}" stroke-width="${isCenter ? '1.5' : '1'}" />
        <text x="${padX - 12}" y="${(l.y + 4).toFixed(1)}" fill="#94a3b8" font-size="11" font-family="monospace" text-anchor="end">${l.label}</text>
      `;
    });

    // Station arrival markers
    let arrivalsSvg = '';
    arrivals.forEach((arr) => {
      const relSec = arr.arrivalSec - simTimeSec;
      const frac = relSec / (windowDurationMs / 1000);
      if (frac >= 0 && frac <= 1) {
        const ax = padX + frac * chartW;
        const color = arr.role === 'master' ? '#06b6d4' : '#f59e0b';
        arrivalsSvg += `
          <g>
            <line x1="${ax.toFixed(1)}" y1="${topY}" x2="${ax.toFixed(1)}" y2="${botY}" stroke="${color}" stroke-width="1.5" stroke-dasharray="${arr.isSkywave ? '3 3' : 'none'}" opacity="0.85" />
            <polygon points="${ax.toFixed(1)},${topY + 12} ${(ax - 5).toFixed(1)},${topY} ${(ax + 5).toFixed(1)},${topY}" fill="${color}" />
            <text x="${(ax + 5).toFixed(1)}" y="${topY + 22}" fill="${color}" font-size="10" font-family="monospace" font-weight="bold">${arr.station} ${arr.isSkywave ? '(Sky)' : ''}</text>
          </g>
        `;
      }
    });

    // Special SZC & Peak callout in single-pulse zoom mode
    let szcMarkersSvg = '';
    if (windowDurationMs <= 0.5 && arrivals.length > 0) {
      const firstArrival = arrivals[0];
      const relSec = firstArrival.arrivalSec - simTimeSec;
      const t30Sec = relSec + 30e-6;
      const t65Sec = relSec + 65e-6;
      const frac30 = t30Sec / (windowDurationMs / 1000);
      const frac65 = t65Sec / (windowDurationMs / 1000);
      if (frac30 >= 0 && frac30 <= 1) {
        const x30 = padX + frac30 * chartW;
        szcMarkersSvg += `
          <line x1="${x30.toFixed(1)}" y1="${topY}" x2="${x30.toFixed(1)}" y2="${botY}" stroke="#10b981" stroke-width="1.2" stroke-dasharray="3 2" />
          <text x="${x30.toFixed(1)}" y="${topY - 6}" fill="#10b981" font-size="10" font-family="monospace" font-weight="bold" text-anchor="middle">SZC (30 µs)</text>
        `;
      }
      if (frac65 >= 0 && frac65 <= 1) {
        const x65 = padX + frac65 * chartW;
        szcMarkersSvg += `
          <line x1="${x65.toFixed(1)}" y1="${topY}" x2="${x65.toFixed(1)}" y2="${botY}" stroke="#f59e0b" stroke-width="1.2" stroke-dasharray="3 2" />
          <text x="${x65.toFixed(1)}" y="${topY - 6}" fill="#f59e0b" font-size="10" font-family="monospace" font-weight="bold" text-anchor="middle">Peak (65 µs)</text>
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
      <stop offset="0%" stop-color="#0b0f19" />
      <stop offset="100%" stop-color="#05070d" />
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="${exportWidth}" height="${exportHeight}" fill="url(#bgGrad)" rx="10" />

  <!-- Oscilloscope Bezel -->
  <rect x="${padX}" y="${topY}" width="${chartW}" height="${chartH}" fill="#03050a" stroke="#1e293b" stroke-width="1.5" rx="6" />

  <!-- Header Info -->
  <text x="${padX}" y="38" fill="#f8fafc" font-size="18" font-family="monospace" font-weight="bold">Loran-C / eLoran Antenna Composite Voltage</text>
  <text x="${padX}" y="60" fill="#94a3b8" font-size="12" font-family="monospace">Receiver: ${rx?.label || 'R1'} · Time Window: ${windowTitle} · Carrier: ${settings.includeCarrier ? '100 kHz ON' : 'Envelope Only'} · Sample Rate: ${(sampleRate / 1e6).toFixed(1)} MHz · Peak: ${maxAmp.toFixed(2)} V</text>
  <text x="${padX}" y="78" fill="#64748b" font-size="10" font-family="monospace">Standard: USCG Specification COMDTINST M16562.4A · CCIR Rec. 589 (Standard 65 µs Peak / 30 µs SZC)</text>

  <!-- Legend in SVG Header -->
  <g transform="translate(${exportWidth - 340}, 32)">
    <line x1="0" y1="0" x2="22" y2="0" stroke="#ef4444" stroke-width="2.5" />
    <text x="28" y="4" fill="#ef4444" font-size="11" font-family="monospace" font-weight="bold">Pulse Envelope E(t)</text>
    <line x1="0" y1="20" x2="22" y2="20" stroke="#06b6d4" stroke-width="1.5" />
    <text x="28" y="24" fill="#06b6d4" font-size="11" font-family="monospace" font-weight="bold">Pulse Wave (100 kHz)</text>
    <line x1="0" y1="40" x2="22" y2="40" stroke="#f59e0b" stroke-width="1" stroke-dasharray="3 3" />
    <text x="28" y="44" fill="#f59e0b" font-size="11" font-family="monospace">GRI Grid / Secondary</text>
  </g>

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

  const clrEloran = '#06b6d4';
  const clrLoranC = '#f59e0b';
  const clrGrid   = '#1e293b';
  const clrGri    = '#d97706';

  return (
    <div className="space-y-6">
      {/* Top Controls Bar */}
      <div
        className="rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 font-mono text-xs"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
      >
        <div className="flex items-center gap-3">
          <span className="font-semibold uppercase tracking-wider text-[11px]" style={{ color: 'var(--text-dim)' }}>
            Receiver Antenna:
          </span>
          <select
            value={selectedReceiver}
            onChange={(e) => setSelectedReceiver(e.target.value)}
            className="rounded-lg px-3 py-1.5 font-bold"
            style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', outline: 'none' }}
          >
            {receivers.map((r) => (
              <option key={r.label} value={r.label}>{r.label}</option>
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
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition cursor-pointer hover:bg-[var(--bg-muted)]"
            style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
            title="Download uncompressed high-resolution vector SVG"
          >
            <Download size={13} /> Export SVG
          </button>
        </div>
      </div>

      {/* Time Window Slider & Single-Pulse Zoom Presets */}
      <div
        className="rounded-xl p-4 space-y-3"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
      >
        <div className="flex items-center justify-between flex-wrap gap-2">
          <Slider
            label="Time Axis Observation Window"
            value={windowDurationMs}
            min={0.3} max={50} step={0.1} unit="ms"
            tooltip="Duration of RF sample captured at antenna input (use 0.3 ms for 1-pulse canonical inspection)"
            onChange={setWindowDurationMs}
          />
        </div>

        {/* Quick Zoom Presets */}
        <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-[var(--border-subtle)] font-mono text-xs">
          <span className="text-[10px] uppercase tracking-wider font-semibold mr-1" style={{ color: 'var(--text-dim)' }}>
            Quick Zoom:
          </span>
          <button
            onClick={() => setWindowDurationMs(0.3)}
            className="px-2.5 py-0.5 rounded text-[11px] font-bold border transition cursor-pointer"
            style={windowDurationMs === 0.3
              ? { background: 'var(--accent-eloran-subtle)', color: 'var(--accent-eloran)', borderColor: 'var(--accent-eloran-border)' }
              : { background: 'var(--bg-subtle)', color: 'var(--text-secondary)', borderColor: 'var(--border-subtle)' }}
            title="Canonical 300 µs window to inspect USCG standard pulse shape, 65 µs peak, and 30 µs SZC"
          >
            300 µs (1-Pulse Zoom)
          </button>
          <button
            onClick={() => setWindowDurationMs(1)}
            className="px-2.5 py-0.5 rounded text-[11px] font-bold border transition cursor-pointer"
            style={windowDurationMs === 1
              ? { background: 'var(--accent-eloran-subtle)', color: 'var(--accent-eloran)', borderColor: 'var(--accent-eloran-border)' }
              : { background: 'var(--bg-subtle)', color: 'var(--text-secondary)', borderColor: 'var(--border-subtle)' }}
          >
            1 ms
          </button>
          <button
            onClick={() => setWindowDurationMs(5)}
            className="px-2.5 py-0.5 rounded text-[11px] font-bold border transition cursor-pointer"
            style={windowDurationMs === 5
              ? { background: 'var(--accent-eloran-subtle)', color: 'var(--accent-eloran)', borderColor: 'var(--accent-eloran-border)' }
              : { background: 'var(--bg-subtle)', color: 'var(--text-secondary)', borderColor: 'var(--border-subtle)' }}
          >
            5 ms
          </button>
          <button
            onClick={() => setWindowDurationMs(10)}
            className="px-2.5 py-0.5 rounded text-[11px] font-bold border transition cursor-pointer"
            style={windowDurationMs === 10
              ? { background: 'var(--accent-eloran-subtle)', color: 'var(--accent-eloran)', borderColor: 'var(--accent-eloran-border)' }
              : { background: 'var(--bg-subtle)', color: 'var(--text-secondary)', borderColor: 'var(--border-subtle)' }}
          >
            10 ms (Default)
          </button>
          <button
            onClick={() => setWindowDurationMs(Math.min(50, Math.max(1, griMs)))}
            className="px-2.5 py-0.5 rounded text-[11px] font-bold border transition cursor-pointer"
            style={windowDurationMs === Math.min(50, Math.max(1, griMs))
              ? { background: 'var(--accent-eloran-subtle)', color: 'var(--accent-eloran)', borderColor: 'var(--accent-eloran-border)' }
              : { background: 'var(--bg-subtle)', color: 'var(--text-secondary)', borderColor: 'var(--border-subtle)' }}
          >
            Full GRI ({griMs} ms)
          </button>
        </div>
      </div>

      {/* Primary Waveform Oscilloscope */}
      <div
        className="rounded-xl p-5 space-y-3 shadow-lg"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
      >
        <div className="flex justify-between items-center text-xs font-mono flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Radio size={14} style={{ color: 'var(--accent-eloran)' }} aria-hidden="true" />
            <span className="font-bold" style={{ color: 'var(--text-primary)' }}>Antenna Composite Voltage</span>
            <span className="text-[10px]" style={{ color: 'var(--text-dim)' }}>
              (Sample Rate: {(sampleRate / 1e6).toFixed(1)} MHz · Max: {maxAmp.toFixed(1)} V)
            </span>
          </div>
          <div className="flex items-center gap-3 text-[11px]" style={{ color: 'var(--text-dim)' }}>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 inline-block rounded" style={{ background: '#ef4444' }} />
              Pulse Envelope E(t)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 inline-block rounded" style={{ background: 'var(--accent-eloran)' }} />
              {settings.includeCarrier ? 'Pulse Wave (100 kHz)' : 'Envelope Signal'}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 inline-block rounded" style={{ background: 'var(--accent-loran-c)' }} />
              GRI Grid
            </span>
          </div>
        </div>

        {/* SVG Canvas */}
        <div
          className="relative rounded-lg overflow-hidden"
          style={{ background: 'var(--bg-canvas)', border: '1px solid var(--border-subtle)' }}
        >
          <svg
            ref={svgRef}
            viewBox="0 0 1000 200"
            preserveAspectRatio="none"
            className="w-full h-56 cursor-crosshair"
          >
            {/* Horizontal centerline (0V) */}
            <line x1="0" y1="100" x2="1000" y2="100" stroke={clrGrid} strokeWidth="1" />

            {/* Voltage grid lines */}
            <line x1="0" y1="22" x2="1000" y2="22" stroke={clrGrid} strokeWidth="0.8" strokeDasharray="3 3" opacity="0.4" />
            <line x1="0" y1="61" x2="1000" y2="61" stroke={clrGrid} strokeWidth="0.8" strokeDasharray="3 3" opacity="0.4" />
            <line x1="0" y1="139" x2="1000" y2="139" stroke={clrGrid} strokeWidth="0.8" strokeDasharray="3 3" opacity="0.4" />
            <line x1="0" y1="178" x2="1000" y2="178" stroke={clrGrid} strokeWidth="0.8" strokeDasharray="3 3" opacity="0.4" />

            {/* GRI timing lines */}
            {griLines.map((x, i) => (
              <line
                key={`gri-${i}`}
                x1={x} y1="0" x2={x} y2="200"
                stroke={clrGri} strokeWidth="0.8" strokeDasharray="3 3" opacity="0.6"
              />
            ))}

            {/* Station arrival flags */}
            {arrivals.map((arr, i) => {
              const relSec = arr.arrivalSec - simTimeSec;
              const x = (relSec / (windowDurationMs / 1000)) * 1000;
              const color = arr.role === 'master' ? clrEloran : clrLoranC;
              return (
                <g key={`arr-${i}`}>
                  <line
                    x1={x} y1="14" x2={x} y2="200"
                    stroke={color} strokeWidth="1.2"
                    strokeDasharray={arr.isSkywave ? '2 2' : 'none'} opacity="0.85"
                  />
                  <polygon points={`${x},14 ${x - 4},4 ${x + 4},4`} fill={color} />
                  <text x={x + 3} y="22" fontSize="9" fill={color} fontFamily="monospace" fontWeight="bold">
                    {arr.station} {arr.isSkywave ? '(Sky)' : ''}
                  </text>
                </g>
              );
            })}

            {/* Synthesized RF Waveform (Cyan Carrier Oscillations) */}
            {polylinePoints && (
              <polyline
                points={polylinePoints}
                fill="none"
                stroke={clrEloran}
                strokeWidth={settings.includeCarrier ? "1.2" : "2"}
                strokeLinejoin="round"
              />
            )}

            {/* Standard Loran-C Pulse Envelope (Red Curve, matching Image 4) */}
            {envelopePoints && (
              <polyline
                points={envelopePoints}
                fill="none"
                stroke="#ef4444"
                strokeWidth="2"
                strokeLinejoin="round"
                opacity="0.95"
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
        className="rounded-xl p-5 space-y-4"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
      >
        <div className="text-xs font-mono font-bold uppercase tracking-wider flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
          <Layers size={14} style={{ color: 'var(--accent-eloran)' }} aria-hidden="true" />
          Station Component Tracks
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
                    <span className="font-bold" style={{ color: 'var(--text-primary)' }}>{station.label}</span>
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
                  className="h-6 rounded relative overflow-hidden"
                  style={{ background: 'var(--bg-canvas)' }}
                >
                  {stArrivals.map((a, i) => {
                    const relSec = a.arrivalSec - simTimeSec;
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
