import React, { useState } from 'react';
import { Sparkles, CheckCircle2, AlertCircle, Wrench } from 'lucide-react';
import { useSimulationStore } from '../../state/simulationStore.js';
import { validateAsfExpression } from '../../lib/asf.js';
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
  const { masters, updateStation, receiverFixes, evaluateReceivers } = useSimulationStore();
  const master = masters[0];

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

  return (
    <div className="space-y-4">
      {/* ASF Definition */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">
          ASF Formula (Additional Secondary Factor)
        </label>
        <p className="text-[11px] text-zinc-400">
          Models land path delays in meters. Whitelisted variables:{' '}
          <code className="text-cyan-400 font-mono">lat</code>,{' '}
          <code className="text-cyan-400 font-mono">lng</code>,{' '}
          <code className="text-cyan-400 font-mono">pi</code>.
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

      {/* Differential Corrections Tuning */}
      {master && (
        <div className="pt-2 border-t border-zinc-800/80 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
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
