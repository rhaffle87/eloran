import React, { useState, useMemo, useCallback } from 'react';
import { RotateCcw, Info, Sliders, ShieldAlert, Sparkles, CheckCircle2 } from 'lucide-react';
import {
  computeAustronWrongCycleProbability,
  computeTheoreticalRiceWrongCycleProbability,
  simulateMonteCarloWrongCycleCurve,
  BOYCE_2006_RATIO_BOUNDS,
} from '../../lib/pulse.js';
import Slider from '../ui/Slider.jsx';

export default function CycleSelectionPanel() {
  const [numTrials, setNumTrials] = useState(1000);
  const [showTheoretical, setShowTheoretical] = useState(true);
  const [showAustronNew, setShowAustronNew] = useState(true);
  const [showAustronOld, setShowAustronOld] = useState(true);
  const [showMonteCarlo, setShowMonteCarlo] = useState(true);
  const [inspectionSnrDb, setInspectionSnrDb] = useState(18);
  const [inspectionPulses, setInspectionPulses] = useState(10);
  const [simSeed, setSimSeed] = useState(42);

  // Re-run Monte Carlo when trials or seed change
  const mcCurve = useMemo(() => {
    // Deterministic pseudo-random number generator for reproducible plots
    let s = simSeed;
    const rng = () => {
      s = (s * 1664525 + 1013904223) % 4294967296;
      return s / 4294967296;
    };

    const snrDbList = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24];
    return simulateMonteCarloWrongCycleCurve({
      snrDbList,
      numTrialsPerPoint: numTrials,
      rng,
    });
  }, [numTrials, simSeed]);

  // Pre-calculate continuous analytic curves from 0 to 24 dB
  const analyticPoints = useMemo(() => {
    const pts = [];
    for (let db = 0; db <= 24; db += 0.5) {
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
  const totalInspectionSnrDb = inspectionSnrDb + 10 * Math.log10(Math.max(1, inspectionPulses));
  const inspectRice = computeTheoreticalRiceWrongCycleProbability(totalInspectionSnrDb);
  const inspectAustronNew = computeAustronWrongCycleProbability(totalInspectionSnrDb, 'new');
  const inspectAustronOld = computeAustronWrongCycleProbability(totalInspectionSnrDb, 'old');

  // Chart coordinates mapping:
  // X: SNR dB [0 to 24] -> [60 to 760] (width 700)
  // Y: log10(P) [-4 to 0] -> [340 to 40] (height 300)
  const mapX = useCallback((db) => 60 + (db / 24) * 700, []);
  const mapY = useCallback((p) => {
    const safeP = Math.max(1e-4, Math.min(1.0, p));
    const logP = Math.log10(safeP); // -4 to 0
    return 40 + ((0 - logP) / 4) * 300;
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

  return (
    <div className="bg-[var(--bg-subtle)] border border-[var(--border-subtle)] rounded-xl p-5 space-y-6 shadow-2xl">
      {/* Header and Provenance Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--status-ok-subtle)] text-[var(--status-ok)] border border-[var(--status-ok-border)] flex items-center gap-1 font-semibold uppercase tracking-wider">
              <CheckCircle2 size={11} /> Model: Boyce Ratio & Austron ECD (SOURCED)
            </span>
            <span className="text-[10px] font-mono text-[var(--text-muted)]">
              Boyce et al. (ILA 2006, Section II-D, Fig. 9)
            </span>
          </div>
          <h2 className="text-lg font-bold text-[var(--text-primary)] font-mono flex items-center gap-2">
            <Sparkles size={16} className="text-[var(--accent-eloran)]" />
            Loran Cycle Selection & Monte Carlo Simulator
          </h2>
          <p className="text-[var(--text-dim)] text-xs mt-0.5">
            Analytic comparison of Rician envelope ratio excursion probability against empirical Austron ECD bounds.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSimSeed((prev) => prev + 1)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--accent-eloran-subtle)] hover:bg-[var(--accent-eloran-subtle)] text-[var(--accent-eloran)] border border-[var(--accent-eloran-border)] rounded-lg text-xs font-mono transition"
            title="Re-seed Monte Carlo Gaussian noise generator"
          >
            <RotateCcw size={13} /> Re-seed Trials
          </button>
        </div>
      </div>

      {/* Primary Analytic & Monte Carlo Comparison Chart (Replicating Boyce Fig. 9) */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
          <span className="text-[var(--text-secondary)] font-semibold">
            P[Wrong Cycle] vs Total SNR (N Â· SNR)
          </span>
          <div className="flex flex-wrap items-center gap-4 text-[11px]">
            <label className="flex items-center gap-1.5 cursor-pointer text-[var(--accent-eloran)]">
              <input
                type="checkbox"
                checked={showTheoretical}
                onChange={(e) => setShowTheoretical(e.target.checked)}
                className="accent-cyan-400"
              />
              <span className="w-3 h-0.5 bg-cyan-400 inline-block"></span> Theoretical Rician Ratio
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer" style={{ color: 'var(--status-ok)' }}>
              <input
                type="checkbox"
                checked={showAustronNew}
                onChange={(e) => setShowAustronNew(e.target.checked)}
                className="accent-emerald-400"
              />
              <span className="w-3 h-0.5 bg-emerald-400 border-b border-dashed inline-block"></span> Austron New (28 Âµs)
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer text-[var(--status-warn)]">
              <input
                type="checkbox"
                checked={showAustronOld}
                onChange={(e) => setShowAustronOld(e.target.checked)}
                className="accent-amber-400"
              />
              <span className="w-3 h-0.5 bg-amber-400 border-b border-dotted inline-block"></span> Austron Old (42 Âµs)
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer text-fuchsia-300">
              <input
                type="checkbox"
                checked={showMonteCarlo}
                onChange={(e) => setShowMonteCarlo(e.target.checked)}
                className="accent-fuchsia-400"
              />
              <span className="w-2.5 h-2.5 rounded-full bg-fuchsia-400 inline-block"></span> Monte Carlo ({numTrials} trials)
            </label>
          </div>
        </div>

        {/* SVG Logarithmic Chart */}
        <div className="relative bg-[var(--bg-canvas)] rounded-xl border border-[var(--border-subtle)]/90 p-2 overflow-hidden shadow-inner">
          <svg viewBox="0 0 800 380" className="w-full h-72">
            {/* Grid background */}
            <rect x="60" y="40" width="700" height="300" fill="#09090b" rx="4" />

            {/* Horizontal logarithmic gridlines (10^0, 10^-1, 10^-2, 10^-3, 10^-4) */}
            {[-4, -3, -2, -1, 0].map((exp) => {
              const y = mapY(Math.pow(10, exp));
              return (
                <g key={`ygrid-${exp}`}>
                  <line x1="60" y1={y} x2="760" y2={y} stroke="#27272a" strokeWidth="0.8" strokeDasharray={exp === 0 ? 'none' : '3 3'} />
                  <text x="52" y={y + 3} fill="#71717a" fontSize="10" fontFamily="monospace" textAnchor="end">
                    10{exp === 0 ? 'â°' : exp === -1 ? 'â»Â¹' : exp === -2 ? 'â»Â²' : exp === -3 ? 'â»Â³' : 'â»â´'}
                  </text>
                </g>
              );
            })}

            {/* Vertical SNR gridlines (0, 4, 8, 12, 16, 20, 24 dB) */}
            {[0, 4, 8, 12, 16, 20, 24].map((db) => {
              const x = mapX(db);
              return (
                <g key={`xgrid-${db}`}>
                  <line x1={x} y1="40" x2={x} y2="340" stroke="#27272a" strokeWidth="0.8" strokeDasharray="3 3" />
                  <text x={x} y="358" fill="#71717a" fontSize="10" fontFamily="monospace" textAnchor="middle">
                    {db} dB
                  </text>
                </g>
              );
            })}

            {/* Axis labels */}
            <text x="410" y="375" fill="#a1a1aa" fontSize="11" fontFamily="monospace" textAnchor="middle">
              Total SNR [dB] = 10 Â· logâ‚â‚€(N Â· SNR)
            </text>
            <text x="18" y="190" fill="#a1a1aa" fontSize="11" fontFamily="monospace" textAnchor="middle" transform="rotate(-90 18 190)">
              P[Wrong Cycle Selection]
            </text>

            {/* Curves */}
            {showAustronOld && (
              <path d={austronOldPath} fill="none" stroke="#f59e0b" strokeWidth="1.8" strokeDasharray="4 4" opacity="0.9" />
            )}
            {showAustronNew && (
              <path d={austronNewPath} fill="none" stroke="#10b981" strokeWidth="1.8" strokeDasharray="6 3" opacity="0.9" />
            )}
            {showTheoretical && (
              <path d={ricePath} fill="none" stroke="#06b6d4" strokeWidth="2.2" opacity="0.95" />
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

            {/* Active inspection marker line */}
            {totalInspectionSnrDb >= 0 && totalInspectionSnrDb <= 24 && (
              <g>
                <line
                  x1={mapX(totalInspectionSnrDb)}
                  y1="40"
                  x2={mapX(totalInspectionSnrDb)}
                  y2="340"
                  stroke="#ef4444"
                  strokeWidth="1.2"
                  strokeDasharray="2 2"
                />
                <circle
                  cx={mapX(totalInspectionSnrDb)}
                  cy={mapY(inspectRice)}
                  r="5"
                  fill="#ef4444"
                  stroke="#ffffff"
                  strokeWidth="1"
                />
              </g>
            )}
          </svg>
        </div>
      </div>

      {/* Controls & Active Inspection Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left Column: Simulation Tuning */}
        <div className="bg-[var(--bg-canvas)] p-4 rounded-xl border border-[var(--border-subtle)] space-y-4 font-mono text-xs">
          <div className="font-bold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-2">
            <Sliders size={14} className="text-[var(--accent-eloran)]" />
            Monte Carlo Parameters
          </div>

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

          <Slider
            label="Receiver RF Input SNR"
            value={inspectionSnrDb}
            min={-5}
            max={25}
            step={1}
            unit="dB"
            tooltip="Per-pulse signal-to-noise ratio at antenna input"
            onChange={setInspectionSnrDb}
          />

          <Slider
            label="Pulse Averaging Count (N_pulses)"
            value={inspectionPulses}
            min={1}
            max={50}
            step={1}
            unit="pulses"
            tooltip="Number of pulses integrated per GRI"
            onChange={setInspectionPulses}
          />
        </div>

        {/* Right Column: Live Analytic Readout */}
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

          <div className="space-y-2 pt-1">
            <div className="flex justify-between items-center bg-[var(--bg-subtle)]/80 p-2 rounded border border-[var(--border-subtle)] text-[11px]">
              <span className="text-[var(--accent-eloran)] font-medium">Theoretical Rice (Boyce 2006):</span>
              <span className="font-bold text-[var(--text-primary)]">{(inspectRice * 100).toFixed(3)}%</span>
            </div>
            <div className="flex justify-between items-center bg-[var(--bg-subtle)]/80 p-2 rounded border border-[var(--border-subtle)] text-[11px]">
              <span className="font-medium" style={{ color: 'var(--status-ok)' }}>Austron New (28 µs / modern):</span>
              <span className="font-bold text-[var(--text-primary)]">{(inspectAustronNew * 100).toFixed(3)}%</span>
            </div>
            <div className="flex justify-between items-center bg-[var(--bg-subtle)]/80 p-2 rounded border border-[var(--border-subtle)] text-[11px]">
              <span className="text-[var(--status-warn)] font-medium">Austron Old (42 Âµs / historical):</span>
              <span className="font-bold text-[var(--text-primary)]">{(inspectAustronOld * 100).toFixed(3)}%</span>
            </div>
          </div>

          {/* Decision Boundary Summary */}
          <div className="pt-2 border-t border-[var(--border-subtle)] text-[10px] text-[var(--text-dim)] space-y-1">
            <div className="flex justify-between">
              <span>Standard Zero Crossing (SZC):</span>
              <span className="text-[var(--text-primary)] font-bold">Ï„ = 30 Âµs (Ideal Ratio â‰ˆ {BOYCE_2006_RATIO_BOUNDS.szc.toFixed(4)})</span>
            </div>
            <div className="flex justify-between">
              <span>Wrong-Cycle Excursion Window:</span>
              <span className="text-[var(--text-primary)] font-bold">
                [{BOYCE_2006_RATIO_BOUNDS.lower.toFixed(4)}, {BOYCE_2006_RATIO_BOUNDS.upper.toFixed(4)}] (Â±5 Âµs)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Sourced Quoted Passage Callout */}
      <div className="bg-[var(--bg-canvas)]/80 border border-[var(--border-subtle)] rounded-lg p-3 text-[11px] font-mono text-[var(--text-dim)] space-y-1.5">
        <div className="flex items-center gap-1.5 text-[var(--accent-eloran)] font-bold">
          <Info size={13} /> Sourced Excerpt: Boyce, Lo, Powell, & Enge (ILA 2006, Section II-D)
        </div>
        <blockquote className="border-l-2 pl-2.5 italic text-[var(--text-secondary)]" style={{ borderColor: 'var(--accent-eloran-border)' }}>
          "An offset in the time estimate of 5 Âµs would result in a wrong cycle selection, therefore, we can set bounds on Ratio(30) to lie between Ratio(25) and Ratio(35) in order to obtain the correct cycle. Therefore, a wrong cycle selection will occur if Ratio(30) â‰¤ Ratio(25) or Ratio(30) â‰¥ Ratio(35)."
        </blockquote>
        <p className="text-[10px] text-[var(--text-muted)]">
          Historical Austron ECD variance: Ïƒ_ECD_Old = 42 / âˆš(N Â· SNR) Âµs (Eq. 5), modern Peterson estimate: Ïƒ_ECD_New = 28 / âˆš(N Â· SNR) Âµs (Eq. 6).
        </p>
      </div>
    </div>
  );
}

