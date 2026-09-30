import React from 'react';
import { InfoTooltip } from './Tooltip.jsx';

/** Format a numeric slider value cleanly, avoiding floating-point noise like 0.6500000000000001 */
function formatSliderValue(value, step) {
  if (typeof value !== 'number' || !isFinite(value)) return String(value);
  if (value === 0) return '0';
  const absVal = Math.abs(value);
  // Very small magnitudes: use scientific notation (e.g. clock drift 3.00e-9 s/s)
  if (absVal > 0 && absVal < 0.001) {
    return value.toExponential(2);
  }
  // Infer precision from step size to eliminate IEEE-754 noise (e.g. 0.6500000000000001 -> 0.65)
  if (typeof step === 'number' && step > 0) {
    const stepStr = step.toString();
    const dotIdx = stepStr.indexOf('.');
    const decimals = dotIdx === -1 ? 0 : stepStr.length - dotIdx - 1;
    return parseFloat(value.toFixed(Math.min(decimals, 6))).toString();
  }
  return parseFloat(value.toPrecision(6)).toString();
}

export default function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  onChange,
  disabled = false,
  tooltip = '',
}) {
  const displayValue = formatSliderValue(value, step);
  const displayUnit = unit ? ` ${unit}` : '';
  const testId = `slider-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
  return (
    <div className={`space-y-1.5 ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
      <div className="flex justify-between items-center text-xs">
        <div className="flex items-center gap-1.5">
          <span className="font-medium" style={{ color: 'var(--text-secondary)' }}>
            {label}
          </span>
          {tooltip && <InfoTooltip content={tooltip} align="left" size={12} />}
        </div>
        <span
          className="font-mono px-1.5 py-0.5 rounded text-[11px]"
          style={{ color: 'var(--accent-eloran)', background: 'var(--accent-eloran-subtle)' }}
        >
          {displayValue}{displayUnit}
        </span>
      </div>
      <input
        type="range"
        aria-label={label}
        data-testid={testId}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 rounded-lg appearance-none cursor-pointer focus:outline-hidden"
        style={{ accentColor: 'var(--accent-eloran)', background: 'var(--bg-muted)' }}
      />
    </div>
  );
}
