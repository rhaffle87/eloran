import React from 'react';
import { InfoTooltip } from './Tooltip.jsx';

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
          {value} {unit}
        </span>
      </div>
      <input
        type="range"
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
