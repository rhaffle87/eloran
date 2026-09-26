import React, { useMemo } from 'react';
import {
  Compass,
  Layers,
  AlertTriangle,
  CheckCircle2,
  Plus,
  Trash2,
  RefreshCw,
  ExternalLink,
  ShieldAlert,
  ArrowRight,
  BookOpen,
} from 'lucide-react';
import { useSimulationStore, DESIGN_PRESETS } from '../../state/simulationStore.js';
import {
  evaluateChainFeasibility,
  USCG_SPEC_GDOP,
  USCG_MIN_CODING_DELAY_US,
  PROPAGATION_RATE_US_PER_NM,
} from '../../lib/chainDesign.js';
import Toggle from '../ui/Toggle.jsx';

export default function ChainDesignPanel() {
  const {
    designChain,
    designParams,
    showBaselineExtensions,
    showCrossingAngles,
    toggleBaselineExtensions,
    toggleCrossingAngles,
    updateDesignMaster,
    updateDesignSecondary,
    addDesignSecondary,
    removeDesignSecondary,
    setDesignGRI,
    setDesignTDSigma,
    updateDesignParams,
    loadDesignPreset,
    syncDesignFromActiveStations,
    commitDesignToSimulation,
    toggleDesignMode,
  } = useSimulationStore();

  const { master, secondaries, griUs, tdSigmaUs } = designChain;

  // Real-time engineering feasibility evaluation with configurable planning thresholds
  const plan = useMemo(() => {
    return evaluateChainFeasibility(master, secondaries, griUs, {
      maxCoverageDistanceMeters: (designChain.coverageRadiusKm || 600) * 1000,
      minCodingDelayUs: designParams?.minCodingDelayUs,
      maxBaselineKm: designParams?.maxBaselineKm,
    });
  }, [master, secondaries, griUs, designChain.coverageRadiusKm, designParams]);

  const ideal2drmsMeters = useMemo(() => {
    const sigmaSec = (tdSigmaUs || 0.1) * 1e-6;
    const c = 299792458 / 1.000338;
    return (2 * Math.SQRT2 * sigmaSec * (c / 2)).toFixed(1);
  }, [tdSigmaUs]);

  return (
    <div className="space-y-4 font-mono text-xs pb-6">
      {/* Educational Simulator Disclaimer Banner */}
      <div
        className="p-2.5 rounded-lg border flex items-start gap-2.5"
        style={{
          background: 'rgba(245, 158, 11, 0.08)',
          borderColor: 'rgba(245, 158, 11, 0.35)',
        }}
      >
        <AlertTriangle size={15} className="text-amber-500 shrink-0 mt-0.5" aria-hidden="true" />
        <div className="text-[11px] leading-relaxed">
          <span className="font-bold uppercase tracking-wider block text-amber-500 mb-0.5 text-[10px]">
            Educational Simulator Disclaimer
          </span>
          <span style={{ color: 'var(--text-secondary)' }}>
            Educational chain-design simulator — not validated for real regulatory chain planning, station licensing, or operational deployment.
          </span>
        </div>
      </div>

      {/* Header Banner & Mode State */}
      <div
        className="p-3 rounded-lg border backdrop-blur-md"
        style={{
          background: 'var(--bg-subtle)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[11px]" style={{ color: 'var(--accent-loran-c)' }}>
            <Compass size={14} aria-hidden="true" />
            <span>Chain Design & Planning</span>
          </div>
          <span
            className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide border"
            style={{
              background: 'var(--accent-loran-c-subtle)',
              color: 'var(--accent-loran-c)',
              borderColor: 'var(--accent-loran-c-border)',
            }}
          >
            Engineering Tool
          </span>
        </div>

        <p className="text-[11px] leading-relaxed mb-3" style={{ color: 'var(--text-secondary)' }}>
          Design station layouts, compute baseline travel times ($T_b$), emission delays ($ED = T_b + CD$), and verify minimum feasible GRI against USCG COMDTINST M16562.4A standards before activating.
        </p>

        {/* Quick Presets with Provenance Badges */}
        <div className="space-y-1.5 pt-2 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold" style={{ color: 'var(--text-dim)' }}>Presets & Scenarios</span>
            <button
              onClick={syncDesignFromActiveStations}
              className="px-2 py-0.5 rounded text-[10px] transition border cursor-pointer flex items-center gap-1 hover:bg-[var(--bg-muted)]"
              style={{
                background: 'var(--bg-canvas)',
                color: 'var(--accent-eloran)',
                borderColor: 'var(--accent-eloran-border)',
              }}
              title="Import active stations from current simulation"
            >
              <RefreshCw size={10} aria-hidden="true" />
              <span>Sync Active</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
            <button
              onClick={() => loadDesignPreset('uscg-400mi')}
              className="p-2 rounded text-left transition border cursor-pointer hover:bg-[var(--bg-muted)] flex flex-col justify-between"
              style={{
                background: 'var(--bg-canvas)',
                borderColor: 'var(--border-subtle)',
              }}
              title="Golden 400-mile worked example from USCG Loran-C User Handbook §2.B"
            >
              <div className="font-bold text-[10px]" style={{ color: 'var(--text-primary)' }}>USCG 400-mi</div>
              <div className="flex items-center gap-1 mt-1">
                <span className="px-1 py-0.2 rounded text-[8px] bg-blue-500/10 text-blue-500 border border-blue-500/30">
                  Textbook Benchmark
                </span>
              </div>
            </button>

            <button
              onClick={() => loadDesignPreset('jakarta-proposed')}
              className="p-2 rounded text-left transition border cursor-pointer hover:bg-[var(--bg-muted)] flex flex-col justify-between"
              style={{
                background: 'var(--bg-canvas)',
                borderColor: 'var(--border-subtle)',
              }}
              title="Hypothetical regional planning scenario for the Sunda Strait & Java Sea corridor"
            >
              <div className="font-bold text-[10px]" style={{ color: 'var(--text-primary)' }}>Jakarta Coastal</div>
              <div className="flex items-center gap-1 mt-1">
                <span className="px-1 py-0.2 rounded text-[8px] bg-purple-500/10 text-purple-500 border border-purple-500/30">
                  Synthetic / Proposal
                </span>
              </div>
            </button>

            <button
              onClick={() => loadDesignPreset('us-east-coast')}
              className="p-2 rounded text-left transition border cursor-pointer hover:bg-[var(--bg-muted)] flex flex-col justify-between"
              style={{
                background: 'var(--bg-canvas)',
                borderColor: 'var(--border-subtle)',
              }}
              title="Historical Northeast U.S. Chain (GRI 9960) — illustrative parameters"
            >
              <div className="font-bold text-[10px]" style={{ color: 'var(--text-primary)' }}>US East (9960)</div>
              <div className="flex items-center gap-1 mt-1">
                <span className="px-1 py-0.2 rounded text-[8px] bg-amber-500/10 text-amber-500 border border-amber-500/30">
                  Illustrative — unverified this session
                </span>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Real-time Feasibility Status */}
      <div
        className="p-3 rounded-lg border"
        style={{
          background: plan.isFeasible ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
          borderColor: plan.isFeasible ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)',
        }}
      >
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2">
            {plan.isFeasible ? (
              <CheckCircle2 size={16} className="text-emerald-500 shrink-0" aria-hidden="true" />
            ) : (
              <AlertTriangle size={16} className="text-rose-500 shrink-0" aria-hidden="true" />
            )}
            <span
              className="font-bold uppercase tracking-wider text-[11px]"
              style={{ color: plan.isFeasible ? 'var(--status-ok)' : 'var(--status-danger)' }}
            >
              {plan.isFeasible ? 'Chain Feasible & Conflict-Free' : 'Timing Constraint Violation'}
            </span>
          </div>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded font-bold"
            style={{
              background: plan.isFeasible ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              color: plan.isFeasible ? 'var(--status-ok)' : 'var(--status-danger)',
            }}
          >
            GRI ≥ {plan.minFeasibleGRI} µs
          </span>
        </div>

        {plan.violations.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {plan.violations.map((v, i) => (
              <div key={i} className="text-[11px] leading-snug p-2 rounded bg-rose-500/10 border border-rose-500/20 text-rose-300">
                <span className="font-bold uppercase text-[9px] block text-rose-400 mb-0.5">[{v.code}]</span>
                {v.message}
              </div>
            ))}
          </div>
        )}

        {plan.warnings.length > 0 && (
          <div className="mt-2 space-y-1">
            {plan.warnings.map((w, i) => (
              <div key={i} className="text-[10px] leading-tight text-amber-400/90 flex items-start gap-1">
                <span>⚠</span>
                <span>{w.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Global Timing & GRI Configuration */}
      <div
        className="p-3 rounded-lg border space-y-3"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
      >
        <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-primary)' }}>
          <span>GRI & Noise Parameters</span>
          <span className="text-[10px] font-normal" style={{ color: 'var(--text-dim)' }}>USCG M16562.4A</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] block mb-1" style={{ color: 'var(--text-secondary)' }}>
              Assigned GRI (µs)
            </label>
            <input
              type="number"
              step="10"
              value={griUs}
              onChange={(e) => setDesignGRI(e.target.value)}
              className="w-full px-2 py-1 rounded bg-[var(--bg-canvas)] border text-[11px] font-mono focus:outline-none focus:border-[var(--accent-eloran)]"
              style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
            />
            <div className="text-[9px] mt-0.5" style={{ color: griUs >= plan.minFeasibleGRI ? 'var(--status-ok)' : 'var(--status-danger)' }}>
              Min feasible: {plan.minFeasibleGRI} µs
            </div>
          </div>

          <div>
            <label className="text-[10px] block mb-1" style={{ color: 'var(--text-secondary)' }}>
              TD Std Dev σ (µs)
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              max="1.0"
              value={tdSigmaUs}
              onChange={(e) => setDesignTDSigma(e.target.value)}
              className="w-full px-2 py-1 rounded bg-[var(--bg-canvas)] border text-[11px] font-mono focus:outline-none focus:border-[var(--accent-eloran)]"
              style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
            />
            <div className="text-[9px] mt-0.5" style={{ color: 'var(--text-dim)' }}>
              Ideal 2drms*: {ideal2drmsMeters} m
            </div>
          </div>
        </div>

        <div className="p-2 rounded bg-[var(--bg-subtle)] border text-[10px] space-y-1" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="flex justify-between">
            <span style={{ color: 'var(--text-secondary)' }}>USCG Spec Accuracy:</span>
            <span className="font-bold" style={{ color: 'var(--text-primary)' }}>0.25 nmi (463 m, 2drms)</span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: 'var(--text-secondary)' }}>Specification GDOP:</span>
            <span className="font-bold" style={{ color: 'var(--accent-eloran)' }}>GDOP = {USCG_SPEC_GDOP}</span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: 'var(--text-secondary)' }}>Nominal Baseline Rate:</span>
            <span style={{ color: 'var(--text-dim)' }}>~{PROPAGATION_RATE_US_PER_NM.toFixed(2)} µs / nmi</span>
          </div>
        </div>
      </div>

      {/* Master Station Coordinates */}
      <div
        className="p-3 rounded-lg border space-y-2"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-bold text-[11px]">
            <span className="w-2.5 h-2.5 rounded-full bg-[#06b6d4] inline-block border border-white shrink-0" />
            <span style={{ color: 'var(--accent-eloran)' }}>Master Station ({master.label})</span>
          </div>
          <span className="text-[10px]" style={{ color: 'var(--text-dim)' }}>Pulse Group 0 µs</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>Latitude (°)</label>
            <input
              type="number"
              step="0.0001"
              value={master.lat}
              onChange={(e) => updateDesignMaster({ lat: parseFloat(e.target.value) || 0 })}
              className="w-full px-2 py-1 rounded bg-[var(--bg-canvas)] border text-[11px] font-mono"
              style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
            />
          </div>
          <div>
            <label className="text-[10px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>Longitude (°)</label>
            <input
              type="number"
              step="0.0001"
              value={master.lng}
              onChange={(e) => updateDesignMaster({ lng: parseFloat(e.target.value) || 0 })}
              className="w-full px-2 py-1 rounded bg-[var(--bg-canvas)] border text-[11px] font-mono"
              style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
            />
          </div>
        </div>
      </div>

      {/* Secondaries Planning Cards */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider px-1" style={{ color: 'var(--text-primary)' }}>
          <span>Secondary Stations ({plan.secondaries.length})</span>
          <button
            onClick={() => addDesignSecondary()}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] transition cursor-pointer hover:bg-[var(--bg-muted)] border"
            style={{
              background: 'var(--accent-loran-c-subtle)',
              color: 'var(--accent-loran-c)',
              borderColor: 'var(--accent-loran-c-border)',
            }}
          >
            <Plus size={11} aria-hidden="true" />
            <span>Add Secondary</span>
          </button>
        </div>

        {plan.secondaries.map((sec, idx) => (
          <div
            key={idx}
            className="p-3 rounded-lg border space-y-2.5 transition"
            style={{
              background: 'var(--bg-surface)',
              borderColor: sec.codingDelayUs < USCG_MIN_CODING_DELAY_US ? 'rgba(239, 68, 68, 0.4)' : 'var(--border-subtle)',
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-bold text-[11px]">
                <span className="w-2.5 h-2.5 rounded-full bg-[#f59e0b] inline-block border border-white shrink-0" />
                <span style={{ color: 'var(--accent-loran-c)' }}>Secondary {sec.label}</span>
                <span className="text-[10px] font-normal" style={{ color: 'var(--text-dim)' }}>
                  ({sec.name || `Station ${sec.label}`})
                </span>
              </div>
              <button
                onClick={() => removeDesignSecondary(idx)}
                className="p-1 rounded text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition"
                title={`Remove secondary ${sec.label}`}
              >
                <Trash2 size={13} aria-hidden="true" />
              </button>
            </div>

            {/* Coordinates */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>Latitude (°)</label>
                <input
                  type="number"
                  step="0.0001"
                  value={sec.lat}
                  onChange={(e) => updateDesignSecondary(idx, { lat: parseFloat(e.target.value) || 0 })}
                  className="w-full px-2 py-1 rounded bg-[var(--bg-canvas)] border text-[11px] font-mono"
                  style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                />
              </div>
              <div>
                <label className="text-[10px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>Longitude (°)</label>
                <input
                  type="number"
                  step="0.0001"
                  value={sec.lng}
                  onChange={(e) => updateDesignSecondary(idx, { lng: parseFloat(e.target.value) || 0 })}
                  className="w-full px-2 py-1 rounded bg-[var(--bg-canvas)] border text-[11px] font-mono"
                  style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                />
              </div>
            </div>

            {/* Engineering Delay Table */}
            <div className="grid grid-cols-3 gap-1.5 p-2 rounded bg-[var(--bg-subtle)] border text-[10px]" style={{ borderColor: 'var(--border-subtle)' }}>
              <div>
                <div style={{ color: 'var(--text-dim)' }}>Baseline (Tb)</div>
                <div className="font-bold text-[11px]" style={{ color: 'var(--text-primary)' }}>
                  {sec.travelTimeUs.toFixed(0)} µs
                </div>
                <div className="text-[9px]" style={{ color: 'var(--text-dim)' }}>
                  {sec.baselineDistanceNm.toFixed(0)} nmi
                </div>
              </div>

              <div>
                <div style={{ color: 'var(--text-dim)' }}>Coding (CD)</div>
                <input
                  type="number"
                  step="100"
                  value={sec.codingDelayUs}
                  onChange={(e) => updateDesignSecondary(idx, { codingDelayUs: parseFloat(e.target.value) || 0 })}
                  className="w-full mt-0.5 px-1 py-0.5 rounded bg-[var(--bg-canvas)] border text-[10px] font-mono font-bold"
                  style={{
                    borderColor: sec.codingDelayUs < (designParams?.minCodingDelayUs || 10000) ? 'var(--status-danger)' : 'var(--border-subtle)',
                    color: sec.codingDelayUs < (designParams?.minCodingDelayUs || 10000) ? 'var(--status-danger)' : 'var(--text-primary)',
                  }}
                />
                <div className="text-[9px]" style={{ color: 'var(--text-dim)' }}>≥{(designParams?.minCodingDelayUs || 10000).toLocaleString()} µs</div>
              </div>

              <div>
                <div style={{ color: 'var(--text-dim)' }}>Emission (ED)</div>
                <div className="font-bold text-[11px]" style={{ color: 'var(--accent-loran-c)' }}>
                  {sec.emissionDelayUs.toFixed(0)} µs
                </div>
                <div className="text-[9px]" style={{ color: 'var(--text-dim)' }}>
                  Tb + CD
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Configurable Engineering Planning Thresholds */}
      <div
        className="p-3 rounded-lg border space-y-2.5"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
      >
        <div className="flex items-center justify-between">
          <div className="font-bold text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-primary)' }}>
            Planning Thresholds & Heuristics
          </div>
          <span className="px-1.5 py-0.2 rounded text-[8px] bg-amber-500/10 text-amber-500 border border-amber-500/30">
            Illustrative default, not a regulatory limit
          </span>
        </div>

        <p className="text-[10px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          Tunable geometric and timing rules of thumb used in chain feasibility validation.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div>
            <div className="flex items-center justify-between mb-0.5">
              <label className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>Min Coding Delay (CD)</label>
            </div>
            <input
              id="chain-min-cd-input"
              data-testid="chain-min-cd-input"
              type="number"
              step="500"
              min="1000"
              max="30000"
              value={designParams?.minCodingDelayUs ?? 10000}
              onChange={(e) => updateDesignParams({ minCodingDelayUs: parseFloat(e.target.value) || 10000 })}
              className="w-full px-2 py-1 rounded bg-[var(--bg-canvas)] border text-[10px] font-mono"
              style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
            />
            <div className="text-[9px] mt-0.5" style={{ color: 'var(--text-dim)' }}>Default: 10,000 µs</div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-0.5">
              <label className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>Max Baseline Distance</label>
            </div>
            <input
              id="chain-max-baseline-input"
              data-testid="chain-max-baseline-input"
              type="number"
              step="500"
              min="200"
              max="3500"
              value={designParams?.maxBaselineKm ?? 1800}
              onChange={(e) => updateDesignParams({ maxBaselineKm: parseFloat(e.target.value) || 1800 })}
              className="w-full px-2 py-1 rounded bg-[var(--bg-canvas)] border text-[10px] font-mono"
              style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
            />
            <div className="text-[9px] mt-0.5" style={{ color: 'var(--text-dim)' }}>Default: 1,800 km</div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-0.5">
              <label className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>Hazard Cone Half-Angle</label>
            </div>
            <input
              id="chain-hazard-cone-input"
              data-testid="chain-hazard-cone-input"
              type="number"
              step="0.5"
              min="2"
              max="30"
              value={designParams?.hazardConeHalfAngleDeg ?? 10}
              onChange={(e) => updateDesignParams({ hazardConeHalfAngleDeg: parseFloat(e.target.value) || 10 })}
              className="w-full px-2 py-1 rounded bg-[var(--bg-canvas)] border text-[10px] font-mono"
              style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
            />
            <div className="text-[9px] mt-0.5" style={{ color: 'var(--text-dim)' }}>Default: 10.0° (±)</div>
          </div>
        </div>
      </div>

      {/* Map Overlays & Inspection Toggles */}
      <div
        className="p-3 rounded-lg border space-y-2.5"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
      >
        <div className="font-bold text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-primary)' }}>
          Visualization Layers
        </div>

        <Toggle
          label="Baseline Extension Danger Wedges"
          description="Renders ±7.5° to 10° conical hazard sectors along baseline extensions where LOP gradient collapses"
          checked={showBaselineExtensions}
          onChange={toggleBaselineExtensions}
        />

        <Toggle
          label="LOP Crossing Angle Analysis"
          description="Inspect geometric crossing angles (θ ≈ 90° optimal, θ < 30° degraded fix)"
          checked={showCrossingAngles}
          onChange={toggleCrossingAngles}
        />
      </div>

      {/* Primary Commit / Apply Action */}
      <div className="pt-2 space-y-2">
        <button
          onClick={commitDesignToSimulation}
          disabled={!plan.isFeasible}
          className={`w-full py-2.5 px-3 rounded-lg font-bold font-mono text-xs flex items-center justify-center gap-2 shadow-lg transition cursor-pointer ${
            plan.isFeasible
              ? 'bg-gradient-to-r from-cyan-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 text-white'
              : 'opacity-50 cursor-not-allowed bg-[var(--bg-subtle)] text-[var(--text-dim)] border border-[var(--border-subtle)]'
          }`}
        >
          <span>Commit Design to Active Simulation</span>
          <ArrowRight size={14} aria-hidden="true" />
        </button>

        <button
          onClick={() => toggleDesignMode(false)}
          className="w-full py-1.5 px-3 rounded-lg font-mono text-xs transition cursor-pointer text-center hover:bg-[var(--bg-muted)] border"
          style={{
            background: 'transparent',
            borderColor: 'var(--border-subtle)',
            color: 'var(--text-secondary)',
          }}
        >
          Return to Simulation Mode
        </button>
      </div>
    </div>
  );
}
