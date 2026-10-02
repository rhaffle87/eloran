import React, { useState, useMemo } from 'react';
import {
  Sun,
  Moon,
  Radio,
  Activity,
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  Zap,
  Globe2,
} from 'lucide-react';
import Slider from '../ui/Slider.jsx';
import {
  evaluateSkywaveInterference,
  synthesizeCompositeWaveform,
} from '../../lib/skywave.js';
import { useSimulationStore } from '../../state/simulationStore.js';

const SVG_WIDTH = 600;
const SVG_HEIGHT = 200;
const PAD_X = 40;
const PLOT_W = SVG_WIDTH - PAD_X - 20;
const CENTER_Y = 100;
const SCALE_Y = 55;

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
  const [solarHour, setSolarHour] = useState(12.0); // 12 = Noon
  const [distanceKm, setDistanceKm] = useState(800.0);
  const [powerKw, setPowerKw] = useState(50.0);
  const [groundSigma, setGroundSigma] = useState(0.005); // S/m (land)

  const { injectCycleSlip } = useSimulationStore();

  // Evaluate skywave interference metrics
  const assessment = useMemo(() => {
    return evaluateSkywaveInterference(distanceKm, solarHour, powerKw, groundSigma);
  }, [distanceKm, solarHour, powerKw, groundSigma]);

  // Compute waveform samples for SVG oscilloscope
  const waveform = useMemo(() => {
    const pointsCount = 240;
    const timePoints = [];
    for (let i = 0; i <= pointsCount; i++) {
      timePoints.push((i / pointsCount) * 120.0); // 0 to 120 µs
    }

    return synthesizeCompositeWaveform(timePoints, assessment.tauSkyUs, assessment.ampRatio);
  }, [assessment.tauSkyUs, assessment.ampRatio]);

  // Preset Handlers
  const setPreset = (hour, dist, sigma, pKw) => {
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

  return (
    <div
      className="p-5 rounded-xl border space-y-6"
      style={{
        background: 'var(--panel-bg, #111827)',
        borderColor: 'var(--border-subtle, #374151)',
        color: 'var(--text-primary, #f9fafb)',
      }}
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
        <div>
          <div className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--accent-eloran)' }}>
            <Radio size={14} aria-hidden="true" />
            <span>Atmospheric Physics &amp; Ionospheric Reflection Engine</span>
          </div>
          <h2 className="text-xl font-bold font-mono tracking-tight">
            Ionospheric Skywave &amp; Diurnal Interference
          </h2>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5 max-w-2xl">
            Spherical-Earth 1-Hop / 2-Hop reflection geometry (Doherty et al. 1961), diurnal D-layer (70 km) / E-layer (90 km) transition, and Standard Zero Crossing (SZC at 30 µs) cycle slip distortion.
          </p>
        </div>

        <a
          href="/learn#skywave"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono border self-start sm:self-auto transition cursor-pointer hover:opacity-80"
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
        <div className="text-xs font-mono text-[var(--text-dim)] uppercase tracking-wider mb-2">
          Diurnal Scenarios &amp; Physical Benchmarks
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <button
            onClick={() => setPreset(12.0, 500.0, 0.005, 50.0)}
            className="py-1.5 px-2.5 rounded text-xs font-mono border flex items-center justify-center gap-1.5 transition cursor-pointer hover:border-[var(--accent-eloran)]"
            style={{
              background: solarHour === 12.0 && distanceKm === 500 ? 'var(--accent-eloran-subtle)' : 'var(--bg-subtle)',
              borderColor: solarHour === 12.0 && distanceKm === 500 ? 'var(--accent-eloran)' : 'var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
            title="Solar noon: D-layer at 70 km with heavy ionospheric absorption"
          >
            <Sun size={13} className="text-amber-400" />
            <span>Day / Solar Noon</span>
          </button>

          <button
            onClick={() => setPreset(18.5, 800.0, 0.005, 50.0)}
            className="py-1.5 px-2.5 rounded text-xs font-mono border flex items-center justify-center gap-1.5 transition cursor-pointer hover:border-[var(--accent-eloran)]"
            style={{
              background: solarHour === 18.5 ? 'var(--accent-eloran-subtle)' : 'var(--bg-subtle)',
              borderColor: solarHour === 18.5 ? 'var(--accent-eloran)' : 'var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
            title="Twilight: D-layer recombinant decay, intermediate reflection height"
          >
            <Activity size={13} className="text-sky-400" />
            <span>Dusk / Sunset</span>
          </button>

          <button
            onClick={() => setPreset(0.0, 900.0, 0.005, 50.0)}
            className="py-1.5 px-2.5 rounded text-xs font-mono border flex items-center justify-center gap-1.5 transition cursor-pointer hover:border-[var(--accent-eloran)]"
            style={{
              background: solarHour === 0.0 && distanceKm === 900 ? 'var(--accent-eloran-subtle)' : 'var(--bg-subtle)',
              borderColor: solarHour === 0.0 && distanceKm === 900 ? 'var(--accent-eloran)' : 'var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
            title="Midnight: E-layer at 90 km, absorption drops, high skywave amplitude"
          >
            <Moon size={13} className="text-indigo-400" />
            <span>Night / Midnight</span>
          </button>

          <button
            onClick={() => setPreset(1.0, 1400.0, 0.003, 100.0)}
            className="py-1.5 px-2.5 rounded text-xs font-mono border flex items-center justify-center gap-1.5 transition cursor-pointer hover:border-[var(--accent-eloran)]"
            style={{
              background: distanceKm >= 1400 ? 'var(--accent-eloran-subtle)' : 'var(--bg-subtle)',
              borderColor: distanceKm >= 1400 ? 'var(--accent-eloran)' : 'var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
            title="Extended 1400 km range at night: Skywave exceeds groundwave (SSR < 0 dB)"
          >
            <AlertTriangle size={13} className="text-red-400" />
            <span>Severe Night Inversion</span>
          </button>
        </div>
      </div>

      {/* Main Interactive Controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Solar Hour */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs font-mono">
            <span className="text-[var(--text-dim)] flex items-center gap-1">
              {isNight ? <Moon size={12} className="text-indigo-400" /> : <Sun size={12} className="text-amber-400" />}
              Local Solar Hour:
            </span>
            <span className="font-bold">{solarHour.toFixed(1)}:00 ({isNight ? 'Night' : 'Day'})</span>
          </div>
          <Slider
            label="Solar Hour (UTC)"
            min={0}
            max={24}
            step={0.5}
            value={solarHour}
            onChange={(v) => setSolarHour(parseFloat(v))}
          />
        </div>

        {/* Geodesic Distance */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs font-mono">
            <span className="text-[var(--text-dim)]">Geodesic Distance:</span>
            <span className="font-bold">{distanceKm.toFixed(0)} km</span>
          </div>
          <Slider
            label="Distance"
            min={100}
            max={2000}
            step={25}
            value={distanceKm}
            onChange={(v) => setDistanceKm(parseFloat(v))}
          />
        </div>

        {/* ERP Power */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs font-mono">
            <span className="text-[var(--text-dim)]">Transmitter Power (ERP):</span>
            <span className="font-bold">{powerKw.toFixed(0)} kW</span>
          </div>
          <Slider
            label="Power"
            min={10}
            max={500}
            step={10}
            value={powerKw}
            onChange={(v) => setPowerKw(parseFloat(v))}
          />
        </div>

        {/* Terrain Conductivity */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs font-mono">
            <span className="text-[var(--text-dim)]">Terrain Conductivity (σ):</span>
            <span className="font-bold">
              {groundSigma >= 1.0 ? 'Seawater (5.0 S/m)' : groundSigma >= 0.003 ? 'Average Land (0.005 S/m)' : 'Poor Land (0.001 S/m)'}
            </span>
          </div>
          <select
            value={groundSigma}
            onChange={(e) => setGroundSigma(parseFloat(e.target.value))}
            className="w-full py-1.5 px-2.5 rounded text-xs font-mono border cursor-pointer"
            style={{
              background: 'var(--bg-subtle)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          >
            <option value={5.0}>Seawater (σ = 5.0 S/m, low attenuation)</option>
            <option value={0.005}>Average Continental Land (σ = 0.005 S/m)</option>
            <option value={0.001}>Mountains / Dry Ground (σ = 0.001 S/m)</option>
          </select>
        </div>
      </div>

      {/* Primary Physical Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-xs">
        <div className="p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)]">
          <div className="text-[var(--text-dim)] uppercase text-[10px] tracking-wider mb-1">
            Reflection Altitude (h)
          </div>
          <div className="text-base font-bold text-sky-400">
            {(assessment.refHeightM / 1000.0).toFixed(1)} km
          </div>
          <div className="text-[10px] text-[var(--text-dim)] mt-0.5">
            {isNight ? 'E-Layer (Night Nadir)' : 'D-Layer (Solar Zenith)'}
          </div>
        </div>

        <div className="p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)]">
          <div className="text-[var(--text-dim)] uppercase text-[10px] tracking-wider mb-1">
            1-Hop Slant Delay (τ)
          </div>
          <div className="text-base font-bold text-amber-400">
            {assessment.tauSkyUs.toFixed(1)} µs
          </div>
          <div className="text-[10px] text-[var(--text-dim)] mt-0.5">
            {assessment.tauSkyUs > 35.0 ? 'Arrives AFTER SZC (30 µs)' : 'Direct SZC Contamination!'}
          </div>
        </div>

        <div className="p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)]">
          <div className="text-[var(--text-dim)] uppercase text-[10px] tracking-wider mb-1">
            Signal-to-Skywave (SSR)
          </div>
          <div className={`text-base font-bold ${assessment.ssrDb < 0 ? 'text-red-400' : assessment.ssrDb < 10 ? 'text-amber-400' : 'text-emerald-400'}`}>
            {assessment.ssrDb > 0 ? `+${assessment.ssrDb.toFixed(1)}` : assessment.ssrDb.toFixed(1)} dB
          </div>
          <div className="text-[10px] text-[var(--text-dim)] mt-0.5">
            Amp Ratio: {(assessment.ampRatio * 100).toFixed(1)}% of Groundwave
          </div>
        </div>

        <div className="p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)]">
          <div className="text-[var(--text-dim)] uppercase text-[10px] tracking-wider mb-1">
            SZC Zero Crossing Shift
          </div>
          <div className="text-base font-bold text-purple-400">
            {assessment.timingShiftUs !== 0 ? `${assessment.timingShiftUs > 0 ? '+' : ''}${assessment.timingShiftUs.toFixed(2)} µs` : '0.00 µs (Clean)'}
          </div>
          <div className="text-[10px] text-[var(--text-dim)] mt-0.5">
            Phase Offset: {assessment.phaseErrorDeg.toFixed(1)}°
          </div>
        </div>
      </div>

      {/* Risk Alert Banner */}
      <div
        className="p-3 rounded-lg border flex items-center justify-between gap-3 text-xs font-mono"
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
            <span className="text-[var(--text-dim)]">
              (Empirical slip probability: {(assessment.cycleSlipProb * 100).toFixed(0)}% per 100 GRIs)
            </span>
          )}
        </div>

        {assessment.cycleSlipRisk !== 'NONE' && (
          <button
            onClick={() => injectCycleSlip(1)}
            className="px-2.5 py-1 rounded text-xs font-mono border font-semibold transition cursor-pointer hover:opacity-80"
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
        <div className="flex items-center justify-between text-xs font-mono text-[var(--text-dim)]">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-0.5 bg-sky-400" /> Groundwave Pulse
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-0.5 bg-amber-400 stroke-dashed" /> Skywave Pulse (Delay {assessment.tauSkyUs.toFixed(0)} µs)
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-0.5 bg-white font-bold" /> Composite Waveform
            </span>
          </div>

          <div className="text-[11px] text-[var(--text-dim)]">
            Standard Zero Crossing: 30.0 µs
          </div>
        </div>

        {/* SVG Oscilloscope Display */}
        <div
          className="w-full rounded-lg border overflow-hidden"
          style={{
            background: '#090d16',
            borderColor: 'var(--border-subtle, #374151)',
          }}
        >
          <svg
            viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
            className="w-full h-48 block"
            preserveAspectRatio="none"
          >
            {/* Background Grid Lines */}
            {[0, 20, 40, 60, 80, 100, 120].map((t) => (
              <line
                key={t}
                x1={toSvgX(t)}
                y1={10}
                x2={toSvgX(t)}
                y2={SVG_HEIGHT - 20}
                stroke="#1f293d"
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
              stroke="#374151"
              strokeWidth={1}
            />

            {/* Standard Zero Crossing Vertical Marker (30 µs) */}
            <line
              x1={toSvgX(30.0)}
              y1={10}
              x2={toSvgX(30.0)}
              y2={SVG_HEIGHT - 20}
              stroke="#a855f7"
              strokeWidth={1.5}
              strokeDasharray="3,3"
            />
            <text
              x={toSvgX(30.0)}
              y={22}
              fill="#c084fc"
              fontSize={10}
              fontFamily="monospace"
              textAnchor="middle"
            >
              SZC (30 µs)
            </text>

            {/* Groundwave Waveform */}
            <path
              d={groundwavePath}
              fill="none"
              stroke="#38bdf8"
              strokeWidth={1.4}
              opacity={0.7}
            />

            {/* Delayed Skywave Waveform */}
            <path
              d={skywavePath}
              fill="none"
              stroke="#fbbf24"
              strokeWidth={1.2}
              strokeDasharray="4,2"
              opacity={0.85}
            />

            {/* Composite Superposition Waveform */}
            <path
              d={compositePath}
              fill="none"
              stroke="#ffffff"
              strokeWidth={2.0}
              opacity={0.95}
            />

            {/* X-Axis Labels */}
            {[0, 20, 40, 60, 80, 100, 120].map((t) => (
              <text
                key={t}
                x={toSvgX(t)}
                y={SVG_HEIGHT - 6}
                fill="#6b7280"
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
