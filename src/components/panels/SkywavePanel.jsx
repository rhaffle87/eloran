import React, { useState, useMemo } from 'react';
import {
  Sun,
  Moon,
  Radio,
  Activity,
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  Eye,
  EyeOff,
} from 'lucide-react';
import Slider from '../ui/Slider.jsx';
import {
  evaluateSkywaveInterference,
  synthesizeCompositeWaveform,
  canonicalPulseEnvelope,
  getDiurnalReflectionHeight,
} from '../../lib/skywave.js';
import { useSimulationStore } from '../../state/simulationStore.js';
import { useThemeStore } from '../../state/themeStore.js';

const SVG_WIDTH = 600;
const SVG_HEIGHT = 220;
const PAD_X = 44;
const PLOT_W = SVG_WIDTH - PAD_X - 24;
const CENTER_Y = 110;
const SCALE_Y = 62;

function toSvgX(tUs) {
  return PAD_X + (tUs / 120.0) * PLOT_W;
}

function toSvgY(v) {
  return CENTER_Y - v * SCALE_Y;
}

function makePath(data) {
  return data
    .map((val, idx) => {
      const t = (idx / (data.length - 1)) * 120.0;
      const x = toSvgX(t);
      const y = toSvgY(val);
      return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}

export default function SkywavePanel() {
  const { effectiveTheme } = useThemeStore();
  const isDark = effectiveTheme === 'dark';

  // State initialized to match the nominal Day / Solar Noon scenario
  const [selectedScenario, setSelectedScenario] = useState('day'); // 'day' | 'dusk' | 'night' | 'severe' | 'custom'
  const [solarHour, setSolarHour] = useState(12.0); // 12 = Noon
  const [distanceKm, setDistanceKm] = useState(500.0);
  const [powerKw, setPowerKw] = useState(50.0);
  const [groundSigma, setGroundSigma] = useState(0.005); // S/m (land)

  // Trace visibility toggles
  const [showGroundwave, setShowGroundwave] = useState(true);
  const [showSkywave, setShowSkywave] = useState(true);
  const [showComposite, setShowComposite] = useState(true);
  const [showEnvelopes, setShowEnvelopes] = useState(true);

  const { injectCycleSlip } = useSimulationStore();

  // Evaluate skywave interference metrics
  const assessment = useMemo(() => {
    return evaluateSkywaveInterference(distanceKm, solarHour, powerKw, groundSigma);
  }, [distanceKm, solarHour, powerKw, groundSigma]);

  // Compute waveform samples for SVG oscilloscope
  const waveform = useMemo(() => {
    const pointsCount = 280;
    const timePoints = [];
    for (let i = 0; i <= pointsCount; i++) {
      timePoints.push((i / pointsCount) * 120.0); // 0 to 120 µs
    }

    return synthesizeCompositeWaveform(timePoints, assessment.tauSkyUs, assessment.ampRatio);
  }, [assessment.tauSkyUs, assessment.ampRatio]);

  // Compute envelope sample paths
  const envelopes = useMemo(() => {
    const pointsCount = 280;
    const gwEnv = [];
    const swEnv = [];
    for (let i = 0; i <= pointsCount; i++) {
      const t = (i / pointsCount) * 120.0;
      gwEnv.push(canonicalPulseEnvelope(t));
      swEnv.push(t >= assessment.tauSkyUs ? canonicalPulseEnvelope(t - assessment.tauSkyUs) * assessment.ampRatio : 0);
    }
    return {
      gwPath: makePath(gwEnv),
      swPath: makePath(swEnv),
      gwNegPath: makePath(gwEnv.map((v) => -v)),
      swNegPath: makePath(swEnv.map((v) => -v)),
    };
  }, [assessment.tauSkyUs, assessment.ampRatio]);

  // Preset Scenario Handlers
  const handlePresetSelect = (id, hour, dist, sigma, pKw) => {
    setSelectedScenario(id);
    setSolarHour(hour);
    setDistanceKm(dist);
    setGroundSigma(sigma);
    if (pKw) setPowerKw(pKw);
  };

  const groundwavePath = useMemo(() => makePath(waveform.groundwave), [waveform.groundwave]);
  const skywavePath = useMemo(() => makePath(waveform.skywave), [waveform.skywave]);
  const compositePath = useMemo(() => makePath(waveform.composite), [waveform.composite]);

  // Risk styling
  const isNight = solarHour < 6.0 || solarHour > 18.0;
  const riskBadge = {
    NONE: { label: 'Pristine (No Skywave Interference)', color: 'var(--status-ok)', bg: 'var(--status-ok-subtle)', border: 'var(--status-ok-border)', icon: ShieldCheck },
    LOW: { label: 'Low Skywave Risk (Benign)', color: 'var(--status-ok)', bg: 'var(--status-ok-subtle)', border: 'var(--status-ok-border)', icon: ShieldCheck },
    MODERATE: { label: 'Moderate Skywave Contamination', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)', border: 'rgba(245, 158, 11, 0.3)', icon: AlertTriangle },
    HIGH: { label: 'High Cycle-Slip Risk (> 25%)', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)', border: 'rgba(239, 68, 68, 0.3)', icon: ShieldAlert },
    CRITICAL: { label: 'Critical Skywave Inversion (> 50% Cycle Slip)', color: '#dc2626', bg: 'rgba(220, 38, 38, 0.15)', border: 'rgba(220, 38, 38, 0.4)', icon: ShieldAlert },
  }[assessment.cycleSlipRisk] || { label: 'Safe', color: 'var(--status-ok)', bg: 'var(--status-ok-subtle)', border: 'var(--status-ok-border)', icon: ShieldCheck };

  const RiskIcon = riskBadge.icon;

  // Calibrated colors for oscilloscope screen in dark vs light mode
  const scopeColors = isDark ? {
    bg: '#060911',
    border: 'var(--border-subtle)',
    grid: 'rgba(255, 255, 255, 0.07)',
    centerLine: 'rgba(255, 255, 255, 0.18)',
    axisText: '#9ca3af',
    gwColor: '#38bdf8',
    swColor: '#fbbf24',
    compColor: '#f8fafc',
    szcColor: '#a855f7',
    szcText: '#c084fc',
    envColor: 'rgba(56, 189, 248, 0.35)',
    swEnvColor: 'rgba(251, 191, 36, 0.35)',
  } : {
    bg: '#f8fafc',
    border: 'var(--border-subtle)',
    grid: 'rgba(0, 0, 0, 0.07)',
    centerLine: 'rgba(0, 0, 0, 0.22)',
    axisText: '#64748b',
    gwColor: '#0284c7',
    swColor: '#d97706',
    compColor: '#0f172a',
    szcColor: '#9333ea',
    szcText: '#7e22ce',
    envColor: 'rgba(2, 132, 199, 0.30)',
    swEnvColor: 'rgba(217, 119, 6, 0.30)',
  };

  return (
    <div
      className="p-5 rounded-xl border space-y-6 shadow-sm font-mono transition-colors"
      style={{
        background: 'var(--bg-surface)',
        borderColor: 'var(--border-subtle)',
        color: 'var(--text-primary)',
      }}
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--accent-eloran)' }}>
            <Radio size={14} aria-hidden="true" />
            <span>Atmospheric Physics &amp; Ionospheric Reflection Engine</span>
          </div>
          <h2 className="text-xl font-bold tracking-tight">
            Ionospheric Skywave &amp; Diurnal Interference
          </h2>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5 max-w-2xl font-sans">
            Spherical-Earth 1-Hop / 2-Hop reflection geometry (Doherty et al. 1961), diurnal D-layer (70 km) / E-layer (90 km) transition, and Standard Zero Crossing (SZC at 30 µs) cycle slip distortion.
          </p>
        </div>

        <a
          href="/learn#skywave"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs border self-start sm:self-auto transition cursor-pointer hover:opacity-80"
          style={{
            background: 'var(--accent-eloran-subtle)',
            color: 'var(--accent-eloran)',
            borderColor: 'var(--accent-eloran-border)',
          }}
          title="Learn about skywave propagation theory and cycle selection"
        >
          <span>Theory &rarr;</span>
        </a>
      </div>

      {/* Quick Scenario Presets */}
      <div>
        <div className="text-xs text-[var(--text-dim)] uppercase tracking-wider mb-2">
          Diurnal Scenarios &amp; Physical Benchmarks
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <button
            type="button"
            onClick={() => handlePresetSelect('day', 12.0, 500.0, 0.005, 50.0)}
            className="py-1.5 px-2.5 rounded-lg text-xs border flex items-center justify-center gap-1.5 transition cursor-pointer hover:border-[var(--accent-eloran)]"
            style={{
              background: selectedScenario === 'day' ? 'var(--accent-eloran-subtle)' : 'var(--bg-subtle)',
              borderColor: selectedScenario === 'day' ? 'var(--accent-eloran)' : 'var(--border-subtle)',
              color: selectedScenario === 'day' ? 'var(--accent-eloran)' : 'var(--text-secondary)',
              fontWeight: selectedScenario === 'day' ? 700 : 500,
            }}
            title="Solar noon: D-layer at 70 km with heavy ionospheric absorption"
          >
            <Sun size={13} className="text-amber-500" />
            <span>Day / Solar Noon</span>
          </button>

          <button
            type="button"
            onClick={() => handlePresetSelect('dusk', 18.5, 800.0, 0.005, 50.0)}
            className="py-1.5 px-2.5 rounded-lg text-xs border flex items-center justify-center gap-1.5 transition cursor-pointer hover:border-[var(--accent-eloran)]"
            style={{
              background: selectedScenario === 'dusk' ? 'var(--accent-eloran-subtle)' : 'var(--bg-subtle)',
              borderColor: selectedScenario === 'dusk' ? 'var(--accent-eloran)' : 'var(--border-subtle)',
              color: selectedScenario === 'dusk' ? 'var(--accent-eloran)' : 'var(--text-secondary)',
              fontWeight: selectedScenario === 'dusk' ? 700 : 500,
            }}
            title="Twilight: D-layer recombinant decay, intermediate reflection height"
          >
            <Activity size={13} className="text-sky-500" />
            <span>Dusk / Sunset</span>
          </button>

          <button
            type="button"
            onClick={() => handlePresetSelect('night', 0.0, 900.0, 0.005, 50.0)}
            className="py-1.5 px-2.5 rounded-lg text-xs border flex items-center justify-center gap-1.5 transition cursor-pointer hover:border-[var(--accent-eloran)]"
            style={{
              background: selectedScenario === 'night' ? 'var(--accent-eloran-subtle)' : 'var(--bg-subtle)',
              borderColor: selectedScenario === 'night' ? 'var(--accent-eloran)' : 'var(--border-subtle)',
              color: selectedScenario === 'night' ? 'var(--accent-eloran)' : 'var(--text-secondary)',
              fontWeight: selectedScenario === 'night' ? 700 : 500,
            }}
            title="Midnight: E-layer at 90 km, absorption drops, high skywave amplitude"
          >
            <Moon size={13} className="text-indigo-500" />
            <span>Night / Midnight</span>
          </button>

          <button
            type="button"
            onClick={() => handlePresetSelect('severe', 1.0, 1400.0, 0.003, 100.0)}
            className="py-1.5 px-2.5 rounded-lg text-xs border flex items-center justify-center gap-1.5 transition cursor-pointer hover:border-[var(--accent-eloran)]"
            style={{
              background: selectedScenario === 'severe' ? 'var(--accent-eloran-subtle)' : 'var(--bg-subtle)',
              borderColor: selectedScenario === 'severe' ? 'var(--accent-eloran)' : 'var(--border-subtle)',
              color: selectedScenario === 'severe' ? 'var(--accent-eloran)' : 'var(--text-secondary)',
              fontWeight: selectedScenario === 'severe' ? 700 : 500,
            }}
            title="Extended 1400 km range at night: Skywave exceeds groundwave (SSR < 0 dB)"
          >
            <AlertTriangle size={13} className="text-red-500" />
            <span>Severe Night Inversion</span>
          </button>
        </div>
      </div>

      {/* Main Interactive Controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Solar Hour */}
        <Slider
          label="Local Solar Hour"
          unit={isNight ? 'h (Night)' : 'h (Day)'}
          min={0}
          max={24}
          step={0.5}
          value={solarHour}
          onChange={(v) => {
            setSolarHour(parseFloat(v));
            setSelectedScenario('custom');
          }}
          tooltip="Local solar time governing ionospheric photo-ionization and D-layer altitude"
        />

        {/* Geodesic Distance */}
        <Slider
          label="Geodesic Distance"
          unit="km"
          min={100}
          max={2000}
          step={25}
          value={distanceKm}
          onChange={(v) => {
            setDistanceKm(parseFloat(v));
            setSelectedScenario('custom');
          }}
          tooltip="Great-circle distance along curved Earth from transmitter to receiver"
        />

        {/* ERP Power */}
        <Slider
          label="Transmitter ERP"
          unit="kW"
          min={10}
          max={500}
          step={10}
          value={powerKw}
          onChange={(v) => {
            setPowerKw(parseFloat(v));
            setSelectedScenario('custom');
          }}
          tooltip="Effective Radiated Power of Loran-C / eLoran station"
        />

        {/* Terrain Conductivity */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center text-xs">
            <span className="font-medium" style={{ color: 'var(--text-secondary)' }}>
              Terrain Conductivity (σ)
            </span>
            <span
              className="font-mono px-1.5 py-0.5 rounded text-[11px]"
              style={{ color: 'var(--accent-eloran)', background: 'var(--accent-eloran-subtle)' }}
            >
              {groundSigma >= 1.0 ? '5.0 S/m' : groundSigma >= 0.003 ? '0.005 S/m' : '0.001 S/m'}
            </span>
          </div>
          <select
            value={groundSigma}
            onChange={(e) => {
              setGroundSigma(parseFloat(e.target.value));
              setSelectedScenario('custom');
            }}
            className="w-full py-1.5 px-2.5 rounded-lg text-xs font-mono border cursor-pointer transition focus:ring-1 focus:ring-[var(--accent-eloran)]"
            style={{
              background: 'var(--bg-subtle)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-primary)',
              outline: 'none',
            }}
          >
            <option value={5.0}>Seawater (σ = 5.0 S/m)</option>
            <option value={0.005}>Average Land (σ = 0.005 S/m)</option>
            <option value={0.001}>Mountains / Dry (σ = 0.001 S/m)</option>
          </select>
        </div>
      </div>

      {/* Primary Physical Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] transition-colors">
          <div className="text-[var(--text-dim)] uppercase text-[10px] tracking-wider mb-1">
            Reflection Altitude (h)
          </div>
          <div className="text-base font-bold text-sky-500 dark:text-sky-400">
            {(getDiurnalReflectionHeight(solarHour) / 1000).toFixed(1)} km
          </div>
          <div className="text-[10px] text-[var(--text-dim)] mt-0.5">
            {isNight ? 'E-Layer (Night Reflection)' : 'D-Layer (Solar Zenith)'}
          </div>
        </div>

        <div className="p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] transition-colors">
          <div className="text-[var(--text-dim)] uppercase text-[10px] tracking-wider mb-1">
            1-Hop Slant Delay (τ)
          </div>
          <div className="text-base font-bold text-amber-500 dark:text-amber-400">
            {assessment.tauSkyUs.toFixed(1)} µs
          </div>
          <div className="text-[10px] text-[var(--text-dim)] mt-0.5">
            {assessment.tauSkyUs > 35.0 ? 'Arrives AFTER SZC (30 µs)' : 'Direct SZC Contamination!'}
          </div>
        </div>

        <div className="p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] transition-colors">
          <div className="text-[var(--text-dim)] uppercase text-[10px] tracking-wider mb-1">
            Signal-to-Skywave (SSR)
          </div>
          <div className={`text-base font-bold ${assessment.ssrDb < 0 ? 'text-red-500 dark:text-red-400' : assessment.ssrDb < 10 ? 'text-amber-500 dark:text-amber-400' : 'text-emerald-500 dark:text-emerald-400'}`}>
            {assessment.ssrDb > 0 ? `+${assessment.ssrDb.toFixed(1)}` : assessment.ssrDb.toFixed(1)} dB
          </div>
          <div className="text-[10px] text-[var(--text-dim)] mt-0.5">
            Amp Ratio: {(assessment.ampRatio * 100).toFixed(1)}% of Groundwave
          </div>
        </div>

        <div className="p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] transition-colors">
          <div className="text-[var(--text-dim)] uppercase text-[10px] tracking-wider mb-1">
            SZC Zero Crossing Shift
          </div>
          <div className="text-base font-bold text-purple-500 dark:text-purple-400">
            {assessment.timingShiftUs !== 0 ? `${assessment.timingShiftUs > 0 ? '+' : ''}${assessment.timingShiftUs.toFixed(2)} µs` : '0.00 µs (Clean)'}
          </div>
          <div className="text-[10px] text-[var(--text-dim)] mt-0.5">
            Phase Offset: {assessment.phaseErrorDeg.toFixed(1)}°
          </div>
        </div>
      </div>

      {/* Risk Alert Banner */}
      <div
        className="p-3 rounded-lg border flex flex-wrap items-center justify-between gap-3 text-xs"
        style={{
          background: riskBadge.bg,
          borderColor: riskBadge.border,
          color: riskBadge.color,
        }}
      >
        <div className="flex items-center gap-2">
          <RiskIcon size={16} />
          <span className="font-semibold">{riskBadge.label}</span>
          {assessment.cycleSlipProb > 0 && (
            <span className="text-[var(--text-dim)] text-[11px]">
              (Empirical slip probability: {(assessment.cycleSlipProb * 100).toFixed(0)}% per 100 GRIs)
            </span>
          )}
        </div>

        {assessment.cycleSlipRisk !== 'NONE' && (
          <button
            type="button"
            onClick={() => injectCycleSlip(1)}
            className="px-2.5 py-1 rounded text-xs border font-semibold transition cursor-pointer hover:opacity-80"
            style={{
              background: 'var(--status-err-subtle, rgba(239, 68, 68, 0.2))',
              color: 'var(--status-err, #ef4444)',
              borderColor: 'var(--status-err-border, rgba(239, 68, 68, 0.4))',
            }}
            title="Inject real-time ±10 µs cycle slip into receiver tracking loop"
          >
            Force Cycle Slip (+10 µs)
          </button>
        )}
      </div>

      {/* Oscilloscope View */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-dim)]">
          {/* Interactive Trace Toggles in Legend */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowGroundwave((v) => !v)}
              className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] border transition cursor-pointer ${
                showGroundwave ? 'border-sky-500/50 bg-sky-500/10 text-sky-500 dark:text-sky-400 font-bold' : 'border-[var(--border-subtle)] text-[var(--text-dim)] opacity-50'
              }`}
              title="Click to toggle Groundwave Pulse visibility"
            >
              <span className="inline-block w-2.5 h-0.5 bg-sky-500" />
              <span>Groundwave</span>
              {showGroundwave ? <Eye size={11} /> : <EyeOff size={11} />}
            </button>

            <button
              type="button"
              onClick={() => setShowSkywave((v) => !v)}
              className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] border transition cursor-pointer ${
                showSkywave ? 'border-amber-500/50 bg-amber-500/10 text-amber-500 dark:text-amber-400 font-bold' : 'border-[var(--border-subtle)] text-[var(--text-dim)] opacity-50'
              }`}
              title="Click to toggle Skywave Pulse visibility"
            >
              <span className="inline-block w-2.5 h-0.5 bg-amber-500 border-b border-dashed" />
              <span>Skywave (Delay {assessment.tauSkyUs.toFixed(1)} µs)</span>
              {showSkywave ? <Eye size={11} /> : <EyeOff size={11} />}
            </button>

            <button
              type="button"
              onClick={() => setShowComposite((v) => !v)}
              className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] border transition cursor-pointer ${
                showComposite ? 'border-neutral-500/50 bg-neutral-500/10 text-[var(--text-primary)] font-bold' : 'border-[var(--border-subtle)] text-[var(--text-dim)] opacity-50'
              }`}
              title="Click to toggle Composite Superposition Waveform visibility"
            >
              <span className="inline-block w-2.5 h-0.5 bg-[var(--text-primary)]" />
              <span>Composite</span>
              {showComposite ? <Eye size={11} /> : <EyeOff size={11} />}
            </button>

            <button
              type="button"
              onClick={() => setShowEnvelopes((v) => !v)}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] border transition cursor-pointer ${
                showEnvelopes ? 'border-[var(--accent-eloran-border)] bg-[var(--accent-eloran-subtle)] text-[var(--accent-eloran)] font-bold' : 'border-[var(--border-subtle)] text-[var(--text-dim)] opacity-50'
              }`}
              title="Click to toggle envelope curves"
            >
              <span>Envelopes</span>
              {showEnvelopes ? <Eye size={10} /> : <EyeOff size={10} />}
            </button>
          </div>

          <div className="text-[11px] text-[var(--text-dim)]">
            Standard Zero Crossing: 30.0 µs
          </div>
        </div>

        {/* SVG Oscilloscope Display */}
        <div
          className="w-full rounded-lg border overflow-hidden transition-colors"
          style={{
            background: scopeColors.bg,
            borderColor: scopeColors.border,
          }}
        >
          <svg
            viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
            className="w-full h-56 block"
            preserveAspectRatio="none"
          >
            {/* Background Grid Lines */}
            {[0, 20, 40, 60, 80, 100, 120].map((t) => (
              <line
                key={t}
                x1={toSvgX(t)}
                y1={12}
                x2={toSvgX(t)}
                y2={SVG_HEIGHT - 22}
                stroke={scopeColors.grid}
                strokeWidth={1}
                strokeDasharray="2,4"
              />
            ))}
            {/* Center zero line */}
            <line
              x1={PAD_X}
              y1={CENTER_Y}
              x2={SVG_WIDTH - 20}
              y2={CENTER_Y}
              stroke={scopeColors.centerLine}
              strokeWidth={1}
            />

            {/* Standard Zero Crossing Vertical Marker (30 µs) */}
            <line
              x1={toSvgX(30.0)}
              y1={12}
              x2={toSvgX(30.0)}
              y2={SVG_HEIGHT - 22}
              stroke={scopeColors.szcColor}
              strokeWidth={1.5}
              strokeDasharray="3,3"
            />
            <text
              x={toSvgX(30.0)}
              y={24}
              fill={scopeColors.szcText}
              fontSize={10}
              fontFamily="monospace"
              textAnchor="middle"
            >
              SZC (30 µs)
            </text>

            {/* Optional Envelope Outlines */}
            {showEnvelopes && showGroundwave && (
              <>
                <path d={envelopes.gwPath} fill="none" stroke={scopeColors.envColor} strokeWidth={1} strokeDasharray="3,3" />
                <path d={envelopes.gwNegPath} fill="none" stroke={scopeColors.envColor} strokeWidth={1} strokeDasharray="3,3" />
              </>
            )}
            {showEnvelopes && showSkywave && (
              <>
                <path d={envelopes.swPath} fill="none" stroke={scopeColors.swEnvColor} strokeWidth={1} strokeDasharray="3,3" />
                <path d={envelopes.swNegPath} fill="none" stroke={scopeColors.swEnvColor} strokeWidth={1} strokeDasharray="3,3" />
              </>
            )}

            {/* Groundwave Waveform */}
            {showGroundwave && (
              <path
                d={groundwavePath}
                fill="none"
                stroke={scopeColors.gwColor}
                strokeWidth={2.0}
                opacity={0.85}
              />
            )}

            {/* Delayed Skywave Waveform */}
            {showSkywave && (
              <path
                d={skywavePath}
                fill="none"
                stroke={scopeColors.swColor}
                strokeWidth={2.0}
                strokeDasharray="5,2"
                opacity={0.95}
              />
            )}

            {/* Composite Superposition Waveform */}
            {showComposite && (
              <path
                d={compositePath}
                fill="none"
                stroke={scopeColors.compColor}
                strokeWidth={1.6}
                opacity={0.8}
              />
            )}

            {/* X-Axis Labels */}
            {[0, 20, 40, 60, 80, 100, 120].map((t) => (
              <text
                key={t}
                x={toSvgX(t)}
                y={SVG_HEIGHT - 6}
                fill={scopeColors.axisText}
                fontSize={9}
                fontFamily="monospace"
                textAnchor="middle"
              >
                {t} µs
              </text>
            ))}
          </svg>
        </div>
      </div>
    </div>
  );
}
