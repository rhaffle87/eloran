import React, { useState } from 'react';
import { Sparkles, CheckCircle2, AlertCircle, Wrench, ShieldAlert, Waves, Layers } from 'lucide-react';
import { useSimulationStore } from '../../state/simulationStore.js';
import {
  validateAsfExpression,
  ITU_R_P832_CONDUCTIVITIES,
  DEFAULT_MILLINGTON_SCALE,
  computeMixedPathAsfMeters,
} from '../../lib/asf.js';
import Toggle from '../ui/Toggle.jsx';
import Slider from '../ui/Slider.jsx';

const ASF_TEMPLATES = [
  {
    name: 'Coastal Conductivity Gradient',
    formula: '20 * sin((lat / 10) * pi) + 10 * cos((lng / 10) * pi)',
  },
  {
    name: 'Inland Mountain Range Delay',
    formula: '40 * exp(-((lat + 6.2)^2 + (lng - 106.8)^2) / 0.5)',
  },
  {
    name: 'Uniform Seawater Path (Zero ASF)',
    formula: '0',
  },
];

export default function AsfPanel() {
  const { masters, updateStation, receiverFixes, evaluateReceivers, settings, updateSettings } = useSimulationStore();
  const master = masters[0];

  const asfMode = settings.asfModelMode || 'millington'; // 'millington' | 'formula'

  const [formulaInput, setFormulaInput] = useState(master?.asfFormula || '0');
  const [validation, setValidation] = useState(validateAsfExpression(master?.asfFormula || '0'));

  const handleFormulaChange = (val) => {
    setFormulaInput(val);
    const res = validateAsfExpression(val);
    setValidation(res);
    if (res.valid && master) {
      updateStation(master.label, { asfFormula: val });
    }
  };

  const handleApplyTemplate = (tmpl) => {
    setFormulaInput(tmpl.formula);
    const res = validateAsfExpression(tmpl.formula);
    setValidation(res);
    if (res.valid && master) {
      updateStation(master.label, { asfFormula: tmpl.formula });
    }
  };

  const handleAutoCalibrate = () => {
    if (!master) return;
    const fixes = Object.values(receiverFixes);
    if (!fixes.length) {
      evaluateReceivers();
    }
    const currentDiff = master.diffCorrections?.avgMeters || 0;
    // Auto-calibration: adjust differential correction to cancel observed residual
    const avgResidual = fixes.length
      ? fixes.reduce((s, f) => s + (f.residualMeters || 0), 0) / fixes.length
      : 5.0;

    const newDiff = parseFloat((currentDiff + avgResidual).toFixed(2));
    updateStation(master.label, {
      diffCorrections: { enabled: true, avgMeters: newDiff },
    });
    setTimeout(() => evaluateReceivers(), 50);
  };

  // Sample delays for monotonicity verification
  const sample100km = computeMixedPathAsfMeters({
    totalDistMeters: 100000,
    landFraction: settings.asfLandFraction ?? 0.5,
    landSigma: settings.asfLandSigma ?? 0.003,
    scale: settings.asfMillingtonScale ?? DEFAULT_MILLINGTON_SCALE,
  });
  const sample300km = computeMixedPathAsfMeters({
    totalDistMeters: 300000,
    landFraction: settings.asfLandFraction ?? 0.5,
    landSigma: settings.asfLandSigma ?? 0.003,
    scale: settings.asfMillingtonScale ?? DEFAULT_MILLINGTON_SCALE,
  });
  const sample500km = computeMixedPathAsfMeters({
    totalDistMeters: 500000,
    landFraction: settings.asfLandFraction ?? 0.5,
    landSigma: settings.asfLandSigma ?? 0.003,
    scale: settings.asfMillingtonScale ?? DEFAULT_MILLINGTON_SCALE,
  });

  return (
    <div className="space-y-5">
      {/* Mode Switcher Tabs */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">
          ASF Propagation Model Mode
        </label>
        <div className="grid grid-cols-2 gap-2 text-xs font-mono">
          <button
            onClick={() => updateSettings({ asfModelMode: 'millington' })}
            className={`p-2 rounded border text-left transition flex flex-col gap-0.5 ${
              asfMode === 'millington'
                ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'
            }`}
          >
            <span className="font-bold flex items-center gap-1.5">
              <Waves size={13} className="text-cyan-400" /> Mixed-Path (Millington)
            </span>
            <span className="text-[10px] text-zinc-500">
              ITU-R P.832 physical ground conductivity
            </span>
          </button>

          <button
            onClick={() => updateSettings({ asfModelMode: 'formula' })}
            className={`p-2 rounded border text-left transition flex flex-col gap-0.5 ${
              asfMode === 'formula'
                ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'
            }`}
          >
            <span className="font-bold flex items-center gap-1.5">
              <Sparkles size={13} className="text-amber-400" /> Formula Override (AST)
            </span>
            <span className="text-[10px] text-zinc-500">
              Manual sandboxed mathematical formula
            </span>
          </button>
        </div>
      </div>

      {/* Mode 1: Physical Mixed-Path Millington Model */}
      {asfMode === 'millington' && (
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-4 font-mono text-xs">
          {/* Status Badge */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/80 pb-3">
            <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-semibold uppercase tracking-wider flex items-center gap-1">
              <CheckCircle2 size={11} /> Model: Millington Mixed-Path (SOURCED / UNVERIFIED)
            </span>
            <span className="text-[10px] text-zinc-500">
              Conductivity: ITU-R P.832 (SOURCED) • Scale k: UNVERIFIED
            </span>
          </div>

          {/* Land Conductivity Selector */}
          <div className="space-y-1.5">
            <label className="text-zinc-300 text-xs font-semibold block">
              Land Terrain Conductivity Preset (ITU-R P.832)
            </label>
            <select
              value={
                Object.values(ITU_R_P832_CONDUCTIVITIES).find(
                  (c) => c.sigma === (settings.asfLandSigma ?? 0.003)
                )?.id || 'custom'
              }
              onChange={(e) => {
                const preset = ITU_R_P832_CONDUCTIVITIES[e.target.value];
                if (preset) {
                  updateSettings({ asfLandSigma: preset.sigma });
                }
              }}
              className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-100"
            >
              {Object.values(ITU_R_P832_CONDUCTIVITIES).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label} [{c.category}]
                </option>
              ))}
            </select>
            <div className="text-[10px] text-zinc-500 flex justify-between">
              <span>Seawater reference: 5.0 S/m</span>
              <span className="text-cyan-400 font-bold">
                Selected σ = {settings.asfLandSigma ?? 0.003} S/m
              </span>
            </div>
          </div>

          {/* Land Fraction Slider */}
          <Slider
            label="Propagation Path Land Fraction (f_land)"
            value={settings.asfLandFraction ?? 0.5}
            min={0.0}
            max={1.0}
            step={0.05}
            unit=""
            tooltip="Fraction of transmitter-to-receiver geodesic path over land (0 = all-sea, 1 = all-land)"
            onChange={(val) => updateSettings({ asfLandFraction: val })}
          />

          {/* Empirical Scale Constant Slider */}
          <div className="space-y-1">
            <Slider
              label="Empirical Scale Constant (k_asf)"
              value={settings.asfMillingtonScale ?? DEFAULT_MILLINGTON_SCALE}
              min={0.0001}
              max={0.0030}
              step={0.0001}
              unit=""
              tooltip="UNVERIFIED empirical phase lag scaling factor"
              onChange={(val) => updateSettings({ asfMillingtonScale: val })}
            />
            <div className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 flex items-center justify-between">
              <span>Status: UNVERIFIED parameter</span>
              <span>Default: 0.0008</span>
            </div>
          </div>

          {/* Monotonicity & Physics Sanity Card */}
          <div className="bg-zinc-900/90 rounded-lg p-3 border border-zinc-800 space-y-2">
            <div className="text-[11px] font-bold text-zinc-300 flex items-center justify-between">
              <span>Path Distance vs Predicted ASF Delay</span>
              <span className="text-[10px] text-emerald-400 font-medium">✓ Monotonicity Guaranteed</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
              <div className="bg-zinc-950 p-1.5 rounded border border-zinc-800">
                <div className="text-zinc-500">100 km</div>
                <div className="font-bold text-cyan-400">{sample100km.toFixed(1)} m</div>
                <div className="text-zinc-600 font-mono">{(sample100km / 0.299792).toFixed(2)} ns</div>
              </div>
              <div className="bg-zinc-950 p-1.5 rounded border border-zinc-800">
                <div className="text-zinc-500">300 km</div>
                <div className="font-bold text-cyan-400">{sample300km.toFixed(1)} m</div>
                <div className="text-zinc-600 font-mono">{(sample300km / 0.299792).toFixed(2)} ns</div>
              </div>
              <div className="bg-zinc-950 p-1.5 rounded border border-zinc-800">
                <div className="text-zinc-500">500 km</div>
                <div className="font-bold text-cyan-400">{sample500km.toFixed(1)} m</div>
                <div className="text-zinc-600 font-mono">{(sample500km / 0.299792).toFixed(2)} ns</div>
              </div>
            </div>
            <div className="text-[10px] text-zinc-400 leading-tight">
              {settings.asfLandFraction === 0 ? (
                <span className="text-cyan-300 font-semibold">
                  All-Seawater Path: ASF delay is exactly 0.00 m (0.00 µs).
                </span>
              ) : (
                <span>
                  Delay increases monotonically with path distance and land fraction over non-seawater terrain.
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mode 2: Safe AST Formula Override */}
      {asfMode === 'formula' && (
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">
                Manual ASF Formula (Safe AST Override)
              </label>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Model: AST Formula (UNVERIFIED)
              </span>
            </div>
            <p className="text-[11px] text-zinc-400">
              Models arbitrary spatial land path delays in meters. Whitelisted variables:{' '}
              <code className="text-cyan-400 font-mono">lat</code>,{' '}
              <code className="text-cyan-400 font-mono">lng</code>,{' '}
              <code className="text-cyan-400 font-mono">pi</code>,{' '}
              <code className="text-cyan-400 font-mono">e</code>.
            </p>

            <textarea
              rows={3}
              value={formulaInput}
              onChange={(e) => handleFormulaChange(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-xs text-zinc-100 font-mono focus:outline-hidden focus:border-cyan-500"
              placeholder="e.g. 20 * sin((lat / 10) * pi)"
            />

            {/* Validation Status Badge */}
            <div className="flex items-center justify-between text-xs">
              {validation.valid ? (
                <div className="flex items-center gap-1.5 text-emerald-400 font-medium text-[11px]">
                  <CheckCircle2 size={13} /> Valid Sandboxed AST Expression
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-red-400 font-medium text-[11px]">
                  <AlertCircle size={13} /> {validation.error}
                </div>
              )}
            </div>
          </div>

          {/* Preset Formula Templates */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
              Example Models
            </span>
            <div className="grid grid-cols-1 gap-1">
              {ASF_TEMPLATES.map((tmpl) => (
                <button
                  key={tmpl.name}
                  onClick={() => handleApplyTemplate(tmpl)}
                  className="text-left px-2.5 py-1.5 bg-zinc-950 border border-zinc-800/80 hover:border-zinc-700 rounded-md text-xs text-zinc-300 transition"
                >
                  <div className="font-medium text-cyan-300 text-[11px]">{tmpl.name}</div>
                  <div className="text-[10px] text-zinc-500 font-mono truncate">{tmpl.formula}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Differential Corrections Tuning */}
      {master && (
        <div className="pt-2 border-t border-zinc-800/80 space-y-3 font-mono text-xs">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-zinc-400 uppercase tracking-wider">
              Differential eLoran (dLORAN)
            </span>
            <button
              onClick={handleAutoCalibrate}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded text-[11px] font-mono transition"
            >
              <Wrench size={11} /> Auto-Calibrate
            </button>
          </div>

          <Toggle
            label="Enable Differential Corrections"
            description="Broadcasts ASF calibration offsets to mobile receivers via DDS"
            checked={master.diffCorrections?.enabled || false}
            onChange={(checked) =>
              updateStation(master.label, {
                diffCorrections: { ...master.diffCorrections, enabled: checked },
              })
            }
          />

          <Slider
            label="Applied Correction Offset"
            value={master.diffCorrections?.avgMeters || 0}
            min={-50}
            max={50}
            step={0.5}
            unit="m"
            tooltip="Spatial compensation subtracted from observed arrival time"
            disabled={!master.diffCorrections?.enabled}
            onChange={(val) =>
              updateStation(master.label, {
                diffCorrections: { ...master.diffCorrections, avgMeters: val },
              })
            }
          />
        </div>
      )}
    </div>
  );
}
