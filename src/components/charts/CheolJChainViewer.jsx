import React, { useState, useMemo, useRef } from 'react';
import {
  Radio, Layers, Activity, ZoomIn, ZoomOut, RotateCcw,
  Compass, ExternalLink, ChevronRight, Zap
} from 'lucide-react';
import { useThemeStore } from '../../state/themeStore.js';
import {
  CHEOLJ_REFERENCE_CHAINS,
  CHEOLJ_PCI_CODES,
  synthesizeCheolJReferenceChain,
} from '../../lib/pulse.js';

export default function CheolJChainViewer() {
  const { effectiveTheme } = useThemeStore();
  const isDark = effectiveTheme === 'dark';

  const [selectedChainId, setSelectedChainId] = useState(9930);
  const [pciPeriod, setPciPeriod] = useState('both'); // 'A' | 'B' | 'both'
  const [signalMode, setSignalMode] = useState('rf'); // 'rf' | 'envelope'
  const [hoverData, setHoverData] = useState(null);

  // Zoom viewport state in microseconds: [viewStartUs, viewEndUs]
  const [viewportRange, setViewportRange] = useState(null);

  const svgRef = useRef(null);

  // Synthesize reference chain using CheolJ (2020) model at 1 MHz (1 µs resolution)
  const synthesized = useMemo(() => {
    return synthesizeCheolJReferenceChain({
      chainId: selectedChainId,
      pciPeriod,
      sampleRate: 1000000,
      includeCarrier: signalMode === 'rf',
    });
  }, [selectedChainId, pciPeriod, signalMode]);

  const { chain, durationUs, timeUs, rfSignal, envelope, arrivals } = synthesized;

  // Active view window
  const curStartUs = viewportRange ? Math.max(0, viewportRange[0]) : 0;
  const curEndUs = viewportRange ? Math.min(durationUs, viewportRange[1]) : durationUs;
  const curDurationUs = Math.max(100, curEndUs - curStartUs);
  const isZoomedBurst = curDurationUs <= 20000;

  // Reset zoom
  const handleResetZoom = () => {
    setViewportRange(null);
  };

  // Zoom into specific station burst
  const handleZoomStation = (arrival) => {
    const burstWidthUs = arrival.role === 'master' ? 11000 : 8000;
    const pad = 1000;
    const start = Math.max(0, arrival.edUs - pad);
    const end = Math.min(durationUs, arrival.edUs + burstWidthUs + pad);
    setViewportRange([start, end]);
  };

  const handleZoomDelta = (factor) => {
    const center = (curStartUs + curEndUs) / 2;
    const newHalf = (curDurationUs * factor) / 2;
    const start = Math.max(0, center - newHalf);
    const end = Math.min(durationUs, center + newHalf);
    setViewportRange([start, end]);
  };

  // Color scheme matching SIMULORAN design system tokens
  const colors = useMemo(() => {
    if (isDark) {
      return {
        bg: '#090d16',
        panelBg: '#0f172a',
        gridLine: '#1e293b',
        centerLine: '#334155',
        rfLine: '#38bdf8', // Sky 400
        envLine: '#fbbf24', // Amber 400
        axisText: '#94a3b8',
        masterColor: '#f59e0b', // Amber 500
        secondaryColor: '#38bdf8', // Sky 400
        badgeBg: '#1e293b',
        badgeBorder: '#475569',
        crosshair: '#f43f5e',
        tooltipBg: 'rgba(15, 23, 42, 0.95)',
        tooltipBorder: '#38bdf8',
        pulseMarker: 'rgba(148, 163, 184, 0.35)',
      };
    }
    return {
      bg: '#f8fafc',
      panelBg: '#ffffff',
      gridLine: '#e2e8f0',
      centerLine: '#cbd5e1',
      rfLine: '#0284c7', // Sky 600
      envLine: '#d97706', // Amber 600
      axisText: '#64748b',
      masterColor: '#b45309', // Amber 700
      secondaryColor: '#0284c7', // Sky 600
      badgeBg: '#ffffff',
      badgeBorder: '#cbd5e1',
      crosshair: '#e11d48',
      tooltipBg: 'rgba(255, 255, 255, 0.95)',
      tooltipBorder: '#0284c7',
      pulseMarker: 'rgba(100, 116, 139, 0.3)',
    };
  }, [isDark]);

  // Chart dimensions
  const svgWidth = 1000;
  const svgHeight = 360;
  const padL = 65;
  const padR = 25;
  const padT = 35;
  const padB = 45;
  const chartW = svgWidth - padL - padR;
  const chartH = svgHeight - padT - padB;
  const midY = padT + chartH / 2;

  // Max absolute signal amplitude for vertical scaling
  const maxAmp = useMemo(() => {
    let max = 0.01;
    const dt = timeUs.length > 1 ? timeUs[1] - timeUs[0] : 1;
    const startIdx = Math.max(0, Math.floor(curStartUs / dt));
    const endIdx = Math.min(timeUs.length - 1, Math.ceil(curEndUs / dt));
    for (let i = startIdx; i <= endIdx; i++) {
      const v = Math.abs(signalMode === 'rf' ? rfSignal[i] : envelope[i]);
      if (v > max) max = v;
    }
    return Math.max(0.5, Math.ceil(max * 1.2 * 10) / 10);
  }, [timeUs, rfSignal, envelope, signalMode, curStartUs, curEndUs]);

  // Decimated waveform path for smooth 60fps SVG rendering
  const waveformPath = useMemo(() => {
    const dt = timeUs.length > 1 ? timeUs[1] - timeUs[0] : 1;
    const startIdx = Math.max(0, Math.floor(curStartUs / dt));
    const endIdx = Math.min(timeUs.length - 1, Math.ceil(curEndUs / dt));
    const totalVisSamples = endIdx - startIdx + 1;

    if (totalVisSamples <= 0) return '';

    const numPoints = Math.min(1000, Math.max(300, Math.floor(chartW)));
    const step = Math.max(1, Math.floor(totalVisSamples / numPoints));

    let path = '';
    for (let p = 0; p < numPoints; p++) {
      const chunkStart = startIdx + p * step;
      if (chunkStart > endIdx) break;
      const chunkEnd = Math.min(endIdx, chunkStart + step);

      let minVal = Infinity;
      let maxVal = -Infinity;
      for (let j = chunkStart; j <= chunkEnd; j++) {
        const val = signalMode === 'rf' ? rfSignal[j] : envelope[j];
        if (val < minVal) minVal = val;
        if (val > maxVal) maxVal = val;
      }

      const tChunk = timeUs[chunkStart];
      const frac = (tChunk - curStartUs) / curDurationUs;
      const x = padL + frac * chartW;

      const yMax = midY - (maxVal / maxAmp) * (chartH / 2);
      const yMin = midY - (minVal / maxAmp) * (chartH / 2);

      const cmd = p === 0 ? 'M' : 'L';
      if (signalMode === 'envelope') {
        path += `${cmd} ${x.toFixed(1)} ${yMax.toFixed(1)} `;
      } else {
        if (Math.abs(yMax - yMin) < 0.5) {
          path += `${cmd} ${x.toFixed(1)} ${yMax.toFixed(1)} `;
        } else {
          path += `${cmd} ${x.toFixed(1)} ${yMax.toFixed(1)} L ${x.toFixed(1)} ${yMin.toFixed(1)} `;
        }
      }
    }
    return path;
  }, [timeUs, rfSignal, envelope, signalMode, curStartUs, curEndUs, curDurationUs, maxAmp, chartW, chartH, midY, padL]);

  // Visible arrivals inside viewport with collision-free tiers
  const layoutedArrivals = useMemo(() => {
    const list = arrivals
      .filter((arr) => {
        const burstLen = arr.role === 'master' ? 11000 : 8000;
        return arr.edUs + burstLen >= curStartUs && arr.edUs <= curEndUs;
      })
      .map((arr) => {
        const frac = (arr.edUs - curStartUs) / curDurationUs;
        const ax = padL + frac * chartW;
        return { ...arr, frac, ax };
      })
      .sort((a, b) => a.ax - b.ax);

    const tiers = [padT + 8, padT + 30, padT + 52];
    const tierRightEdges = [-9999, -9999, -9999];

    return list.map((arr) => {
      const isMaster = arr.role === 'master';
      const badgeW = isMaster ? 120 : 106;
      let badgeX = arr.ax + 4;
      if (badgeX + badgeW > padL + chartW - 4) {
        badgeX = arr.ax - badgeW - 4;
      }

      let chosenTier = 0;
      for (let t = 0; t < tiers.length; t++) {
        if (badgeX >= tierRightEdges[t] + 8) {
          chosenTier = t;
          break;
        }
        if (t === tiers.length - 1) {
          chosenTier = tierRightEdges.indexOf(Math.min(...tierRightEdges));
        }
      }
      tierRightEdges[chosenTier] = badgeX + badgeW;
      const badgeY = tiers[chosenTier];

      return {
        ...arr,
        badgeX,
        badgeY,
        badgeW,
      };
    });
  }, [arrivals, curStartUs, curEndUs, curDurationUs, chartW, padL, padT]);

  // Grid tick values (10 horizontal divisions)
  const xTicks = useMemo(() => {
    const ticks = [];
    for (let i = 0; i <= 10; i++) {
      const t = curStartUs + (i / 10) * curDurationUs;
      const x = padL + (i / 10) * chartW;
      let label = '';
      if (curDurationUs >= 10000) {
        label = `${(t / 1000).toFixed(1)} ms`;
      } else {
        label = `${Math.round(t)} µs`;
      }
      ticks.push({ x, t, label });
    }
    return ticks;
  }, [curStartUs, curDurationUs, chartW, padL]);

  // When zoomed into a single station burst, generate pulse markers
  const individualPulseMarkers = useMemo(() => {
    if (!isZoomedBurst) return [];
    const markers = [];
    layoutedArrivals.forEach((arr) => {
      const isMaster = arr.role === 'master';
      const codeList = isMaster
        ? CHEOLJ_PCI_CODES.master[arr.period]
        : CHEOLJ_PCI_CODES.secondary[arr.period];

      codeList.forEach((sign, pIdx) => {
        if (sign === 0) return; // 1 ms blank gap before 9th pulse
        const pulseOffsetUs = pIdx === 9 ? 10000 : pIdx * 1000;
        const pTimeUs = arr.edUs + pulseOffsetUs;
        if (pTimeUs >= curStartUs && pTimeUs <= curEndUs) {
          const frac = (pTimeUs - curStartUs) / curDurationUs;
          const px = padL + frac * chartW;
          const pName = pIdx === 9 ? 'P9' : `P${pIdx + 1}`;
          markers.push({
            x: px,
            t: pTimeUs,
            name: pName,
            sign,
            isMaster,
            station: arr.station,
          });
        }
      });
    });
    return markers;
  }, [isZoomedBurst, layoutedArrivals, curStartUs, curEndUs, curDurationUs, chartW, padL]);

  // SVG Mouse interaction for crosshair
  const handleMouseMove = (e) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    if (mouseX >= padL && mouseX <= padL + chartW && mouseY >= padT && mouseY <= padT + chartH) {
      const frac = (mouseX - padL) / chartW;
      const timeAtMouseUs = curStartUs + frac * curDurationUs;

      const dt = timeUs.length > 1 ? timeUs[1] - timeUs[0] : 1;
      const idx = Math.min(timeUs.length - 1, Math.max(0, Math.round(timeAtMouseUs / dt)));
      const rfVal = rfSignal[idx] || 0;
      const envVal = envelope[idx] || 0;

      let nearest = null;
      let minDist = Infinity;
      arrivals.forEach((arr) => {
        const d = Math.abs(timeAtMouseUs - arr.edUs);
        if (d < minDist) {
          minDist = d;
          nearest = arr;
        }
      });

      setHoverData({
        x: mouseX,
        y: mouseY,
        timeUs: timeAtMouseUs,
        val: signalMode === 'rf' ? rfVal : envVal,
        nearestStation: nearest,
        distanceUs: minDist,
      });
    } else {
      setHoverData(null);
    }
  };

  const handleMouseLeave = () => {
    setHoverData(null);
  };

  return (
    <div
      className="rounded-xl p-5 space-y-6 shadow-sm font-sans"
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
      }}
    >
      {/* Header & Provenance */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-[var(--border-subtle)]">
        <div>
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold"
              style={{
                background: 'var(--accent-eloran-subtle)',
                color: 'var(--accent-eloran)',
                border: '1px solid var(--accent-eloran-border)',
              }}
            >
              <Radio size={13} /> CheolJ Loran-C Reference Standard
            </span>
            <span className="text-xs font-mono text-[var(--text-dim)]">
              GRI {chain.chainId} &bull; PCI Pulse Synthesis
            </span>
          </div>
          <h2
            className="text-xl font-bold tracking-tight font-mono mt-1"
            style={{ color: 'var(--text-primary)' }}
          >
            {chain.name}
          </h2>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5 max-w-2xl">
            Mathematical Phase Code Interval (PCI) signal generator and calibrated emission delay models synthesized
            directly from the reference implementation by CheolJ (2020).
          </p>
        </div>

        <div className="flex items-center gap-2 self-start lg:self-center">
          <a
            href="https://github.com/CheolJ/Loran-c-reference-code"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition hover:opacity-90"
            style={{
              background: 'var(--bg-subtle)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
            title="Open CheolJ/Loran-c-reference-code on GitHub"
          >
            <ExternalLink size={13} />
            CheolJ Reference Repo &rarr;
          </a>
        </div>
      </div>

      {/* Control Strip */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Chain Selector */}
        <div className="space-y-1.5">
          <label className="text-xs font-mono font-semibold uppercase tracking-wider text-[var(--text-dim)]">
            Reference Chain (GRI)
          </label>
          <div className="flex rounded-lg p-1 bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-xs font-mono">
            {[
              { id: 9930, label: '9930 East Asia' },
              { id: 7430, label: '7430 North Sea' },
              { id: 8390, label: '8390 East Sea' },
            ].map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setSelectedChainId(c.id);
                  handleResetZoom();
                }}
                className="flex-1 py-1.5 text-center rounded transition font-medium cursor-pointer"
                style={
                  selectedChainId === c.id
                    ? { background: 'var(--accent-eloran)', color: 'var(--btn-eloran-text)', fontWeight: 700 }
                    : { color: 'var(--text-secondary)' }
                }
              >
                {c.id}
              </button>
            ))}
          </div>
        </div>

        {/* PCI Period Selector */}
        <div className="space-y-1.5">
          <label className="text-xs font-mono font-semibold uppercase tracking-wider text-[var(--text-dim)]">
            PCI Interval
          </label>
          <div className="flex rounded-lg p-1 bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-xs font-mono">
            {[
              { id: 'both', label: 'Full PCI (2×GRI)' },
              { id: 'A', label: 'GRI A' },
              { id: 'B', label: 'GRI B' },
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setPciPeriod(p.id);
                  handleResetZoom();
                }}
                className="flex-1 py-1.5 text-center rounded transition font-medium cursor-pointer"
                style={
                  pciPeriod === p.id
                    ? { background: 'var(--accent-eloran)', color: 'var(--btn-eloran-text)', fontWeight: 700 }
                    : { color: 'var(--text-secondary)' }
                }
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Signal Mode Toggle */}
        <div className="space-y-1.5">
          <label className="text-xs font-mono font-semibold uppercase tracking-wider text-[var(--text-dim)]">
            Signal Display
          </label>
          <div className="flex rounded-lg p-1 bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-xs font-mono">
            {[
              { id: 'rf', label: '100 kHz RF' },
              { id: 'envelope', label: 'Pulse Envelope' },
            ].map((m) => (
              <button
                key={m.id}
                onClick={() => setSignalMode(m.id)}
                className="flex-1 py-1.5 text-center rounded transition font-medium cursor-pointer"
                style={
                  signalMode === m.id
                    ? { background: 'var(--accent-eloran)', color: 'var(--btn-eloran-text)', fontWeight: 700 }
                    : { color: 'var(--text-secondary)' }
                }
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Zoom Controls */}
        <div className="space-y-1.5">
          <label className="text-xs font-mono font-semibold uppercase tracking-wider text-[var(--text-dim)]">
            Viewport Zoom
          </label>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => handleZoomDelta(0.5)}
              className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] hover:bg-[var(--border-subtle)] transition"
              title="Zoom In 2x"
            >
              <ZoomIn size={13} /> In
            </button>
            <button
              onClick={() => handleZoomDelta(2.0)}
              className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-primary)] hover:bg-[var(--border-subtle)] transition"
              title="Zoom Out 2x"
            >
              <ZoomOut size={13} /> Out
            </button>
            <button
              onClick={handleResetZoom}
              className="inline-flex items-center justify-center p-1.5 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-subtle)] transition"
              title="Reset Viewport to Full Chain"
            >
              <RotateCcw size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Station Quick-Zoom Jump Chips */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <span className="text-xs font-mono text-[var(--text-dim)] flex items-center gap-1">
          <Zap size={12} /> Focus Burst:
        </span>
        <button
          onClick={handleResetZoom}
          className="px-2.5 py-1 rounded text-xs font-mono transition border cursor-pointer"
          style={
            viewportRange === null
              ? {
                  background: 'var(--accent-eloran-subtle)',
                  borderColor: 'var(--accent-eloran-border)',
                  color: 'var(--accent-eloran)',
                  fontWeight: 700,
                }
              : {
                  background: 'var(--bg-subtle)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-secondary)',
                }
          }
        >
          Full Chain Overview
        </button>

        {arrivals.map((arr) => {
          const isMaster = arr.role === 'master';
          return (
            <button
              key={`${arr.period}-${arr.label}-${arr.edUs}`}
              onClick={() => handleZoomStation(arr)}
              className="px-2.5 py-1 rounded text-xs font-mono transition border flex items-center gap-1.5 hover:opacity-90 cursor-pointer"
              style={{
                background: isMaster ? 'rgba(245, 158, 11, 0.12)' : 'rgba(56, 189, 248, 0.12)',
                borderColor: isMaster ? 'rgba(245, 158, 11, 0.35)' : 'rgba(56, 189, 248, 0.35)',
                color: isMaster ? 'var(--accent-loran-c)' : 'var(--accent-eloran)',
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: isMaster ? 'var(--accent-loran-c)' : 'var(--accent-eloran)' }}
              />
              <span className="font-bold">
                {arr.period}: {arr.station} ({arr.label})
              </span>
              <span className="text-[10px] opacity-75">
                {(arr.edUs / 1000).toFixed(1)} ms
              </span>
            </button>
          );
        })}
      </div>

      {/* Oscilloscope SVG Display */}
      <div
        className="relative rounded-xl overflow-hidden border border-[var(--border-subtle)]"
        style={{ background: colors.bg }}
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full h-auto block select-none cursor-crosshair"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          {/* Background grid lines */}
          {xTicks.map((tick) => (
            <g key={tick.x}>
              <line
                x1={tick.x}
                y1={padT}
                x2={tick.x}
                y2={padT + chartH}
                stroke={colors.gridLine}
                strokeWidth="1"
                strokeDasharray="2 3"
              />
              <text
                x={tick.x}
                y={padT + chartH + 20}
                fill={colors.axisText}
                fontSize="10"
                fontFamily="ui-monospace, monospace"
                textAnchor="middle"
              >
                {tick.label}
              </text>
            </g>
          ))}

          {/* Amplitude horizontal grid lines */}
          {[-maxAmp, -maxAmp * 0.5, 0, maxAmp * 0.5, maxAmp].map((val) => {
            const y = midY - (val / maxAmp) * (chartH / 2);
            const isZero = Math.abs(val) < 0.001;
            return (
              <g key={val}>
                <line
                  x1={padL}
                  y1={y}
                  x2={padL + chartW}
                  y2={y}
                  stroke={isZero ? colors.centerLine : colors.gridLine}
                  strokeWidth={isZero ? '1.5' : '1'}
                />
                <text
                  x={padL - 8}
                  y={y + 3.5}
                  fill={colors.axisText}
                  fontSize="10"
                  fontFamily="ui-monospace, monospace"
                  textAnchor="end"
                >
                  {val >= 0 ? `+${val.toFixed(2)}` : val.toFixed(2)}
                </text>
              </g>
            );
          })}

          {/* Individual pulse markers when zoomed into a single burst */}
          {individualPulseMarkers.map((pm, idx) => (
            <g key={`pm-${idx}`}>
              <line
                x1={pm.x}
                y1={padT + 22}
                x2={pm.x}
                y2={padT + chartH}
                stroke={colors.pulseMarker}
                strokeWidth="1"
                strokeDasharray="2 2"
              />
              <rect
                x={pm.x - 12}
                y={padT + 4}
                width={24}
                height={15}
                rx={3}
                fill={colors.badgeBg}
                stroke={pm.sign > 0 ? 'var(--status-ok)' : 'var(--status-error)'}
                strokeWidth="1"
              />
              <text
                x={pm.x}
                y={padT + 15}
                fill={pm.sign > 0 ? 'var(--status-ok)' : 'var(--status-error)'}
                fontSize="8"
                fontFamily="ui-monospace, monospace"
                fontWeight="bold"
                textAnchor="middle"
              >
                {pm.name}
              </text>
            </g>
          ))}

          {/* Station arrival burst indicators & multi-tier anti-collision pill badges */}
          {!isZoomedBurst && layoutedArrivals.map((arr) => {
            const isMaster = arr.role === 'master';
            const color = isMaster ? colors.masterColor : colors.secondaryColor;

            return (
              <g key={`arr-${arr.period}-${arr.label}-${arr.edUs}`}>
                <line
                  x1={arr.ax}
                  y1={padT}
                  x2={arr.ax}
                  y2={padT + chartH}
                  stroke={color}
                  strokeWidth="1.5"
                  strokeDasharray="3 2"
                  opacity="0.8"
                />
                <polygon
                  points={`${arr.ax},${padT + 8} ${arr.ax - 4},${padT} ${arr.ax + 4},${padT}`}
                  fill={color}
                />
                <rect
                  x={arr.badgeX}
                  y={arr.badgeY}
                  width={arr.badgeW}
                  height={18}
                  rx={3}
                  fill={colors.badgeBg}
                  stroke={color}
                  strokeWidth="1"
                />
                <circle
                  cx={arr.badgeX + 8}
                  cy={arr.badgeY + 9}
                  r={2.5}
                  fill={color}
                />
                <text
                  x={arr.badgeX + 18}
                  y={arr.badgeY + 13}
                  fill={color}
                  fontSize="9.5"
                  fontFamily="ui-monospace, monospace"
                  fontWeight="bold"
                >
                  {arr.station} ({arr.label}) {isMaster ? '• 9P' : ''}
                </text>
              </g>
            );
          })}

          {/* Main Waveform / Envelope Path */}
          {waveformPath && (
            <path
              d={waveformPath}
              fill="none"
              stroke={signalMode === 'rf' ? colors.rfLine : colors.envLine}
              strokeWidth={isZoomedBurst ? '1.8' : '1.3'}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}

          {/* Interactive Mouse Crosshair & Tooltip */}
          {hoverData && (
            <g>
              <line
                x1={hoverData.x}
                y1={padT}
                x2={hoverData.x}
                y2={padT + chartH}
                stroke={colors.crosshair}
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              <circle
                cx={hoverData.x}
                cy={midY - (hoverData.val / maxAmp) * (chartH / 2)}
                r="3.5"
                fill={colors.crosshair}
              />
            </g>
          )}
        </svg>

        {/* Hover Floating HUD */}
        {hoverData && (
          <div
            className="absolute pointer-events-none text-xs font-mono p-2 rounded shadow-lg backdrop-blur-md"
            style={{
              left: Math.min(hoverData.x + 15, svgWidth - 180),
              top: Math.max(10, hoverData.y - 60),
              background: colors.tooltipBg,
              border: `1px solid ${colors.tooltipBorder}`,
              color: 'var(--text-primary)',
            }}
          >
            <div>
              <span className="text-[var(--text-dim)]">Time: </span>
              <span className="font-bold">{hoverData.timeUs.toFixed(1)} µs</span> (
              {(hoverData.timeUs / 1000).toFixed(3)} ms)
            </div>
            <div>
              <span className="text-[var(--text-dim)]">Amplitude: </span>
              <span className="font-bold text-[var(--accent-eloran)]">
                {hoverData.val >= 0 ? `+${hoverData.val.toFixed(3)}` : hoverData.val.toFixed(3)}
              </span>
            </div>
            {hoverData.nearestStation && hoverData.distanceUs < 15000 && (
              <div className="text-[10px] text-[var(--text-secondary)] mt-0.5 border-t border-[var(--border-subtle)] pt-0.5">
                Near {hoverData.nearestStation.station} ({hoverData.nearestStation.label}) &Delta;t ={' '}
                {hoverData.distanceUs.toFixed(0)} µs
              </div>
            )}
          </div>
        )}
      </div>

      {/* PCI Phase Code Matrix Display */}
      <div
        className="rounded-xl p-4 space-y-3 font-mono text-xs"
        style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)' }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers size={14} className="text-[var(--accent-eloran)]" />
            <span className="font-bold text-[var(--text-primary)]">
              CheolJ Phase Code Interval (PCI) Matrix
            </span>
          </div>
          <span className="text-[11px] text-[var(--text-dim)]">
            Standard Loran-C Phase Coding (USCG / CheolJ 2020)
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Master Station PCI */}
          <div className="p-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-2">
            <div className="flex justify-between items-center">
              <span className="font-bold text-[var(--accent-loran-c)] flex items-center gap-1">
                <Radio size={12} /> Master Station ({chain.master.name})
              </span>
              <span className="text-[10px] text-[var(--text-dim)]">10 Pulses (2 ms blank gap)</span>
            </div>

            {/* GRI A */}
            <div className="space-y-1">
              <div className="text-[11px] text-[var(--text-secondary)] flex justify-between">
                <span>Group Interval A (GRI A):</span>
                <span className="text-[10px] text-[var(--text-dim)]">Phase sequence</span>
              </div>
              <div className="flex flex-wrap gap-1 items-center">
                {CHEOLJ_PCI_CODES.master.A.map((code, idx) => (
                  <span
                    key={`m-a-${idx}`}
                    className="w-6 h-6 rounded flex items-center justify-center font-bold text-xs"
                    style={{
                      background:
                        code === 1
                          ? 'rgba(16, 185, 129, 0.2)'
                          : code === -1
                          ? 'rgba(239, 68, 68, 0.2)'
                          : 'transparent',
                      color:
                        code === 1
                          ? 'var(--status-ok)'
                          : code === -1
                          ? 'var(--status-error)'
                          : 'var(--text-dim)',
                      border: code === 0 ? '1px dashed var(--border-subtle)' : 'none',
                    }}
                    title={
                      code === 0
                        ? '1000 µs blanking interval before 9th pulse'
                        : `Pulse ${idx === 9 ? 9 : idx + 1}: ${code > 0 ? '+1 (0°)' : '-1 (180°)'}`
                    }
                  >
                    {code === 1 ? '+' : code === -1 ? '−' : '·'}
                  </span>
                ))}
              </div>
            </div>

            {/* GRI B */}
            <div className="space-y-1 pt-1">
              <div className="text-[11px] text-[var(--text-secondary)] flex justify-between">
                <span>Group Interval B (GRI B):</span>
                <span className="text-[10px] text-[var(--text-dim)]">Phase sequence</span>
              </div>
              <div className="flex flex-wrap gap-1 items-center">
                {CHEOLJ_PCI_CODES.master.B.map((code, idx) => (
                  <span
                    key={`m-b-${idx}`}
                    className="w-6 h-6 rounded flex items-center justify-center font-bold text-xs"
                    style={{
                      background:
                        code === 1
                          ? 'rgba(16, 185, 129, 0.2)'
                          : code === -1
                          ? 'rgba(239, 68, 68, 0.2)'
                          : 'transparent',
                      color:
                        code === 1
                          ? 'var(--status-ok)'
                          : code === -1
                          ? 'var(--status-error)'
                          : 'var(--text-dim)',
                      border: code === 0 ? '1px dashed var(--border-subtle)' : 'none',
                    }}
                    title={
                      code === 0
                        ? '1000 µs blanking interval before 9th pulse'
                        : `Pulse ${idx === 9 ? 9 : idx + 1}: ${code > 0 ? '+1 (0°)' : '-1 (180°)'}`
                    }
                  >
                    {code === 1 ? '+' : code === -1 ? '−' : '·'}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Secondary Stations PCI */}
          <div className="p-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-2">
            <div className="flex justify-between items-center">
              <span className="font-bold text-[var(--accent-eloran)] flex items-center gap-1">
                <Compass size={12} /> Secondary Stations (X, Y, Z, W, P)
              </span>
              <span className="text-[10px] text-[var(--text-dim)]">8 Pulses (1000 µs spacing)</span>
            </div>

            {/* GRI A */}
            <div className="space-y-1">
              <div className="text-[11px] text-[var(--text-secondary)] flex justify-between">
                <span>Group Interval A (GRI A):</span>
                <span className="text-[10px] text-[var(--text-dim)]">Phase sequence</span>
              </div>
              <div className="flex flex-wrap gap-1 items-center">
                {CHEOLJ_PCI_CODES.secondary.A.map((code, idx) => (
                  <span
                    key={`s-a-${idx}`}
                    className="w-6 h-6 rounded flex items-center justify-center font-bold text-xs"
                    style={{
                      background: code === 1 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                      color: code === 1 ? 'var(--status-ok)' : 'var(--status-error)',
                    }}
                    title={`Pulse ${idx + 1}: ${code > 0 ? '+1 (0°)' : '-1 (180°)'}`}
                  >
                    {code === 1 ? '+' : '−'}
                  </span>
                ))}
              </div>
            </div>

            {/* GRI B */}
            <div className="space-y-1 pt-1">
              <div className="text-[11px] text-[var(--text-secondary)] flex justify-between">
                <span>Group Interval B (GRI B):</span>
                <span className="text-[10px] text-[var(--text-dim)]">Phase sequence</span>
              </div>
              <div className="flex flex-wrap gap-1 items-center">
                {CHEOLJ_PCI_CODES.secondary.B.map((code, idx) => (
                  <span
                    key={`s-b-${idx}`}
                    className="w-6 h-6 rounded flex items-center justify-center font-bold text-xs"
                    style={{
                      background: code === 1 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                      color: code === 1 ? 'var(--status-ok)' : 'var(--status-error)',
                    }}
                    title={`Pulse ${idx + 1}: ${code > 0 ? '+1 (0°)' : '-1 (180°)'}`}
                  >
                    {code === 1 ? '+' : '−'}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Calibrated Reference Station Characteristics Table */}
      <div className="space-y-2">
        <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-[var(--text-primary)] flex items-center gap-1.5">
          <Activity size={14} className="text-[var(--accent-eloran)]" /> Calibrated Reference Station Telemetry
        </h3>
        <div className="overflow-x-auto rounded-lg border border-[var(--border-subtle)]">
          <table className="w-full text-xs font-mono text-left">
            <thead className="bg-[var(--bg-subtle)] text-[var(--text-dim)] border-b border-[var(--border-subtle)]">
              <tr>
                <th className="py-2.5 px-3">Station</th>
                <th className="py-2.5 px-3">Role &amp; Code</th>
                <th className="py-2.5 px-3">Coordinates</th>
                <th className="py-2.5 px-3">Emission Delay (ED)</th>
                <th className="py-2.5 px-3">Amplitude Ratio</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {/* Master Station */}
              <tr className="hover:bg-[var(--bg-subtle)] transition">
                <td className="py-2.5 px-3 font-bold text-[var(--text-primary)]">
                  {chain.master.name}
                </td>
                <td className="py-2.5 px-3">
                  <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/20 text-[var(--accent-loran-c)] border border-amber-500/30">
                    Master (M)
                  </span>
                </td>
                <td className="py-2.5 px-3 text-[var(--text-secondary)]">
                  {chain.master.lat.toFixed(4)}°N, {chain.master.lng.toFixed(4)}°E
                </td>
                <td className="py-2.5 px-3 font-semibold text-[var(--accent-loran-c)]">
                  {chain.master.emissionDelayUs.toLocaleString('en-US', { minimumFractionDigits: 2 })} µs
                </td>
                <td className="py-2.5 px-3 text-[var(--text-secondary)]">
                  {(chain.master.ampRatio * 100).toFixed(0)}%
                </td>
                <td className="py-2.5 px-3 text-right">
                  <button
                    onClick={() => {
                      const arr = arrivals.find((a) => a.role === 'master');
                      if (arr) handleZoomStation(arr);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[var(--bg-subtle)] hover:bg-[var(--border-subtle)] text-[var(--text-primary)] transition cursor-pointer"
                  >
                    Focus <ChevronRight size={12} />
                  </button>
                </td>
              </tr>

              {/* Secondary Stations */}
              {chain.secondaries.map((sec) => (
                <tr key={sec.code} className="hover:bg-[var(--bg-subtle)] transition">
                  <td className="py-2.5 px-3 font-bold text-[var(--text-primary)]">
                    {sec.name}
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-sky-500/20 text-[var(--accent-eloran)] border border-sky-500/30">
                      Secondary ({sec.code})
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-[var(--text-secondary)]">
                    {sec.lat.toFixed(4)}°N, {sec.lng.toFixed(4)}°E
                  </td>
                  <td className="py-2.5 px-3 font-semibold text-[var(--accent-eloran)]">
                    {sec.emissionDelayUs.toLocaleString('en-US', { minimumFractionDigits: 2 })} µs
                  </td>
                  <td className="py-2.5 px-3 text-[var(--text-secondary)]">
                    {(sec.ampRatio * 100).toFixed(0)}%
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <button
                      onClick={() => {
                        const arr = arrivals.find((a) => a.label === sec.code);
                        if (arr) handleZoomStation(arr);
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[var(--bg-subtle)] hover:bg-[var(--border-subtle)] text-[var(--text-primary)] transition cursor-pointer"
                    >
                      Focus <ChevronRight size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
