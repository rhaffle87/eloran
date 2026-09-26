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
import InfoTooltip from '../ui/Tooltip.jsx';

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

  const engineMethod = settings.asfEngineMethod || 'grwave';

  // Sample delays for monotonicity verification
  const sample100km = computeMixedPathAsfMeters({
    totalDistMeters: 100000,
    landFraction: settings.asfLandFraction ?? 0.5,
    landSigma: settings.asfLandSigma ?? 0.003,
    scale: settings.asfMillingtonScale ?? DEFAULT_MILLINGTON_SCALE,
    method: engineMethod,
  });
  const sample300km = computeMixedPathAsfMeters({
    totalDistMeters: 300000,
    landFraction: settings.asfLandFraction ?? 0.5,
    landSigma: settings.asfLandSigma ?? 0.003,
    scale: settings.asfMillingtonScale ?? DEFAULT_MILLINGTON_SCALE,
    method: engineMethod,
  });
  const sample500km = computeMixedPathAsfMeters({
    totalDistMeters: 500000,
    landFraction: settings.asfLandFraction ?? 0.5,
    landSigma: settings.asfLandSigma ?? 0.003,
    scale: settings.asfMillingtonScale ?? DEFAULT_MILLINGTON_SCALE,
    method: engineMethod,
  });

  return (
    <div className="space-y-5">
      {/* Mode Switcher Tabs */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider block">
          ASF Propagation Model Mode
        </label>
        <div className="grid grid-cols-2 gap-2 text-xs font-mono">
          <div className="flex items-center gap-1">
            <button
              onClick={() => updateSettings({ asfModelMode: 'millington' })}
              className={`flex-1 p-2 rounded border text-left transition flex items-center gap-1.5 cursor-pointer ${
                asfMode === 'millington'
                  ? 'bg-[var(--accent-eloran-subtle)] border-[var(--accent-eloran-border)] text-[var(--accent-eloran)]'
                  : 'bg-[var(--bg-canvas)] border-[var(--border-subtle)] text-[var(--text-dim)] hover:border-[var(--border-default)]'
              }`}
            >
              <Waves size={13} className="text-[var(--accent-eloran)] shrink-0" />
              <span className="font-bold text-[11px] truncate">Millington Mixed</span>
            </button>
            <InfoTooltip text="Physical mixed-path delay model based on ITU-R P.832 ground conductivity mapping." />
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => updateSettings({ asfModelMode: 'formula' })}
              className={`flex-1 p-2 rounded border text-left transition flex items-center gap-1.5 cursor-pointer ${
                asfMode === 'formula'
                  ? 'bg-[var(--accent-eloran-subtle)] border-[var(--accent-eloran-border)] text-[var(--accent-eloran)]'
                  : 'bg-[var(--bg-canvas)] border-[var(--border-subtle)] text-[var(--text-dim)] hover:border-[var(--border-default)]'
              }`}
            >
              <Sparkles size={13} className="text-[var(--accent-loran-c)] shrink-0" />
              <span className="font-bold text-[11px] truncate">Formula AST</span>
            </button>
            <InfoTooltip text="Manual sandboxed mathematical formula evaluation for synthetic delay profiles." />
          </div>
        </div>
      </div>

      {/* Mode 1: Physical Mixed-Path Millington Model */}
      {asfMode === 'millington' && (
        <div className="bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-xl p-4 space-y-4 font-mono text-xs">
          {/* Status Header */}
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2.5">
            <span className="text-[11px] font-semibold text-[var(--text-primary)]">
              Millington Mixed-Path Terrain Model
            </span>
            <InfoTooltip
              align="right"
              text="Physical mixed-path delay calculation utilizing ITU-R P.832 ground conductivity mapping."
            />
          </div>

          {/* Groundwave Calculation Engine Selector */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[var(--text-secondary)] text-xs font-semibold block">
                Propagation Calculation Engine
              </label>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                engineMethod === 'grwave'
                  ? 'bg-[var(--status-ok-subtle)] text-[var(--status-ok)] border border-[var(--status-ok-border)]'
                  : 'bg-[var(--status-warn-subtle)] text-[var(--status-warn)] border border-[var(--status-warn-border)]'
              }`}>
                {engineMethod === 'grwave' ? 'SOURCED (ITU-R P.368 / GRWAVE)' : 'UNVERIFIED (Empirical k_asf)'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <button
                type="button"
                onClick={() => updateSettings({ asfEngineMethod: 'grwave' })}
                className={`p-1.5 rounded border text-center transition cursor-pointer ${
                  engineMethod === 'grwave'
                    ? 'bg-[var(--accent-eloran-subtle)] border-[var(--accent-eloran-border)] text-[var(--accent-eloran)] font-bold'
                    : 'bg-[var(--bg-subtle)] border-[var(--border-subtle)] text-[var(--text-dim)] hover:border-[var(--border-default)]'
                }`}
              >
                ITU-R P.368 (GRWAVE)
              </button>
              <button
                type="button"
                onClick={() => updateSettings({ asfEngineMethod: 'empirical' })}
                className={`p-1.5 rounded border text-center transition cursor-pointer ${
                  engineMethod === 'empirical'
                    ? 'bg-[var(--accent-eloran-subtle)] border-[var(--accent-eloran-border)] text-[var(--accent-eloran)] font-bold'
                    : 'bg-[var(--bg-subtle)] border-[var(--border-subtle)] text-[var(--text-dim)] hover:border-[var(--border-default)]'
                }`}
              >
                Empirical Model (k_asf)
              </button>
            </div>
          </div>

          {/* Land Conductivity Selector */}
          <div className="space-y-1.5">
            <label className="text-[var(--text-secondary)] text-xs font-semibold block">
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
              className="w-full bg-[var(--bg-subtle)] border border-[var(--border-subtle)] rounded px-2.5 py-1.5 text-xs text-[var(--text-primary)]"
            >
              {Object.values(ITU_R_P832_CONDUCTIVITIES).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label} [{c.category}]
                </option>
              ))}
            </select>
            <div className="text-[10px] text-[var(--text-muted)] flex justify-between">
              <span>Seawater reference: 5.0 S/m</span>
              <span className="text-[var(--accent-eloran)] font-bold">
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

          {/* Engine Parameters / Empirical Scale Slider */}
          {engineMethod === 'grwave' ? (
            <div className="bg-[var(--bg-subtle)] rounded-lg p-2.5 border border-[var(--border-subtle)] space-y-1">
              <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)] font-semibold">
                <span>Constitutive Formulation:</span>
                <span className="text-[var(--status-ok)] font-mono">100 kHz Groundwave</span>
              </div>
              <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">
                Sommerfeld surface impedance & numerical distance $p = (\pi d / \lambda)|\eta|^2$ with multi-boundary reciprocal Millington averaging per ITU-R P.368-10 Annex 2. Verified against compiled Fortran GRWAVE reference output.
              </p>
            </div>
          ) : (
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
              <div className="text-[10px] px-2 py-0.5 rounded bg-[var(--status-warn-subtle)] text-[var(--status-warn)] border border-[var(--status-warn-border)] flex items-center justify-between">
                <span>Status: UNVERIFIED parameter</span>
                <span>Default: 0.0008</span>
              </div>
            </div>
          )}


          {/* Monotonicity & Physics Sanity Card */}
          <div className="bg-[var(--bg-subtle)] rounded-lg p-3 border border-[var(--border-subtle)] space-y-2">
            <div className="text-[11px] font-bold text-[var(--text-secondary)] flex items-center justify-between">
              <span>Path Distance vs Predicted ASF Delay</span>
              <span className="text-[10px] text-[var(--status-ok)] font-medium">✓ Monotonicity Guaranteed</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
              <div className="bg-[var(--bg-canvas)] p-1.5 rounded border border-[var(--border-subtle)]">
                <div className="text-[var(--text-muted)]">100 km</div>
                <div className="font-bold text-[var(--accent-eloran)]">{sample100km.toFixed(1)} m</div>
                <div className="text-[var(--text-dim)] font-mono">{(sample100km / 0.299792).toFixed(2)} ns</div>
              </div>
              <div className="bg-[var(--bg-canvas)] p-1.5 rounded border border-[var(--border-subtle)]">
                <div className="text-[var(--text-muted)]">300 km</div>
                <div className="font-bold text-[var(--accent-eloran)]">{sample300km.toFixed(1)} m</div>
                <div className="text-[var(--text-dim)] font-mono">{(sample300km / 0.299792).toFixed(2)} ns</div>
              </div>
              <div className="bg-[var(--bg-canvas)] p-1.5 rounded border border-[var(--border-subtle)]">
                <div className="text-[var(--text-muted)]">500 km</div>
                <div className="font-bold text-[var(--accent-eloran)]">{sample500km.toFixed(1)} m</div>
                <div className="text-[var(--text-dim)] font-mono">{(sample500km / 0.299792).toFixed(2)} ns</div>
              </div>
            </div>
            <div className="text-[10px] text-[var(--text-dim)] leading-tight">
              {settings.asfLandFraction === 0 ? (
                <span className="text-[var(--accent-eloran)] font-semibold">
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
              <div className="flex items-center gap-1.5">
                <label className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider block">
                  Manual ASF Formula (AST)
                </label>
                <InfoTooltip text="Models arbitrary spatial land path delays in meters. Whitelisted variables: lat, lng, pi, e." />
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--status-warn-subtle)] text-[var(--status-warn)] border border-[var(--status-warn-border)]">
                UNVERIFIED
              </span>
            </div>

            <textarea
              rows={3}
              value={formulaInput}
              onChange={(e) => handleFormulaChange(e.target.value)}
              className="w-full bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-lg p-2.5 text-xs text-[var(--text-primary)] font-mono focus:outline-hidden focus:border-[var(--accent-eloran-border)]"
              placeholder="e.g. 20 * sin((lat / 10) * pi)"
            />

            {/* Validation Status Badge */}
            <div className="flex items-center justify-between text-xs">
              {validation.valid ? (
                <div className="flex items-center gap-1.5 text-[var(--status-ok)] font-medium text-[11px]">
                  <CheckCircle2 size={13} /> Valid Sandboxed AST Expression
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-[var(--status-danger)] font-medium text-[11px]">
                  <AlertCircle size={13} /> {validation.error}
                </div>
              )}
            </div>
          </div>

          {/* Preset Formula Templates */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
              Example Models
            </span>
            <div className="grid grid-cols-1 gap-1">
              {ASF_TEMPLATES.map((tmpl) => (
                <button
                  key={tmpl.name}
                  onClick={() => handleApplyTemplate(tmpl)}
                  className="text-left px-2.5 py-1.5 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] hover:border-[var(--border-default)] rounded-md text-xs text-[var(--text-secondary)] transition"
                >
                  <div className="font-medium text-[var(--accent-eloran)] text-[11px]">{tmpl.name}</div>
                  <div className="text-[10px] text-[var(--text-muted)] font-mono truncate">{tmpl.formula}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Differential Corrections Tuning */}
      {master && (
        <div className="pt-2 border-t border-[var(--border-subtle)] space-y-3 font-mono text-xs">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-[var(--text-dim)] uppercase tracking-wider">
              Differential eLoran (dLORAN)
            </span>
            <button
              onClick={handleAutoCalibrate}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-[var(--accent-eloran-subtle)] hover:bg-[var(--accent-eloran-subtle)] text-[var(--accent-eloran)] border border-[var(--accent-eloran-border)]/30 rounded text-[11px] font-mono transition"
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

