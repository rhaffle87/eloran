import React, { useState, useMemo, useCallback } from 'react';
import { RotateCcw, Info, Sliders, ShieldAlert, Sparkles, CheckCircle2, ChevronDown } from 'lucide-react';
import {
  computeAustronWrongCycleProbability,
  computeTheoreticalRiceWrongCycleProbability,
  simulateMonteCarloWrongCycleCurve,
  BOYCE_2006_RATIO_BOUNDS,
} from '../../lib/pulse.js';
import Slider from '../ui/Slider.jsx';
import { InfoTooltip } from '../ui/Tooltip.jsx';

export default function CycleSelectionPanel() {
  const [numTrials, setNumTrials] = useState(1000);
  const [showTheoretical, setShowTheoretical] = useState(true);
  const [showAustronNew, setShowAustronNew] = useState(true);
  const [showAustronOld, setShowAustronOld] = useState(true);
  const [showMonteCarlo, setShowMonteCarlo] = useState(true);
  const [inspectionSnrDb, setInspectionSnrDb] = useState(18);
  const [inspectionPulses, setInspectionPulses] = useState(10);
  const [simSeed, setSimSeed] = useState(42);

  // Extended SNR range from 0 to 32 dB to capture full operating point dynamic range
  const snrDbList = useMemo(() => [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32], []);

  // Re-run Monte Carlo when trials or seed change
  const mcCurve = useMemo(() => {
    let s = simSeed;
    const rng = () => {
      s = (s * 1664525 + 1013904223) % 4294967296;
      return s / 4294967296;
    };

    return simulateMonteCarloWrongCycleCurve({
      snrDbList,
      numTrialsPerPoint: numTrials,
      rng,
    });
  }, [numTrials, simSeed, snrDbList]);

  // Pre-calculate continuous analytic curves from 0 to 32 dB
  const analyticPoints = useMemo(() => {
    const pts = [];
    for (let db = 0; db <= 32; db += 0.5) {
      pts.push({
        db,
        pRice: computeTheoreticalRiceWrongCycleProbability(db),
        pAustronNew: computeAustronWrongCycleProbability(db, 'new'),
        pAustronOld: computeAustronWrongCycleProbability(db, 'old'),
      });
    }
    return pts;
  }, []);

  // Inspection calculations
  const totalInspectionSnrDb = useMemo(() => {
    const linearSnr = Math.pow(10, inspectionSnrDb / 10);
    return 10 * Math.log10(Math.max(1e-4, linearSnr * inspectionPulses));
  }, [inspectionSnrDb, inspectionPulses]);

  const inspectRice = computeTheoreticalRiceWrongCycleProbability(totalInspectionSnrDb);
  const inspectAustronNew = computeAustronWrongCycleProbability(totalInspectionSnrDb, 'new');
  const inspectAustronOld = computeAustronWrongCycleProbability(totalInspectionSnrDb, 'old');

  // Operational Risk & Mean Time Between Slips (MTBS)
  // Assuming 10 GRI bursts/second (typical 100 ms GRI cycle)
  const mtbsSeconds = useMemo(() => {
    const safeP = Math.max(1e-12, inspectRice);
    return 1 / (safeP * 10);
  }, [inspectRice]);

  const mtbsFormatted = useMemo(() => {
    if (inspectRice < 1e-7) return '> 10,000 Hours (Nominal)';
    if (mtbsSeconds >= 3600) return `${(mtbsSeconds / 3600).toFixed(1)} Hours`;
    if (mtbsSeconds >= 60) return `${(mtbsSeconds / 60).toFixed(1)} Minutes`;
    return `${mtbsSeconds.toFixed(1)} Seconds`;
  }, [inspectRice, mtbsSeconds]);

  const operationalStatus = useMemo(() => {
    if (inspectRice < 1e-5) {
      return {
        label: 'NOMINAL LOCK (IMO Standard)',
        color: 'var(--status-ok)',
        bg: 'var(--status-ok-subtle)',
        border: 'var(--status-ok-border)',
        desc: 'Negligible cycle slip risk (< 0.001%). Reliable marine navigation fix.',
      };
    }
    if (inspectRice < 1e-2) {
      return {
        label: 'MARGINAL (Advisory Warning)',
        color: 'var(--status-warn)',
        bg: 'var(--status-warn-subtle)',
        border: 'var(--status-warn-border)',
        desc: 'Elevated cycle slip probability. Pulse integration recommended.',
      };
    }
    return {
      label: 'CRITICAL SLIP HAZARD',
      color: 'var(--status-danger)',
      bg: 'var(--status-danger-subtle)',
      border: 'var(--status-danger-border)',
      desc: 'Severe slip hazard (> 1%). 10 µs / 3 km LOP displacement likely.',
    };
  }, [inspectRice]);

  // Chart coordinates mapping (Fuller container: 920x420)
  // X: SNR dB [0 to 32] -> [75 to 885] (width 810)
  // Y: log10(P) [-4 to 0] -> [365 to 35] (height 330)
  const mapX = useCallback((db) => {
    const clampedDb = Math.max(0, Math.min(32, db));
    return 75 + (clampedDb / 32) * 810;
  }, []);

  const mapY = useCallback((p) => {
    const safeP = Math.max(1e-4, Math.min(1.0, p));
    const logP = Math.log10(safeP); // -4 to 0
    return 35 + ((0 - logP) / 4) * 330;
  }, []);

  const ricePath = useMemo(() => {
    return analyticPoints
      .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${mapX(pt.db).toFixed(1)} ${mapY(pt.pRice).toFixed(1)}`)
      .join(' ');
  }, [analyticPoints, mapX, mapY]);

  const austronNewPath = useMemo(() => {
    return analyticPoints
      .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${mapX(pt.db).toFixed(1)} ${mapY(pt.pAustronNew).toFixed(1)}`)
      .join(' ');
  }, [analyticPoints, mapX, mapY]);

  const austronOldPath = useMemo(() => {
    return analyticPoints
      .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${mapX(pt.db).toFixed(1)} ${mapY(pt.pAustronOld).toFixed(1)}`)
      .join(' ');
  }, [analyticPoints, mapX, mapY]);

  // Operating Reticle Coordinates
  const reticleX = mapX(totalInspectionSnrDb);
  const reticleY = mapY(inspectRice);

  return (
    <div className="bg-[var(--bg-subtle)] border border-[var(--border-subtle)] rounded-xl p-5 space-y-6 shadow-2xl">
      {/* Header and Provenance Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--status-ok-subtle)] text-[var(--status-ok)] border border-[var(--status-ok-border)] flex items-center gap-1 font-semibold uppercase tracking-wider">
              <CheckCircle2 size={11} /> Model: Boyce Ratio &amp; Austron ECD (SOURCED)
              <InfoTooltip
                align="left"
                title="Boyce (ILA 2006) &amp; Austron ECD Model Sourced Excerpt"
                text="Sourced Excerpt: Boyce, Lo, Powell, &amp; Enge (ILA 2006, Section II-D): 'An offset in the time estimate of 5 µs would result in a wrong cycle selection, therefore, we can set bounds on Ratio(30) to lie between Ratio(25) and Ratio(35) in order to obtain the correct cycle. Therefore, a wrong cycle selection will occur if Ratio(30) ≤ Ratio(25) or Ratio(30) ≥ Ratio(35).' Historical Austron ECD variance: σ_ECD_Old = 42 / √(N · SNR) µs (Eq. 5), modern Peterson estimate: σ_ECD_New = 28 / √(N · SNR) µs (Eq. 6)."
              />
            </span>
            <span className="text-[10px] font-mono text-[var(--text-muted)]">
              Boyce et al. (ILA 2006, Section II-D, Fig. 9)
            </span>
          </div>
          <h2 className="text-lg font-bold text-[var(--text-primary)] font-mono flex items-center gap-2">
            <Sparkles size={16} className="text-[var(--accent-eloran)]" />
            Loran Cycle Selection &amp; Monte Carlo Simulator
          </h2>
          <p className="text-[var(--text-dim)] text-xs mt-0.5">
            Real-time Rician envelope ratio excursion probability against empirical Austron ECD decision bounds.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSimSeed((prev) => prev + 1)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--accent-eloran-subtle)] hover:opacity-90 text-[var(--accent-eloran)] border border-[var(--accent-eloran-border)] rounded-lg text-xs font-mono transition cursor-pointer font-bold"
            title="Re-seed Monte Carlo Gaussian noise generator"
          >
            <RotateCcw size={13} /> Re-seed Trials
          </button>
        </div>
      </div>

      {/* Primary Analytic & Monte Carlo Comparison Chart (Replicating Boyce Fig. 9) */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
          <span className="text-[var(--text-secondary)] font-semibold">
            P[Wrong Cycle] vs Total SNR (N · SNR)
          </span>
          <div className="flex flex-wrap items-center gap-4 text-[11px]">
            <label className="flex items-center gap-1.5 cursor-pointer text-[var(--accent-eloran)] font-medium">
              <input
                type="checkbox"
                checked={showTheoretical}
                onChange={(e) => setShowTheoretical(e.target.checked)}
                className="accent-cyan-400 cursor-pointer"
              />
              <span className="w-3 h-0.5 inline-block" style={{ background: 'var(--accent-eloran)' }}></span> Theoretical Rician Ratio
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer font-medium" style={{ color: 'var(--status-ok)' }}>
              <input
                type="checkbox"
                checked={showAustronNew}
                onChange={(e) => setShowAustronNew(e.target.checked)}
                className="accent-emerald-400 cursor-pointer"
              />
              <span className="w-3 h-0.5 border-b border-dashed inline-block" style={{ background: 'var(--status-ok)' }}></span> Austron New (28 µs)
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer text-[var(--status-warn)] font-medium">
              <input
                type="checkbox"
                checked={showAustronOld}
                onChange={(e) => setShowAustronOld(e.target.checked)}
                className="accent-amber-400 cursor-pointer"
              />
              <span className="w-3 h-0.5 border-b border-dotted inline-block" style={{ background: 'var(--status-warn)' }}></span> Austron Old (42 µs)
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer text-fuchsia-400 font-medium">
              <input
                type="checkbox"
                checked={showMonteCarlo}
                onChange={(e) => setShowMonteCarlo(e.target.checked)}
                className="accent-fuchsia-400 cursor-pointer"
              />
              <span className="w-2.5 h-2.5 rounded-full bg-fuchsia-500 inline-block"></span> Monte Carlo ({numTrials} trials)
            </label>
          </div>
        </div>

        {/* Responsive, Full-Width SVG Logarithmic Chart (Overhauled Image 3) */}
        <div className="relative bg-[var(--bg-canvas)] rounded-xl border border-[var(--border-subtle)] p-2 overflow-hidden shadow-inner">
          <svg
            viewBox="0 0 920 420"
            className="w-full h-80 sm:h-96 md:h-[440px]"
            preserveAspectRatio="none"
          >
            {/* Grid plot area background */}
            <rect x="75" y="35" width="810" height="330" fill="var(--bg-surface)" stroke="var(--border-subtle)" strokeWidth="1" rx="4" />

            {/* Horizontal logarithmic gridlines (10^0 down to 10^-4) */}
            {[-4, -3, -2, -1, 0].map((exp) => {
              const y = mapY(Math.pow(10, exp));
              return (
                <g key={`ygrid-${exp}`}>
                  <line x1="75" y1={y} x2="885" y2={y} stroke="var(--border-subtle)" strokeWidth="0.8" strokeDasharray={exp === 0 ? 'none' : '3 3'} />
                  <text x="67" y={y + 3.5} fill="var(--text-secondary)" fontSize="11" fontFamily="ui-monospace, monospace" textAnchor="end">
                    10{exp === 0 ? '\u2070' : exp === -1 ? '\u207B\u00B9' : exp === -2 ? '\u207B\u00B2' : exp === -3 ? '\u207B\u00B3' : '\u207B\u2074'}
                  </text>
                </g>
              );
            })}

            {/* Vertical SNR gridlines (0, 4, 8, 12, 16, 20, 24, 28, 32 dB) */}
            {[0, 4, 8, 12, 16, 20, 24, 28, 32].map((db) => {
              const x = mapX(db);
              return (
                <g key={`xgrid-${db}`}>
                  <line x1={x} y1="35" x2={x} y2="365" stroke="var(--border-subtle)" strokeWidth="0.8" strokeDasharray="3 3" />
                  <text x={x} y="385" fill="var(--text-secondary)" fontSize="11" fontFamily="ui-monospace, monospace" textAnchor="middle">
                    {db} dB
                  </text>
                </g>
              );
            })}

            {/* Axis labels */}
            <text x="480" y="408" fill="var(--text-primary)" fontSize="12" fontFamily="ui-monospace, monospace" fontWeight="bold" textAnchor="middle">
              {"Total SNR [dB] = 10 \u00B7 log\u2081\u2080(N \u00B7 SNR)"}
            </text>
            <text x="22" y="200" fill="var(--text-primary)" fontSize="12" fontFamily="ui-monospace, monospace" fontWeight="bold" textAnchor="middle" transform="rotate(-90 22 200)">
              P[Wrong Cycle Selection]
            </text>

            {/* Continuous Curves */}
            {showAustronOld && (
              <path d={austronOldPath} fill="none" stroke="var(--status-warn)" strokeWidth="2.0" strokeDasharray="4 4" opacity="0.9" />
            )}
            {showAustronNew && (
              <path d={austronNewPath} fill="none" stroke="var(--status-ok)" strokeWidth="2.0" strokeDasharray="6 3" opacity="0.9" />
            )}
            {showTheoretical && (
              <path d={ricePath} fill="none" stroke="var(--accent-eloran)" strokeWidth="2.4" opacity="0.95" />
            )}

            {/* Monte Carlo scatter markers */}
            {showMonteCarlo &&
              mcCurve.map((pt, i) => {
                const cx = mapX(pt.snrDb);
                const cy = mapY(pt.pWrongCycle);
                return (
                  <g key={`mc-${i}`}>
                    <circle cx={cx} cy={cy} r="4.5" fill="#e879f9" stroke="#581c87" strokeWidth="1.5" />
                  </g>
                );
              })}

            {/* Dynamic Active Operating Point Reticle (Real-time tracking of sliders) */}
            <g className="transition-all duration-150">
              {/* Vertical Reticle Guide Line */}
              <line
                x1={reticleX}
                y1="35"
                x2={reticleX}
                y2="365"
                stroke="#f43f5e"
                strokeWidth="1.6"
                strokeDasharray="3 2"
              />

              {/* Pulsing Target Ring */}
              <circle
                cx={reticleX}
                cy={reticleY}
                r="9"
                fill="none"
                stroke="#f43f5e"
                strokeWidth="1.5"
                opacity="0.6"
              />
              <circle
                cx={reticleX}
                cy={reticleY}
                r="4.5"
                fill="#f43f5e"
                stroke="#ffffff"
                strokeWidth="1.5"
              />

              {/* Dynamic Callout HUD Badge */}
              <g transform={`translate(${reticleX > 680 ? reticleX - 165 : reticleX + 12}, ${Math.max(45, Math.min(330, reticleY - 18))})`}>
                <rect
                  width="155"
                  height="34"
                  rx="5"
                  fill="#0f172a"
                  stroke="#f43f5e"
                  strokeWidth="1.2"
                  filter="drop-shadow(0 2px 4px rgba(0,0,0,0.5))"
                />
                <text x="8" y="14" fill="#cbd5e1" fontSize="9" fontFamily="ui-monospace, monospace" fontWeight="bold">
                  ACTIVE OPERATING POINT
                </text>
                <text x="8" y="27" fill="#f43f5e" fontSize="10" fontFamily="ui-monospace, monospace" fontWeight="bold">
                  {totalInspectionSnrDb.toFixed(1)} dB · {(inspectRice * 100).toExponential(2)}%
                </text>
              </g>
            </g>
          </svg>
        </div>
      </div>

      {/* Controls & Active Inspection Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left Column: Simulation Tuning */}
        <div className="bg-[var(--bg-canvas)] p-4 rounded-xl border border-[var(--border-subtle)] space-y-4 font-mono text-xs">
          <div className="font-bold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-2">
            <Sliders size={14} className="text-[var(--accent-eloran)]" />
            Monte Carlo &amp; Operating Point Parameters
          </div>

          <Slider
            label="Receiver RF Input SNR"
            value={inspectionSnrDb}
            min={-5}
            max={25}
            step={1}
            unit="dB"
            tooltip="Per-pulse signal-to-noise ratio at antenna input. Dynamically shifts the operating reticle across the curve in real time."
            onChange={setInspectionSnrDb}
          />

          <Slider
            label="Pulse Averaging Count (N_pulses)"
            value={inspectionPulses}
            min={1}
            max={50}
            step={1}
            unit="pulses"
            tooltip="Number of pulses integrated per GRI. Multiplies total SNR by 10 · log10(N), moving the reticle rightward into high reliability."
            onChange={setInspectionPulses}
          />

          <Slider
            label="Monte Carlo Trials per Point (N)"
            value={numTrials}
            min={500}
            max={5000}
            step={500}
            unit="trials"
            tooltip="Higher trial counts increase statistical convergence to Boyce Fig. 9 at high SNRs"
            onChange={setNumTrials}
          />
        </div>

        {/* Right Column: Live Analytic Readout & Real-Time Operational Risk */}
        <div className="bg-[var(--bg-canvas)] p-4 rounded-xl border border-[var(--border-subtle)] space-y-3 font-mono text-xs">
          <div className="font-bold text-[var(--text-primary)] uppercase tracking-wider flex items-center justify-between">
            <span className="flex items-center gap-2">
              <ShieldAlert size={14} className="text-[var(--accent-loran-c)]" />
              Live Cycle Slip Prediction
            </span>
            <span className="text-[11px] text-[var(--accent-eloran)] font-bold">
              Total SNR: {totalInspectionSnrDb.toFixed(1)} dB
            </span>
          </div>

          {/* Operational Risk Badge & Mean Time Between Slips */}
          <div
            className="p-3 rounded-lg border space-y-1.5"
            style={{
              background: operationalStatus.bg,
              borderColor: operationalStatus.border,
            }}
          >
            <div className="flex justify-between items-center text-xs">
              <span className="font-bold uppercase tracking-wide" style={{ color: operationalStatus.color }}>
                {operationalStatus.label}
              </span>
              <span className="text-[11px] font-bold text-[var(--text-primary)]">
                MTBS: {mtbsFormatted}
              </span>
            </div>
            <p className="text-[10px] leading-relaxed text-[var(--text-secondary)]">
              {operationalStatus.desc}
            </p>
          </div>

          <div className="space-y-2 pt-1">
            <div className="flex justify-between items-center bg-[var(--bg-subtle)] p-2 rounded border border-[var(--border-subtle)] text-[11px]">
              <span className="text-[var(--accent-eloran)] font-medium">Theoretical Rice (Boyce 2006):</span>
              <span className="font-bold text-[var(--text-primary)]">
                {inspectRice < 1e-6 ? `${(inspectRice * 100).toExponential(3)}%` : `${(inspectRice * 100).toFixed(4)}%`}
              </span>
            </div>
            <div className="flex justify-between items-center bg-[var(--bg-subtle)] p-2 rounded border border-[var(--border-subtle)] text-[11px]">
              <span className="font-medium" style={{ color: 'var(--status-ok)' }}>Austron New (28 µs / modern):</span>
              <span className="font-bold text-[var(--text-primary)]">
                {inspectAustronNew < 1e-6 ? `${(inspectAustronNew * 100).toExponential(3)}%` : `${(inspectAustronNew * 100).toFixed(4)}%`}
              </span>
            </div>
            <div className="flex justify-between items-center bg-[var(--bg-subtle)] p-2 rounded border border-[var(--border-subtle)] text-[11px]">
              <span className="text-[var(--status-warn)] font-medium">Austron Old (42 µs / historical):</span>
              <span className="font-bold text-[var(--text-primary)]">
                {inspectAustronOld < 1e-6 ? `${(inspectAustronOld * 100).toExponential(3)}%` : `${(inspectAustronOld * 100).toFixed(4)}%`}
              </span>
            </div>
          </div>

          {/* Decision Boundary Summary */}
          <div className="pt-2 border-t border-[var(--border-subtle)] text-[10px] text-[var(--text-dim)] space-y-1">
            <div className="flex justify-between">
              <span>Standard Zero Crossing (SZC):</span>
              <span className="text-[var(--text-primary)] font-bold">τ = 30 µs (Ideal Ratio ≈ {BOYCE_2006_RATIO_BOUNDS.szc.toFixed(4)})</span>
            </div>
            <div className="flex justify-between">
              <span>Wrong-Cycle Excursion Window:</span>
              <span className="text-[var(--text-primary)] font-bold">
                [{BOYCE_2006_RATIO_BOUNDS.lower.toFixed(4)}, {BOYCE_2006_RATIO_BOUNDS.upper.toFixed(4)}] (±5 µs)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Sourced Quoted Passage Callout in Sleek Expandable Disclosure (Decluttered) */}
      <details className="group border border-[var(--border-subtle)] rounded-lg p-3 bg-[var(--bg-canvas)]/60 cursor-pointer">
        <summary className="flex items-center justify-between font-bold text-xs text-[var(--text-secondary)] select-none">
          <span className="flex items-center gap-1.5 text-[var(--accent-eloran)]">
            <Info size={13} /> Sourced Excerpt: Boyce, Lo, Powell, &amp; Enge (ILA 2006, Section II-D)
          </span>
          <span className="text-[10px] text-[var(--text-dim)] flex items-center gap-1 group-open:rotate-180 transition-transform">
            <ChevronDown size={13} />
          </span>
        </summary>
        <div className="mt-2.5 pt-2 border-t border-[var(--border-subtle)] space-y-1.5 text-[11px] font-mono text-[var(--text-dim)]">
          <blockquote className="border-l-2 pl-2.5 italic text-[var(--text-secondary)]" style={{ borderColor: 'var(--accent-eloran-border)' }}>
            "An offset in the time estimate of 5 µs would result in a wrong cycle selection, therefore, we can set bounds on Ratio(30) to lie between Ratio(25) and Ratio(35) in order to obtain the correct cycle. Therefore, a wrong cycle selection will occur if Ratio(30) ≤ Ratio(25) or Ratio(30) ≥ Ratio(35)."
          </blockquote>
          <p className="text-[10px] text-[var(--text-muted)]">
            Historical Austron ECD variance: σ_ECD_Old = 42 / √(N · SNR) µs (Eq. 5), modern Peterson estimate: σ_ECD_New = 28 / √(N · SNR) µs (Eq. 6).
          </p>
        </div>
      </details>
    </div>
  );
}
